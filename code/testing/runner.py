"""Test runner (EH-3): runs test specs against the agent under test and saves every trace.

The pipeline calls run(ctx) as stage 5 ("test"). For each test spec the runner:

1. checks the spec against schemas/test_spec.schema.json (an invalid spec is reported, not run);
2. sends the spec's scripted user messages through the adapter, up to the turn budget
   ({date+N} in a message becomes the date N days from today, so tests never expire);
3. repeats the conversation as many times as the developer asked in Phase 0
   (run_config.repeats, default 3), so results can be reported as passes out of total runs;
4. saves each trace to <output folder>/traces/<test_id>_run<k>.json.

It then writes <output folder>/test_run.json and puts the specs, traces and summary into ctx
for the checks (MF), the judge (AY) and the report stage.

Specs without a script are listed as "not_run": they need the user simulator (EH-2).
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

from testing.adapter import REPO_ROOT, Adapter, Backend, TravelAgentBackend, run_conversation

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


def spec_problem(spec: dict[str, Any]) -> str | None:
    """Why a spec cannot run, or None if it is valid and has a script."""
    schema = json.loads(TEST_SPEC_SCHEMA_PATH.read_text(encoding="utf-8"))
    try:
        jsonschema.validate(spec, schema)
    except jsonschema.ValidationError as exc:
        return f"invalid test spec: {exc.message}"
    if not spec.get("script"):
        return "no script yet; needs the user simulator (EH-2)"
    return None


def run_test(spec: dict[str, Any], backend_factory: BackendFactory, repeats: int, traces_dir: Path) -> dict[str, Any]:
    """Runs one spec `repeats` times. Returns its summary; traces are saved to traces_dir."""
    test_id = str(spec.get("test_id", "unknown"))
    summary: dict[str, Any] = {"test_id": test_id, "target_id": spec.get("target_id"), "runs": 0}
    problem = spec_problem(spec)
    if problem:
        summary.update(status="invalid" if problem.startswith("invalid") else "not_run", reason=problem)
        return summary
    counts = dict.fromkeys(STATUSES, 0)
    files: list[str] = []
    traces: list[dict[str, Any]] = []
    for k in range(1, repeats + 1):
        adapter = Adapter(backend_factory(), test_id=test_id, modality=spec["modality"])
        trace = run_conversation(adapter, expand_script(spec["script"]), spec["turn_budget"])
        counts[trace["run_status"]] += 1
        path = traces_dir / f"{test_id}_run{k}.json"
        path.write_text(json.dumps(trace, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        files.append(path.name)
        traces.append(trace)
    summary.update(status="ran", runs=repeats, **counts, traces=files)
    summary["_traces"] = traces  # kept in memory for ctx, not written to test_run.json
    return summary


def run(ctx: dict[str, Any]) -> str:
    """Pipeline stage 5. Returns a one-line summary for the run log."""
    specs = load_test_specs(ctx)
    if not specs:
        return "no test specs yet"
    folder = Path(ctx.get("folder") or Path("outputs") / ctx.get("name", "agent"))
    traces_dir = folder / "traces"
    traces_dir.mkdir(parents=True, exist_ok=True)
    backend_factory: BackendFactory = ctx.get("backend_factory") or TravelAgentBackend
    repeats = repeats_for(ctx)

    results = [run_test(spec, backend_factory, repeats, traces_dir) for spec in specs]
    all_traces = [t for r in results for t in r.pop("_traces", [])]
    totals = {s: sum(r.get(s, 0) for r in results) for s in STATUSES}
    ran = sum(1 for r in results if r["status"] == "ran")
    skipped = len(results) - ran
    run_record = {"repeats": repeats, "tests": results, "totals": totals}
    (folder / "test_run.json").write_text(json.dumps(run_record, indent=2) + "\n", encoding="utf-8")

    ctx["test_specs"] = specs
    ctx["traces"] = all_traces
    ctx["test_run"] = run_record
    detail = (f"{ran} test(s) x {repeats} run(s): {totals['completed']} completed, "
              f"{totals['crashed']} crashed, {totals['timeout']} timed out")
    return detail + (f"; {skipped} not run" if skipped else "")


def main(argv: list[str] | None = None) -> int:
    """Runs test specs by hand: python -m testing.runner SPEC.json [--repeats N] [--out FOLDER]."""
    import argparse

    parser = argparse.ArgumentParser(description="Run test specs against the target agent and save the traces.")
    parser.add_argument("specs", help="a test spec JSON file (one spec or a list of specs)")
    parser.add_argument("--repeats", type=int, default=DEFAULT_REPEATS, help="runs per test (default 3)")
    parser.add_argument("--out", default="outputs/manual_run", help="folder for traces and test_run.json")
    args = parser.parse_args(argv)
    data = json.loads(Path(args.specs).read_text(encoding="utf-8"))
    ctx: dict[str, Any] = {
        "test_specs": data if isinstance(data, list) else [data],
        "folder": Path(args.out),
        "spec": {"run_config": {"repeats": args.repeats}},
    }
    print(run(ctx))
    print(f"traces and test_run.json saved in {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
