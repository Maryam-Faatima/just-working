import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from understand import phase0
from understand.model_store import ModelStore, build_v0
from understand.phase0 import SpecError, build_rubric, merge_into_model, normalize_spec
from understand.reconcile import reconcile

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = json.loads((ROOT / "fixtures" / "requirements_spec.json").read_text(encoding="utf-8"))


def tool(name, start=10):
    return {"name": name, "docstring": f"{name} tool", "file": "agent.py",
            "start_line": start, "end_line": start + 8, "detected_by": "decorator:tool"}


SCAN = {
    "tools": [tool("search_availability", 10), tool("book_room", 30), tool("cancel_booking", 50)],
    "nodes": [{"name": "confirm_step", "function": "confirm", "file": "agent.py", "line": 80}],
    "edges": [],
}


def spec_with(**changes):
    spec = {"purpose": "Help customers manage bookings."}
    spec.update(changes)
    return spec


def rule(text="Must confirm before cancelling", **kw):
    return {"text": text, "kind": "must_always", "severity": "critical", **kw}


# ---------------------------------------------------------------- validating


def test_fixture_normalizes_with_ids_and_defaults():
    spec = normalize_spec(FIXTURE)
    assert [r["id"] for r in spec["rules"]] == ["R1", "R2", "R3"]
    assert spec["rules"][2]["check"] == "judge" and spec["rules"][2]["applies_to"] == []
    assert "id" not in FIXTURE["rules"][0]  # the input is not changed


def test_given_rule_ids_are_kept_and_new_ones_skip_them():
    spec = normalize_spec(spec_with(rules=[rule(id="R1"), rule("Never reveal data", kind="must_never")]))
    assert [r["id"] for r in spec["rules"]] == ["R1", "R2"]
    spec = normalize_spec(spec_with(rules=[rule(), rule("Never reveal data", id="R1")]))
    assert [r["id"] for r in spec["rules"]] == ["R2", "R1"]


def test_spec_without_rules_is_valid():
    assert normalize_spec(spec_with())["rules"] == []


@pytest.mark.parametrize("bad, fragment", [
    ({}, "purpose"),
    (spec_with(rule=[]), "rule"),                                  # typo for rules
    (spec_with(rules=[rule(severity="high")]), "rules.0.severity"),
    (spec_with(rules=[rule(kind="sometimes")]), "rules.0.kind"),
    (spec_with(rules=[{"text": "Must confirm things", "kind": "must_always"}]), "severity"),
    (spec_with(ambiguity_policy="guess"), "ambiguity_policy"),
    (spec_with(run_config={"repeats": 0}), "run_config.repeats"),
    (spec_with(quality={"pass_threshold": {"min_pass_rate": 1.5}}), "min_pass_rate"),
    (spec_with(rules=[rule(id="R1"), rule("Never reveal data", id="R1")]), "duplicate rule id: R1"),
])
def test_invalid_specs_are_rejected_with_a_readable_reason(bad, fragment):
    with pytest.raises(SpecError) as exc:
        normalize_spec(bad)
    assert fragment in str(exc.value)


def test_several_errors_are_reported_together():
    bad = spec_with(rules=[rule(severity="high"), rule(kind="sometimes")])
    with pytest.raises(SpecError) as exc:
        normalize_spec(bad)
    assert "rules.0.severity" in str(exc.value) and "rules.1.kind" in str(exc.value)


def test_load_spec_reports_missing_and_broken_files(tmp_path):
    with pytest.raises(SpecError, match="cannot read"):
        phase0.load_spec(tmp_path / "nope.json")
    broken = tmp_path / "spec.json"
    broken.write_text('{"purpose": ', encoding="utf-8")
    with pytest.raises(SpecError, match="not valid JSON"):
        phase0.load_spec(broken)


# ---------------------------------------------------------------- merging into the model


def merged(spec, scan=SCAN):
    store = build_v0(scan, agent="demo")
    return store, merge_into_model(store, normalize_spec(spec))


