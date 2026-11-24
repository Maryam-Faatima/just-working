"""Tests for evidence/graph.py and evidence/report.py.

Covers:
- Node creation for every kind (code_location, developer_rule, model_entry,
  test_spec, trace, finding)
- Edge creation for every relation (supports, defines, targeted_by, produces,
  triggers, has_finding)
- Deduplication of nodes and edges
- Graceful handling of empty / partial inputs
- save_graph roundtrip
- build(ctx) pipeline hook — happy path, skip on missing store, disk fallback
"""
import json

import pytest

from evidence.graph import build_graph, save_graph
from evidence.report import build
from understand.model_store import ModelStore


# ── shared test data ──────────────────────────────────────────────────────────

def _entry(
    entry_id="cap_001",
    etype="capability",
    name="search_flights",
    status="unverified",
    confidence=0.70,
    evidence=None,
    detected_by="rule",
):
    return {
        "id": entry_id,
        "type": etype,
        "name": name,
        "description": f"Agent can {name}.",
        "evidence": evidence or [{"source": "static", "file": "tools.py", "lines": "10-20"}],
        "confidence": confidence,
        "status": status,
        "detected_by": detected_by,
    }


def _store_dict(entries=None, agent="demo"):
    """Build a minimal store dict with a list of entries."""
    return {
        "agent": agent,
        "version": "v0",
        "entries": entries or [_entry()],
    }


def _finding(
    finding_id="F-001",
    target_id="cap_001",
    test_id="RT-001",
    trace_id="TR-001",
    result="fail",
    severity="major",
):
    return {
        "finding_id": finding_id,
        "target_id": target_id,
        "test_id": test_id,
        "trace_id": trace_id,
        "result": result,
        "severity": severity,
        "description": "Test failed.",
        "reproducibility": {"runs": 1, "failures": 1},
    }


def _trace(trace_id="TR-001", test_id="RT-001", run_status="completed"):
    return {
        "trace_id": trace_id,
        "test_id": test_id,
        "modality": "text",
        "run_status": run_status,
        "turns": [
            {"turn": 1, "role": "user", "content": "hello"},
            {"turn": 2, "role": "agent", "content": "hi",
             "tool_calls": [{"name": "search_flights"}]},
        ],
    }


def _test_spec(test_id="RT-001", target_id="cap_001"):
    return {
        "test_id": test_id,
        "target_id": target_id,
        "category": "functional",
        "persona": "curious traveller",
        "goal": "find a flight",
        "success_criteria": "agent returns flights",
        "difficulty": 3,
        "turn_budget": 5,
        "modality": "text",
        "generated_by": "seed",
    }


def _ids(graph):
    return {n["id"] for n in graph["nodes"]}


def _rels(graph):
    return {(e["from"], e["to"], e["relation"]) for e in graph["edges"]}


def _node(graph, node_id):
    return next((n for n in graph["nodes"] if n["id"] == node_id), None)


# ══════════════════════════════════════════════════════════════════════════════
# 1. Empty / minimal inputs
# ══════════════════════════════════════════════════════════════════════════════

def test_empty_store_gives_empty_graph():
    g = build_graph({"agent": "x", "version": "v0", "entries": []})
    assert g["nodes"] == []
    assert g["edges"] == []
    assert g["stats"]["nodes"] == 0
    assert g["stats"]["edges"] == 0
    assert g["agent"] == "x"


def test_no_optional_args_does_not_raise():
    g = build_graph(_store_dict())
    assert g["stats"]["nodes"] >= 1


def test_entries_as_dict_is_normalised():
    """ModelStore.entries is a dict keyed by id; build_graph must handle it."""
    store_with_dict_entries = {
        "agent": "demo",
        "version": "v0",
        "entries": {"cap_001": _entry()},
    }
    g = build_graph(store_with_dict_entries)
    assert "cap_001" in _ids(g)


# ══════════════════════════════════════════════════════════════════════════════
# 2. model_entry nodes
# ══════════════════════════════════════════════════════════════════════════════

def test_model_entry_node_created_with_correct_attributes():
    g = build_graph(_store_dict())
    n = _node(g, "cap_001")
    assert n is not None
    assert n["kind"] == "model_entry"
    assert n["entry_type"] == "capability"
    assert n["name"] == "search_flights"
    assert n["status"] == "unverified"
    assert n["confidence"] == 0.70


