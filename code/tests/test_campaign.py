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
<<<<<<< Updated upstream
    assert campaign.run({"store": make_store(), "rubric": {}}) == "skipped: no traces yet"
=======
    assert campaign.run({"store": make_store(), "rubric": {}}) == "skipped: no traces yet"


RUBRIC = {"items": [
    {"rule_id": "R1", "target_id": "con_001", "source": "developer", "check": "judge"},
    {"rule_id": "R2", "target_id": "con_002", "source": "developer", "check": "judge"},
    {"rule_id": "U1", "source": "default", "check": "deterministic"},
    {"rule_id": "U2", "source": "default", "check": "judge"},
]}


def make_constraint(entry_id, rule_id):
    return {"id": entry_id, "type": "constraint", "name": f"rule {rule_id}",
            "description": "Developer rule.",
            "evidence": [{"source": "developer", "pattern": f"phase0:rule:{rule_id}"}],
            "confidence": 0.60, "status": "unverified", "detected_by": "developer"}


def test_scope_checks_drops_other_rules_and_marks_which_may_move_the_entry():
    checks = [{"rule_id": "R1", "passed": True}, {"rule_id": "R2", "passed": False},
              {"rule_id": "U1", "passed": True}, {"rule_id": "U2", "passed": False},
              {"rule_id": "X9", "passed": True}]
    kept = campaign.scope_checks(checks, RUBRIC, "con_001")
    assert [c["rule_id"] for c in kept] == ["R1", "U1", "U2", "X9"]
    moves = {c["rule_id"]: c.get("moves_entry", True) for c in kept}
    assert moves == {"R1": True, "U1": True, "U2": False, "X9": True}
    assert "moves_entry" not in checks[3]  # the input results are not changed


def test_another_rules_failure_does_not_contradict_this_entry(monkeypatch):
    stub_checks(monkeypatch, {"T1": [{"rule_id": "R1", "passed": True},
                                     {"rule_id": "R2", "passed": False, "severity": "critical"},
                                     {"rule_id": "U1", "passed": True}]})
    store = make_store()
    store.add(make_constraint("con_001", "R1"))
    findings, _, _ = campaign.run_campaign(store, RUBRIC, [spec("RT-1", "con_001")], [make_trace("T1")])
    assert findings[0]["result"] == "pass"
    assert store.get("con_001")["status"] == "confirmed"


def test_universal_failure_still_contradicts(monkeypatch):
    stub_checks(monkeypatch, {"T1": [{"rule_id": "R1", "passed": True},
                                     {"rule_id": "U1", "passed": False, "severity": "critical"}]})
    store = make_store()
    store.add(make_constraint("con_001", "R1"))
    campaign.run_campaign(store, RUBRIC, [spec("RT-1", "con_001")], [make_trace("T1")])
    assert store.get("con_001")["status"] == "contradicted"


def test_contradicted_stays_contradicted_after_a_later_passing_test(monkeypatch):
    stub_checks(monkeypatch, {"T1": [FAIL], "T2": [PASS]})
    store = make_store()
    specs = [spec("RT-1"), spec("RT-2")]
    traces = [make_trace("T1", "RT-1"), make_trace("T2", "RT-2")]
    findings, _, _ = campaign.run_campaign(store, {}, specs, traces)
    entry = store.get("cap_004")
    assert entry["status"] == "contradicted" and entry["confidence"] == 0.435
    assert {"source": "runtime", "test_id": "RT-2", "trace_id": "T2"} in entry["evidence"]
    assert findings[1]["result"] == "pass" and "status_change" not in findings[1]
    assert "stays contradicted" in findings[1]["description"]


def test_run_writes_live_model_changes(monkeypatch, tmp_path):
    stub_checks(monkeypatch, {"T1": [FAIL]})
    ctx = {"store": make_store(), "rubric": {}, "test_specs": [spec()],
           "traces": [make_trace("T1")], "folder": tmp_path}
    campaign.run(ctx)
    data = json.loads((tmp_path / "model_changes.json").read_text(encoding="utf-8"))
    assert data["state"] == "done" and data["done_specs"] == data["total_specs"] == 1
    change = data["changes"][0]
    assert (change["entry_id"], change["status_from"], change["status_to"]) == ("cap_004", "unverified", "contradicted")
    assert (change["confidence_from"], change["confidence_to"]) == (0.87, 0.435)
    assert change["runs"] == 1 and change["failures"] == 1


def test_progress_is_reported_after_each_spec(monkeypatch):
    stub_checks(monkeypatch, {"T1": [PASS], "T2": [PASS]})
    calls, changes = [], []
    traces = [make_trace("T1", "RT-1"), make_trace("T2", "RT-2")]
    campaign.run_campaign(make_store(), {}, [spec("RT-1"), spec("RT-2")], traces,
                          changes=changes, on_progress=lambda: calls.append(len(changes)))
    assert calls == [1, 2]


