import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent


def load(rel_path):
    return json.loads((ROOT / rel_path).read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "schema_file, fixture_file",
    [
        ("schemas/test_spec.schema.json", "fixtures/test_spec.json"),
        ("schemas/requirements_spec.schema.json", "fixtures/requirements_spec.json"),
        ("schemas/trace.schema.json", "fixtures/trace.json"),
        ("schemas/finding.schema.json", "fixtures/finding.json"),
    ],
)
def test_fixture_matches_schema(schema_file, fixture_file):
    Draft202012Validator(load(schema_file)).validate(load(fixture_file))


def test_model_v0_entries_match_schema():
    validator = Draft202012Validator(load("schemas/model_entry.schema.json"))
    for entry in load("fixtures/model_v0.json")["entries"]:
        validator.validate(entry)


def test_invalid_status_is_rejected():
    validator = Draft202012Validator(load("schemas/model_entry.schema.json"))
    bad = load("fixtures/model_v0.json")["entries"][0]
    bad["status"] = "maybe"
    assert not validator.is_valid(bad)


def test_confidence_out_of_range_is_rejected():
    validator = Draft202012Validator(load("schemas/model_entry.schema.json"))
    bad = load("fixtures/model_v0.json")["entries"][0]
    bad["confidence"] = 1.5
    assert not validator.is_valid(bad)


def test_missing_detected_by_is_rejected():
    validator = Draft202012Validator(load("schemas/model_entry.schema.json"))
    bad = load("fixtures/model_v0.json")["entries"][0]
    del bad["detected_by"]
    assert not validator.is_valid(bad)


def test_unknown_detected_by_is_rejected():
    validator = Draft202012Validator(load("schemas/model_entry.schema.json"))
    bad = load("fixtures/model_v0.json")["entries"][0]
    bad["detected_by"] = "magic"
    assert not validator.is_valid(bad)

def test_developer_stated_entry_is_accepted():
    validator = Draft202012Validator(load("schemas/model_entry.schema.json"))
    entry = load("fixtures/model_v0.json")["entries"][1]
    entry["detected_by"] = "developer"
    entry["evidence"] = [{"source": "developer", "pattern": "phase0:rule:R1"}]
    validator.validate(entry)


def test_unknown_evidence_source_is_rejected():
    validator = Draft202012Validator(load("schemas/model_entry.schema.json"))
    bad = load("fixtures/model_v0.json")["entries"][0]
    bad["evidence"] = [{"source": "rumour"}]
    assert not validator.is_valid(bad)


def test_spec_with_a_misspelled_field_is_rejected():
    validator = Draft202012Validator(load("schemas/requirements_spec.schema.json"))
    bad = load("fixtures/requirements_spec.json")
    bad["rule"] = bad.pop("rules")
    assert not validator.is_valid(bad)