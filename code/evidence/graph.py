"""Evidence graph builder (Phase 3).

Constructs a directed graph that links every piece of the evidence chain:

    code_location / developer_rule
        → model_entry  (capability / workflow / constraint)
            → test_spec
                → trace
                    → finding

Node kinds
----------
code_location   A source file location that justified a model entry.
developer_rule  A developer-supplied rule from the Phase 0 spec (R1, R2, …).
model_entry     One entry in the Behavioral Model V0/V1.
test_spec       A test scenario targeting a model entry.
trace           The raw conversation produced by one test run.
finding         The reconciliation result for one test run batch.

Edge relations
--------------
supports        code_location  → model_entry   (static evidence)
defines         developer_rule → model_entry   (developer evidence)
targeted_by     model_entry    → test_spec     (test_spec.target_id)
produces        test_spec      → trace         (trace.test_id)
triggers        trace          → finding       (finding.trace_id)
has_finding     model_entry    → finding       (finding.target_id)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def build_graph(
    store_dict: dict,
    rubric: dict | None = None,
    spec: dict | None = None,
    findings: list[dict] | None = None,
    test_specs: list[dict] | None = None,
    traces: list[dict] | None = None,
) -> dict:
    """Build an evidence graph from all available pipeline data.

    Parameters
    ----------
    store_dict:
        Output of ``ModelStore.to_dict()`` — keys: ``agent``, ``version``,
        ``entries`` (list of model entry dicts).
    rubric:
        Rubric dict (rubric.schema.json shape). Used to enrich developer-rule
        nodes with ``kind`` and ``severity``.
    spec:
        Developer spec dict (requirements_spec.schema.json shape). Used to
        resolve rule descriptions.
    findings:
        List of Finding dicts (finding.schema.json shape).
    test_specs:
        List of TestSpec dicts (test_spec.schema.json shape). When provided,
        node attributes (persona, goal, …) are richer.
    traces:
        List of Trace dicts (trace.schema.json shape).

    Returns
    -------
    dict
        ``{"agent", "built_at", "nodes", "edges", "stats"}``
    """
    # Use dict keyed by node id so we can lookup membership in O(1).
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, str]] = []
    edge_keys: set[tuple[str, str, str]] = set()

    # ── helpers ──────────────────────────────────────────────────────────────

    def add_node(node_id: str, kind: str, **attrs: Any) -> None:
        """Add a node only if its id has not been seen before."""
        if node_id not in nodes:
            nodes[node_id] = {"id": node_id, "kind": kind, **attrs}

    def add_edge(from_id: str, to_id: str, relation: str) -> None:
        """Add a directed edge, silently skipping exact duplicates."""
        key = (from_id, to_id, relation)
        if key not in edge_keys:
            edge_keys.add(key)
            edges.append({"from": from_id, "to": to_id, "relation": relation})

    # ── normalise store entries ───────────────────────────────────────────────
    agent = store_dict.get("agent", "unknown")
    raw = store_dict.get("entries", [])
    entries: list[dict] = list(raw.values()) if isinstance(raw, dict) else list(raw)

    # ── index lookup helpers ──────────────────────────────────────────────────
    rubric_by_rule: dict[str, dict] = {
        item["rule_id"]: item
        for item in (rubric or {}).get("items", [])
    }
    spec_rules: dict[str, dict] = {
        r.get("id", ""): r
        for r in (spec or {}).get("rules", [])
        if r.get("id")
    }

    # ══════════════════════════════════════════════════════════════════════════
    # PASS 1 — Create all nodes (richest data source wins first)
    # ══════════════════════════════════════════════════════════════════════════

    # TestSpec nodes — process before entries so runtime-evidence placeholders
    # don't overwrite richer attributes.
    for ts in (test_specs or []):
        ts_id = ts.get("test_id", "")
        add_node(
            f"test:{ts_id}",
            "test_spec",
            test_id=ts_id,
            target_id=ts.get("target_id"),
            category=ts.get("category"),
            persona=ts.get("persona"),
            goal=ts.get("goal"),
            difficulty=ts.get("difficulty"),
        )

    # Trace nodes
    for tr in (traces or []):
        tr_id = tr.get("trace_id", "")
        add_node(
            f"trace:{tr_id}",
            "trace",
            trace_id=tr_id,
            test_id=tr.get("test_id"),
            run_status=tr.get("run_status"),
            turns=len(tr.get("turns", [])),
        )

    # Finding nodes
    for f in (findings or []):
        f_id = f.get("finding_id", "")
        add_node(
            f"finding:{f_id}",
            "finding",
            finding_id=f_id,
            result=f.get("result"),
            severity=f.get("severity"),
            description=f.get("description"),
            status_change=f.get("status_change"),
            confidence_change=f.get("confidence_change"),
        )

    # Model-entry nodes + their upstream evidence nodes
    for entry in entries:
        entry_id = entry["id"]
        add_node(
            entry_id,
            "model_entry",
            entry_type=entry["type"],
            name=entry["name"],
            status=entry["status"],
            confidence=entry["confidence"],
            detected_by=entry.get("detected_by"),
        )

        for ev in entry.get("evidence", []):
            source = ev.get("source")

            if source == "static":
                file_ = ev.get("file", "unknown")
                lines = ev.get("lines", "")
                loc_id = f"code:{file_}:{lines}"
                add_node(
                    loc_id,
                    "code_location",
                    file=file_,
                    lines=lines,
                    pattern=ev.get("pattern", ""),
                )

            elif source == "developer":
                pattern = ev.get("pattern", "")
                if pattern.startswith("phase0:rule:"):
                    rule_id = pattern.split(":", 2)[-1]
                    rule_node_id = f"rule:{rule_id}"
                    rubric_item = rubric_by_rule.get(rule_id, {})
                    add_node(
                        rule_node_id,
                        "developer_rule",
                        rule_id=rule_id,
                        description=spec_rules.get(rule_id, {}).get("text", rule_id),
                        rule_kind=rubric_item.get("kind", ""),
                        severity=rubric_item.get("severity", ""),
                    )

            elif source == "runtime":
                # Placeholder nodes in case caller didn't pass full test_specs/traces.
                test_id = ev.get("test_id")
                trace_id = ev.get("trace_id")
                if test_id:
                    add_node(f"test:{test_id}", "test_spec", test_id=test_id)
                if trace_id:
                    add_node(f"trace:{trace_id}", "trace", trace_id=trace_id)

    # ══════════════════════════════════════════════════════════════════════════
    # PASS 2 — Create all edges (nodes must all exist first)
    # ══════════════════════════════════════════════════════════════════════════

    # Edges derived from model-entry evidence arrays
    for entry in entries:
        entry_id = entry["id"]
        for ev in entry.get("evidence", []):
            source = ev.get("source")

            if source == "static":
                file_ = ev.get("file", "unknown")
                lines = ev.get("lines", "")
                loc_id = f"code:{file_}:{lines}"
                add_edge(loc_id, entry_id, "supports")

            elif source == "developer":
                pattern = ev.get("pattern", "")
                if pattern.startswith("phase0:rule:"):
                    rule_id = pattern.split(":", 2)[-1]
                    add_edge(f"rule:{rule_id}", entry_id, "defines")

            elif source == "runtime":
                test_id = ev.get("test_id")
                trace_id = ev.get("trace_id")
                if test_id:
                    add_edge(entry_id, f"test:{test_id}", "targeted_by")
                if test_id and trace_id:
                    add_edge(f"test:{test_id}", f"trace:{trace_id}", "produces")

    # Edges from test-spec target_id → entry, and test_spec → (traces via test_id)
    for ts in (test_specs or []):
        ts_id = ts.get("test_id", "")
        target_id = ts.get("target_id", "")
        ts_node_id = f"test:{ts_id}"
        if target_id and target_id in nodes:
            add_edge(target_id, ts_node_id, "targeted_by")

    # Edges from traces → test specs
    for tr in (traces or []):
        tr_id = tr.get("trace_id", "")
        test_id = tr.get("test_id", "")
        if test_id:
            add_edge(f"test:{test_id}", f"trace:{tr_id}", "produces")

    # Edges from findings → traces + model entries
    for f in (findings or []):
        f_id = f.get("finding_id", "")
        f_node_id = f"finding:{f_id}"
        trace_id = f.get("trace_id", "")
        target_id = f.get("target_id", "")
        if trace_id:
            add_edge(f"trace:{trace_id}", f_node_id, "triggers")
        if target_id and target_id in nodes:
            add_edge(target_id, f_node_id, "has_finding")

    # ── Stats ─────────────────────────────────────────────────────────────────
    kind_counts: dict[str, int] = {}
    for n in nodes.values():
        k = n["kind"]
        kind_counts[k] = kind_counts.get(k, 0) + 1

    return {
        "agent": agent,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "nodes": list(nodes.values()),
        "edges": edges,
        "stats": {
            "nodes": len(nodes),
            "edges": len(edges),
            **{f"{k}_nodes": v for k, v in sorted(kind_counts.items())},
        },
    }


def save_graph(graph: dict, folder: Path) -> Path:
    """Write *evidence_graph.json* to *folder*, creating it if needed.

    Returns the path that was written.
    """
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "evidence_graph.json"
    path.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    return path
