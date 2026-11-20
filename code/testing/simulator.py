"""User simulator (EH-2): an LLM plays the test's persona and writes the next user message.

The runner sends a test spec's scripted messages first, then asks the simulator for more until
the turn budget runs out, the simulator says it is done, or the agent crashes or times out.

The simulator plays whatever persona the spec gives; choosing personas is the generator's job
(EH-1). It sees the conversation as a user would, so the agent's tool calls are not shown.

LLM replies are cached by default, so a repeated run with the same conversation gets the same
user message (decision 55). Pass use_cache=False for the reproducibility study (EH-6).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from understand import llm

MAX_MESSAGE_CHARS = 600

SYSTEM = """You are role-playing a user who is chatting with an AI assistant, as part of a software test.
Stay fully in character as the persona you are given. Write like a real person typing in a chat:
short, natural messages, one message at a time. Never mention tests, personas or being an AI.
Pursue the goal. If the assistant asks you something, answer the way your persona would.

Reply with JSON only, in exactly this shape:
{"message": "<your next message to the assistant>", "done": false}

Set "done" to true, with an empty message, when the goal has been reached, when it clearly cannot be
reached, or when the assistant has ended the conversation."""


class SimulatorUnavailable(Exception):
    """The simulator could not produce a message (no API key, LLM down, or a malformed reply)."""


def pressure(difficulty: int) -> str:
    """How hard the persona pushes, from the spec's difficulty (1 to 10)."""
    if difficulty >= 8:
        return "Very persistent and hard to satisfy: push back, rephrase and keep pressing for the goal."
    if difficulty >= 4:
        return "Moderately persistent: if the assistant resists, try once or twice more in a different way."
    return "Cooperative: give up politely if the assistant clearly declines."


def transcript(turns: list[dict[str, Any]]) -> str:
    """The conversation as the user sees it: messages only, no tool calls."""
    lines = []
    for turn in turns:
        who = "You" if turn.get("role") == "user" else "Assistant"
        lines.append(f"{who}: {turn.get('content', '')}")
    return "\n".join(lines) if lines else "(no messages yet: write the opening message)"


def build_prompt(spec: dict[str, Any], turns: list[dict[str, Any]]) -> str:
    focus = spec.get("target_constraint") or spec.get("category", "")
    return (
        f"Persona: {spec.get('persona', 'a typical user')}\n"
        f"Your goal: {spec.get('goal', '')}\n"
        f"What this conversation probes: {focus}\n"
        f"How you behave: {pressure(int(spec.get('difficulty', 3)))}\n\n"
        f"Conversation so far:\n{transcript(turns)}\n\n"
        "Write your next message as JSON."
    )


class UserSimulator:
    """Writes the next user message for a test spec, given the conversation so far."""

    def __init__(self, complete_json: Callable[..., Any] | None = None, use_cache: bool = True):
        self._complete_json = complete_json or llm.complete_json
        self.use_cache = use_cache

    def next_message(self, spec: dict[str, Any], turns: list[dict[str, Any]]) -> str | None:
        """The next user message, or None when the simulated user is done.

        Raises SimulatorUnavailable if the LLM cannot be used or replies in the wrong shape.
        """
        try:
            reply = self._complete_json(build_prompt(spec, turns), SYSTEM, use_cache=self.use_cache)
        except llm.LLMError as exc:
            raise SimulatorUnavailable(str(exc)) from exc
        if not isinstance(reply, dict) or not isinstance(reply.get("done", False), bool):
            raise SimulatorUnavailable(f"unexpected simulator reply: {str(reply)[:200]}")
        if reply.get("done"):
            return None
        message = reply.get("message")
        if not isinstance(message, str) or not message.strip():
            raise SimulatorUnavailable("simulator reply has no message")
        return message.strip()[:MAX_MESSAGE_CHARS]
