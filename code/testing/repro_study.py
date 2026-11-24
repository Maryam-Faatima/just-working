"""Reproducibility study (EH-6): how stable are test verdicts across repeated runs, per persona?

LLM agents do not answer the same way every time, so one run of a test says little. This study
runs every test spec several times against the agent, marks each run with the checks (MF-1), and
measures for each test how often the most common verdict came up (stability) and how often the
verdict changed between consecutive runs (flips). Results are grouped by persona and overall.

It works for any agent the adapter can reach (EH-4): the travel agent (offline or live), any
LangChain or LangGraph agent, a plain Python function, or an HTTP endpoint. The user simulator runs without its cache (decision 55), so variation
from the simulated user is included. Offline (sample data and a stand-in LLM) the travel agent is
deterministic, which makes an offline run a useful control.

    python -m testing.repro_study --name travel --live --repeats 10
    python -m testing.repro_study --name langchain --target python --agent-dir fixtures/agents/langchain_agent \
        --entry-point agent.py:graph --specs fixtures/langchain_seed_specs.json --rubric fixtures/langchain_rubric.json

Writes <out>/<name>/repro_study.json, repro_study.md, repro_study.png and the traces in repro_traces/.
"""

from __future__ import annotations

import argparse
import json
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
LIVE_TRAVEL_ENV = {"DATA_MODE": "live", "LLM_PROVIDER": "groq"}

CheckFn = Callable[[dict[str, Any], dict[str, Any]], list[dict[str, Any]]]


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
    counts = Counter(verdicts)
    modal, modal_count = (counts.most_common(1)[0] if counts else ("none", 0))
    flips = sum(1 for a, b in pairwise(verdicts) if a != b)
    return {"modal_verdict": modal, "stability": round(modal_count / len(verdicts), 3) if verdicts else 0.0,
            "flips": flips, "verdict_counts": dict(counts)}


def study(specs: list[dict[str, Any]], rubric: dict[str, Any], backend_factory: Callable[[], Backend],
          repeats: int, folder: Path, simulator: UserSimulator | None, check_fn: CheckFn,
          pause_seconds: float = 0.0, progress: Callable[[str], None] | None = None) -> dict[str, Any]:
    """Runs each spec `repeats` times, checks every run, and returns per-test, per-persona and overall stability."""
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
            if pause_seconds:
                time.sleep(pause_seconds)
        if entry["runs"]:
            entry.update(status="ran", **stability([r["verdict"] for r in entry["runs"]]))
        tests.append(entry)

    ran = [t for t in tests if t.get("status") == "ran"]
    personas: dict[str, list[dict[str, Any]]] = {}
    for t in ran:
        personas.setdefault(t["persona"], []).append(t)
    by_persona = [{"persona": p, "tests": [t["test_id"] for t in ts],
                   "mean_stability": round(sum(t["stability"] for t in ts) / len(ts), 3)}
                  for p, ts in sorted(personas.items())]
    all_runs = [r for t in ran for r in t["runs"]]
    overall = {
        "tests_run": len(ran),
        "tests_not_run": len(tests) - len(ran),
        "runs": len(all_runs),
        "mean_stability": round(sum(t["stability"] for t in ran) / len(ran), 3) if ran else 0.0,
        "fully_stable_tests": sum(1 for t in ran if t["stability"] == 1.0),
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
             f"Mean verdict stability: **{o['mean_stability']:.0%}** over {o['tests_run']} tests and {o['runs']} runs. "
             f"Fully stable tests: {o['fully_stable_tests']} of {o['tests_run']}. Verdict flips: {o['total_flips']}. "
             f"Crashed runs: {o['crashed']}, timed out: {o['timeout']}.", "",
             "Verdicts: P pass, W weak, F fail, U unchecked (no rule could be decided, for example with the LLM judge off).", "",
             "| Test | Persona | Verdicts in order | Most common | Stability | Flips |", "|---|---|---|---|---|---|"]
    for t in result["tests"]:
        if t.get("status") != "ran":
            lines.append(f"| {t['test_id']} | {t['persona']} | not run: {t.get('reason', '')} | | | |")
            continue
        seq = " ".join(r["verdict"][0].upper() for r in t["runs"])
        lines.append(f"| {t['test_id']} | {t['persona']} | {seq} | {t['modal_verdict']} | {t['stability']:.0%} | {t['flips']} |")
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
    ran = [t for t in result["tests"] if t.get("status") == "ran"]
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Reproducibility study (EH-6): verdict stability across repeated runs.")
    parser.add_argument("--name", required=True, help="agent name; outputs go to <out>/<name>/")
    parser.add_argument("--out", default="outputs", help="base output folder (default outputs)")
    parser.add_argument("--specs", help="test specs JSON (default: <out>/<name>/test_specs.json)")
    parser.add_argument("--rubric", help="rubric JSON (default: <out>/<name>/rubric.json)")
    parser.add_argument("--repeats", type=int, default=10, help="runs per test (default 10)")
    parser.add_argument("--target", choices=["travel", "python", "http"], default="travel", help="how to reach the agent")
    parser.add_argument("--live", action="store_true", help="travel agent only: real data and a real LLM (needs keys)")
    parser.add_argument("--agent-dir", help="--target python: the agent's folder")
    parser.add_argument("--entry-point", help="--target python: file.py:name (a function or a LangChain object); --target http: the URL")
    parser.add_argument("--no-llm", action="store_true", help="no simulator and no LLM judge (scripted tests, rule checks only)")
    parser.add_argument("--pause", type=float, default=0.0, help="seconds to wait between conversations (free-tier limits)")
    args = parser.parse_args(argv)

    folder = Path(args.out) / args.name
    specs = json.loads(Path(args.specs or folder / "test_specs.json").read_text(encoding="utf-8"))
    rubric = json.loads(Path(args.rubric or folder / "rubric.json").read_text(encoding="utf-8"))
    if args.target == "travel":
        env = LIVE_TRAVEL_ENV if args.live else {}
        factory: Callable[[], Backend] | None = lambda: TravelAgentBackend(env=env)  # noqa: E731
        mode = "live" if args.live else "offline (sample data, stand-in LLM)"
    else:
        interface = "http" if args.target == "http" else "python_module"
        ctx = {"repo_root": Path(args.agent_dir or ".").resolve(),
               "spec": {"run_config": {"interface": interface, "entry_point": args.entry_point or ""}}}
        factory, how = choose_backend(ctx)
        if factory is None:
            parser.error(how)
        mode = f"{args.target} agent"
    use_llm = not args.no_llm
    simulator = UserSimulator(use_cache=False) if use_llm else None

    def check_fn(trace: dict[str, Any], rub: dict[str, Any]) -> list[dict[str, Any]]:
        return checks.run_checks(trace, rub, use_llm=use_llm)

    started = datetime.now(tz=UTC)
    result = study(specs if isinstance(specs, list) else [specs], rubric, factory, args.repeats, folder,
                   simulator, check_fn, args.pause, progress=print)
    result["meta"] = {"agent": args.name, "mode": mode, "llm": use_llm, "started_at": started.isoformat(timespec="seconds"),
                      "finished_at": datetime.now(tz=UTC).isoformat(timespec="seconds")}
    for path in save(result, folder):
        print(f"saved {path}")
    o = result["overall"]
    print(f"mean stability {o['mean_stability']:.0%} over {o['tests_run']} tests, {o['runs']} runs; "
          f"{o['fully_stable_tests']} fully stable; {o['total_flips']} flips")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
