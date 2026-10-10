import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from understand.confidence import baseline_confidence, tool_to_capability
from understand.scanner import scan_repo

ROOT = Path(__file__).resolve().parent.parent


def load(rel_path):
    return json.loads((ROOT / rel_path).read_text(encoding="utf-8"))


def test_rule_beats_llm_only():
    assert baseline_confidence("rule", "decorator:tool") > baseline_confidence("llm")


def test_agreement_raises_confidence_but_stays_below_one():
    rule = baseline_confidence("rule", "decorator:tool")
    both = baseline_confidence("rule+llm", "decorator:tool")
    assert rule < both < 1


def test_name_based_constructor_is_weaker_than_decorator():
    assert baseline_confidence("rule", "constructor:Tool") < baseline_confidence(
        "rule", "decorator:tool"
    )

def test_developer_statement_sits_between_llm_only_and_rule_detection():
    developer = baseline_confidence("developer")
    assert baseline_confidence("llm") < developer < baseline_confidence("rule", "decorator:tool")
    assert developer < baseline_confidence("rule")  # also below a name-based rule match

def test_unknown_source_is_rejected():
    with pytest.raises(ValueError):
        baseline_confidence("guess")


def test_scanned_tool_becomes_valid_model_entry(tmp_path):
    (tmp_path / "agent.py").write_text(
        "from langchain_core.tools import tool\n\n"
        "@tool\ndef cancel_booking(booking_id):\n    '''Cancel a booking.'''\n    return 1\n"
    )
    tool = scan_repo(tmp_path)["tools"][0]
    entry = tool_to_capability(tool, 1)
    Draft202012Validator(load("schemas/model_entry.schema.json")).validate(entry)
    assert entry["id"] == "cap_001"
    assert entry["detected_by"] == "rule"