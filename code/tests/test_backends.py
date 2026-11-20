"""Tests for the universal agent adapter (EH-4): the Python-module and HTTP backends."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
import pytest

from testing.adapter import TARGET_AGENT_DIR, Adapter, AgentCrashed, AgentTimedOut, TravelAgentBackend, validate_trace
from testing.backends import HttpBackend, PythonModuleBackend, choose_backend

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
