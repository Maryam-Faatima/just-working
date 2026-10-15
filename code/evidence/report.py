"""Pipeline hook for the evidence/report stage (Phase 3).

Called automatically by pipeline.py as stage 7::

    ("report", optional_stage("evidence.report", "build"))

``build(ctx)`` reads the populated ModelStore, rubric, spec, and any
findings collected by the testing lane, then writes two files:

* ``evidence_graph.json`` — machine-readable evidence graph
* ``report.md``           — human-readable markdown summary
"""
from __future__ import annotations

import json
from pathlib import Path

from evidence.graph import build_graph, save_graph


def build(ctx: dict) -> str:
    """Build the evidence graph and a markdown report.

    Reads from *ctx*
    ----------------
    store      ModelStore instance (has ``.to_dict()``).  Required.
    rubric     Rubric dict or None.
    spec       Spec dict or None.
    findings   list[Finding dict] — set by the testing lane, optional.
    folder     Path — output folder for this agent run.
    name       str  — agent name used in the report heading.

    Writes
    ------
    ``<folder>/evidence_graph.json``
    ``<folder>/report.md``

    Returns a one-line summary string for the pipeline run_summary.
    """
    store = ctx.get("store")
    if store is None:
        return "skipped — no model store in context"

    folder: Path = ctx["folder"]
    rubric: dict | None = ctx.get("rubric")
    spec: dict | None = ctx.get("spec")

    # Findings may come from the testing lane via ctx, or from a findings.json
    # written to disk by a previous run.
    findings: list[dict] = list(ctx.get("findings") or [])
    if not findings:
        findings_path = folder / "findings.json"
        if findings_path.exists():
            try:
                findings = json.loads(findings_path.read_text(encoding="utf-8"))
            except (OSError, ValueError, json.JSONDecodeError):
                findings = []

    graph = build_graph(
        store_dict=store.to_dict(),
        rubric=rubric,
        spec=spec,
        findings=findings,
    )

    graph_path = save_graph(graph, folder)
    report_path = _write_report(graph, folder, ctx.get("name", "unknown"))

    stats = graph["stats"]
    return (
        f"evidence graph: {stats['nodes']} nodes, {stats['edges']} edges"
        f" — {graph_path.name}, {report_path.name}"
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _write_report(graph: dict, folder: Path, agent: str) -> Path:
    """Write a human-readable markdown summary of the evidence graph."""
    stats = graph["stats"]
    entry_nodes = [n for n in graph["nodes"] if n["kind"] == "model_entry"]
    finding_nodes = [n for n in graph["nodes"] if n["kind"] == "finding"]

    lines = [
        f"# Evidence Report — {agent}",
        "",
        f"Generated: {graph['built_at']}",
        "",
        "## Summary",
        "",
        "| Kind | Count |",
        "|---|---|",
        f"| Model entries | {stats.get('model_entry_nodes', 0)} |",
        f"| Code locations | {stats.get('code_location_nodes', 0)} |",
        f"| Developer rules | {stats.get('developer_rule_nodes', 0)} |",
        f"| Test specs | {stats.get('test_spec_nodes', 0)} |",
        f"| Traces | {stats.get('trace_nodes', 0)} |",
        f"| Findings | {stats.get('finding_nodes', 0)} |",
        f"| **Total edges** | **{stats['edges']}** |",
        "",
        "## Model Entries",
        "",
    ]

    for e in sorted(entry_nodes, key=lambda x: x["id"]):
        conf = e.get("confidence", 0)
        status = e.get("status", "unknown")
        etype = e.get("entry_type", "?")
        lines.append(
            f"- **{e['id']}** ({etype}) `{status}` "
            f"confidence={conf:.2f} — {e.get('name', '')}"
        )

    if finding_nodes:
        lines += ["", "## Findings", ""]
        for f in finding_nodes:
            result = f.get("result", "?")
            sev = f.get("severity", "?")
            desc = (f.get("description") or "")[:100]
            lines.append(
                f"- **{f.get('finding_id', f['id'])}** "
                f"[{result}] severity={sev} — {desc}"
            )
            sc = f.get("status_change")
            if sc:
                lines.append(f"  - Status change: `{sc['from']}` → `{sc['to']}`")
            cc = f.get("confidence_change")
            if cc:
                lines.append(
                    f"  - Confidence change: {cc['from']:.2f} → {cc['to']:.2f}"
                )
    else:
        lines += ["", "_No findings yet — run the testing lane to populate._", ""]

    lines.append("")
    report_path = folder / "report.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path
