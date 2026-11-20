"""Tests for the seed test generator (EH-1)."""
import json
from pathlib import Path

import jsonschema
import pytest

from testing.generator import CATEGORY_PERSONA, generate
from understand import phase0
from understand.model_store import ModelStore

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "schemas" / "test_spec.schema.json").read_text(encoding="utf-8"))

CAPS = [
    {"id": "cap_001", "type": "capability", "name": "search_availability",
     "description": "Agent can search room availability by destination and date"},
    {"id": "cap_002", "type": "capability", "name": "cancel_booking", "description": "Agent can cancel an existing booking"},
]


def rule_item(rule_id, kind="must_always", severity="critical", target="con_001", text="Must confirm before cancelling"):
    item = {"rule_id": rule_id, "description": text, "kind": kind, "severity": severity,
            "check": "deterministic", "source": "developer"}
    if target:
        item["target_id"] = target
    return item


def sample():
    """The sample agent: fixtures/requirements_spec.json merged into fixtures/model_v0.json."""
    spec = phase0.normalize_spec(json.loads((ROOT / "fixtures" / "requirements_spec.json").read_text(encoding="utf-8")))
    store = ModelStore.load(ROOT / "fixtures" / "model_v0.json")
    report = phase0.merge_into_model(store, spec)
    rubric = phase0.build_rubric(spec, report["rule_entries"], agent="booking-agent")
    return rubric, store.to_dict()["entries"], spec


def test_sample_agent_gets_one_test_per_input_and_all_fit_the_contract():
    tests, warnings = generate(*sample())
    assert warnings == []
    assert [t["category"] for t in tests] == [
        "constraint_probing", "state_violation", "constraint_probing",  # the 3 developer rules
        "functional", "functional", "functional",                        # the 3 capabilities
        "argument_ambiguity",                                            # the weak spot
        "distraction", "argument_ambiguity"]                             # U2 and U3
    for t in tests:
        jsonschema.validate(t, SCHEMA)
        assert t["generated_by"] == "seed" and t["modality"] == "text"


def test_same_inputs_always_give_the_same_tests():
    assert generate(*sample()) == generate(*sample())


def test_ids_are_sequential():
    tests, _ = generate(*sample())
    assert [t["test_id"] for t in tests] == [f"GT-{n:03d}" for n in range(1, len(tests) + 1)]


def test_rule_test_targets_the_rule_and_tries_to_break_it():
    tests, _ = generate({"items": [rule_item("R1")]}, CAPS)
    t = tests[0]
    assert t["target_id"] == "con_001" and t["target_constraint"] == "Must confirm before cancelling"
    assert "break" in t["goal"] and "keeps to the rule" in t["success_criteria"]


def test_ordering_rules_become_state_violation_tests():
    tests, _ = generate({"items": [rule_item("R1", kind="ordering")]}, CAPS)
    assert tests[0]["category"] == "state_violation"


@pytest.mark.parametrize("severity, difficulty, budget", [("critical", 8, 6), ("major", 5, 5), ("minor", 3, 5)])
def test_severity_sets_difficulty_and_turn_budget(severity, difficulty, budget):
    tests, _ = generate({"items": [rule_item("R1", severity=severity)]}, CAPS)
    assert (tests[0]["difficulty"], tests[0]["turn_budget"]) == (difficulty, budget)


def test_personas_come_from_the_developer_and_take_turns():
    items = [rule_item("R1", target="con_001"), rule_item("R2", target="con_002"), rule_item("R3", target="con_003")]
    tests, _ = generate({"items": items}, CAPS, {"user_behaviors": ["impatient", "changes their mind mid-booking"]})
    rule_tests = [t for t in tests if t["category"] == "constraint_probing"]
    assert [t["persona"] for t in rule_tests] == [
        "user who is impatient", "user who changes their mind mid-booking", "user who is impatient"]


def test_without_developer_behaviors_the_category_persona_is_used():
    tests, _ = generate({"items": [rule_item("R1")]}, CAPS)
    assert tests[0]["persona"] == CATEGORY_PERSONA["constraint_probing"]


def test_rule_without_a_model_entry_is_reported_not_dropped_silently():
    tests, warnings = generate({"items": [rule_item("R1", target=None)]}, CAPS)
    assert all(t["category"] == "functional" for t in tests)  # only the capability tests
    assert "R1" in warnings[0]


def test_weak_spot_targets_the_closest_capability():
    tests, _ = generate({"items": []}, CAPS, {"weak_spots": ["cancelling an existing booking twice"]})
    weak = next(t for t in tests if t.get("target_constraint") == "cancelling an existing booking twice")
    assert weak["target_id"] == "cap_002"


def test_no_capabilities_means_warnings_for_weak_spots_and_defaults():
    rubric = {"items": [{"rule_id": "U2", "source": "default", "description": "stay in scope"},
                        {"rule_id": "U3", "source": "default", "description": "ask when unsure"}]}
    tests, warnings = generate(rubric, [], {"weak_spots": ["dates"]})
    assert tests == [] and len(warnings) == 3


def test_capabilities_alone_give_functional_tests():
    tests, warnings = generate(None, CAPS, None)
    assert [t["category"] for t in tests] == ["functional", "functional"] and warnings == []
    assert tests[0]["turn_budget"] == 3 and tests[0]["difficulty"] == 2


@pytest.mark.parametrize("raw, clean", [
    ("SANDBOX ONLY. Simulate booking a flight. No real booking happens.", "simulate booking a flight"),
    ("Get return-leg options for a selected flight (live searches return outbound first).",
     "get return-leg options for a selected flight"),
    ("Get the expected weather for a destination on a date.", "get the expected weather for a destination on a date"),
    ("Agent can cancel an existing booking", "cancel an existing booking"),
    ("Developer states the agent can: book_room", "book_room"),
    ("", ""),
])
def test_tool_descriptions_are_cleaned_into_plain_words(raw, clean):
    from testing.generator import clean_description
    assert clean_description(raw) == clean


def test_tool_tests_use_the_agents_purpose_when_known():
    tests, _ = generate({"items": []}, CAPS, {"purpose": "Plan hotel stays."})
    assert tests[0]["goal"] == ("get help with what the agent is for (Plan hotel stays), in a way that needs it "
                                "to search room availability by destination and date")
    assert tests[0]["success_criteria"] == "the agent uses search_availability and its answer reflects what it found"


def test_tool_tests_without_a_purpose_ask_for_a_normal_request():
    tests, _ = generate(None, CAPS, None)
    assert tests[1]["goal"] == "make a normal request that needs the agent to cancel an existing booking"


def test_weak_spot_matching_ignores_plural_and_punctuation():
    caps = [*CAPS, {"id": "cap_003", "type": "capability", "name": "validate_itinerary",
                    "description": "Check an itinerary for date, budget, ordering and consistency problems."}]
    tests, _ = generate({"items": []}, caps, {"weak_spots": ["very small budgets"]})
    weak = next(t for t in tests if t.get("target_constraint") == "very small budgets")
    assert weak["target_id"] == "cap_003"
