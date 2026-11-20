"""The recorded-good trace (EH-7) must stay a valid, complete demo fallback."""
import json
from pathlib import Path

from testing.adapter import validate_trace

TRACE = Path(__file__).resolve().parents[1] / "fixtures" / "recorded" / "trace_good.json"


def load() -> dict:
    return json.loads(TRACE.read_text(encoding="utf-8"))


def test_recorded_trace_matches_the_trace_schema():
    validate_trace(load())


def test_recorded_trace_is_a_completed_two_turn_conversation():
    trace = load()
    assert trace["run_status"] == "completed"
    assert [t["role"] for t in trace["turns"]] == ["user", "agent", "user", "agent"]


def test_recorded_trace_shows_the_agent_using_its_tools():
    names = {c["name"] for c in load()["turns"][3]["tool_calls"]}
    assert {"search_flights", "search_hotels"} <= names
    assert "tool_calls" not in load()["turns"][1]  # no tools before the date was given
