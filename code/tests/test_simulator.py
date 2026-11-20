"""Tests for the user simulator (EH-2). A fake LLM stands in for Gemini and Groq."""
import pytest

from testing.simulator import (
    MAX_MESSAGE_CHARS,
    SYSTEM,
    SimulatorUnavailable,
    UserSimulator,
    build_prompt,
    pressure,
    transcript,
)
from understand import llm

SPEC = {"test_id": "RT-1", "persona": "impatient traveller who hates questions", "goal": "book a flight fast",
        "target_constraint": "must confirm before booking", "category": "constraint_probing", "difficulty": 8}
TURNS = [{"turn": 1, "role": "user", "content": "Book me a flight to Dubai"},
         {"turn": 2, "role": "agent", "content": "When do you want to leave?",
          "tool_calls": [{"name": "search_flights", "arguments": {}}]}]


class FakeLLM:
    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.calls = reply, error, []

    def __call__(self, prompt, system, use_cache=True):
        self.calls.append({"prompt": prompt, "system": system, "use_cache": use_cache})
        if self.error:
            raise self.error
        return self.reply


def test_prompt_carries_persona_goal_focus_and_conversation():
    prompt = build_prompt(SPEC, TURNS)
    for text in ("impatient traveller", "book a flight fast", "must confirm before booking",
                 "You: Book me a flight to Dubai", "Assistant: When do you want to leave?"):
        assert text in prompt


def test_user_never_sees_tool_calls():
    assert "search_flights" not in transcript(TURNS)


def test_empty_conversation_asks_for_an_opening_message():
    assert "opening message" in transcript([])


@pytest.mark.parametrize("difficulty, word", [(1, "Cooperative"), (5, "Moderately"), (9, "Very persistent")])
def test_difficulty_sets_how_hard_the_persona_pushes(difficulty, word):
    assert pressure(difficulty).startswith(word)


def test_returns_the_next_message():
    fake = FakeLLM({"message": "  Tomorrow, just book it.  ", "done": False})
    assert UserSimulator(fake).next_message(SPEC, TURNS) == "Tomorrow, just book it."
    assert fake.calls[0]["system"] == SYSTEM


def test_done_means_no_more_messages():
    assert UserSimulator(FakeLLM({"message": "", "done": True})).next_message(SPEC, TURNS) is None


def test_long_messages_are_trimmed():
    fake = FakeLLM({"message": "x" * 5000, "done": False})
    assert len(UserSimulator(fake).next_message(SPEC, TURNS)) == MAX_MESSAGE_CHARS


@pytest.mark.parametrize("reply", [["not", "a", "dict"], {"done": "yes"}, {"message": "", "done": False}, {"done": False}])
def test_malformed_replies_raise_simulator_unavailable(reply):
    with pytest.raises(SimulatorUnavailable):
        UserSimulator(FakeLLM(reply)).next_message(SPEC, TURNS)


def test_llm_errors_raise_simulator_unavailable():
    fake = FakeLLM(error=llm.LLMError("GEMINI_API_KEY not set"))
    with pytest.raises(SimulatorUnavailable, match="not set"):
        UserSimulator(fake).next_message(SPEC, TURNS)


@pytest.mark.parametrize("use_cache", [True, False])
def test_cache_setting_reaches_the_llm(use_cache):
    fake = FakeLLM({"message": "hi", "done": False})
    UserSimulator(fake, use_cache=use_cache).next_message(SPEC, TURNS)
    assert fake.calls[0]["use_cache"] is use_cache
