"""One command for the whole pipeline.

    python -m pipeline <git URL | .zip file | folder> [--spec FILE] [--ask | --no-ask]
                       [--name N] [--out DIR] [--repos DIR] [--no-llm] [--open]

Everything is worked out from the source:
  - the agent name comes from the URL or folder (--name overrides it)
  - results go to outputs/<agent>/ (--out changes the base folder)
  - a git URL is cloned fresh into repos/<agent>/ (--repos changes the base folder) on every run,
    replacing the previous clone there. A local folder is used in place
  - started in a terminal, the run begins with the Phase 0 questionnaire. The answers are saved
    in outputs/<agent>/spec.json and offered for reuse next time. --spec FILE skips the
    questions, --ask always asks, --no-ask never asks (scripts and CI never ask)

The target repo is acquired once and kept open while every stage runs, so later stages
(for example the testing engine) can start the agent from its real folder.

Stages run in order and share one context dict:
  spec       Phase 0: load the developer requirements spec. Skipped without one
  scan       acquire the repo, parse it (framework-aware AST), write scan.json / scan.html / scan.md
  callgraph  build the call graph and the component interactions, write callgraph.json / .md
  model      build the rule-based Behavioral Model V0 (model_v0_rule.json), add the developer's rules
             from the spec, write rubric.json (and spec.json) and model_v0.json
  infer      ask the LLM to cross-check V0 and add constraints (overwrites model_v0.json)
  test       OPTIONAL hook: testing.runner.run(ctx), the testing lane plugs in here
  report     OPTIONAL hook: evidence.report.build(ctx), the evidence lane plugs in here

A hook is a function that takes ctx and returns a short text (or None). Until the module
exists the stage is reported as "skipped". If a hook exists and raises, the stage is
reported as "failed" and the run continues with the next stage.

ctx keys: source, name, use_llm, repo_root, folder, scan, callgraph, store,
spec (None without a spec), rubric, spec_report.
Everything is summarised in <output folder>/run_summary.json.
Exit code: 0 all stages ok or skipped, 1 a stage failed or the run was cancelled,
2 the source or the spec could not be used.
"""
import argparse
import importlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from understand import callgraph, infer, llm, phase0
from understand.acquire import (
    DEFAULT_CLONE_DIR,
    AcquireError,
    check_source,
    head_commit,
    is_git_url,
    open_source,
)
from understand.model_store import build_v0
from understand.outputs import DEFAULT_OUTPUT_DIR, agent_name, write_scan_outputs
from understand.scanner import scan_repo

REQUIRED_STAGES = {"scan", "model"}  # nothing useful can run after these fail


def stage_spec(ctx):
    spec = ctx.get("spec")
    if spec is None:
        return "skipped", ("no spec: the model is built from code only and the rubric has the defaults "
                           "(run in a terminal to answer the questionnaire, or pass --spec)")
    return "ok", (f"{len(spec['rules'])} rules, {len(spec.get('capabilities', []))} capabilities, "
                  f"{len(spec.get('external_services', []))} external services")


def stage_scan(ctx):
    scan = scan_repo(ctx["repo_root"])
    scan["source"] = ctx["source"]
    scan["commit"] = head_commit(ctx["repo_root"])
    scan["agent"] = ctx["name"]
    scan["scanned_at"] = datetime.now(UTC).isoformat(timespec="seconds")
    ctx["scan"] = scan
    ctx["folder"] = write_scan_outputs(scan, ctx["name"], ctx["out"])
    detail = (f"{scan['files_scanned']} files, {len(scan['tools'])} tools, "
              f"{len(scan['nodes'])} nodes, {len(scan['edges'])} edges")
    if scan["errors"]:
        return "warning", f"{detail}, {len(scan['errors'])} files could not be parsed"
    return "ok", detail


def stage_callgraph(ctx):
    graph = callgraph.build_callgraph(ctx["repo_root"], ctx["scan"])
    callgraph.write_outputs(graph, ctx["folder"])
    ctx["callgraph"] = graph
    s = graph["stats"]
    detail = (f"{s['functions']} functions, {s['resolved']} resolved calls, "
              f"{s['agent_calls']} agent calls, {s['unresolved']} unresolved")
    if s["parse_errors"]:
        return "warning", f"{detail}, {s['parse_errors']} files could not be parsed"
    return "ok", detail


def stage_model(ctx):
    store = build_v0(ctx["scan"])
    store.save(ctx["folder"] / "model_v0_rule.json")  # code only, kept for the rule-only comparison
    detail = (f"{len(store.find(type='capability'))} capabilities, "
              f"{len(store.find(type='workflow'))} workflow steps from the code")
    status, spec = "ok", ctx.get("spec")
    report = {"rule_entries": {}, "warnings": []}
    if spec:
        report = phase0.merge_into_model(store, spec)
        detail += (f"; spec added {report['constraints_added']} constraints "
                   f"and {report['capabilities_added']} capabilities")
        if report["warnings"]:
            status = "warning"
            detail += f", {len(report['warnings'])} spec warnings (see run_summary.json)"
    rubric = phase0.build_rubric(spec, report["rule_entries"], agent=ctx["name"])
    phase0.write_outputs(ctx["folder"], rubric, spec)
    store.save(ctx["folder"] / "model_v0.json")  # downstream stages always read this one
    ctx.update(store=store, rubric=rubric, spec_report=report)
    return status, f"{detail}; rubric has {len(rubric['items'])} items"


