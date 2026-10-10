"""Static-runtime reconciliation (Phase 2): compare what the code claimed with what happened.

Input: the behavioral model, the test spec that targeted one entry, and one or more
runs (a trace plus the check results for that trace). Output: the model entry's status
and confidence are updated through ModelStore.apply_outcome, tools the agent called but
static analysis never found are added as `discovered`, and one finding is produced.

Rules, in short:
- Any failed check on a completed run contradicts the claim. The test fails if any check fails.
- No failures and the claim's tool was called: confirmed.
- No failures and the tool was never called: unreachable only after UNREACHABLE_MIN_RUNS
  completed runs. Fewer runs is inconclusive, so the model is left alone.
- A crash or timeout says nothing about the claim, so the model is left alone. The crash is
  still reported as a critical finding, so it can never hang or pass silently.
"""
import copy
import json
from pathlib import Path

from jsonschema import Draft202012Validator

from understand.model_store import ModelError

FINDING_SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "finding.schema.json"
_FINDING_VALIDATOR = Draft202012Validator(json.loads(FINDING_SCHEMA_PATH.read_text(encoding="utf-8")))

SEVERITIES = ["info", "minor", "major", "critical"]
DEFAULT_FAIL_SEVERITY = "major"  # used when a failed check carries no severity
CRASH_SEVERITY = "critical"      # rubric R12: no crash or empty reply
UNREACHABLE_MIN_RUNS = 3         # "never triggered after repeated attempts"


def validate_finding(finding):
    """Raise ModelError with a readable message if the finding breaks the schema."""
    errors = sorted(_FINDING_VALIDATOR.iter_errors(finding), key=lambda e: list(e.path))
    if errors:
        where = ".".join(str(p) for p in errors[0].path) or "finding"
        raise ModelError(f"{finding.get('finding_id', '?')}: {where}: {errors[0].message}")


def _tool_names(entry):
    """Tool names whose use would show the entry's claim being exercised."""
    names = set(entry.get("related_tools", []))
    if not names and entry["type"] == "capability":
        names = {entry["name"]}
    return names


def _called_tools(trace):
    return [
        call["name"]
        for turn in trace["turns"] if turn["role"] == "agent"
        for call in turn.get("tool_calls", [])
    ]


def _failed_checks(checks):
    for check in checks:
        if "passed" not in check:
            raise ModelError(f"check result without 'passed': {check}")
    return [c for c in checks if not c["passed"]]


def classify_run(entry, run):
    """Reduce one run (trace + checks) to the facts reconciliation needs."""
    trace = run["trace"]
    tools = _tool_names(entry)
    completed = trace["run_status"] == "completed"
    return {
        "trace_id": trace["trace_id"],
        "status": trace["run_status"],
        "error": trace.get("error", ""),
        "failed": _failed_checks(run.get("checks", [])) if completed else [],
        "exercised": completed and (not tools or bool(tools & set(_called_tools(trace)))),
    }


def decide_outcome(infos):
    """confirmed, contradicted, unreachable, or None (inconclusive, leave the model alone)."""
    done = [r for r in infos if r["status"] == "completed"]
    if not done:
        return None
    if any(r["failed"] for r in done):
        return "contradicted"
    if any(r["exercised"] for r in done):
        return "confirmed"
    if len(done) >= UNREACHABLE_MIN_RUNS:
        return "unreachable"
    return None


def _apply(store, entry_id, outcome, infos, test_id):
    """One bounded confidence step per run. Passing runs first, failing runs last,
    so a single failure always leaves the entry contradicted."""
    done = [r for r in infos if r["status"] == "completed"]
    if outcome == "contradicted":
        passing = [r for r in done if not r["failed"] and r["exercised"]]
        failing = [r for r in done if r["failed"]]
        steps = [("confirmed", r) for r in passing] + [("contradicted", r) for r in failing]
    elif outcome == "confirmed":
        steps = [("confirmed", r) for r in done if r["exercised"]]
    else:
        steps = [("unreachable", r) for r in done]
    for step_outcome, run in steps:
        store.apply_outcome(entry_id, step_outcome, test_id=test_id, trace_id=run["trace_id"])


