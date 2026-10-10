import json
from pathlib import Path

import pytest

from understand.model_store import ModelError, ModelStore
from understand.reconcile import reconcile, validate_finding

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
SPEC = json.loads((FIXTURES / "test_spec.json").read_text(encoding="utf-8"))
TRACE = json.loads((FIXTURES / "trace.json").read_text(encoding="utf-8"))

FAIL = {"rule_id": "R1", "passed": False, "severity": "critical",
        "description": "cancel_booking called without confirmation."}
PASS = {"rule_id": "R1", "passed": True}


def make_store():
    store = ModelStore("demo")
    store.add({
        "id": "cap_004", "type": "capability", "name": "cancel_booking",
        "description": "Agent can cancel a booking.",
        "evidence": [{"source": "static", "file": "booking_agent.py", "lines": "72-91"}],
        "confidence": 0.87, "status": "unverified", "detected_by": "rule",
        "related_tools": ["cancel_booking"],
    })
    return store


def trace(trace_id="TR-1", status="completed", tools=("cancel_booking",), error=None):
    t = {"trace_id": trace_id, "test_id": "RT-020", "modality": "text", "run_status": status,
         "turns": [{"turn": 1, "role": "user", "content": "cancel it"},
                   {"turn": 2, "role": "agent", "content": "ok",
                    "tool_calls": [{"name": n} for n in tools]}]}
    if error:
        t["error"] = error
    return t


def run(checks, **kw):
    return {"trace": trace(**kw), "checks": checks}


def test_failed_check_contradicts_and_matches_fixture_shape():
    store = make_store()
    result = reconcile(store, SPEC, [{"trace": TRACE, "checks": [FAIL]}])
    entry = store.get("cap_004")
    assert (entry["status"], entry["confidence"]) == ("contradicted", 0.435)
    finding = result["finding"]
    assert (finding["result"], finding["severity"]) == ("fail", "critical")
    assert finding["status_change"] == {"from": "unverified", "to": "contradicted"}
    assert finding["trace_id"] == "TR-0091"
    assert entry["evidence"][-1] == {"source": "runtime", "test_id": "RT-020", "trace_id": "TR-0091"}


def test_passing_run_that_calls_the_tool_confirms():
    store = make_store()
    result = reconcile(store, SPEC, [run([PASS])])
    assert result["outcome"] == "confirmed"
    assert store.get("cap_004")["confidence"] > 0.87
    assert result["finding"]["result"] == "pass"
    assert result["finding"]["severity"] == "info"


def test_one_failure_among_runs_leaves_entry_contradicted():
    store = make_store()
    runs = [run([PASS], trace_id="TR-1"), run([FAIL], trace_id="TR-2"), run([PASS], trace_id="TR-3")]
    result = reconcile(store, SPEC, runs)
    assert store.get("cap_004")["status"] == "contradicted"
    assert result["finding"]["reproducibility"] == {"runs": 3, "failures": 1}
    assert result["finding"]["trace_id"] == "TR-2"


def test_crash_reports_critical_finding_but_leaves_model_alone():
    store = make_store()
    result = reconcile(store, SPEC, [run([], status="crashed", tools=(), error="connection lost")])
    entry = store.get("cap_004")
    assert (entry["status"], entry["confidence"]) == ("unverified", 0.87)
    assert result["outcome"] is None
    assert result["finding"]["severity"] == "critical"
    assert "connection lost" in result["finding"]["description"]
    assert "status_change" not in result["finding"]


def test_unreachable_needs_repeated_attempts():
    store = make_store()
    one = reconcile(store, SPEC, [run([PASS], tools=())])
    assert one["outcome"] is None and store.get("cap_004")["status"] == "unverified"
    three = reconcile(store, SPEC, [run([PASS], trace_id=f"TR-{i}", tools=()) for i in range(3)])
    assert three["outcome"] == "unreachable"
    assert store.get("cap_004")["confidence"] < 0.87


def test_unknown_tool_is_added_as_discovered():
    store = make_store()
    result = reconcile(store, SPEC, [run([PASS], tools=("cancel_booking", "check_loyalty_status"))])
    assert result["discovered"] == ["cap_005"]
    new = store.get("cap_005")
    assert (new["status"], new["detected_by"]) == ("discovered", "runtime")
    # a second run with the same tool must not add it again
    again = reconcile(store, SPEC, [run([PASS], tools=("check_loyalty_status",))])
    assert again["discovered"] == []


def test_every_finding_validates_and_bad_input_is_rejected():
    store = make_store()
    validate_finding(reconcile(store, SPEC, [run([FAIL])])["finding"])
    with pytest.raises(ModelError):
        reconcile(store, SPEC, [])
    with pytest.raises(ModelError, match="without 'passed'"):
        reconcile(store, SPEC, [run([{"rule_id": "R1"}])])