def stage_infer(ctx):
    if not ctx["use_llm"]:
        return "skipped", "--no-llm: model_v0.json holds the rule-based model"
    try:
        report = infer.infer_v0(ctx["scan"], ctx["repo_root"], ctx["store"], ctx.get("callgraph"))
    except llm.LLMError as exc:
        return "warning", f"LLM unavailable, kept the rule-based model ({exc})"
    ctx["store"].save(ctx["folder"] / "model_v0.json")
    detail = (f"agreed on {report['capabilities_agreed']} capabilities, "
              f"added {report['constraints_added']} constraints, "
              f"rejected {len(report['constraints_rejected'])}")
    if report["batches_failed"]:
        return "warning", f"{detail}; {report['batches_failed']} of {report['batches']} batches failed"
    return "ok", detail


def optional_stage(module, function):
    """A stage that calls module.function(ctx) if the module exists, otherwise is skipped."""
    def run(ctx):
        try:
            mod = importlib.import_module(module)
        except ModuleNotFoundError as exc:
            if exc.name in (module, module.split(".")[0]):
                return "skipped", f"{module} not available yet"
            raise  # the module exists but one of its own imports is missing
        hook = getattr(mod, function, None)
        if hook is None:
            return "skipped", f"{module}.{function} not defined yet"
        return "ok", str(hook(ctx) or "done")
    return run


STAGES = [
    ("spec", stage_spec),
    ("scan", stage_scan),
    ("callgraph", stage_callgraph),
    ("model", stage_model),
    ("infer", stage_infer),
    ("test", optional_stage("testing.runner", "run")),
    ("report", optional_stage("evidence.report", "build")),
]


def run_pipeline(source, name=None, out=None, use_llm=True, log=print, spec_path=None, repos=None):
    """Run every stage on `source`. Returns the summary dict (also written to disk).

    Raises AcquireError if the source cannot be opened and SpecError if the spec cannot be
    used. The spec is checked first, so a typo in it costs nothing. A git URL is cloned fresh
    into <repos>/<name>, replacing the clone from an earlier run.
    """
    name = name or agent_name(source)
    spec = phase0.load_spec(spec_path) if spec_path else None
    ctx = {"source": str(source), "name": name, "out": out, "use_llm": use_llm, "spec": spec}
    clone_dir = Path(repos or DEFAULT_CLONE_DIR)
    if is_git_url(source):
        target = clone_dir / name
        verb = "Replacing the existing clone in" if target.exists() else "Cloning into"
        log(f"{verb} {target} ...")
    started = datetime.now(UTC)
    results = []
    with open_source(source, clone_dir=clone_dir, name=name) as repo_root:
        ctx["repo_root"] = repo_root
        for number, (stage, run) in enumerate(STAGES, start=1):
            began = time.perf_counter()
            try:
                status, detail = run(ctx)
            except Exception as exc:  # noqa: BLE001  (a stage must never take the whole run down silently)
                status, detail = "failed", f"{type(exc).__name__}: {exc}"
            seconds = round(time.perf_counter() - began, 2)
            results.append({"stage": stage, "status": status, "detail": detail, "seconds": seconds})
            log(f"[{number}/{len(STAGES)}] {stage:<9} {status:<8} {detail} ({seconds}s)")
            if status == "failed" and stage in REQUIRED_STAGES:
                break

    folder = ctx.get("folder") or Path(out or DEFAULT_OUTPUT_DIR) / name
    folder.mkdir(parents=True, exist_ok=True)
    summary = {
        "agent": name,
        "source": ctx["source"],
        "commit": (ctx.get("scan") or {}).get("commit"),
        "started_at": started.isoformat(timespec="seconds"),
        "spec": str(spec_path) if spec_path else None,
        "spec_warnings": (ctx.get("spec_report") or {}).get("warnings", []),
        "ok": all(r["status"] != "failed" for r in results) and len(results) == len(STAGES),
        "stages": results,
        "folder": str(folder),
    }
    (folder / "run_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def _interactive():
    """True when a person is at the keyboard. Scripts and CI never are, so they are never asked."""
    return sys.stdin is not None and sys.stdin.isatty()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run the whole GreatTest pipeline on an agent repo.")
    parser.add_argument("source", help="git URL (cloned fresh into repos/), .zip file or folder")
    parser.add_argument("--spec", help="use this Phase 0 spec (JSON) instead of asking the questions")
    parser.add_argument("--ask", action="store_true",
                        help="run the Phase 0 questionnaire even if saved answers exist")
    parser.add_argument("--no-ask", action="store_true", help="never ask questions (for scripts and CI)")
    parser.add_argument("--name", help="agent name for the output folder (default: from the source)")
    parser.add_argument("--out", help="base output folder (default: outputs/)")
    parser.add_argument("--repos", help="base folder for cloned git URLs (default: repos/)")
    parser.add_argument("--no-llm", action="store_true", help="skip the LLM step (rule-based model only)")
    parser.add_argument("--open", action="store_true", help="open the scan report in the browser")
    args = parser.parse_args(argv)

    name = args.name or agent_name(args.source)
    spec_path = args.spec
    try:
        check_source(args.source)  # a mistyped path should fail before the questions, not after
        if spec_path is None and not args.no_ask and (args.ask or _interactive()):
            spec_path = phase0.ensure_spec(Path(args.out or DEFAULT_OUTPUT_DIR) / name, force=args.ask)
        summary = run_pipeline(args.source, name, args.out, use_llm=not args.no_llm,
                               spec_path=spec_path, repos=args.repos)
    except (EOFError, KeyboardInterrupt):
        print("\ncancelled, nothing was run", file=sys.stderr)
        return 1
    except (AcquireError, phase0.SpecError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(f"\nOutputs: {summary['folder']}")
    if args.open:
        import webbrowser

        report = Path(summary["folder"]) / "scan.html"
        if report.exists():
            webbrowser.open(report.as_uri())
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())