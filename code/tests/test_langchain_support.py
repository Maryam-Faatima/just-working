"""Tests for LangChain support in the universal adapter (EH-4): any LangChain agent, no wrapper."""
from pathlib import Path
from types import SimpleNamespace

import pytest

from testing.backends import PythonModuleBackend
from testing.langchain_support import _text, invoke, is_langchain_runnable, tool_calls_from_messages

pytest.importorskip("langchain_core")
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

AGENT = Path(__file__).resolve().parents[1] / "fixtures" / "agents" / "langchain_agent"


def test_tool_calls_are_paired_with_their_results():
    messages = [
        HumanMessage(content="cancel A200"),
        AIMessage(content="", tool_calls=[{"name": "lookup_order", "args": {"order_id": "A200"}, "id": "c1"},
                                           {"name": "cancel_order", "args": {"order_id": "A200"}, "id": "c2"}]),
        ToolMessage(content="A200: keyboard, processing", tool_call_id="c1"),
        ToolMessage(content="A200 cancelled", tool_call_id="c2"),
        AIMessage(content="Done."),
    ]
    assert tool_calls_from_messages(messages) == [
        {"name": "lookup_order", "arguments": {"order_id": "A200"}, "result": "A200: keyboard, processing"},
        {"name": "cancel_order", "arguments": {"order_id": "A200"}, "result": "A200 cancelled"},
    ]


def test_list_content_blocks_become_text():
    assert _text([{"type": "text", "text": "Hello"}, {"type": "text", "text": "there"}]) == "Hello there"


def test_plain_functions_are_not_treated_as_langchain():
    def respond(messages):
        return "ok"
    assert not is_langchain_runnable(respond)


def test_langgraph_app_needs_no_wrapper():
    pytest.importorskip("langgraph")
    result = PythonModuleBackend(AGENT, "agent.py:graph").run_turn(["Where is my order A100?"])
    assert "shipped" in result.reply
    assert result.tool_calls == [{"name": "lookup_order", "arguments": {"order_id": "A100"},
                                  "result": "A100: wireless headphones, shipped"}]


def test_earlier_turns_are_replayed_and_only_the_last_turns_tools_are_reported():
    pytest.importorskip("langgraph")
    result = PythonModuleBackend(AGENT, "agent.py:graph").run_turn(["Where is A100?", "And cancel A200 please"])
    assert [c["name"] for c in result.tool_calls] == ["cancel_order"]
    assert "A200 cancelled" in result.reply


class FakeExecutor:
    """Behaves like a LangChain AgentExecutor with return_intermediate_steps=True."""

    input_keys = ("input", "chat_history")

    def __init__(self):
        self.calls = []

    def invoke(self, payload):
        self.calls.append(payload)
        action = SimpleNamespace(tool="lookup_order", tool_input={"order_id": "A100"})
        return {"output": f"answer to: {payload['input']}", "intermediate_steps": [(action, "A100: shipped")]}


def test_agent_executor_style_agents_get_input_and_chat_history():
    executor = FakeExecutor()
    result = invoke(executor, ["first", "second"])
    assert result["reply"] == "answer to: second"
    assert result["tool_calls"] == [{"name": "lookup_order", "arguments": {"order_id": "A100"}, "result": "A100: shipped"}]
    assert executor.calls[0]["chat_history"] == []
    assert [m.content for m in executor.calls[1]["chat_history"]] == ["first", "answer to: first"]