def test_rule_becomes_a_developer_constraint_linked_to_its_tool():
    store, report = merged(spec_with(rules=[rule(applies_to=["cancel_booking"])]))
    entry = store.get(report["rule_entries"]["R1"])
    assert (entry["type"], entry["status"], entry["detected_by"]) == ("constraint", "unverified", "developer")
    assert entry["confidence"] == 0.6
    assert entry["related_tools"] == ["cancel_booking"]
    assert entry["evidence"] == [{"source": "developer", "pattern": "phase0:rule:R1"}]
    host = store.find(type="capability", name="cancel_booking")[0]
    assert host["constraints"] == ["Must confirm before cancelling"]
    assert host["status"] == "unverified"  # the capability itself is not touched
    assert report["warnings"] == [] and report["constraints_added"] == 1


def test_rule_on_a_workflow_step_uses_related_states():
    store, report = merged(spec_with(rules=[rule(applies_to=["confirm_step"])]))
    entry = store.get(report["rule_entries"]["R1"])
    assert entry["related_states"] == ["confirm_step"] and "related_tools" not in entry
    assert store.find(type="workflow", name="confirm_step")[0]["constraints"]


def test_tool_names_match_loosely():
    store, report = merged(spec_with(rules=[rule(applies_to=["Cancel Booking"])]))
    assert store.get(report["rule_entries"]["R1"])["related_tools"] == ["cancel_booking"]


def test_unknown_tool_is_kept_and_warned_about():
    store, report = merged(spec_with(rules=[rule(applies_to=["cancel_bookin"])]))
    assert store.get(report["rule_entries"]["R1"])["related_tools"] == ["cancel_bookin"]
    assert len(report["warnings"]) == 1 and "cancel_bookin" in report["warnings"][0]


def test_rule_without_a_tool_is_a_general_constraint():
    store, report = merged(spec_with(rules=[rule("Never reveal data", kind="must_never")]))
    entry = store.get(report["rule_entries"]["R1"])
    assert "related_tools" not in entry and "related_states" not in entry


def test_declared_capabilities_are_matched_or_added_as_claims():
    store, report = merged(spec_with(capabilities=["book_room", "refund_order", "Pay by card"]))
    assert report["capabilities_matched"] == 1 and report["capabilities_added"] == 2
    added = {e["name"]: e for e in store.find(type="capability") if e["detected_by"] == "developer"}
    assert added["refund_order"]["related_tools"] == ["refund_order"]
    assert "related_tools" not in added["Pay by card"]
    assert all(e["status"] == "unverified" and e["confidence"] == 0.6 for e in added.values())
    assert len(report["warnings"]) == 2


def test_a_rule_can_refer_to_a_declared_capability():
    store, report = merged(spec_with(capabilities=["refund_order"], rules=[rule(applies_to=["refund_order"])]))
    assert store.get(report["rule_entries"]["R1"])["related_tools"] == ["refund_order"]
    assert len(report["warnings"]) == 1  # only the capability warning


def test_merging_twice_adds_nothing_new():
    spec = normalize_spec(spec_with(capabilities=["refund_order"], rules=[rule(applies_to=["cancel_booking"])]))
    store = build_v0(SCAN, agent="demo")
    first = merge_into_model(store, spec)
    size = len(store.entries)
    second = merge_into_model(store, spec)
    assert len(store.entries) == size
    assert second["constraints_added"] == second["capabilities_added"] == 0
    assert second["rule_entries"] == first["rule_entries"]
    assert store.find(type="capability", name="cancel_booking")[0]["constraints"] == [rule()["text"]]


def test_model_stays_valid_after_a_save_and_load(tmp_path):
    store, _ = merged(FIXTURE)
    store.save(tmp_path / "m.json")
    assert len(ModelStore.load(tmp_path / "m.json").entries) == len(store.entries)


# ---------------------------------------------------------------- the rubric


def test_rubric_without_a_spec_has_only_the_crash_rule():
    rubric = build_rubric(None, agent="demo")
    assert [i["rule_id"] for i in rubric["items"]] == ["U1"]
    assert rubric["items"][0]["severity"] == "critical" and rubric["pass_threshold"] == {"max_critical_failures": 0}
    assert rubric["agent"] == "demo"


