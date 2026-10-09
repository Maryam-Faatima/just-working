from pathlib import Path

import pytest

from understand.confidence import baseline_confidence
from understand.model_store import (
    ModelError,
    ModelStore,
    build_v0,
    update_confidence,
)

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "model_v0.json"

SCAN = {
    "agent": "booking_agent",
    "tools": [
        {"name": "cancel_booking", "file": "agent.py", "start_line": 72, "end_line": 91,
         "args": ["booking_id"], "docstring": "Cancel a booking.", "detected_by": "decorator:tool"},
        {"name": "cancel_booking", "file": "agent.py", "start_line": 72, "end_line": 91,
         "args": [], "docstring": None, "detected_by": "schema"},
        {"name": "search", "file": "agent.py", "start_line": 10, "end_line": 20,
         "args": [], "docstring": None, "detected_by": "decorator:tool"},
    ],
    "nodes": [
        {"name": "agent", "function": "call_model", "file": "graph.py", "line": 5},
        {"name": "tools", "function": "cancel_booking", "file": "graph.py", "line": 6},
    ],
    "edges": [
        {"from": "agent", "to": "tools", "conditional": True, "condition": "route",
         "file": "graph.py", "line": 8},
        {"from": "agent", "to": "END", "conditional": True, "condition": "route",
         "file": "graph.py", "line": 8},
        {"from": "tools", "to": "agent", "conditional": False, "condition": None,
         "file": "graph.py", "line": 9},
    ],
}


def test_update_is_bounded_and_never_overwrites():
    up = update_confidence(0.5, "confirmed")
    down = update_confidence(0.5, "contradicted")
    assert 0.5 < up < 1
    assert 0 < down < 0.5
    c = 0.9
    for _ in range(200):
        c = update_confidence(c, "confirmed")
    assert c < 1
    for _ in range(200):
        c = update_confidence(c, "contradicted")
    assert c > 0


def test_unknown_outcome_rejected():
    with pytest.raises(ModelError):
        update_confidence(0.5, "maybe")


def test_build_v0_dedupes_tools_and_builds_workflow():
    model = build_v0(SCAN)
    caps = model.find(type="capability")
    flows = model.find(type="workflow")
    assert [c["name"] for c in caps] == ["cancel_booking", "search"]
    assert caps[0]["related_states"] == ["tools"]
    assert caps[0]["status"] == "unverified"
    assert [f["name"] for f in flows] == ["agent", "tools"]
    assert flows[0]["related_states"] == ["tools", "END"]
    patterns = [e["pattern"] for e in flows[0]["evidence"]]
    assert patterns == ["graph:add_node", "graph:add_conditional_edges"]
    assert flows[0]["confidence"] == baseline_confidence("rule", "graph:add_node")


def test_apply_outcome_updates_status_confidence_and_evidence():
    model = build_v0(SCAN)
    before = model.get("cap_001")["confidence"]
    updated = model.apply_outcome("cap_001", "contradicted", test_id="t1", trace_id="tr1")
    assert updated["status"] == "contradicted"
    assert updated["confidence"] < before
    assert updated["evidence"][-1] == {"source": "runtime", "test_id": "t1", "trace_id": "tr1"}


def test_runs_applies_one_step_per_run():
    model = build_v0(SCAN)
    start = model.get("cap_001")["confidence"]
    once = update_confidence(update_confidence(update_confidence(start, "confirmed"), "confirmed"), "confirmed")
    assert model.apply_outcome("cap_001", "confirmed", runs=3)["confidence"] == once


def test_discover_adds_runtime_entry():
    model = build_v0(SCAN)
    entry = model.discover("capability", "refund", "Agent issued a refund", "t9", "tr9")
    assert entry["id"] == "cap_003"
    assert entry["status"] == "discovered"
    assert entry["detected_by"] == "runtime"


def test_invalid_entry_and_duplicate_rejected():
    model = ModelStore("a")
    with pytest.raises(ModelError):
        model.add({"id": "cap_001", "type": "capability"})
    model = build_v0(SCAN)
    with pytest.raises(ModelError):
        model.add(dict(model.get("cap_001")))
    with pytest.raises(ModelError):
        model.get("cap_999")


def test_find_low_confidence():
    model = build_v0(SCAN)
    model.apply_outcome("cap_002", "contradicted")
    low = model.find(max_confidence=0.5)
    assert [e["id"] for e in low] == ["cap_002"]


def test_save_load_roundtrip(tmp_path):
    model = build_v0(SCAN)
    model.apply_outcome("cap_001", "confirmed", test_id="t1")
    path = tmp_path / "out" / "model_v0.json"
    model.save(path)
    assert ModelStore.load(path).to_dict() == model.to_dict()


def test_fixture_loads_and_next_id_follows_highest():
    model = ModelStore.load(FIXTURE)
    assert model.next_id("capability") == "cap_005"