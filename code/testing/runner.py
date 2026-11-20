"""Test runner (EH-3): runs test specs against the agent under test and saves every trace.

The pipeline calls run(ctx) as stage 5 ("test"). If there are no test specs yet, the seed generator
(EH-1) writes them from the rubric and the model into <output folder>/test_specs.json first.
The agent is reached through the universal adapter (EH-4, testing/backends.py), chosen from the
Phase 0 run config; the travel agent in target_agent/ keeps its own backend.
For each test spec the runner:

1. checks the spec against schemas/test_spec.schema.json (an invalid spec is reported, not run);
2. sends the spec's scripted user messages through the adapter ({date+N} in a message becomes
   the date N days from today, so tests never expire), then lets the user simulator (EH-2)
   continue the conversation until the turn budget runs out or the simulated user is done;
3. repeats the conversation as many times as the developer asked in Phase 0
   (run_config.repeats, default 3), so results can be reported as passes out of total runs;
4. saves each trace to <output folder>/traces/<test_id>_run<k>.json.

It then writes <output folder>/test_run.json and puts the specs, traces and summary into ctx
for the checks (MF), the judge (AY) and the report stage.

A spec without a script gets its opening message from the simulator. If the simulator cannot be
used (no LLM key, or a --no-llm run), the runner carries on with scripts only and notes why;
a spec with no script is then listed as "not_run".
Crashes and timeouts are recorded through the trace's run_status and never stop the runner.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import jsonschema

from testing.adapter import REPO_ROOT, Adapter, Backend, TravelAgentBackend
from testing.backends import choose_backend
from testing.generator import generate
from testing.simulator import SimulatorUnavailable, UserSimulator

TEST_SPEC_SCHEMA_PATH = REPO_ROOT / "schemas" / "test_spec.schema.json"
DEFAULT_REPEATS = 3
MAX_REPEATS = 20
STATUSES = ("completed", "crashed", "timeout")

BackendFactory = Callable[[], Backend]
DATE_PLACEHOLDER = re.compile(r"\{date\+(\d{1,3})\}")


def expand_script(messages: list[str], today: date | None = None) -> list[str]:
    """Replaces {date+N} with the ISO date N days after today, so scripted tests never expire."""
    base = today or datetime.now(tz=UTC).date()
    return [DATE_PLACEHOLDER.sub(lambda m: (base + timedelta(days=int(m.group(1)))).isoformat(), text)
            for text in messages]


def load_test_specs(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """Test specs from ctx["test_specs"], else <folder>/test_specs.json, else none."""
    if ctx.get("test_specs") is not None:
        return list(ctx["test_specs"])
    folder = ctx.get("folder")
    path = Path(folder) / "test_specs.json" if folder else None
    if path and path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else [data]
    return []


def repeats_for(ctx: dict[str, Any]) -> int:
    """How many times to run each test: the developer's Phase 0 answer, kept within 1 to 20."""
    run_config = (ctx.get("spec") or {}).get("run_config") or {}
    try:
        value = int(run_config.get("repeats", DEFAULT_REPEATS))
    except (TypeError, ValueError):
        value = DEFAULT_REPEATS
    return max(1, min(MAX_REPEATS, value))


def spec_problem(spec: dict[str, Any], has_simulator: bool = False) -> str | None:
    """Why a spec cannot run, or None if it is valid and has a script or a simulator to start it."""
    schema = json.loads(TEST_SPEC_SCHEMA_PATH.read_text(encoding="utf-8"))
    try:
        jsonschema.validate(spec, schema)
    except jsonschema.ValidationError as exc:
        return f"invalid test spec: {exc.message}"
    if not spec.get("script") and not has_simulator:
        return "no script, and the user simulator is not available"
    return None


class SimulatorState:
    """The simulator shared by every test in a run; switched off for the run if it fails once."""

    def __init__(self, simulator: UserSimulator | None):
        self.simulator = simulator
        self.note: str | None = None

    def next_message(self, spec: dict[str, Any], turns: list[dict[str, Any]]) -> str | None:
        if self.simulator is None:
            return None
        try:
            return self.simulator.next_message(spec, turns)
        except SimulatorUnavailable as exc:
            self.simulator, self.note = None, f"user simulator off: {exc}"
            return None


def converse(adapter: Adapter, spec: dict[str, Any], sim: SimulatorState) -> tuple[dict[str, Any] | None, int]:
    """One conversation: the script first, then simulated messages, within the turn budget.

    Returns (trace, number of simulated messages), or (None, 0) if no message could be sent.
    """
    adapter.reset_session()
    budget = spec["turn_budget"]
    sent = simulated = 0
    for text in expand_script(spec.get("script") or [])[:budget]:
        sent += 1
        if adapter.send_message(text) is None:
            return adapter.get_trace(), simulated
    while sent < budget and not adapter.finished:
        text = sim.next_message(spec, adapter.turns)
        if text is None:
            break
        sent += 1
        simulated += 1
        if adapter.send_message(text) is None:
            break
    if sent == 0:
        return None, 0
    return adapter.get_trace(), simulated