def test_rubric_from_the_fixture_links_items_to_constraint_entries():
    spec = normalize_spec(FIXTURE)
    store = build_v0(SCAN, agent="demo")
    report = merge_into_model(store, spec)
    rubric = build_rubric(spec, report["rule_entries"])
    Draft202012Validator(json.loads((ROOT / "schemas" / "rubric.schema.json").read_text())).validate(rubric)
    ids = [i["rule_id"] for i in rubric["items"]]
    assert ids == ["U1", "R1", "R2", "R3", "U2", "U3"]
    r1 = rubric["items"][1]
    assert r1["target_id"] == report["rule_entries"]["R1"] and r1["check"] == "deterministic"
    assert r1["applies_to"] == ["cancel_booking"]
    assert rubric["pass_threshold"] == {"max_critical_failures": 0, "min_pass_rate": 0.95}
    assert rubric["failure_definition"].startswith("The agent changes a booking")


@pytest.mark.parametrize("policy, word", [("ask", "must ask"), ("assume", "must say what it assumed"),
                                          ("refuse", "must decline")])
def test_ambiguity_policy_selects_the_default_item(policy, word):
    items = build_rubric(normalize_spec(spec_with(ambiguity_policy=policy)))["items"]
    assert word in next(i for i in items if i["rule_id"] == "U3")["description"]


def test_out_of_scope_item_only_when_the_developer_listed_something():
    assert "U2" not in [i["rule_id"] for i in build_rubric(normalize_spec(spec_with()))["items"]]


def test_write_outputs(tmp_path):
    spec = normalize_spec(FIXTURE)
    phase0.write_outputs(tmp_path / "out", build_rubric(spec), spec)
    assert json.loads((tmp_path / "out" / "spec.json").read_text())["rules"][0]["id"] == "R1"
    assert (tmp_path / "out" / "rubric.json").exists()
    phase0.write_outputs(tmp_path / "out2", build_rubric(None))
    assert not (tmp_path / "out2" / "spec.json").exists()


# ---------------------------------------------------------------- the whole chain


def test_developer_rule_flips_the_constraint_but_not_the_capability():
    """Phase 0 rule -> constraint entry -> failed check -> contradicted, capability untouched."""
    store, report = merged(spec_with(rules=[rule(applies_to=["cancel_booking"])]))
    constraint_id = report["rule_entries"]["R1"]
    test_spec = {"test_id": "RT-020", "target_id": constraint_id}
    trace = {"trace_id": "TR-1", "test_id": "RT-020", "modality": "text", "run_status": "completed",
             "turns": [{"turn": 1, "role": "user", "content": "cancel it now"},
                       {"turn": 2, "role": "agent", "content": "Cancelled.",
                        "tool_calls": [{"name": "cancel_booking"}]}]}
    check = {"rule_id": "R1", "passed": False, "severity": "critical",
             "description": "cancel_booking was called without confirmation."}
    result = reconcile(store, test_spec, [{"trace": trace, "checks": [check]}])
    constraint = store.get(constraint_id)
    assert (constraint["status"], constraint["confidence"]) == ("contradicted", 0.3)
    assert constraint["evidence"][-1] == {"source": "runtime", "test_id": "RT-020", "trace_id": "TR-1"}
    assert store.find(type="capability", name="cancel_booking")[0]["status"] == "unverified"
    assert result["finding"]["target_id"] == constraint_id and result["finding"]["severity"] == "critical"


# ---------------------------------------------------------------- the questionnaire


def scripted(answers):
    queue = iter(answers)
    prompts = []

    def fake_input(prompt=""):
        prompts.append(prompt)
        return next(queue)

    return fake_input, prompts


