"""Child-process entry point used by PythonModuleBackend. Not imported by GreatTest.

Calls the agent once and writes a small JSON result:
    python python_bridge.py ENTRY_POINT request.json result.json
ENTRY_POINT is "path/to/file.py:name" or "package.module:name", relative to the agent's
folder, which is the working directory and on PYTHONPATH (so is its src/ folder).

The request is {"messages": [user messages so far], "history": [{"role", "content"}...],
"kind": "auto" or "langgraph"}. What `name` is decides how the agent is called:
  - a plain function: it receives the user messages (a list of strings) and returns the reply as
    a string, or a dict with "reply" and, optionally, "tool_calls" (a list of {"name",
    "arguments", "result"}).
  - a LangGraph graph (a compiled graph, an uncompiled StateGraph, or with kind "langgraph" a
    function that returns one): it is run with {"messages": history}, where history is the whole
    conversation so far, user turns and the agent's earlier replies. The reply is the last text
    the graph added, and the tool calls are the ones its messages show for this turn.
Nothing here imports LangGraph or LangChain: messages go in as plain dicts and are read back by
attribute, so any version works, as long as it is installed for the interpreter running this.
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import json
import sys
import types
import uuid
from pathlib import Path

RESULT_CHARS = 2000


def _roots(folder: Path):
    """Folders a repo's own imports may start from: the repo itself and its src/ layout."""
    return [r for r in (folder / "src", folder) if r.is_dir()]


def load_function(entry_point: str):
    """The object named by the entry point (a function, a graph, a factory)."""
    target, sep, name = entry_point.rpartition(":")
    if not sep or not target or not name:
        raise ValueError(f"entry point must look like file.py:name or module:name, got {entry_point!r}")
    cwd = Path.cwd().resolve()
    for root in reversed(_roots(cwd)):
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
    if target.endswith(".py"):
        path = Path(target).resolve()
        module = None
        # Import by package name where the file sits inside the repo, so its relative imports work.
        for root in _roots(cwd):
            try:
                dotted = ".".join(path.relative_to(root).with_suffix("").parts)
            except ValueError:
                continue
            try:
                module = importlib.import_module(dotted)
                break
            except ImportError:
                module = None
        if module is None:
            spec = importlib.util.spec_from_file_location(path.stem, path)
            if spec is None or spec.loader is None:
                raise ImportError(f"cannot load {target}")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
    else:
        module = importlib.import_module(target)
    return getattr(module, name)


# ---------------------------------------------------------------- LangGraph

def _runs(obj) -> bool:
    return hasattr(obj, "ainvoke") or hasattr(obj, "invoke")


def is_graph(obj) -> bool:
    """A graph object, not a plain function: it can be invoked, or compiled and then invoked."""
    return not isinstance(obj, types.FunctionType) and (_runs(obj) or hasattr(obj, "compile"))


def to_runnable(obj):
    if not _runs(obj) and hasattr(obj, "compile"):
        obj = obj.compile()
    if not _runs(obj) and callable(obj):  # a factory: make_graph() or make_graph(config)
        try:
            obj = obj()
        except TypeError:
            obj = obj({})
        if not _runs(obj) and hasattr(obj, "compile"):
            obj = obj.compile()
    if not _runs(obj):
        raise TypeError("the entry point is not a LangGraph graph or a function")
    return obj


def _field(message, *names):
    for name in names:
        value = message.get(name) if isinstance(message, dict) else getattr(message, name, None)
        if value not in (None, ""):
            return value
    return None


def _text(content) -> str:
    """Text of a message whose content is a string or a list of blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [b if isinstance(b, str) else (b.get("text") or "") for b in content
                 if isinstance(b, (str, dict))]
        return "".join(p for p in parts if isinstance(p, str))
    return "" if content is None else str(content)


def _kind(message) -> str:
    value = str(_field(message, "type", "role") or "").lower()
    return {"user": "human", "assistant": "ai"}.get(value, value)


def read_turn(result) -> dict:
    """Reply and tool calls from the messages a graph produced for the latest user message."""
    messages = result.get("messages") if isinstance(result, dict) else getattr(result, "messages", None)
    if not isinstance(messages, (list, tuple)):
        raise TypeError("the graph returned no 'messages': GreatTest reads the reply from state['messages']")
    last_human = max((i for i, m in enumerate(messages) if _kind(m) == "human"), default=-1)
    fresh = list(messages[last_human + 1:])
    results = {_field(m, "tool_call_id"): _text(_field(m, "content")) for m in fresh if _kind(m) == "tool"}
    calls, reply = [], ""
    for m in fresh:
        if _kind(m) != "ai":
            continue
        for call in _field(m, "tool_calls") or []:
            name = _field(call, "name") or "unknown"
            args = _field(call, "args", "arguments")
            entry = {"name": str(name), "arguments": args if isinstance(args, dict) else {}}
            outcome = results.get(_field(call, "id"))
            if outcome is not None:
                entry["result"] = outcome[:RESULT_CHARS]
            calls.append(entry)
        text = _text(_field(m, "content")).strip()
        if text:
            reply = text
    return {"reply": reply, "tool_calls": calls}


def run_graph(obj, request: dict) -> dict:
    graph = to_runnable(obj)
    history = request.get("history") or [{"role": "user", "content": m} for m in request["messages"]]
    state = {"messages": history}
    config = {"configurable": {"thread_id": f"greattest-{uuid.uuid4().hex[:8]}"}}
    if hasattr(graph, "ainvoke"):
        result = asyncio.run(graph.ainvoke(state, config))
    else:
        result = graph.invoke(state, config)
    return read_turn(result)


# ---------------------------------------------------------------- entry

def main(entry_point: str, request_path: str, result_path: str) -> int:
    request = json.loads(Path(request_path).read_text(encoding="utf-8"))
    target = load_function(entry_point)
    if request.get("kind") == "langgraph" or is_graph(target):
        result = run_graph(target, request)
    else:
        reply = target(list(request["messages"]))
        if isinstance(reply, dict):
            result = {"reply": str(reply.get("reply", "")), "tool_calls": reply.get("tool_calls") or []}
        else:
            result = {"reply": "" if reply is None else str(reply), "tool_calls": []}
    Path(result_path).write_text(json.dumps(result, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
