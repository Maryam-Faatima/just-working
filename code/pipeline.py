"""One command for the whole pipeline.

    python pipeline.py <git URL | .zip file | folder> [--name N] [--out DIR] [--no-llm] [--open]

The target repo is acquired once and kept open while every stage runs, so later stages
(for example the testing engine) can start the agent from its real folder.

Stages run in order and share one context dict:
  scan    acquire the repo, scan it, write scan.json / scan.html / scan.md
  model   build the rule-based Behavioral Model V0 (model_v0_rule.json and model_v0.json)
  infer   ask the LLM to cross-check V0 and add constraints (overwrites model_v0.json)
  test    OPTIONAL hook: testing.runner.run(ctx), the testing lane plugs in here
  report  OPTIONAL hook: evidence.report.build(ctx), the evidence lane plugs in here

A hook is a function that takes ctx and returns a short text (or None). Until the module
exists the stage is reported as "skipped". If a hook exists and raises, the stage is
reported as "failed" and the run continues with the next stage.

ctx keys: source, name, use_llm, repo_root, folder, scan, store.
Everything is summarised in <output folder>/run_summary.json.
Exit code: 0 all stages ok or skipped, 1 a stage failed, 2 the source could not be opened.
"""
import argparse
import importlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from understand import infer, llm
from understand.acquire import AcquireError, head_commit, open_source
from understand.model_store import build_v0
from understand.outputs import DEFAULT_OUTPUT_DIR, agent_name, write_scan_outputs
from understand.scanner import scan_repo

REQUIRED_STAGES = {"scan", "model"}  # nothing useful can run after these fail


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


def stage_model(ctx):
    store = build_v0(ctx["scan"])
    store.save(ctx["folder"] / "model_v0_rule.json")
    store.save(ctx["folder"] / "model_v0.json")  # downstream stages always read this one
    ctx["store"] = store
    caps = len(store.find(type="capability"))
    flows = len(store.find(type="workflow"))
    return "ok", f"{caps} capabilities, {flows} workflow steps (rules only)"


def stage_infer(ctx):
    if not ctx["use_llm"]:
        return "skipped", "--no-llm: model_v0.json holds the rule-based model"
    try:
        report = infer.infer_v0(ctx["scan"], ctx["repo_root"], ctx["store"])
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
    ("scan", stage_scan),
    ("model", stage_model),
    ("infer", stage_infer),
    ("test", optional_stage("testing.runner", "run")),
    ("report", optional_stage("evidence.report", "build")),
]


def run_pipeline(source, name=None, out=None, use_llm=True, log=print):
    """Run every stage on `source`. Returns the summary dict (also written to disk).

    Raises AcquireError if the source cannot be opened.
    """
    name = name or agent_name(source)
    ctx = {"source": str(source), "name": name, "out": out, "use_llm": use_llm}
    started = datetime.now(UTC)
    results = []
    with open_source(source) as repo_root:
        ctx["repo_root"] = repo_root
        for number, (stage, run) in enumerate(STAGES, start=1):
            began = time.perf_counter()
            try:
                status, detail = run(ctx)
            except Exception as exc:  # noqa: BLE001  (a stage must never take the whole run down silently)
                status, detail = "failed", f"{type(exc).__name__}: {exc}"
            seconds = round(time.perf_counter() - began, 2)
            results.append({"stage": stage, "status": status, "detail": detail, "seconds": seconds})
            log(f"[{number}/{len(STAGES)}] {stage:<7} {status:<8} {detail} ({seconds}s)")
            if status == "failed" and stage in REQUIRED_STAGES:
                break

    folder = ctx.get("folder") or Path(out or DEFAULT_OUTPUT_DIR) / name
    folder.mkdir(parents=True, exist_ok=True)
    summary = {
        "agent": name,
        "source": ctx["source"],
        "commit": (ctx.get("scan") or {}).get("commit"),
        "started_at": started.isoformat(timespec="seconds"),
        "ok": all(r["status"] != "failed" for r in results) and len(results) == len(STAGES),
        "stages": results,
        "folder": str(folder),
    }
    (folder / "run_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run the whole GreatTest pipeline on an agent repo.")
    parser.add_argument("source", help="git URL, .zip file or folder")
    parser.add_argument("--name", help="agent name for the output folder (default: from the source)")
    parser.add_argument("--out", help="base output folder (default: outputs/)")
    parser.add_argument("--no-llm", action="store_true", help="skip the LLM step (rule-based model only)")
    parser.add_argument("--open", action="store_true", help="open the scan report in the browser")
    args = parser.parse_args(argv)

    try:
        summary = run_pipeline(args.source, args.name, args.out, use_llm=not args.no_llm)
    except AcquireError as exc:
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