def test_multiple_entries_all_become_nodes():
    entries = [
        _entry("cap_001", name="search_flights"),
        _entry("cap_002", name="book_flight"),
        _entry("con_001", etype="constraint", name="confirm_before_cancel"),
    ]
    g = build_graph(_store_dict(entries))
    ids = _ids(g)
    assert {"cap_001", "cap_002", "con_001"}.issubset(ids)


# ══════════════════════════════════════════════════════════════════════════════
# 3. code_location nodes and "supports" edges
# ══════════════════════════════════════════════════════════════════════════════

def test_static_evidence_creates_code_location_node():
    entry = _entry(evidence=[{"source": "static", "file": "tools.py", "lines": "10-20",
                               "pattern": "decorator:tool"}])
    g = build_graph(_store_dict([entry]))
    loc_id = "code:tools.py:10-20"
    assert loc_id in _ids(g)
    n = _node(g, loc_id)
    assert n["kind"] == "code_location"
    assert n["file"] == "tools.py"
    assert n["lines"] == "10-20"
    assert n["pattern"] == "decorator:tool"


def test_static_evidence_creates_supports_edge():
    entry = _entry(evidence=[{"source": "static", "file": "tools.py", "lines": "10-20"}])
    g = build_graph(_store_dict([entry]))
    assert ("code:tools.py:10-20", "cap_001", "supports") in _rels(g)


def test_multiple_static_evidence_items_create_multiple_code_nodes():
    entry = _entry(evidence=[
        {"source": "static", "file": "a.py", "lines": "1-5"},
        {"source": "static", "file": "b.py", "lines": "10-15"},
    ])
    g = build_graph(_store_dict([entry]))
    assert "code:a.py:1-5" in _ids(g)
    assert "code:b.py:10-15" in _ids(g)
    assert len([e for e in g["edges"] if e["relation"] == "supports"]) == 2


# ══════════════════════════════════════════════════════════════════════════════
# 4. developer_rule nodes and "defines" edges
# ══════════════════════════════════════════════════════════════════════════════

def test_developer_evidence_creates_rule_node():
    entry = _entry(evidence=[{"source": "developer", "pattern": "phase0:rule:R1"}])
    g = build_graph(_store_dict([entry]))
    rule_id = "rule:R1"
    assert rule_id in _ids(g)
    n = _node(g, rule_id)
    assert n["kind"] == "developer_rule"
    assert n["rule_id"] == "R1"


def test_developer_evidence_uses_spec_text_when_available():
    entry = _entry(evidence=[{"source": "developer", "pattern": "phase0:rule:R1"}])
    spec = {"rules": [{"id": "R1", "text": "Must confirm before cancelling."}]}
    g = build_graph(_store_dict([entry]), spec=spec)
    n = _node(g, "rule:R1")
    assert n["description"] == "Must confirm before cancelling."


def test_developer_evidence_uses_rubric_kind_and_severity():
    entry = _entry(evidence=[{"source": "developer", "pattern": "phase0:rule:R1"}])
    rubric = {
        "agent": "demo", "version": "1", "pass_threshold": {"max_critical_failures": 0, "min_pass_rate": 1.0},
        "items": [{"rule_id": "R1", "description": "x", "kind": "must_never",
                   "severity": "critical", "check": "deterministic", "source": "developer"}],
    }
    g = build_graph(_store_dict([entry]), rubric=rubric)
    n = _node(g, "rule:R1")
    assert n["rule_kind"] == "must_never"
    assert n["severity"] == "critical"


def test_developer_evidence_creates_defines_edge():
    entry = _entry(evidence=[{"source": "developer", "pattern": "phase0:rule:R1"}])
    g = build_graph(_store_dict([entry]))
    assert ("rule:R1", "cap_001", "defines") in _rels(g)


def test_non_phase0_developer_pattern_is_ignored():
    """Only phase0:rule:* patterns should create rule nodes."""
    entry = _entry(evidence=[{"source": "developer", "pattern": "something_else:R1"}])
    g = build_graph(_store_dict([entry]))
    rule_nodes = [n for n in g["nodes"] if n["kind"] == "developer_rule"]
    assert rule_nodes == []


