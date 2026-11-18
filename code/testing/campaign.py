"""Campaign (MF-3): turns the runner's traces into checked, reconciled findings.

Runs after testing.runner. For each test spec it takes the traces of its repeated runs,
checks every trace against the rubric, and reconciles all runs of that spec in one call,
so the model, the findings and the report all see the same evidence.
"""
import json
from pathlib import Path

from testing.checks import run_checks
from understand.model_store import ModelError
from understand.reconcile import reconcile


def group_traces(traces):
    """Traces grouped by the test that produced them."""
    groups = {}
    for trace in traces:
        groups.setdefault(trace["test_id"], []).append(trace)
    return groups


def run_campaign(store, rubric, specs, traces, use_llm=True, complete_json=None):
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
            {"trace": t, "checks": run_checks(t, rubric, complete_json=complete_json, use_llm=use_llm)}
            for t in spec_traces
        ]
        try:
            result = reconcile(store, spec, runs)
        except (ModelError, KeyError) as exc:
            skipped.append({"test_id": spec["test_id"], "reason": str(exc)})
            continue
        findings.append(result["finding"])
        discovered += result["discovered"]
    return findings, skipped, discovered


def run(ctx):
    """Pipeline stage after 'test'. Updates ctx["store"] in place and sets ctx["findings"]."""
    store, rubric, traces = ctx.get("store"), ctx.get("rubric"), ctx.get("traces")
    if store is None or rubric is None:
        return "skipped: no model or rubric"
    if not traces:
        return "skipped: no traces yet"
    findings, skipped, discovered = run_campaign(
        store, rubric, ctx.get("test_specs") or [], traces, use_llm=ctx.get("use_llm", True)
    )
    ctx["findings"] = findings
    folder = ctx.get("folder")
    if folder:
        folder = Path(folder)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "findings.json").write_text(json.dumps(findings, indent=2) + "\n", encoding="utf-8")
    failed = sum(1 for f in findings if f["result"] == "fail")
    detail = f"{len(findings)} finding(s), {failed} failed, {len(discovered)} discovered"
    if skipped:
        detail += f"; {len(skipped)} skipped ({skipped[0]['reason']})"
    return detail