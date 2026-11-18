import json

from testing import campaign
from understand.model_store import ModelStore

FAIL = {"rule_id": "R1", "passed": False, "severity": "critical", "description": "No confirmation."}
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


def make_trace(trace_id, test_id="RT-1"):
    return {"trace_id": trace_id, "test_id": test_id, "modality": "text", "run_status": "completed",
            "turns": [{"turn": 1, "role": "user", "content": "cancel it"},
                      {"turn": 2, "role": "agent", "content": "ok",
                       "tool_calls": [{"name": "cancel_booking"}]}]}


def stub_checks(monkeypatch, results):
    monkeypatch.setattr(campaign, "run_checks",
                        lambda trace, rubric, complete_json=None, use_llm=True: results[trace["trace_id"]])


def spec(test_id="RT-1", target="cap_004"):
    return {"test_id": test_id, "target_id": target}


def test_one_finding_per_spec_and_one_failure_contradicts(monkeypatch):
    stub_checks(monkeypatch, {"T1": [PASS], "T2": [FAIL], "T3": [PASS]})
    store = make_store()
    traces = [make_trace("T1"), make_trace("T2"), make_trace("T3")]
    findings, skipped, _ = campaign.run_campaign(store, {}, [spec()], traces)
    assert len(findings) == 1 and not skipped
    assert findings[0]["result"] == "fail"
    assert findings[0]["reproducibility"] == {"runs": 3, "failures": 1}
    assert store.get("cap_004")["status"] == "contradicted"
    assert store.get("cap_004")["confidence"] == 0.435


def test_spec_without_traces_makes_no_finding(monkeypatch):
    stub_checks(monkeypatch, {})
    findings, skipped, _ = campaign.run_campaign(make_store(), {}, [spec()], [])
    assert findings == [] and skipped == []


def test_unknown_target_is_skipped_and_others_still_run(monkeypatch):
    stub_checks(monkeypatch, {"T1": [PASS], "T2": [PASS]})
    traces = [make_trace("T1", "RT-1"), make_trace("T2", "RT-2")]
    findings, skipped, _ = campaign.run_campaign(
        make_store(), {}, [spec("RT-1", "cap_999"), spec("RT-2")], traces)
    assert [f["test_id"] for f in findings] == ["RT-2"]
    assert skipped[0]["test_id"] == "RT-1"


def test_run_sets_ctx_and_writes_findings(monkeypatch, tmp_path):
    stub_checks(monkeypatch, {"T1": [FAIL]})
    ctx = {"store": make_store(), "rubric": {}, "test_specs": [spec()],
           "traces": [make_trace("T1")], "folder": tmp_path}
    detail = campaign.run(ctx)
    assert detail.startswith("1 finding(s), 1 failed")
    assert ctx["findings"][0]["target_id"] == "cap_004"
    assert json.loads((tmp_path / "findings.json").read_text(encoding="utf-8"))[0]["result"] == "fail"


def test_run_skips_cleanly_without_traces():
    assert campaign.run({"store": make_store(), "rubric": {}}) == "skipped: no traces yet"