# ══════════════════════════════════════════════════════════════════════════════
# 5. Runtime evidence → placeholder test_spec / trace nodes
# ══════════════════════════════════════════════════════════════════════════════

def test_runtime_evidence_creates_placeholder_test_spec_node():
    entry = _entry(evidence=[{"source": "runtime", "test_id": "RT-001", "trace_id": "TR-001"}])
    g = build_graph(_store_dict([entry]))
    assert "test:RT-001" in _ids(g)
    assert "trace:TR-001" in _ids(g)


def test_runtime_evidence_creates_targeted_by_and_produces_edges():
    entry = _entry(evidence=[{"source": "runtime", "test_id": "RT-001", "trace_id": "TR-001"}])
    g = build_graph(_store_dict([entry]))
    rels = _rels(g)
    assert ("cap_001", "test:RT-001", "targeted_by") in rels
    assert ("test:RT-001", "trace:TR-001", "produces") in rels


def test_runtime_evidence_without_trace_id_still_creates_test_node():
    entry = _entry(evidence=[{"source": "runtime", "test_id": "RT-001"}])
    g = build_graph(_store_dict([entry]))
    assert "test:RT-001" in _ids(g)
    # no trace node or produces edge
    assert not any(n["id"].startswith("trace:") for n in g["nodes"])


# ══════════════════════════════════════════════════════════════════════════════
# 6. test_spec parameter
# ══════════════════════════════════════════════════════════════════════════════

def test_test_spec_param_creates_rich_node_attributes():
    ts = _test_spec()
    g = build_graph(_store_dict(), test_specs=[ts])
    n = _node(g, "test:RT-001")
    assert n is not None
    assert n["category"] == "functional"
    assert n["persona"] == "curious traveller"
    assert n["goal"] == "find a flight"


def test_test_spec_param_creates_targeted_by_edge_to_model_entry():
    ts = _test_spec(target_id="cap_001")
    g = build_graph(_store_dict(), test_specs=[ts])
    assert ("cap_001", "test:RT-001", "targeted_by") in _rels(g)


def test_test_spec_with_unknown_target_does_not_create_targeted_by_edge():
    """If target_id doesn't exist in the model, no edge should be created."""
    ts = _test_spec(target_id="cap_999")
    g = build_graph(_store_dict(), test_specs=[ts])
    assert not any(e["relation"] == "targeted_by" for e in g["edges"])


def test_test_spec_param_takes_priority_over_runtime_placeholder():
    """Rich test_spec attributes should win because we process test_specs first."""
    entry = _entry(evidence=[{"source": "runtime", "test_id": "RT-001", "trace_id": "TR-001"}])
    ts = _test_spec()  # richer node
    g = build_graph(_store_dict([entry]), test_specs=[ts])
    n = _node(g, "test:RT-001")
    # Rich attributes from explicit test_spec
    assert n.get("persona") == "curious traveller"


# ══════════════════════════════════════════════════════════════════════════════
# 7. trace parameter
# ══════════════════════════════════════════════════════════════════════════════

def test_trace_param_creates_trace_node_with_attributes():
    tr = _trace()
    g = build_graph(_store_dict(), traces=[tr])
    n = _node(g, "trace:TR-001")
    assert n is not None
    assert n["run_status"] == "completed"
    assert n["turns"] == 2


def test_trace_param_creates_produces_edge_from_test_spec():
    ts = _test_spec()
    tr = _trace()
    g = build_graph(_store_dict(), test_specs=[ts], traces=[tr])
    assert ("test:RT-001", "trace:TR-001", "produces") in _rels(g)


# ══════════════════════════════════════════════════════════════════════════════
# 8. findings parameter
# ══════════════════════════════════════════════════════════════════════════════

def test_finding_creates_finding_node():
    f = _finding()
    g = build_graph(_store_dict(), findings=[f])
    n = _node(g, "finding:F-001")
    assert n is not None
    assert n["kind"] == "finding"
    assert n["result"] == "fail"
    assert n["severity"] == "major"


