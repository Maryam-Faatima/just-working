"""Tests for testing/adapter.py: conversation recording, trace contract, crash and timeout."""

from __future__ import annotations

import importlib.util
import sys
from datetime import UTC, datetime, timedelta

import jsonschema
import pytest

from testing.adapter import (
    TARGET_AGENT_DIR,
    Adapter,
    AgentCrashed,
    AgentTimedOut,
    TravelAgentBackend,
    TurnResult,
    run_conversation,
    run_subprocess,
    validate_trace,
)


class FakeBackend:
    """Stands in for the agent: replies per turn, or fails on a chosen turn."""

    def __init__(self, fail_on_turn: int | None = None, error: type[Exception] = AgentCrashed):
        self.calls: list[list[str]] = []
        self.fail_on_turn = fail_on_turn
        self.error = error

    def run_turn(self, user_messages: list[str]) -> TurnResult:
        self.calls.append(user_messages)
        if self.fail_on_turn == len(self.calls):
            raise self.error("simulated failure")
        return TurnResult(
            reply=f"reply {len(self.calls)}",
            tool_calls=[{"name": "search_flights", "arguments": None, "result": {"n": 2},
                         "duration_ms": 12}],
        )


def test_conversation_produces_valid_trace():
    adapter = Adapter(FakeBackend(), test_id="RT-001")
    assert adapter.send_message("hello") == "reply 1"
    assert adapter.send_message("more detail") == "reply 2"
    trace = adapter.get_trace()
    assert trace["run_status"] == "completed" and trace["test_id"] == "RT-001"
    assert [t["turn"] for t in trace["turns"]] == [1, 2, 3, 4]
    assert [t["role"] for t in trace["turns"]] == ["user", "agent", "user", "agent"]
    call = trace["turns"][1]["tool_calls"][0]
    assert call == {"name": "search_flights", "arguments": {}, "result": {"n": 2}}


def test_backend_receives_whole_conversation():
    backend = FakeBackend()
    adapter = Adapter(backend, test_id="RT-002")
    adapter.send_message("first")
    adapter.send_message("second")
    assert backend.calls == [["first"], ["first", "second"]]


def test_reset_session_clears_history_and_changes_trace_id():
    backend = FakeBackend()
    adapter = Adapter(backend, test_id="RT-003")
    adapter.send_message("hello")
    old_id = adapter.trace_id
    adapter.reset_session()
    assert adapter.turns == [] and adapter.user_messages == [] and adapter.trace_id != old_id
    adapter.send_message("again")
    assert backend.calls[-1] == ["again"]


def test_crash_is_recorded_and_stops_the_run():
    adapter = Adapter(FakeBackend(fail_on_turn=2), test_id="RT-004")
    adapter.send_message("one")
    assert adapter.send_message("two") is None
    assert adapter.finished and adapter.send_message("three") is None
    trace = adapter.get_trace()
    assert trace["run_status"] == "crashed" and "simulated failure" in trace["error"]
    assert trace["turns"][-1]["role"] == "user"  # the message that crashed it is kept


def test_timeout_is_recorded():
    adapter = Adapter(FakeBackend(fail_on_turn=1, error=AgentTimedOut), test_id="RT-005")
    assert adapter.send_message("hi") is None
    assert adapter.get_trace()["run_status"] == "timeout"


def test_invalid_trace_is_rejected():
    with pytest.raises(jsonschema.ValidationError):
        validate_trace({"trace_id": "x", "test_id": "y", "modality": "text",
                        "run_status": "completed", "turns": [], "extra": 1})


def test_run_conversation_respects_turn_budget():
    backend = FakeBackend()
    trace = run_conversation(Adapter(backend, test_id="RT-006"), ["a", "b", "c"], turn_budget=2)
    assert len(backend.calls) == 2 and len(trace["turns"]) == 4


def test_real_subprocess_timeout(tmp_path):
    command = [sys.executable, "-c", "import time; time.sleep(10)"]
    with pytest.raises(AgentTimedOut):
        run_subprocess(command, tmp_path, {}, 0.5, tmp_path / "out.json")


def test_real_subprocess_crash(tmp_path):
    command = [sys.executable, "-c", "raise SystemExit('boom')"]
    with pytest.raises(AgentCrashed, match="boom"):
        run_subprocess(command, tmp_path, {}, 10, tmp_path / "out.json")


def test_missing_agent_folder_is_a_crash_not_an_exception(tmp_path):
    adapter = Adapter(TravelAgentBackend(agent_dir=tmp_path / "missing"), test_id="RT-007")
    assert adapter.send_message("hello") is None
    assert adapter.get_trace()["run_status"] == "crashed"


needs_agent = pytest.mark.skipif(
    importlib.util.find_spec("langgraph") is None or not TARGET_AGENT_DIR.exists(),
    reason="target agent dependencies not installed",
)


@needs_agent
def test_real_travel_agent_two_turn_conversation():
    departure = (datetime.now(tz=UTC).date() + timedelta(days=40)).isoformat()
    adapter = Adapter(TravelAgentBackend(), test_id="RT-008")
    first = adapter.send_message(
        "I want to travel from Islamabad to Dubai for 5 days. My budget is $1500. "
        "I prefer a comfortable hotel.")
    assert first and "departure date" in first.lower()  # the agent asks instead of guessing
    second = adapter.send_message(f"Departure date: {departure}")
    trace = adapter.get_trace()
    assert second and trace["run_status"] == "completed"
    names = [c["name"] for c in trace["turns"][3]["tool_calls"]]
    assert "search_flights" in names and "search_hotels" in names
    assert "tool_calls" not in trace["turns"][1]  # no tools before the date was given


@needs_agent
def test_real_travel_agent_with_injected_failure():
    departure = (datetime.now(tz=UTC).date() + timedelta(days=40)).isoformat()
    backend = TravelAgentBackend(failure_mode="hotel_timeout")
    trace = run_conversation(Adapter(backend, test_id="RT-009"), [
        f"I want to travel from Islamabad to Dubai on {departure} for 5 days. Budget $1500."])
    calls = [c for c in trace["turns"][1]["tool_calls"] if c["name"] == "search_hotels"]
    assert len(calls) == 2 and "error" in calls[0]["result"]  # failed, then retried