def run_test(spec: dict[str, Any], backend_factory: BackendFactory, repeats: int, traces_dir: Path,
             sim: SimulatorState | None = None) -> dict[str, Any]:
    """Runs one spec `repeats` times. Returns its summary; traces are saved to traces_dir."""
    sim = sim or SimulatorState(None)
    test_id = str(spec.get("test_id", "unknown"))
    summary: dict[str, Any] = {"test_id": test_id, "target_id": spec.get("target_id"), "runs": 0}
    problem = spec_problem(spec, has_simulator=sim.simulator is not None)
    if problem:
        summary.update(status="invalid" if problem.startswith("invalid") else "not_run", reason=problem)
        return summary
    counts = dict.fromkeys(STATUSES, 0)
    files: list[str] = []
    traces: list[dict[str, Any]] = []
    simulated_total = 0
    for k in range(1, repeats + 1):
        adapter = Adapter(backend_factory(), test_id=test_id, modality=spec["modality"])
        trace, simulated = converse(adapter, spec, sim)
        if trace is None:
            summary.update(status="not_run", reason=sim.note or "no message could be sent")
            return summary
        simulated_total += simulated
        counts[trace["run_status"]] += 1
        path = traces_dir / f"{test_id}_run{k}.json"
        path.write_text(json.dumps(trace, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        files.append(path.name)
        traces.append(trace)
    summary.update(status="ran", runs=repeats, **counts, simulated_messages=simulated_total, traces=files)
    summary["_traces"] = traces  # kept in memory for ctx, not written to test_run.json
    return summary


def generate_specs(ctx: dict[str, Any], folder: Path) -> list[dict[str, Any]]:
    """Seed tests from the rubric and model in ctx (EH-1), saved to <folder>/test_specs.json."""
    store = ctx.get("store")
    if ctx.get("rubric") is None or store is None:
        return []
    entries = store.to_dict()["entries"] if hasattr(store, "to_dict") else store.get("entries", [])
    specs, warnings = generate(ctx["rubric"], entries, ctx.get("spec"))
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "test_specs.json").write_text(json.dumps(specs, indent=2) + "\n", encoding="utf-8")
    ctx["generator_warnings"] = warnings
    return specs


def run(ctx: dict[str, Any]) -> str:
    """Pipeline stage 5. Returns a one-line summary for the run log."""
    folder = Path(ctx.get("folder") or Path("outputs") / ctx.get("name", "agent"))
    specs = load_test_specs(ctx)
    generated = ""
    if not specs:
        specs = generate_specs(ctx, folder)
        generated = f"generated {len(specs)} seed test(s); " if specs else ""
    if not specs:
        return "no test specs yet"
    ctx["test_specs"] = specs
    backend_factory, how = choose_backend(ctx)
    if backend_factory is None:
        return f"{generated}not run: {how}"
    ctx["backend"] = how
    traces_dir = folder / "traces"
    traces_dir.mkdir(parents=True, exist_ok=True)
    repeats = repeats_for(ctx)
    sim = SimulatorState(make_simulator(ctx))

    results = [run_test(spec, backend_factory, repeats, traces_dir, sim) for spec in specs]
    all_traces = [t for r in results for t in r.pop("_traces", [])]
    totals = {s: sum(r.get(s, 0) for r in results) for s in STATUSES}
    ran = sum(1 for r in results if r["status"] == "ran")
    skipped = len(results) - ran
    run_record: dict[str, Any] = {"repeats": repeats, "tests": results, "totals": totals}
    if sim.note:
        run_record["simulator_note"] = sim.note
    (folder / "test_run.json").write_text(json.dumps(run_record, indent=2) + "\n", encoding="utf-8")

    ctx["test_specs"] = specs
    ctx["traces"] = all_traces
    ctx["test_run"] = run_record
    detail = (f"{generated}{ran} test(s) x {repeats} run(s): {totals['completed']} completed, "
              f"{totals['crashed']} crashed, {totals['timeout']} timed out")
    if skipped:
        reason = "" if sim.note or sim.simulator else " (unscripted tests need the user simulator)"
        detail += f"; {skipped} not run{reason}"
    return detail + (f"; {sim.note}" if sim.note else "")


def make_simulator(ctx: dict[str, Any]) -> UserSimulator | None:
    """ctx["simulator"] if given; none for --no-llm runs; otherwise an LLM simulator (cached by default)."""
    if "simulator" in ctx:
        return ctx["simulator"]
    if not ctx.get("use_llm", True):
        return None
    return UserSimulator(use_cache=ctx.get("simulator_cache", True))


def main(argv: list[str] | None = None) -> int:
    """Runs test specs by hand: python -m testing.runner SPEC.json [--repeats N] [--out FOLDER]."""
    import argparse

    parser = argparse.ArgumentParser(description="Run test specs against the target agent and save the traces.")
    parser.add_argument("specs", help="a test spec JSON file (one spec or a list of specs)")
    parser.add_argument("--repeats", type=int, default=DEFAULT_REPEATS, help="runs per test (default 3)")
    parser.add_argument("--out", default="outputs/manual_run", help="folder for traces and test_run.json")
    parser.add_argument("--no-llm", action="store_true", help="scripts only, no user simulator")
    parser.add_argument("--no-cache", action="store_true",
                        help="fresh simulator replies on every run (for the reproducibility study, EH-6)")
    parser.add_argument("--agent-dir", help="folder of the agent to test (default: the travel agent)")
    parser.add_argument("--entry-point", help="file.py:function or module:function, or a URL with --interface http")
    parser.add_argument("--interface", choices=["python_module", "http"], default="python_module")
    args = parser.parse_args(argv)
    data = json.loads(Path(args.specs).read_text(encoding="utf-8"))
    ctx: dict[str, Any] = {
        "test_specs": data if isinstance(data, list) else [data],
        "folder": Path(args.out),
        "spec": {"run_config": {"repeats": args.repeats}},
        "use_llm": not args.no_llm,
        "simulator_cache": not args.no_cache,
    }
    if args.entry_point:
        ctx["spec"]["run_config"].update(entry_point=args.entry_point, interface=args.interface)
        ctx["repo_root"] = Path(args.agent_dir or ".").resolve()
    else:
        ctx["backend_factory"] = TravelAgentBackend
    print(run(ctx))
    print(f"traces and test_run.json saved in {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