def test_finding_with_status_change_stores_it():
    f = {**_finding(), "status_change": {"from": "unverified", "to": "contradicted"},
         "confidence_change": {"from": 0.87, "to": 0.435}}
    g = build_graph(_store_dict(), findings=[f])
    n = _node(g, "finding:F-001")
    assert n["status_change"] == {"from": "unverified", "to": "contradicted"}
    assert n["confidence_change"]["from"] == pytest.approx(0.87)


def test_finding_creates_triggers_edge_from_trace():
    tr = _trace()
    f = _finding()
    g = build_graph(_store_dict(), traces=[tr], findings=[f])
    assert ("trace:TR-001", "finding:F-001", "triggers") in _rels(g)


def test_finding_creates_has_finding_edge_from_model_entry():
    f = _finding(target_id="cap_001")
    g = build_graph(_store_dict(), findings=[f])
    assert ("cap_001", "finding:F-001", "has_finding") in _rels(g)


def test_finding_with_unknown_target_no_has_finding_edge():
    f = _finding(target_id="cap_999")
    g = build_graph(_store_dict(), findings=[f])
    assert not any(e["relation"] == "has_finding" for e in g["edges"])


# ══════════════════════════════════════════════════════════════════════════════
# 9. Full chain: static → entry → test → trace → finding
# ══════════════════════════════════════════════════════════════════════════════

def test_full_evidence_chain_all_nodes_and_edges_present():
    entry = _entry(evidence=[
        {"source": "static", "file": "tools.py", "lines": "10-20"},
        {"source": "runtime", "test_id": "RT-001", "trace_id": "TR-001"},
    ])
    tr = _trace()
    f = _finding()
    g = build_graph(_store_dict([entry]), traces=[tr], findings=[f])
    ids = _ids(g)
    rels = _rels(g)

    assert "code:tools.py:10-20" in ids
    assert "cap_001" in ids
    assert "test:RT-001" in ids
    assert "trace:TR-001" in ids
    assert "finding:F-001" in ids

    assert ("code:tools.py:10-20", "cap_001", "supports") in rels
    assert ("cap_001", "test:RT-001", "targeted_by") in rels
    assert ("test:RT-001", "trace:TR-001", "produces") in rels
    assert ("trace:TR-001", "finding:F-001", "triggers") in rels
    assert ("cap_001", "finding:F-001", "has_finding") in rels


def test_developer_rule_chain_all_nodes_and_edges_present():
    entry = _entry(
        entry_id="con_001",
        etype="constraint",
        name="confirm_before_cancel",
        evidence=[{"source": "developer", "pattern": "phase0:rule:R1"}],
    )
    spec = {"rules": [{"id": "R1", "text": "Must confirm before cancelling."}]}
    f = {**_finding(target_id="con_001"), "status_change": {"from": "unverified", "to": "contradicted"}}
    g = build_graph(_store_dict([entry]), spec=spec, findings=[f])
    ids = _ids(g)
    rels = _rels(g)

    assert "rule:R1" in ids
    assert "con_001" in ids
    assert "finding:F-001" in ids
    assert ("rule:R1", "con_001", "defines") in rels
    assert ("con_001", "finding:F-001", "has_finding") in rels


# ══════════════════════════════════════════════════════════════════════════════
# 10. Deduplication
# ══════════════════════════════════════════════════════════════════════════════

def test_same_code_location_in_two_entries_creates_one_node():
    ev = [{"source": "static", "file": "tools.py", "lines": "10-20"}]
    e1 = _entry("cap_001", evidence=ev)
    e2 = _entry("cap_002", name="book_flight", evidence=ev)
    g = build_graph(_store_dict([e1, e2]))
    loc_nodes = [n for n in g["nodes"] if n["kind"] == "code_location"]
    assert len(loc_nodes) == 1


def test_same_code_location_in_two_entries_creates_two_supports_edges():
    ev = [{"source": "static", "file": "tools.py", "lines": "10-20"}]
    e1 = _entry("cap_001", evidence=ev)
    e2 = _entry("cap_002", name="book_flight", evidence=ev)
    g = build_graph(_store_dict([e1, e2]))
    supports = [e for e in g["edges"] if e["relation"] == "supports"]
    assert len(supports) == 2


