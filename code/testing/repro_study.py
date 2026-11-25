"""Reproducibility study (EH-6): how stable are test verdicts across repeated runs, per persona?

LLM agents do not answer the same way every time, so one run of a test says little. This study
runs every test spec several times against the agent, marks each run with the checks (MF-1), and
measures for each test how often the most common verdict came up (stability) and how often the
verdict changed between consecutive runs (flips). Results are grouped by persona and overall.

It works for any agent the pipeline can test: the agent is chosen exactly as the pipeline's test
stage chooses it (testing/backends.choose_backend), from the agent's folder and its Phase 0 run
config, a langgraph.json in the folder, or an explicit entry point. Nothing here is specific to one
agent. The user simulator runs without its cache (decision 55), so variation from the simulated user
is included. A run with --no-llm, against an agent that uses sample data, is a useful control.

    # an agent that the pipeline already ran (reads outputs/<name>/test_specs.json, rubric.json, spec.json)
    python -m testing.repro_study --name myagent --agent-dir path/to/agent --repeats 10
    # a LangChain / LangGraph agent, entry point given explicitly
    python -m testing.repro_study --name orders --agent-dir fixtures/agents/langchain_agent \
        --entry-point agent.py:graph --specs fixtures/langchain_seed_specs.json --rubric fixtures/langchain_rubric.json
    # an agent served over HTTP
    python -m testing.repro_study --name myagent --interface http --entry-point http://localhost:8000/chat
    # settings passed to the agent, for example the team's travel agent in live mode
    python -m testing.repro_study --name travel --agent-dir target_agent --agent-env DATA_MODE=live --agent-env LLM_PROVIDER=groq

Writes <out>/<name>/repro_study.json, repro_study.md, repro_study.png and the traces in repro_traces/.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from collections import Counter
from itertools import pairwise
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from testing import checks
from testing.adapter import Adapter, Backend, TravelAgentBackend
from testing.backends import choose_backend
from testing.runner import SimulatorState, converse, spec_problem
from testing.simulator import UserSimulator

VERDICT_ORDER = {"pass": 0, "weak": 1, "fail": 2}

CheckFn = Callable[[dict[str, Any], dict[str, Any]], list[dict[str, Any]]]
DEFAULT_MAX_SETUP_FAILURES = 3


class SetupProblem(Exception):
    """The first runs all timed out or crashed: the agent or its keys or network are not working."""


def rules_for(spec: dict[str, Any], rubric: dict[str, Any]) -> list[str]:
    """Rubric items a test is judged on: those targeting its model entry, plus U1; else every item."""
    items = rubric.get("items", [])
    target = spec.get("target_id")
    targeted = [i["rule_id"] for i in items if target and (i.get("target_id") == target or i["rule_id"] == target)]
    if not targeted:
        return [i["rule_id"] for i in items]
    return sorted(set(targeted) | ({"U1"} & {i["rule_id"] for i in items}))


def run_verdict(results: list[dict[str, Any]], rule_ids: list[str]) -> tuple[str, list[str], list[str]]:
    """(verdict, failed rules, unchecked rules) for one run.

    The verdict is the worst among the test's rules that were actually decided (fail beats weak beats
    pass). A rule the checks could not decide (method "none", for example the LLM judge was off) does
    not count. U1 (no crash or empty reply) can fail a run but cannot pass it alone: if none of the
    test's own rules was decided, the verdict is "unchecked".
    """
    relevant = [r for r in results if r["rule_id"] in rule_ids] or results
    unchecked = [r["rule_id"] for r in relevant if r.get("method") == "none"]
    decided = [r for r in relevant if r.get("method") != "none"]
    failed = [r["rule_id"] for r in decided if r["verdict"] == "fail"]
    # U1 (no crash or empty reply) can fail a run, but cannot make it pass: the test's own rules must be decided.
    own = [r for r in decided if r["rule_id"] != "U1"] if any(r["rule_id"] != "U1" for r in relevant) else decided
    if not own:
        return ("fail" if failed else "unchecked"), failed, unchecked
    worst = max(decided, key=lambda r: VERDICT_ORDER.get(r["verdict"], 1))["verdict"]
    return worst, failed, unchecked


def stability(verdicts: list[str]) -> dict[str, Any]:
    """Stability over the runs whose verdict was decided; "unchecked" runs (the checks could not decide,
    for example the LLM judge was unavailable) are left out, so an outage is not counted as a flip."""
    decided = [v for v in verdicts if v != "unchecked"]
    counts = Counter(verdicts)
    if not decided:
        return {"modal_verdict": "unchecked", "stability": None, "flips": 0, "decided_runs": 0, "verdict_counts": dict(counts)}
    modal, modal_count = Counter(decided).most_common(1)[0]
    flips = sum(1 for a, b in pairwise(decided) if a != b)
    return {"modal_verdict": modal, "stability": round(modal_count / len(decided), 3), "flips": flips,
            "decided_runs": len(decided), "verdict_counts": dict(counts)}


def study(specs: list[dict[str, Any]], rubric: dict[str, Any], backend_factory: Callable[[], Backend],
          repeats: int, folder: Path, simulator: UserSimulator | None, check_fn: CheckFn,
          pause_seconds: float = 0.0, progress: Callable[[str], None] | None = None,
          max_setup_failures: int = DEFAULT_MAX_SETUP_FAILURES) -> dict[str, Any]:
    """Runs each spec `repeats` times, checks every run, and returns per-test, per-persona and overall stability.

    Raises SetupProblem if the first `max_setup_failures` runs all time out or crash (0 turns this off).
    """
    first_statuses: list[str] = []
    traces_dir = folder / "repro_traces"
    traces_dir.mkdir(parents=True, exist_ok=True)
    sim = SimulatorState(simulator)
    tests: list[dict[str, Any]] = []
    for spec in specs:
        test_id = str(spec.get("test_id", "unknown"))
        problem = spec_problem(spec, has_simulator=sim.simulator is not None)
        entry: dict[str, Any] = {"test_id": test_id, "persona": spec.get("persona", ""),
                                 "category": spec.get("category", ""), "rules": rules_for(spec, rubric), "runs": []}
        if problem:
            entry.update(status="not_run", reason=problem)
            tests.append(entry)
            continue
        for k in range(1, repeats + 1):
            adapter = Adapter(backend_factory(), test_id=test_id, modality=spec["modality"])
            trace, simulated = converse(adapter, spec, sim)
            if trace is None:
                entry.update(status="not_run", reason=sim.note or "no message could be sent")
                break
            name = f"{test_id}_run{k}.json"
            (traces_dir / name).write_text(json.dumps(trace, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            results = check_fn(trace, rubric)
            verdict, failed, unchecked = run_verdict(results, entry["rules"])
            entry["runs"].append({"run": k, "run_status": trace["run_status"], "verdict": verdict,
                                  "failed_rules": failed, "unchecked_rules": unchecked,
                                  "simulated_messages": simulated, "trace": name})
            if progress:
                progress(f"{test_id} run {k}/{repeats}: {trace['run_status']}, {verdict}")
            if max_setup_failures and len(first_statuses) < max_setup_failures:
                first_statuses.append(trace["run_status"])
                if len(first_statuses) == max_setup_failures and "completed" not in first_statuses:
                    raise SetupProblem(
                        f"the first {max_setup_failures} runs all ended as {', '.join(first_statuses)}: "
                        f"{trace.get('error') or 'no error message'}. Check the agent, its API keys and the network "
                        "before running the study (see repro_traces/ for details).")
            if pause_seconds:
                time.sleep(pause_seconds)
        if entry["runs"]:
            entry.update(status="ran", **stability([r["verdict"] for r in entry["runs"]]))
        tests.append(entry)

    ran = [t for t in tests if t.get("status") == "ran"]
    measured = [t for t in ran if t["stability"] is not None]
    personas: dict[str, list[dict[str, Any]]] = {}
    for t in measured:
        personas.setdefault(t["persona"], []).append(t)
    by_persona = [{"persona": p, "tests": [t["test_id"] for t in ts],
                   "mean_stability": round(sum(t["stability"] for t in ts) / len(ts), 3)}
                  for p, ts in sorted(personas.items())]
    all_runs = [r for t in ran for r in t["runs"]]
    overall = {
        "tests_run": len(ran),
        "tests_not_run": len(tests) - len(ran),
        "runs": len(all_runs),
        "tests_decided": len(measured),
        "decided_runs": sum(t["decided_runs"] for t in ran),
        "mean_stability": round(sum(t["stability"] for t in measured) / len(measured), 3) if measured else 0.0,
        "fully_stable_tests": sum(1 for t in measured if t["stability"] == 1.0),
        "total_flips": sum(t["flips"] for t in ran),
        "crashed": sum(1 for r in all_runs if r["run_status"] == "crashed"),
        "timeout": sum(1 for r in all_runs if r["run_status"] == "timeout"),
    }
    note = sim.note
    return {"repeats": repeats, "tests": tests, "by_persona": by_persona, "overall": overall,
            **({"simulator_note": note} if note else {})}


def to_markdown(result: dict[str, Any]) -> str:
    meta, o = result.get("meta", {}), result["overall"]
    lines = [f"# Reproducibility study: {meta.get('agent', '')}", "",
             f"Mode: {meta.get('mode', '')}. Repeats per test: {result['repeats']}. Simulator cache: off. "
             f"Run on {meta.get('finished_at', '')}.", "",
             f"Mean verdict stability: **{o['mean_stability']:.0%}** over {o['tests_decided']} tests with decided verdicts "
             f"({o['decided_runs']} of {o['runs']} runs decided; the rest were unchecked). "
             f"Fully stable tests: {o['fully_stable_tests']} of {o['tests_decided']}. Verdict flips: {o['total_flips']}. "
             f"Crashed runs: {o['crashed']}, timed out: {o['timeout']}.", "",
             "Verdicts: P pass, W weak, F fail, U unchecked (no rule could be decided, for example with the LLM judge off).", "",
             "| Test | Persona | Verdicts in order | Most common | Stability (decided runs) | Flips |", "|---|---|---|---|---|---|"]
    for t in result["tests"]:
        if t.get("status") != "ran":
            lines.append(f"| {t['test_id']} | {t['persona']} | not run: {t.get('reason', '')} | | | |")
            continue
        seq = " ".join(r["verdict"][0].upper() for r in t["runs"])
        share = "n/a" if t["stability"] is None else f"{t['stability']:.0%} ({t['decided_runs']})"
        lines.append(f"| {t['test_id']} | {t['persona']} | {seq} | {t['modal_verdict']} | {share} | {t['flips']} |")
    lines += ["", "| Persona | Tests | Mean stability |", "|---|---|---|"]
    lines += [f"| {p['persona']} | {', '.join(p['tests'])} | {p['mean_stability']:.0%} |" for p in result["by_persona"]]
    if result.get("simulator_note"):
        lines += ["", f"Note: {result['simulator_note']}"]
    return "\n".join(lines) + "\n"


def to_chart(result: dict[str, Any], path: Path) -> bool:
    """A bar chart of stability per test, coloured by the most common verdict. False if matplotlib is missing."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return False
    ran = [t for t in result["tests"] if t.get("status") == "ran" and t["stability"] is not None]
    if not ran:
        return False
    colours = {"pass": "#2E9E5B", "weak": "#E0A21B", "fail": "#D64545", "unchecked": "#9AA0A6"}
    fig, ax = plt.subplots(figsize=(max(6, 0.8 * len(ran) + 2), 4))
    ax.bar([t["test_id"] for t in ran], [t["stability"] * 100 for t in ran],
           color=[colours.get(t["modal_verdict"], "#888") for t in ran])
    ax.set_ylim(0, 105)
    ax.set_ylabel("Verdict stability (%)")
    meta = result.get("meta", {})
    ax.set_title(f"Verdict stability over {result['repeats']} runs ({meta.get('agent', '')}, {meta.get('mode', '')})")
    for label, colour in colours.items():
        ax.bar([], [], color=colour, label=f"mostly {label}")
    ax.legend(loc="lower right", fontsize=8)
    ax.tick_params(axis="x", rotation=45)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)
    return True


