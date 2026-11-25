"""Tests for the universal agent adapter (EH-4): the Python-module and HTTP backends."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
import pytest

from testing.adapter import (
    TARGET_AGENT_DIR,
    Adapter,
    AgentCrashed,
    AgentTimedOut,
    TravelAgentBackend,
    validate_trace,
)
from testing.backends import (
    HttpBackend,
    PythonModuleBackend,
    choose_backend,
    langgraph_entry,
    read_env_file,
)

SIMPLE_AGENT = Path(__file__).resolve().parents[1] / "fixtures" / "agents" / "simple_agent"


def write_agent(folder, body):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "bot.py").write_text(body, encoding="utf-8")
    return folder


# ---------------------------------------------------------------- Python module backend

def test_python_agent_gets_every_message_and_returns_text(tmp_path):
    agent = write_agent(tmp_path, "def respond(messages):\n    return ' | '.join(messages)\n")
    result = PythonModuleBackend(agent, "bot.py:respond").run_turn(["hi", "again"])
    assert result.reply == "hi | again" and result.tool_calls == []


def test_python_agent_can_report_tool_calls():
    result = PythonModuleBackend(SIMPLE_AGENT, "agent.py:respond").run_turn(["Fly on 2026-12-24 please"])
    assert "3 flights" in result.reply
    assert result.tool_calls[0]["name"] == "search_flights"


def test_module_style_entry_point_works(tmp_path):
    pkg = tmp_path / "mybot"
    pkg.mkdir()
    (pkg / "__init__.py").write_text("", encoding="utf-8")
    (pkg / "core.py").write_text("def chat(messages):\n    return 'ok'\n", encoding="utf-8")
    assert PythonModuleBackend(tmp_path, "mybot.core:chat").run_turn(["x"]).reply == "ok"


def test_python_agent_error_is_a_crash(tmp_path):
    agent = write_agent(tmp_path, "def respond(messages):\n    raise RuntimeError('database down')\n")
    with pytest.raises(AgentCrashed, match="database down"):
        PythonModuleBackend(agent, "bot.py:respond").run_turn(["hi"])


def test_slow_python_agent_is_a_timeout(tmp_path):
    agent = write_agent(tmp_path, "import time\n\ndef respond(messages):\n    time.sleep(10)\n")
    with pytest.raises(AgentTimedOut):
        PythonModuleBackend(agent, "bot.py:respond", timeout_seconds=1).run_turn(["hi"])


def test_missing_function_is_a_crash(tmp_path):
    agent = write_agent(tmp_path, "def respond(messages):\n    return 'ok'\n")
    with pytest.raises(AgentCrashed):
        PythonModuleBackend(agent, "bot.py:no_such_function").run_turn(["hi"])


def test_python_agent_trace_through_the_adapter_is_valid():
    adapter = Adapter(PythonModuleBackend(SIMPLE_AGENT, "agent.py:respond"), test_id="T-1")
    adapter.send_message("I want to fly to Dubai")
    adapter.send_message("Departure 2026-12-24")
    trace = adapter.get_trace()
    validate_trace(trace)
    assert trace["run_status"] == "completed" and trace["turns"][3]["tool_calls"][0]["name"] == "search_flights"


# ---------------------------------------------------------------- HTTP backend

def http_backend(handler):
    return HttpBackend("http://agent.test/chat", client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_http_agent_gets_the_messages_and_returns_json():
    def handler(request):
        assert json.loads(request.content) == {"messages": ["hi", "again"]}
        return httpx.Response(200, json={"reply": "hello", "tool_calls": [{"name": "lookup", "arguments": {}}]})
    result = http_backend(handler).run_turn(["hi", "again"])
    assert result.reply == "hello" and result.tool_calls[0]["name"] == "lookup"


def test_http_plain_text_body_is_the_reply():
    assert http_backend(lambda request: httpx.Response(200, text="plain answer")).run_turn(["hi"]).reply == "plain answer"


def test_http_server_error_is_a_crash():
    with pytest.raises(AgentCrashed, match="HTTP 500"):
        http_backend(lambda request: httpx.Response(500, text="boom")).run_turn(["hi"])


def test_http_timeout_is_a_timeout():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)
    with pytest.raises(AgentTimedOut):
        http_backend(handler).run_turn(["hi"])


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ConnectTimeout])
def test_unreachable_http_agent_is_a_crash_not_a_timeout(error):
    """Refused (Linux) or a connect timeout (Windows): either way the agent was never reached."""
    def handler(request):
        raise error("no agent here", request=request)
    with pytest.raises(AgentCrashed, match="could not be reached"):
        http_backend(handler).run_turn(["hi"])


def test_real_local_http_agent():
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # the name http.server expects
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            data = json.dumps({"reply": f"you sent {len(body['messages'])} message(s)"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/chat"
        assert HttpBackend(url, timeout_seconds=5).run_turn(["a", "b"]).reply == "you sent 2 message(s)"
    finally:
        server.shutdown()


# ---------------------------------------------------------------- choosing the backend

def run_config(**cfg):
    return {"spec": {"run_config": cfg}}


def test_a_given_backend_wins():
    factory, how = choose_backend({"backend_factory": TravelAgentBackend, **run_config(entry_point="x.py:f")})
    assert factory is TravelAgentBackend and how == "given"


def test_the_travel_agent_keeps_its_own_backend():
    factory, how = choose_backend({"repo_root": TARGET_AGENT_DIR})
    assert factory is TravelAgentBackend and how == "travel agent"


def test_python_run_config_gives_a_python_backend(tmp_path):
    factory, how = choose_backend({"repo_root": tmp_path, **run_config(interface="python_module", entry_point="bot.py:respond")})
    backend = factory()
    assert how == "python module" and isinstance(backend, PythonModuleBackend) and backend.agent_dir == tmp_path


def test_http_run_config_gives_an_http_backend(tmp_path):
    factory, how = choose_backend({"repo_root": tmp_path, **run_config(interface="http", entry_point="http://localhost:8000/chat")})
    assert how == "http" and factory().url == "http://localhost:8000/chat"


@pytest.mark.parametrize("cfg, reason", [
    ({}, "no entry point"),
    ({"interface": "http", "entry_point": "localhost:8000"}, "must be a URL"),
    ({"interface": "python_module", "entry_point": "bot.py"}, "must look like file.py:function"),
])
def test_unusable_run_config_says_why(tmp_path, cfg, reason):
    factory, why = choose_backend({"repo_root": tmp_path, **run_config(**cfg)})
    assert factory is None and reason in why


# ---------------------------------------------------------------- LangGraph graphs

GRAPH_MODULE = """
class Msg:
    def __init__(self, type, content, tool_calls=None, tool_call_id=None):
        self.type, self.content = type, content
        self.tool_calls, self.tool_call_id = tool_calls or [], tool_call_id