def test_duplicate_edge_is_not_added_twice():
    """Runtime evidence + explicit test_specs/traces should not produce dup edges."""
    entry = _entry(evidence=[{"source": "runtime", "test_id": "RT-001", "trace_id": "TR-001"}])
    ts = _test_spec()
    tr = _trace()
    g = build_graph(_store_dict([entry]), test_specs=[ts], traces=[tr])
    produces = [(e["from"], e["to"], e["relation"]) for e in g["edges"]
                if e["relation"] == "produces"]
    # "test:RT-001" → "trace:TR-001" should appear exactly once
    assert produces.count(("test:RT-001", "trace:TR-001", "produces")) == 1


# ══════════════════════════════════════════════════════════════════════════════
# 11. Stats
# ══════════════════════════════════════════════════════════════════════════════

def test_stats_counts_are_correct():
    entry = _entry(evidence=[
        {"source": "static", "file": "tools.py", "lines": "10-20"},
        {"source": "runtime", "test_id": "RT-001", "trace_id": "TR-001"},
    ])
    f = _finding()
    g = build_graph(_store_dict([entry]), findings=[f])
    stats = g["stats"]
    assert stats["nodes"] == len(g["nodes"])
    assert stats["edges"] == len(g["edges"])
    assert stats["model_entry_nodes"] == 1
    assert stats["code_location_nodes"] == 1
    assert stats["finding_nodes"] == 1


def test_built_at_is_iso_utc():
    g = build_graph(_store_dict())
    # datetime.fromisoformat will raise if badly formatted
    from datetime import datetime
    dt = datetime.fromisoformat(g["built_at"])
    assert dt.tzinfo is not None


# ══════════════════════════════════════════════════════════════════════════════
# 12. save_graph roundtrip
# ══════════════════════════════════════════════════════════════════════════════

def test_save_graph_writes_json_file(tmp_path):
    g = build_graph(_store_dict())
    path = save_graph(g, tmp_path)
    assert path.name == "evidence_graph.json"
    assert path.exists()
    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["agent"] == "demo"
    assert "nodes" in loaded


def test_save_graph_creates_missing_directories(tmp_path):
    g = build_graph(_store_dict())
    folder = tmp_path / "deep" / "nested" / "dir"
    path = save_graph(g, folder)
    assert path.exists()


def test_save_graph_overwrites_previous_file(tmp_path):
    g1 = build_graph(_store_dict())
    save_graph(g1, tmp_path)
    g2 = build_graph({"agent": "other", "version": "v0", "entries": []})
    save_graph(g2, tmp_path)
    loaded = json.loads((tmp_path / "evidence_graph.json").read_text(encoding="utf-8"))
    assert loaded["agent"] == "other"


def test_save_load_roundtrip_preserves_all_data(tmp_path):
    entry = _entry(evidence=[
        {"source": "static", "file": "tools.py", "lines": "10-20"},
        {"source": "developer", "pattern": "phase0:rule:R1"},
    ])
    g = build_graph(_store_dict([entry]), findings=[_finding()])
    path = save_graph(g, tmp_path)
    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["nodes"] == g["nodes"]
    assert loaded["edges"] == g["edges"]
    assert loaded["stats"] == g["stats"]


# ══════════════════════════════════════════════════════════════════════════════
# 13. report.build(ctx) pipeline hook
# ══════════════════════════════════════════════════════════════════════════════

def _make_store():
    """Return a ModelStore with one entry — matches make_store() pattern from reconcile tests."""
    store = ModelStore("demo")
    store.add(_entry())
    return store


def test_build_returns_skip_message_when_no_store(tmp_path):
    ctx = {"folder": tmp_path, "name": "demo"}
    result = build(ctx)
    assert "skipped" in result


def test_build_writes_evidence_graph_json(tmp_path):
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "demo"}
    build(ctx)
    assert (tmp_path / "evidence_graph.json").exists()


def test_build_writes_report_md(tmp_path):
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "demo"}
    build(ctx)
    assert (tmp_path / "report.md").exists()


def test_build_return_string_contains_node_count(tmp_path):
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "demo"}
    result = build(ctx)
    assert "nodes" in result
    assert "edges" in result