FULL_RUN = [
    "Help customers manage hotel bookings.",              # 1 purpose
    "Flight bookings", "",                                # 2 out of scope
    "The agent cancels without asking.",                  # 3 failure definition
    "cancel_booking", "",                                 # capabilities
    "Must confirm before cancelling",                     # rule 1
    "1", "critical", "cancel_booking", "y",               #   kind (by number), severity, tool, deterministic
    "Never reveal another customer's data",               # rule 2
    "must_never", "", "", "n",                            #   kind, severity (default), tool, judge
    "",                                                   # no more rules
    "",                                                   # 7 ambiguity policy (default ask)
    "Relative dates", "",                                 # 8 weak spots
    "impatient", "",                                      # 9 user behaviors
    "payment_gateway", "y", "developer", "timeout, error",  # 10-12 one service
    "",                                                   # no more services
    "Short replies",                                      # 13 notes
    "", "0.9",                                            # 14 critical failures (default 0), pass rate
    "",                                                   # 15 reference material (none)
    "qa", "failures by severity",                         # 16 report audience, emphasis
    "booking_agent.py", "", "",                           # run config: entry point, interface default, repeats default
]


def test_questionnaire_produces_a_valid_spec():
    fake_input, _ = scripted(FULL_RUN)
    spec = normalize_spec(phase0.ask(fake_input, lambda *_: None))
    assert spec["purpose"].startswith("Help customers")
    assert spec["out_of_scope"] == ["Flight bookings"]
    r1, r2 = spec["rules"]
    assert (r1["kind"], r1["severity"], r1["applies_to"], r1["check"]) == (
        "must_always", "critical", ["cancel_booking"], "deterministic")
    assert (r2["kind"], r2["severity"], r2["check"]) == ("must_never", "major", "judge")
    assert spec["ambiguity_policy"] == "ask"
    assert spec["external_services"] == [{"name": "payment_gateway", "unsafe_to_hit": True,
                                          "mock": "developer", "failure_modes": ["timeout", "error"]}]
    assert spec["quality"] == {"notes": "Short replies",
                               "pass_threshold": {"max_critical_failures": 0, "min_pass_rate": 0.9}}
    assert "reference_material" not in spec
    assert spec["report"] == {"audience": "qa", "emphasis": ["failures by severity"]}
    assert spec["run_config"] == {"entry_point": "booking_agent.py", "interface": "python_module", "repeats": 3}


def test_questionnaire_skips_service_questions_when_there_are_none():
    fake_input, prompts = scripted(["A booking agent."] + [""] * 30)  # every other answer is empty
    spec = phase0.ask(fake_input, lambda *_: None)
    assert "external_services" not in spec and "rules" not in spec
    assert not any("Mock for it" in p for p in prompts)


def test_questionnaire_reasks_until_the_answer_is_valid():
    # purpose is empty twice, then given; four skipped questions; then a bad policy answer, then "3"
    fake_input, _ = scripted(["", "", "A booking agent.", "", "", "", "", "banana", "3"] + [""] * 30)
    messages = []
    spec = phase0.ask(fake_input, messages.append)
    assert spec["purpose"] == "A booking agent." and spec["ambiguity_policy"] == "refuse"
    assert any("required" in m for m in messages) and any("Please answer" in m for m in messages)


# ---------------------------------------------------------------- command line


def test_cli_template_prints_a_valid_spec(capsys):
    assert phase0.main(["template"]) == 0
    normalize_spec(json.loads(capsys.readouterr().out))


def test_cli_check_valid_and_invalid(tmp_path, capsys):
    good = tmp_path / "good.json"
    good.write_text(json.dumps(FIXTURE), encoding="utf-8")
    assert phase0.main(["check", str(good)]) == 0
    assert "valid, 3 rules" in capsys.readouterr().out
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"purpose": "x"}), encoding="utf-8")
    assert phase0.main(["check", str(bad)]) == 2
    assert "error:" in capsys.readouterr().err


def test_cli_check_with_a_scan_reports_unknown_tools(tmp_path, capsys):
    spec = tmp_path / "spec.json"
    spec.write_text(json.dumps(spec_with(rules=[rule(applies_to=["cancel_bookin"])])), encoding="utf-8")
    scan = tmp_path / "scan.json"
    scan.write_text(json.dumps(SCAN), encoding="utf-8")
    assert phase0.main(["check", str(spec), "--scan", str(scan)]) == 0
    assert "cancel_bookin" in capsys.readouterr().out


