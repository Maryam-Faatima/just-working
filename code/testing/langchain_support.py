"""LangChain support for the universal adapter (EH-4): test any LangChain agent without a wrapper.

The Phase 0 entry point can name a LangChain object instead of a function, for example
"app/graph.py:graph" for a compiled LangGraph app. Anything with an .invoke method is accepted:

- LangGraph apps (a compiled StateGraph, create_react_agent): invoked with {"messages": [...]}.
- AgentExecutor-style agents (an "input" key): invoked with {"input": ...}, plus "chat_history"
  when the agent accepts it. Tool calls are read from "intermediate_steps" when the agent returns them.

The adapter sends every user message so far, so earlier turns are replayed in order, each with the
agent's own earlier replies carried forward. The reply is the last AI message, and the tool calls
are taken from LangChain's message history: each AIMessage.tool_calls entry paired with the
ToolMessage that answered it.

Imported only when an entry point is a LangChain object, so GreatTest does not need LangChain itself.
"""

from __future__ import annotations

from typing import Any


def is_langchain_runnable(obj: Any) -> bool:
    """True for LangChain or LangGraph objects (anything with .invoke that is not a plain function)."""
    return hasattr(obj, "invoke") and callable(obj.invoke)


def _input_keys(obj: Any) -> list[str]:
    keys = getattr(obj, "input_keys", None)
    if isinstance(keys, list | tuple):
        return list(keys)
    try:
        return list(obj.get_input_jsonschema().get("properties", {}))
    except Exception:  # noqa: BLE001 (any object without a readable schema)
        return []


def _text(content: Any) -> str:
    """Message content as text: a string, or the text parts of a list of content blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content).strip()
    return "" if content is None else str(content)


def tool_calls_from_messages(messages: list[Any]) -> list[dict[str, Any]]:
    """[{"name", "arguments", "result"}] from AIMessage.tool_calls and the matching ToolMessages."""
    results = {getattr(m, "tool_call_id", None): _text(getattr(m, "content", "")) for m in messages
               if getattr(m, "type", "") == "tool"}
    calls = []
    for message in messages:
        for call in getattr(message, "tool_calls", None) or []:
            calls.append({"name": call.get("name", ""), "arguments": call.get("args", {}),
                          "result": results.get(call.get("id"))})
    return calls


def _invoke_graph(app: Any, user_messages: list[str]) -> dict[str, Any]:
    from langchain_core.messages import HumanMessage

    history: list[Any] = []
    new: list[Any] = []
    for text in user_messages:
        state = app.invoke({"messages": [*history, HumanMessage(content=text)]})
        messages = list(state["messages"])
        new = messages[len(history) + 1:]  # what the agent did in reply to this message
        history = messages
    reply = next((_text(m.content) for m in reversed(new) if getattr(m, "type", "") == "ai" and _text(m.content)), "")
    return {"reply": reply, "tool_calls": tool_calls_from_messages(new)}


def _invoke_executor(agent: Any, user_messages: list[str], keys: list[str]) -> dict[str, Any]:
    history: list[tuple[str, str]] = []
    result: dict[str, Any] = {}
    for text in user_messages:
        payload: dict[str, Any] = {"input": text}
        if "chat_history" in keys:
            payload["chat_history"] = _chat_history(history)
        result = agent.invoke(payload)
        history.append((text, str(result.get("output", ""))))
    calls = [{"name": getattr(action, "tool", ""), "arguments": getattr(action, "tool_input", {}), "result": observation}
             for action, observation in result.get("intermediate_steps", []) or []]
    return {"reply": str(result.get("output", "")), "tool_calls": calls}


def _chat_history(history: list[tuple[str, str]]) -> list[Any]:
    from langchain_core.messages import AIMessage, HumanMessage

    messages: list[Any] = []
    for user, agent in history:
        messages += [HumanMessage(content=user), AIMessage(content=agent)]
    return messages


def invoke(obj: Any, user_messages: list[str]) -> dict[str, Any]:
    """Runs a LangChain agent on the conversation; returns {"reply", "tool_calls"}."""
    keys = _input_keys(obj)
    if "input" in keys and "messages" not in keys:
        return _invoke_executor(obj, user_messages, keys)
    return _invoke_graph(obj, user_messages)