def test_build_passes_findings_from_ctx(tmp_path):
    ctx = {
        "store": _make_store(),
        "folder": tmp_path,
        "name": "demo",
        "findings": [_finding()],
    }
    build(ctx)
    graph = json.loads((tmp_path / "evidence_graph.json").read_text(encoding="utf-8"))
    finding_nodes = [n for n in graph["nodes"] if n["kind"] == "finding"]
    assert len(finding_nodes) == 1


def test_build_reads_findings_from_disk_when_not_in_ctx(tmp_path):
    findings_path = tmp_path / "findings.json"
    findings_path.write_text(json.dumps([_finding()]), encoding="utf-8")
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "demo"}
    build(ctx)
    graph = json.loads((tmp_path / "evidence_graph.json").read_text(encoding="utf-8"))
    finding_nodes = [n for n in graph["nodes"] if n["kind"] == "finding"]
    assert len(finding_nodes) == 1


def test_build_prefers_ctx_findings_over_disk(tmp_path):
    # ctx findings: 2 items, disk findings: 1 item
    findings_path = tmp_path / "findings.json"
    findings_path.write_text(json.dumps([_finding()]), encoding="utf-8")
    ctx = {
        "store": _make_store(),
        "folder": tmp_path,
        "name": "demo",
        "findings": [_finding("F-001"), _finding("F-002", test_id="RT-002", trace_id="TR-002")],
    }
    build(ctx)
    graph = json.loads((tmp_path / "evidence_graph.json").read_text(encoding="utf-8"))
    finding_nodes = [n for n in graph["nodes"] if n["kind"] == "finding"]
    assert len(finding_nodes) == 2


def test_build_handles_corrupt_findings_json_on_disk(tmp_path):
    """Corrupt findings.json must not crash build()."""
    (tmp_path / "findings.json").write_text("NOT JSON", encoding="utf-8")
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "demo"}
    result = build(ctx)  # should not raise
    assert "nodes" in result


def test_build_report_md_contains_agent_name(tmp_path):
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "my-agent"}
    build(ctx)
    content = (tmp_path / "report.md").read_text(encoding="utf-8")
    assert "my-agent" in content


def test_build_report_md_lists_model_entries(tmp_path):
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "demo"}
    build(ctx)
    content = (tmp_path / "report.md").read_text(encoding="utf-8")
    assert "cap_001" in content
    assert "search_flights" in content


def test_build_report_md_lists_findings_when_present(tmp_path):
    f = {**_finding(), "status_change": {"from": "unverified", "to": "contradicted"}}
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "demo", "findings": [f]}
    build(ctx)
    content = (tmp_path / "report.md").read_text(encoding="utf-8")
    assert "F-001" in content
    assert "contradicted" in content


def test_build_report_md_shows_placeholder_when_no_findings(tmp_path):
    ctx = {"store": _make_store(), "folder": tmp_path, "name": "demo"}
    build(ctx)
    content = (tmp_path / "report.md").read_text(encoding="utf-8")
    assert "No findings yet" in content


def test_build_passes_rubric_and_spec_to_graph(tmp_path):
    """Rubric and spec are forwarded — verify a developer-rule node appears."""
    store = ModelStore("demo")
    store.add(_entry(evidence=[{"source": "developer", "pattern": "phase0:rule:R1"}]))
    spec = {"rules": [{"id": "R1", "text": "Must confirm before cancelling."}]}
    ctx = {"store": store, "folder": tmp_path, "name": "demo", "spec": spec}
    build(ctx)
    graph = json.loads((tmp_path / "evidence_graph.json").read_text(encoding="utf-8"))
    rule_nodes = [n for n in graph["nodes"] if n["kind"] == "developer_rule"]
    assert len(rule_nodes) == 1
    assert rule_nodes[0]["description"] == "Must confirm before cancelling."


# ══════════════════════════════════════════════════════════════════════════════
# 14. AY-3 / AY-4: real-run wiring and report sections
# ══════════════════════════════════════════════════════════════════════════════

def _dangling(graph):
    ids = _ids(graph)
    return [e for e in graph["edges"] if e["from"] not in ids or e["to"] not in ids]