def discover_new(store, spec, runs):
    """Add a `discovered` capability for every tool the agent called that the model lacks."""
    known = set()
    for e in store.entries.values():
        known.add(e["name"])
        known.update(e.get("related_tools", []))
    added = []
    for run in runs:
        trace = run["trace"]
        if trace["run_status"] != "completed":
            continue
        for name in _called_tools(trace):
            if name in known:
                continue
            entry = store.discover(
                "capability", name,
                f"Agent called {name}, which static analysis did not find",
                test_id=spec["test_id"], trace_id=trace["trace_id"], related_tools=[name],
            )
            known.add(name)
            added.append(entry["id"])
    return added


def _severity(infos):
    levels = []
    for r in infos:
        if r["status"] != "completed":
            levels.append(CRASH_SEVERITY)
        levels += [c.get("severity", DEFAULT_FAIL_SEVERITY) for c in r["failed"]]
    return max(levels, key=SEVERITIES.index) if levels else "info"


def _description(entry, infos, outcome):
    parts = []
    for r in infos:
        if r["status"] != "completed":
            parts.append(f"Target agent {r['status']}" + (f": {r['error']}" if r["error"] else "."))
        for c in r["failed"]:
            parts.append(c.get("description") or f"Check {c.get('rule_id', '?')} failed.")
    if parts:
        return " ".join(dict.fromkeys(parts))
    if outcome == "confirmed":
        return f"All checks passed. {entry['name']} behaved as claimed."
    return f"{entry['name']} was not exercised in these runs. No status change."


def reconcile(store, spec, runs, finding_id=None):
    """Reconcile the runs of one test against the entry it targeted.

    runs: list of {"trace": trace dict, "checks": [{"rule_id", "passed", "severity"?, "description"?}]}
    Returns {"outcome", "finding", "discovered"}. The store is updated in place.
    """
    if not runs:
        raise ModelError("reconcile needs at least one run")
    entry_id = spec["target_id"]
    before = copy.deepcopy(store.get(entry_id))
    infos = [classify_run(before, run) for run in runs]
    outcome = decide_outcome(infos)
    if outcome:
        _apply(store, entry_id, outcome, infos, spec["test_id"])
    discovered = discover_new(store, spec, runs)
    after = store.get(entry_id)

    bad = [r for r in infos if r["failed"] or r["status"] != "completed"]
    finding = {
        "finding_id": finding_id or f"F-{spec['test_id']}",
        "target_id": entry_id,
        "test_id": spec["test_id"],
        "trace_id": (bad or infos)[0]["trace_id"],
        "result": "fail" if bad else "pass",
        "severity": _severity(infos),
        "description": _description(before, infos, outcome),
        "reproducibility": {"runs": len(infos), "failures": len(bad)},
    }
    if outcome:
        finding["status_change"] = {"from": before["status"], "to": after["status"]}
        finding["confidence_change"] = {"from": before["confidence"], "to": after["confidence"]}
    validate_finding(finding)
    return {"outcome": outcome, "finding": finding, "discovered": discovered}


if __name__ == "__main__":
    import argparse
    import sys

    from understand.model_store import ModelStore

    parser = argparse.ArgumentParser(description="Reconcile one single-run test against the model.")
    parser.add_argument("model_json")
    parser.add_argument("spec_json")
    parser.add_argument("trace_json")
    parser.add_argument("checks_json", help="JSON list of check results for this trace")
    parser.add_argument("--finding-out", help="write the finding here (default: print only)")
    args = parser.parse_args()

    def load(path):
        return json.loads(Path(path).read_text(encoding="utf-8"))

    try:
        store = ModelStore.load(args.model_json)
        run = {"trace": load(args.trace_json), "checks": load(args.checks_json)}
        result = reconcile(store, load(args.spec_json), [run])
    except (ModelError, KeyError, OSError, json.JSONDecodeError) as exc:
        sys.exit(f"error: {exc}")
    store.version = "v1"
    store.save(args.model_json)
    if args.finding_out:
        Path(args.finding_out).write_text(json.dumps(result["finding"], indent=2), encoding="utf-8")
    print(json.dumps(result["finding"], indent=2))