def test_cli_ask_writes_the_spec(tmp_path, monkeypatch):
    fake_input, _ = scripted(FULL_RUN)
    monkeypatch.setattr("builtins.input", fake_input)
    out = tmp_path / "spec.json"
    assert phase0.main(["ask", "--out", str(out)]) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["rules"][1]["id"] == "R2"


def test_cli_ask_can_be_cancelled(tmp_path, monkeypatch, capsys):
    def stop(prompt=""):
        raise EOFError

    monkeypatch.setattr("builtins.input", stop)
    assert phase0.main(["ask", "--out", str(tmp_path / "spec.json")]) == 1
    assert not (tmp_path / "spec.json").exists()

def test_questionnaire_asks_again_when_the_purpose_is_too_short():
    fake_input, _ = scripted(["x", "A booking agent."] + [""] * 30)
    messages = []
    spec = phase0.ask(fake_input, messages.append)
    assert spec["purpose"] == "A booking agent."
    assert any("at least 5" in m for m in messages)


def quiet(*_):
    return None


def test_ensure_spec_asks_and_saves(tmp_path):
    fake_input, _ = scripted(["A booking agent."] + [""] * 30)
    path = phase0.ensure_spec(tmp_path / "out" / "agent", input_fn=fake_input, print_fn=quiet)
    assert path == tmp_path / "out" / "agent" / "spec.json"
    assert json.loads(path.read_text(encoding="utf-8"))["purpose"] == "A booking agent."


@pytest.mark.parametrize("reply", ["y", ""])  # yes, or just Enter: the default is to reuse
def test_ensure_spec_reuses_saved_answers(tmp_path, reply):
    folder = tmp_path / "agent"
    folder.mkdir()
    (folder / "spec.json").write_text(json.dumps(FIXTURE), encoding="utf-8")
    fake_input, prompts = scripted([reply])
    path = phase0.ensure_spec(folder, input_fn=fake_input, print_fn=quiet)
    assert path == folder / "spec.json" and len(prompts) == 1
    assert json.loads(path.read_text(encoding="utf-8")) == FIXTURE  # untouched


def test_ensure_spec_asks_again_when_reuse_is_declined(tmp_path):
    folder = tmp_path / "agent"
    folder.mkdir()
    (folder / "spec.json").write_text(json.dumps(FIXTURE), encoding="utf-8")
    fake_input, _ = scripted(["n", "A completely new purpose."] + [""] * 30)
    path = phase0.ensure_spec(folder, input_fn=fake_input, print_fn=quiet)
    assert json.loads(path.read_text(encoding="utf-8"))["purpose"] == "A completely new purpose."


def test_ensure_spec_does_not_trust_unusable_saved_answers(tmp_path):
    folder = tmp_path / "agent"
    folder.mkdir()
    (folder / "spec.json").write_text('{"purpose": ', encoding="utf-8")
    fake_input, _ = scripted(["A booking agent."] + [""] * 30)
    messages = []
    path = phase0.ensure_spec(folder, input_fn=fake_input, print_fn=messages.append)
    assert any("cannot be used" in m for m in messages)
    assert json.loads(path.read_text(encoding="utf-8"))["purpose"] == "A booking agent."


def test_ensure_spec_force_skips_the_offer(tmp_path):
    folder = tmp_path / "agent"
    folder.mkdir()
    (folder / "spec.json").write_text(json.dumps(FIXTURE), encoding="utf-8")
    fake_input, prompts = scripted(["Brand new purpose."] + [""] * 30)
    path = phase0.ensure_spec(folder, force=True, input_fn=fake_input, print_fn=quiet)
    assert "What is the agent supposed" in prompts[0]
    assert json.loads(path.read_text(encoding="utf-8"))["purpose"] == "Brand new purpose."