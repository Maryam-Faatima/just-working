"""Campaign (MF-3): turns the runner's traces into checked, reconciled findings.

Runs after testing.runner. For each test spec it takes the traces of its repeated runs,
checks every trace against the rubric, and reconciles all runs of that spec in one call,
so the model, the findings and the report all see the same evidence.
"""
import json
import os
import tempfile
from pathlib import Path

from testing.checks import run_checks
from understand.model_store import ModelError, ModelStore
from understand.reconcile import reconcile


def group_traces(traces):
    """Traces grouped by the test that produced them."""
    groups = {}
    for trace in traces:
        groups.setdefault(trace["test_id"], []).append(trace)
    return groups


def scope_checks(checks, rubric, target_id):
    """Keep the checks that can speak for one entry: its own rule and the universal items.

    A rule that belongs to another entry is not blamed on this one. A result whose rule is
    not in the rubric is kept, so nothing is hidden silently."""
    items = {item["rule_id"]: item for item in rubric.get("items", [])}
    kept = []
    for check in checks:
        item = items.get(check.get("rule_id"))
        if item is None or item.get("target_id") == target_id or item.get("source") == "default":
            kept.append(check)
    return kept


def change_record(store, finding):
    """One model flip for the live view: which entry moved, from what to what, and why."""
    entry = store.get(finding["target_id"])
    status = finding.get("status_change", {})
    conf = finding.get("confidence_change", {})
    return {
        "entry_id": entry["id"], "entry_name": entry["name"], "entry_type": entry["type"],
        "test_id": finding["test_id"], "finding_id": finding["finding_id"],
        "result": finding["result"], "severity": finding["severity"],
        "status_from": status.get("from", entry["status"]), "status_to": status.get("to", entry["status"]),
        "confidence_from": conf.get("from", entry["confidence"]),
        "confidence_to": conf.get("to", entry["confidence"]),
        "runs": finding["reproducibility"]["runs"], "failures": finding["reproducibility"]["failures"],
    }


def discovered_record(store, entry_id, test_id):
    """A tool the agent used that static analysis missed, shown as a flip from nothing."""
    entry = store.get(entry_id)
    return {
        "entry_id": entry_id, "entry_name": entry["name"], "entry_type": entry["type"],
        "test_id": test_id, "finding_id": None, "result": "discovered", "severity": "info",
        "status_from": None, "status_to": "discovered",
        "confidence_from": None, "confidence_to": entry["confidence"], "runs": None, "failures": None,
    }


def write_changes(folder, state, changes, done, total):
    """Write model_changes.json atomically, so the frontend never reads half a file."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    data = {"state": state, "done_specs": done, "total_specs": total, "changes": changes}
    fd, tmp = tempfile.mkstemp(dir=folder, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, folder / "model_changes.json")


def run_campaign(store, rubric, specs, traces, use_llm=True, complete_json=None,
                 changes=None, on_progress=None):
    """Check and reconcile every spec that has traces. Returns (findings, skipped, discovered).

    A spec that cannot be reconciled (for example its target is not in the model) is listed
    in skipped and never stops the others."""
    groups = group_traces(traces)
    findings, skipped, discovered = [], [], []
    for spec in specs:
        spec_traces = groups.get(spec["test_id"])
        if not spec_traces:
            continue
        runs = [
            {"trace": t, "checks": scope_checks(
                run_checks(t, rubric, complete_json=complete_json, use_llm=use_llm),
                rubric, spec.get("target_id"))}
            for t in spec_traces
        ]
        try:
            result = reconcile(store, spec, runs)
        except (ModelError, KeyError) as exc:
            skipped.append({"test_id": spec["test_id"], "reason": str(exc)})
            continue
        findings.append(result["finding"])
        discovered += result["discovered"]
        if changes is not None:
            changes.append(change_record(store, result["finding"]))
            changes.extend(discovered_record(store, i, spec["test_id"]) for i in result["discovered"])
        if on_progress:
            on_progress()
    return findings, skipped, discovered


def run(ctx):
    """Pipeline stage after 'test'. Updates ctx["store"] in place and sets ctx["findings"].

    While it works it keeps <output folder>/model_changes.json up to date, one record per
    model flip, so the frontend can show entries changing as the tests are reconciled."""
    store, rubric, traces = ctx.get("store"), ctx.get("rubric"), ctx.get("traces")
    if store is None or rubric is None:
        return "skipped: no model or rubric"
    if not traces:
        return "skipped: no traces yet"
    folder = Path(ctx["folder"]) if ctx.get("folder") else None
    changes = []
    total = len(group_traces(traces))
    done = []

    def on_progress():
        done.append(1)
        write_changes(folder, "running", changes, len(done), total)

    if folder:
        write_changes(folder, "running", changes, 0, total)
    findings, skipped, discovered = run_campaign(
        store, rubric, ctx.get("test_specs") or [], traces, use_llm=ctx.get("use_llm", True),
        changes=changes, on_progress=on_progress if folder else None,
    )
    ctx["findings"] = findings
    if folder:
        write_changes(folder, "done", changes, total, total)
        # The updated model, next to the untouched V0. The store in ctx keeps its own version.
        ModelStore(store.agent, "v1", list(store.entries.values())).save(folder / "model_v1.json")
        (folder / "findings.json").write_text(json.dumps(findings, indent=2) + "\n", encoding="utf-8")
    failed = sum(1 for f in findings if f["result"] == "fail")
    detail = f"{len(findings)} finding(s), {failed} failed, {len(discovered)} discovered"
    if skipped:
        detail += f"; {len(skipped)} skipped ({skipped[0]['reason']})"
    return detail