def test_finding_alone_still_gives_the_full_chain_without_dangling_edges():
    g = build_graph(_store_dict(), findings=[_finding()])
    assert {"test:RT-001", "trace:TR-001", "finding:F-001"} <= _ids(g)
    assert {("test:RT-001", "trace:TR-001", "produces"),
            ("trace:TR-001", "finding:F-001", "triggers"),
            ("cap_001", "test:RT-001", "targeted_by"),
            ("cap_001", "finding:F-001", "has_finding")} <= _rels(g)
    assert _dangling(g) == []


def test_rich_test_and_trace_nodes_win_over_finding_placeholders():
    g = build_graph(_store_dict(), findings=[_finding()], test_specs=[_test_spec()], traces=[_trace()])
    nodes = {n["id"]: n for n in g["nodes"]}
    assert nodes["test:RT-001"]["persona"] == "curious traveller"
    assert nodes["trace:TR-001"]["turns"] == 2


def test_finding_with_unknown_target_has_no_dangling_edges():
    g = build_graph(_store_dict(), findings=[_finding(target_id="cap_999")])
    assert _dangling(g) == []
    assert not any(e["relation"] == "has_finding" for e in g["edges"])


def _ctx(tmp_path, **extra):
    return {"store": _make_store(), "folder": tmp_path, "name": "demo", **extra}


def test_build_forwards_test_specs_and_traces_from_ctx(tmp_path):
    build(_ctx(tmp_path, findings=[_finding()], test_specs=[_test_spec()], traces=[_trace()]))
    g = json.loads((tmp_path / "evidence_graph.json").read_text(encoding="utf-8"))
    assert g["stats"]["test_spec_nodes"] == 1 and g["stats"]["trace_nodes"] == 1
    assert {"test:RT-001", "trace:TR-001", "finding:F-001"} <= _ids(g)
    assert _dangling(g) == []


def test_build_reads_specs_and_traces_from_the_agent_folder(tmp_path):
    (tmp_path / "findings.json").write_text(json.dumps([_finding()]), encoding="utf-8")
    (tmp_path / "test_specs.json").write_text(json.dumps([_test_spec()]), encoding="utf-8")
    (tmp_path / "traces").mkdir()
    (tmp_path / "traces" / "RT-001_run1.json").write_text(json.dumps(_trace()), encoding="utf-8")
    (tmp_path / "traces" / "broken.json").write_text("{nope", encoding="utf-8")
    build(_ctx(tmp_path))
    g = json.loads((tmp_path / "evidence_graph.json").read_text(encoding="utf-8"))
    assert g["stats"]["trace_nodes"] == 1 and g["stats"]["test_spec_nodes"] == 1


def _report(tmp_path, **extra):
    build(_ctx(tmp_path, **extra))
    return (tmp_path / "report.md").read_text(encoding="utf-8")


def test_report_has_coverage_by_entry_type(tmp_path):
    store = ModelStore("demo")
    store.add(_entry("cap_001"))
    store.add(_entry("cap_002", name="search_hotels"))
    ctx = {"store": store, "folder": tmp_path, "name": "demo", "test_specs": [_test_spec(target_id="cap_001")]}
    build(ctx)
    text = (tmp_path / "report.md").read_text(encoding="utf-8")
    assert "## Coverage" in text
    assert "| capability | 2 | 1 | 50% |" in text


def test_report_coverage_with_no_tests_is_zero_not_a_crash(tmp_path):
    assert "| capability | 1 | 0 | 0% |" in _report(tmp_path)


def test_report_shows_severity_reproducibility_and_model_changes(tmp_path):
    f = {**_finding(severity="critical"), "reproducibility": {"runs": 3, "failures": 3},
         "status_change": {"from": "unverified", "to": "contradicted"},
         "confidence_change": {"from": 0.7, "to": 0.35}}
    text = _report(tmp_path, findings=[f, _finding("F-002", test_id="RT-002", trace_id="TR-002",
                                                   result="pass", severity="minor")])
    assert "| critical | 1 | 0 |" in text and "| minor | 0 | 1 |" in text
    assert "Reproducibility: 3 of 3 runs failed" in text
    assert "## Model Changes" in text
    assert "| cap_001 | search_flights | `unverified` → `contradicted` | 0.70 → 0.35 | F-001 |" in text


