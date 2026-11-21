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

    # Everything the testing lane produced comes from ctx, or from the files it wrote to the
    # agent's folder when the report stage runs on its own.
    findings = _from_ctx_or_disk(ctx, "findings", folder / "findings.json")
    test_specs = _from_ctx_or_disk(ctx, "test_specs", folder / "test_specs.json")
    traces = list(ctx.get("traces") or []) or _read_traces(folder / "traces")

    graph = build_graph(
        store_dict=store.to_dict(),
        rubric=rubric,
        spec=spec,
        findings=findings,
        test_specs=test_specs,
        traces=traces,
    )

    graph_path = save_graph(graph, folder)
    report_path = _write_report(
        graph, folder, ctx.get("name", "unknown"),
        judge=_read_json(folder / "judge_results.json"),
        checks=_read_json(folder / "check_results.json"),
    )

    stats = graph["stats"]
    return (
        f"evidence graph: {stats['nodes']} nodes, {stats['edges']} edges"
        f" — {graph_path.name}, {report_path.name}"
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _read_json(path: Path):
    """Parsed JSON file, or None if it is missing or unreadable."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _from_ctx_or_disk(ctx: dict, key: str, path: Path) -> list[dict]:
    """A list from ctx[key], else from a JSON list on disk, else empty."""
    value = list(ctx.get(key) or [])
    if value:
        return value
    data = _read_json(path)
    return [d for d in data if isinstance(d, dict)] if isinstance(data, list) else []


def _read_traces(traces_dir: Path) -> list[dict]:
    traces = []
    for path in sorted(traces_dir.glob("*.json")) if traces_dir.is_dir() else []:
        data = _read_json(path)
        if isinstance(data, dict) and data.get("trace_id"):
            traces.append(data)
    return traces


def _percent(part: int, whole: int) -> str:
    return f"{round(100 * part / whole)}%" if whole else "n/a"


def _coverage_lines(graph: dict) -> list[str]:
    """Which model entries a test (or finding) reached, by entry type."""
    entries = [n for n in graph["nodes"] if n["kind"] == "model_entry"]
    reached = {e["from"] for e in graph["edges"] if e["relation"] == "targeted_by"}
    reached |= {e["from"] for e in graph["edges"] if e["relation"] == "has_finding"}
    by_type: dict[str, list[int]] = {}
    for n in entries:
        row = by_type.setdefault(n.get("entry_type", "?"), [0, 0])
        row[0] += 1
        row[1] += n["id"] in reached
    stats = graph["stats"]
    lines = ["| Entry type | Entries | Tested | Coverage |", "|---|---|---|---|"]
    for etype, (total, tested) in sorted(by_type.items()):
        lines.append(f"| {etype} | {total} | {tested} | {_percent(tested, total)} |")
    total = sum(r[0] for r in by_type.values())
    tested = sum(r[1] for r in by_type.values())
    lines.append(f"| **All** | **{total}** | **{tested}** | **{_percent(tested, total)}** |")
    lines += ["", f"Tests: {stats.get('test_spec_nodes', 0)}, traces: {stats.get('trace_nodes', 0)}."]
    return lines


def _severity_lines(findings: list[dict]) -> list[str]:
    order = ["critical", "major", "minor", "info"]
    counts = {sev: [0, 0] for sev in order}   # [failed, passed]
    for f in findings:
        row = counts.get(f.get("severity"))
        if row is not None:
            row[0 if f.get("result") == "fail" else 1] += 1
    lines = ["| Severity | Failed | Passed |", "|---|---|---|"]
    lines += [f"| {sev} | {counts[sev][0]} | {counts[sev][1]} |" for sev in order]
    return lines


def _changes_lines(findings: list[dict], names: dict[str, str]) -> list[str]:
    rows = []
    for f in sorted(findings, key=lambda x: str(x.get("target_id"))):
        sc, cc = f.get("status_change"), f.get("confidence_change")
        if not (sc or cc):
            continue
        status = f"`{sc['from']}` → `{sc['to']}`" if sc else "—"
        conf = f"{cc['from']:.2f} → {cc['to']:.2f}" if cc else "—"
        target = f.get("target_id", "?")
        rows.append(f"| {target} | {names.get(target, '')} | {status} | {conf} | {f.get('finding_id', '')} |")
    if not rows:
        return ["_No model entry changed._"]
    return ["| Entry | Name | Status | Confidence | Finding |", "|---|---|---|---|---|", *rows]


def _judge_lines(judge, checks) -> list[str]:
    """What the LLM judge said about the last trace it scored, set beside the rule checks."""
    if not isinstance(judge, dict) or not isinstance(judge.get("overall_quality"), dict):
        return []
    overall = judge["overall_quality"]
    check_list = checks.get("checks") if isinstance(checks, dict) else checks
    check_list = [c for c in check_list or [] if isinstance(c, dict)]
    failed_checks = [c.get("rule_id", "?") for c in check_list if c.get("verdict") == "fail"]
    failed_rules = [r.get("rule_id", "?") for r in judge.get("rule_scores", []) if r.get("verdict") == "fail"]
    lines = [
        "",
        "## LLM Judge",
        "",
        f"Trace {judge.get('trace_id', '?')}: overall quality {overall.get('score', '?')}/5 "
        f"({overall.get('verdict', '?')}). {overall.get('reasoning', '')}".strip(),
        "",
        f"Rule checks failed: {', '.join(failed_checks) or 'none'}. "
        f"Judge rule scores failed: {', '.join(failed_rules) or 'none'}.",
    ]
    if overall.get("verdict") == "fail" and not failed_checks and check_list:
        lines += ["", "**Flag:** the judge rates this conversation as failing, but no rule check failed. "
                      "The rubric may be missing a rule for this behaviour."]
    return lines


def _write_report(graph: dict, folder: Path, agent: str, judge=None, checks=None) -> Path:
    """Write a human-readable markdown summary of the evidence graph."""
    stats = graph["stats"]
    entry_nodes = [n for n in graph["nodes"] if n["kind"] == "model_entry"]
    finding_nodes = [n for n in graph["nodes"] if n["kind"] == "finding"]
    names = {n["id"]: n.get("name", "") for n in entry_nodes}

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
        "## Coverage",
        "",
        *_coverage_lines(graph),
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
        lines += ["", "## Findings", "", *_severity_lines(finding_nodes), ""]
        for f in finding_nodes:
            result = f.get("result", "?")
            sev = f.get("severity", "?")
            desc = (f.get("description") or "")[:100]
            lines.append(
                f"- **{f.get('finding_id', f['id'])}** "
                f"[{result}] severity={sev} — {desc}"
            )
            repro = f.get("reproducibility")
            if repro:
                lines.append(f"  - Reproducibility: {repro['failures']} of {repro['runs']} runs failed")
            sc = f.get("status_change")
            if sc:
                lines.append(f"  - Status change: `{sc['from']}` → `{sc['to']}`")
            cc = f.get("confidence_change")
            if cc:
                lines.append(
                    f"  - Confidence change: {cc['from']:.2f} → {cc['to']:.2f}"
                )
        lines += ["", "## Model Changes", "", *_changes_lines(finding_nodes, names)]
    else:
        lines += ["", "_No findings yet — the test stage produced no traces. Set the agent's entry point "
                      "(`run_config` in spec.json) and run the pipeline again._", ""]

    lines += _judge_lines(judge, checks)
    lines.append("")
    report_path = folder / "report.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path