def test_discovered_tool_appears_as_a_change_from_nothing(monkeypatch):
    stub_checks(monkeypatch, {"T1": [PASS]})
    trace = make_trace("T1")
    trace["turns"][1]["tool_calls"].append({"name": "refund_payment"})
    changes = []
    campaign.run_campaign(make_store(), {}, [spec()], [trace], changes=changes)
    found = next(c for c in changes if c["result"] == "discovered")
    assert found["entry_name"] == "refund_payment" and found["status_from"] is None


def test_run_saves_the_updated_model_as_v1(monkeypatch, tmp_path):
    stub_checks(monkeypatch, {"T1": [FAIL]})
    store = make_store()
    ctx = {"store": store, "rubric": {}, "test_specs": [spec()],
           "traces": [make_trace("T1")], "folder": tmp_path}
    campaign.run(ctx)
    saved = json.loads((tmp_path / "model_v1.json").read_text(encoding="utf-8"))
    assert saved["version"] == "v1"
    assert saved["entries"][0]["status"] == "contradicted"
    assert store.version == "v0"


def test_default_judge_rule_failure_is_a_finding_but_does_not_flip_the_entry(monkeypatch):
    stub_checks(monkeypatch, {"T1": [
        {"rule_id": "R1", "passed": True},
        {"rule_id": "U2", "passed": False, "severity": "major", "description": "Did not decline."}]})
    store = make_store()
    store.add(make_constraint("con_001", "R1"))
    findings, _, _ = campaign.run_campaign(store, RUBRIC, [spec("RT-1", "con_001")], [make_trace("T1")])
    finding = findings[0]
    assert finding["result"] == "fail" and finding["severity"] == "major"
    assert "Did not decline." in finding["description"]
    assert store.get("con_001")["status"] == "confirmed"  # its own rule passed


def test_default_rule_failures_do_not_make_an_unexercised_target_unreachable(monkeypatch):
    stub_checks(monkeypatch, {t: [{"rule_id": "U2", "passed": False, "severity": "major"}]
                              for t in ("T1", "T2", "T3")})
    traces = []
    for trace_id in ("T1", "T2", "T3"):
        trace = make_trace(trace_id)
        trace["turns"][1]["tool_calls"] = []
        traces.append(trace)
    store = make_store()
    findings, _, _ = campaign.run_campaign(store, RUBRIC, [spec()], traces)
    assert findings[0]["result"] == "fail"
    assert findings[0]["reproducibility"] == {"runs": 3, "failures": 3}
    assert "status_change" not in findings[0]
    assert store.get("cap_004")["status"] == "unverified"


def test_three_clean_runs_that_never_use_the_tool_are_unreachable(monkeypatch):
    stub_checks(monkeypatch, {t: [PASS] for t in ("T1", "T2", "T3")})
    traces = []
    for trace_id in ("T1", "T2", "T3"):
        trace = make_trace(trace_id)
        trace["turns"][1]["tool_calls"] = []
        traces.append(trace)
    store = make_store()
    campaign.run_campaign(store, {}, [spec()], traces)
    assert store.get("cap_004")["status"] == "unreachable"


def test_running_the_stage_twice_gives_the_same_model(monkeypatch, tmp_path):
    stub_checks(monkeypatch, {"T1": [FAIL]})
    ctx = {"store": make_store(), "rubric": {}, "test_specs": [spec()],
           "traces": [make_trace("T1")], "folder": tmp_path}
    campaign.run(ctx)
    first = ctx["store"].get("cap_004")
    assert (first["status"], first["confidence"]) == ("contradicted", 0.435)
    campaign.run(ctx)
    second = ctx["store"].get("cap_004")
    assert (second["status"], second["confidence"]) == ("contradicted", 0.435)
    assert len(second["evidence"]) == len(first["evidence"])
    saved = json.loads((tmp_path / "model_v1.json").read_text(encoding="utf-8"))
    assert saved["entries"][0]["confidence"] == 0.435


def test_the_model_from_before_the_stage_is_kept_untouched(monkeypatch):
    stub_checks(monkeypatch, {"T1": [FAIL]})
    ctx = {"store": make_store(), "rubric": {}, "test_specs": [spec()], "traces": [make_trace("T1")]}
    campaign.run(ctx)
    before = ctx["store_before_check"].get("cap_004")
    assert (before["status"], before["confidence"]) == ("unverified", 0.87)
    assert ctx["store"] is not ctx["store_before_check"]
>>>>>>> Stashed changes