def test_report_without_findings_says_how_to_get_them(tmp_path):
    text = _report(tmp_path)
    assert "No findings yet" in text and "run_config" in text


def _judge(verdict="fail", score=1):
    return {"trace_id": "TR-9", "agent": "demo",
            "overall_quality": {"score": score, "verdict": verdict, "reasoning": "Booked without asking."},
            "rule_scores": [{"rule_id": "U3", "verdict": "pass"}]}


def _checks(verdict="pass"):
    return [{"rule_id": "U1", "verdict": "pass"}, {"rule_id": "R1", "verdict": verdict}]


def test_report_flags_a_judge_fail_that_no_rule_check_caught(tmp_path):
    (tmp_path / "judge_results.json").write_text(json.dumps(_judge()), encoding="utf-8")
    (tmp_path / "check_results.json").write_text(json.dumps(_checks()), encoding="utf-8")
    text = _report(tmp_path)
    assert "## LLM Judge" in text and "1/5 (fail)" in text
    assert "**Flag:**" in text


def test_report_has_no_flag_when_a_rule_check_also_failed(tmp_path):
    (tmp_path / "judge_results.json").write_text(json.dumps(_judge()), encoding="utf-8")
    (tmp_path / "check_results.json").write_text(json.dumps(_checks("fail")), encoding="utf-8")
    text = _report(tmp_path)
    assert "Rule checks failed: R1" in text and "**Flag:**" not in text


def test_report_has_no_flag_when_the_judge_passes(tmp_path):
    (tmp_path / "judge_results.json").write_text(json.dumps(_judge("pass", 5)), encoding="utf-8")
    (tmp_path / "check_results.json").write_text(json.dumps(_checks()), encoding="utf-8")
    assert "**Flag:**" not in _report(tmp_path)


def test_report_ignores_missing_or_corrupt_judge_files(tmp_path):
    assert "## LLM Judge" not in _report(tmp_path)
    (tmp_path / "judge_results.json").write_text("{bad", encoding="utf-8")
    (tmp_path / "check_results.json").write_text("[1, 2", encoding="utf-8")
    assert "## LLM Judge" not in _report(tmp_path)


def test_report_keeps_full_descriptions_and_has_evidence_chains(tmp_path):
    long = "The agent crashed: " + "x" * 250
    text = _report(tmp_path, findings=[{**_finding(), "description": long}],
                   test_specs=[_test_spec()], traces=[_trace()])
    assert long in text
    assert "## Evidence Chains" in text
    assert "| F-001 | fail | TR-001 (" in text and "| RT-001 (" in text


def test_report_without_findings_has_no_evidence_chains(tmp_path):
    assert "## Evidence Chains" not in _report(tmp_path)


def test_report_lists_the_judge_score_of_every_run(tmp_path):
    rows = [
        {"trace_id": "TR-1", "test_id": "GT-1", "run_status": "completed", "checks_failed": [],
         "agreement": "judge_only", "overall_quality": {"score": 1, "verdict": "fail", "reasoning": "Stuck | looping.\nAgain."}},
        {"trace_id": "TR-2", "test_id": "GT-2", "run_status": "crashed", "agreement": "not_judged",
         "note": "The run crashed, nothing to judge."},
    ]
    summary = {"traces": 2, "judged": 1, "mean_overall_score": 1.0, "agreement_rate": 0.0,
               "agreement": {"judge_only": 1}}
    (tmp_path / "judge_all.json").write_text(json.dumps({"summary": summary, "traces": rows}), encoding="utf-8")
    text = _report(tmp_path)
    assert "## Judge Scores by Run" in text and "1 of 2 runs judged" in text
    assert "| TR-1 | GT-1 | completed | 1/5 (fail) | none | judge_only | Stuck / looping. Again. |" in text
    assert "| TR-2 | GT-2 | crashed | — | none | not_judged | The run crashed, nothing to judge. |" in text


def test_report_ignores_a_broken_judge_all_file(tmp_path):
    (tmp_path / "judge_all.json").write_text("{bad", encoding="utf-8")
    assert "## Judge Scores by Run" not in _report(tmp_path)