def _kind(m):
    return m.get("role") if isinstance(m, dict) else m.type


class Graph:
    async def ainvoke(self, state, config=None):
        history = state["messages"]
        last = history[-1]["content"]
        new = []
        if "flight" in last:
            new.append(Msg("ai", "", [{"name": "search_flights", "args": {"to": "Dubai"}, "id": "c1"}]))
            new.append(Msg("tool", "3 flights found", tool_call_id="c1"))
        new.append(Msg("ai", [{"type": "text", "text": f"saw {len(history)} messages"}]))
        return {"messages": [*history, *new]}


graph = Graph()


class Builder:
    def compile(self):
        return Graph()


builder = Builder()


def make_graph(config=None):
    return Graph()


class NoMessages:
    def invoke(self, state, config=None):
        return {"answer": "x"}


broken = NoMessages()
"""


def graph_agent(folder, module="agent.py", body=GRAPH_MODULE):
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / module
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")
    return folder


def test_graph_reply_and_tool_calls_come_from_its_messages(tmp_path):
    agent = graph_agent(tmp_path)
    result = PythonModuleBackend(agent, "agent.py:graph").run_turn(["I want a flight"])
    assert result.reply == "saw 1 messages"
    assert result.tool_calls == [{"name": "search_flights", "arguments": {"to": "Dubai"}, "result": "3 flights found"}]


def test_graph_gets_its_own_earlier_replies_on_later_turns(tmp_path):
    backend = PythonModuleBackend(graph_agent(tmp_path), "agent.py:graph")
    assert backend.run_turn(["hello"]).reply == "saw 1 messages"
    assert backend.run_turn(["hello", "a flight please"]).reply == "saw 3 messages"
    assert backend.run_turn(["hello", "a flight please", "thanks"]).reply == "saw 5 messages"


def test_an_uncompiled_builder_and_a_factory_both_work(tmp_path):
    agent = graph_agent(tmp_path)
    assert PythonModuleBackend(agent, "agent.py:builder").run_turn(["hi"]).reply == "saw 1 messages"
    factory = PythonModuleBackend(agent, "agent.py:make_graph", kind="langgraph")
    assert factory.run_turn(["hi"]).reply == "saw 1 messages"


def test_a_graph_inside_a_src_package_can_use_relative_imports(tmp_path):
    pkg = tmp_path / "src" / "mybot"
    pkg.mkdir(parents=True)
    (pkg / "__init__.py").write_text("", encoding="utf-8")
    (pkg / "helpers.py").write_text("GREETING = 'hello from helpers'\n", encoding="utf-8")
    body = (
        "from .helpers import GREETING\n"
        "class Msg:\n    type = 'ai'\n    tool_calls = []\n    def __init__(self, c): self.content = c\n"
        "class G:\n    def invoke(self, state, config=None):\n"
        "        return {'messages': [*state['messages'], Msg(GREETING)]}\n"
        "graph = G()\n"
    )
    (pkg / "graph.py").write_text(body, encoding="utf-8")
    result = PythonModuleBackend(tmp_path, "src/mybot/graph.py:graph").run_turn(["hi"])
    assert result.reply == "hello from helpers"


def test_a_graph_without_messages_is_a_crash_with_a_clear_reason(tmp_path):
    with pytest.raises(AgentCrashed, match="messages"):
        PythonModuleBackend(graph_agent(tmp_path), "agent.py:broken").run_turn(["hi"])


def test_langgraph_json_is_found_and_used_when_no_entry_point_is_given(tmp_path):
    agent = graph_agent(tmp_path, "src/bot/graph.py")
    (agent / "langgraph.json").write_text(
        json.dumps({"graphs": {"Deep Bot": "./src/bot/graph.py:graph"}}), encoding="utf-8")
    assert langgraph_entry(agent) == ("src/bot/graph.py:graph", "Deep Bot")
    factory, how = choose_backend({"repo_root": agent, "spec": {"run_config": {"interface": "python_module"}}})
    assert "langgraph" in how and "Deep Bot" in how
    assert factory().run_turn(["a flight please"]).tool_calls[0]["name"] == "search_flights"


def test_an_explicit_entry_point_wins_over_langgraph_json(tmp_path):
    agent = graph_agent(tmp_path)
    (agent / "langgraph.json").write_text(json.dumps({"graphs": {"x": "./other.py:g"}}), encoding="utf-8")
    config = {"run_config": {"entry_point": "agent.py:graph"}}
    factory, how = choose_backend({"repo_root": agent, "spec": config})
    assert how == "python module" and factory().entry_point == "agent.py:graph"


def test_no_entry_point_and_no_langgraph_json_explains_what_to_add(tmp_path):
    factory, why = choose_backend({"repo_root": tmp_path, "spec": {"run_config": {}}})
    assert factory is None and "langgraph.json" in why


def test_run_config_timeout_and_python_reach_the_backend(tmp_path):
    config = {"run_config": {"entry_point": "bot.py:respond", "timeout_seconds": 900, "python": "/venv/bin/python"}}
    backend = choose_backend({"repo_root": tmp_path, "spec": config})[0]()
    assert (backend.timeout_seconds, backend.python) == (900.0, "/venv/bin/python")


def test_the_agents_own_env_file_supplies_its_keys(tmp_path):
    (tmp_path / ".env").write_text("# keys\nexport OPENAI_API_KEY='abc'\nEMPTY=\nTAVILY=xyz\n", encoding="utf-8")
    assert read_env_file(tmp_path / ".env") == {"OPENAI_API_KEY": "abc", "TAVILY": "xyz"}
    assert read_env_file(tmp_path / "missing.env") == {}
    agent = write_agent(tmp_path, "import os\n\ndef respond(messages):\n    return os.environ.get('TAVILY', '')\n")
    assert PythonModuleBackend(agent, "bot.py:respond").run_turn(["hi"]).reply == "xyz"