def save(result: dict[str, Any], folder: Path) -> list[Path]:
    folder.mkdir(parents=True, exist_ok=True)
    paths = [folder / "repro_study.json", folder / "repro_study.md"]
    paths[0].write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    paths[1].write_text(to_markdown(result), encoding="utf-8")
    if to_chart(result, folder / "repro_study.png"):
        paths.append(folder / "repro_study.png")
    return paths


def parse_env(pairs: list[str]) -> dict[str, str]:
    """KEY=VALUE strings from --agent-env as a dict."""
    env: dict[str, str] = {}
    for pair in pairs:
        key, sep, value = pair.partition("=")
        if not sep or not key.strip():
            raise ValueError(f"--agent-env must look like KEY=VALUE, got {pair!r}")
        env[key.strip()] = value
    return env


def choose_agent(agent_dir: str | None, spec: dict[str, Any], entry_point: str | None, interface: str | None,
                 agent_env: dict[str, str]) -> tuple[Callable[[], Backend] | None, str]:
    """The backend the pipeline would use for this agent, with any explicit overrides and agent settings."""
    run_config = dict(spec.get("run_config") or {})
    if entry_point:
        run_config["entry_point"] = entry_point
    if interface:
        run_config["interface"] = interface
    ctx = {"repo_root": Path(agent_dir).resolve() if agent_dir else None, "spec": {**spec, "run_config": run_config}}
    factory, how = choose_backend(ctx)
    if factory is None:
        return None, how
    if factory is TravelAgentBackend:  # its sample-data defaults are replaced only by settings passed explicitly
        return (lambda: TravelAgentBackend(env=agent_env)), how
    if agent_env:
        os.environ.update(agent_env)  # each turn's child process inherits these
    return factory, how


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Reproducibility study (EH-6): verdict stability across repeated runs.")
    parser.add_argument("--name", required=True, help="agent name; outputs go to <out>/<name>/")
    parser.add_argument("--out", default="outputs", help="base output folder (default outputs)")
    parser.add_argument("--specs", help="test specs JSON (default: <out>/<name>/test_specs.json)")
    parser.add_argument("--rubric", help="rubric JSON (default: <out>/<name>/rubric.json)")
    parser.add_argument("--spec", help="Phase 0 spec with run_config (default: <out>/<name>/spec.json if it exists)")
    parser.add_argument("--repeats", type=int, default=10, help="runs per test (default 10)")
    parser.add_argument("--agent-dir", help="the agent's folder (its run config, langgraph.json or entry point)")
    parser.add_argument("--entry-point", help="file.py:name (a function, a LangGraph app or an AgentExecutor), or a URL")
    parser.add_argument("--interface", choices=["python_module", "langgraph", "http"], help="override the run config's interface")
    parser.add_argument("--agent-env", action="append", default=[], metavar="KEY=VALUE",
                        help="setting passed to the agent, repeatable (for example DATA_MODE=live)")
    parser.add_argument("--no-llm", action="store_true", help="no simulator and no LLM judge (scripted tests, rule checks only)")
    parser.add_argument("--pause", type=float, default=0.0, help="seconds to wait between conversations (free-tier limits)")
    parser.add_argument("--max-setup-failures", type=int, default=DEFAULT_MAX_SETUP_FAILURES,
                        help="stop if the first N runs all time out or crash (default 3; 0 turns this off)")
    args = parser.parse_args(argv)

    folder = Path(args.out) / args.name
    specs = json.loads(Path(args.specs or folder / "test_specs.json").read_text(encoding="utf-8"))
    rubric = json.loads(Path(args.rubric or folder / "rubric.json").read_text(encoding="utf-8"))
    spec_path = Path(args.spec) if args.spec else folder / "spec.json"
    phase0 = json.loads(spec_path.read_text(encoding="utf-8")) if spec_path.exists() else {}
    try:
        agent_env = parse_env(args.agent_env)
    except ValueError as exc:
        parser.error(str(exc))
    factory, how = choose_agent(args.agent_dir, phase0, args.entry_point, args.interface, agent_env)
    if factory is None:
        parser.error(f"cannot reach the agent: {how}")
    mode = how + (f", agent settings: {', '.join(f'{k}={v}' for k, v in agent_env.items())}" if agent_env else "")
    use_llm = not args.no_llm
    simulator = UserSimulator(use_cache=False) if use_llm else None

    def check_fn(trace: dict[str, Any], rub: dict[str, Any]) -> list[dict[str, Any]]:
        return checks.run_checks(trace, rub, use_llm=use_llm)

    started = datetime.now(tz=UTC)
    try:
        result = study(specs if isinstance(specs, list) else [specs], rubric, factory, args.repeats, folder,
                       simulator, check_fn, args.pause, progress=print, max_setup_failures=args.max_setup_failures)
    except SetupProblem as exc:
        print(f"stopped: {exc}")
        return 2
    result["meta"] = {"agent": args.name, "mode": mode, "llm": use_llm, "started_at": started.isoformat(timespec="seconds"),
                      "finished_at": datetime.now(tz=UTC).isoformat(timespec="seconds")}
    for path in save(result, folder):
        print(f"saved {path}")
    o = result["overall"]
    print(f"mean stability {o['mean_stability']:.0%} over {o['tests_decided']} tests with decided verdicts "
          f"({o['decided_runs']} of {o['runs']} runs decided); {o['fully_stable_tests']} fully stable; {o['total_flips']} flips")
    if o["decided_runs"] < o["runs"]:
        print(f"note: {o['runs'] - o['decided_runs']} runs were unchecked: the LLM judge could not decide them "
              "(check GreatTest's .env keys and the provider's quota)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
