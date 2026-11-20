"""Universal agent adapter (EH-4): backends for any agent, chosen from the Phase 0 run config.

run_config (from the Phase 0 start-up questions, decision 57):
  interface "python_module", entry_point "file.py:function" or "package.module:function"
      GreatTest calls function(messages) in a child process per turn (testing/python_bridge.py),
      with the agent's folder as working directory and on PYTHONPATH.
  interface "http", entry_point "http://host:port/path"
      GreatTest POSTs {"messages": [...]} and reads {"reply": ..., "tool_calls": [...]}
      (a plain-text body is taken as the reply).

Either way the agent receives every user message so far, so it needs no memory between calls.
A slow agent is recorded as a timeout and a failing one as a crash; GreatTest carries on.
The travel agent in target_agent/ keeps its own backend (TravelAgentBackend), which also
records its tool calls and supports failure injection.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx

from testing.adapter import (
    MAX_ERROR_CHARS,
    TARGET_AGENT_DIR,
    AgentCrashed,
    AgentTimedOut,
    Backend,
    TravelAgentBackend,
    TurnResult,
    run_subprocess,
)

PYTHON_BRIDGE = Path(__file__).resolve().parent / "python_bridge.py"
DEFAULT_TIMEOUT_SECONDS = 120.0


def _turn_result(data: Any) -> TurnResult:
    if isinstance(data, dict):
        calls = data.get("tool_calls") or []
        return TurnResult(reply=str(data.get("reply", "")), tool_calls=calls if isinstance(calls, list) else [])
    return TurnResult(reply="" if data is None else str(data))


class PythonModuleBackend:
    """Calls a Python function in the agent's folder, one child process per turn."""

    def __init__(self, agent_dir: Path, entry_point: str, timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
                 python: str = sys.executable):
        self.agent_dir = Path(agent_dir)
        self.entry_point = entry_point
        self.timeout_seconds = timeout_seconds
        self.python = python

    def run_turn(self, user_messages: list[str]) -> TurnResult:
        with tempfile.TemporaryDirectory(prefix="greattest-turn-") as tmp:
            in_path, out_path = Path(tmp) / "request.json", Path(tmp) / "result.json"
            in_path.write_text(json.dumps({"messages": list(user_messages)}), encoding="utf-8")
            env = {**os.environ, "PYTHONPATH": str(self.agent_dir)}
            command = [self.python, str(PYTHON_BRIDGE), self.entry_point, str(in_path), str(out_path)]
            return _turn_result(run_subprocess(command, self.agent_dir, env, self.timeout_seconds, out_path))


class HttpBackend:
    """Sends the conversation to an agent served over HTTP."""

    def __init__(self, url: str, timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS, client: httpx.Client | None = None):
        self.url = url
        self.timeout_seconds = timeout_seconds
        self.client = client

    def run_turn(self, user_messages: list[str]) -> TurnResult:
        payload = {"messages": list(user_messages)}
        try:
            if self.client is not None:
                response = self.client.post(self.url, json=payload, timeout=self.timeout_seconds)
            else:
                response = httpx.post(self.url, json=payload, timeout=self.timeout_seconds)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            # Never connected (refused on Linux, often a connect timeout on Windows): unreachable, not slow.
            raise AgentCrashed(f"agent could not be reached at {self.url}: {exc}"[:MAX_ERROR_CHARS]) from exc
        except httpx.TimeoutException as exc:
            raise AgentTimedOut(f"agent did not answer within {self.timeout_seconds:g} seconds") from exc
        except httpx.HTTPError as exc:
            raise AgentCrashed(f"agent could not be reached at {self.url}: {exc}"[:MAX_ERROR_CHARS]) from exc
        if response.status_code >= 400:
            raise AgentCrashed(f"agent answered HTTP {response.status_code}: {response.text[:200]}"[:MAX_ERROR_CHARS])
        try:
            return _turn_result(response.json())
        except ValueError:
            return TurnResult(reply=response.text)


def choose_backend(ctx: dict[str, Any]) -> tuple[Callable[[], Backend] | None, str]:
    """(backend factory, how it was chosen), or (None, why the agent cannot be run)."""
    if ctx.get("backend_factory"):
        return ctx["backend_factory"], "given"
    root = ctx.get("repo_root")
    if root is not None and Path(root).resolve() == TARGET_AGENT_DIR.resolve():
        return TravelAgentBackend, "travel agent"
    run_config = (ctx.get("spec") or {}).get("run_config") or {}
    entry_point = (run_config.get("entry_point") or "").strip()
    if not entry_point:
        return None, "no entry point: answer the Phase 0 start-up questions (run_config) to run tests"
    interface = run_config.get("interface", "python_module")
    if interface == "http":
        if not entry_point.startswith(("http://", "https://")):
            return None, f"HTTP entry point must be a URL starting with http:// or https://, got {entry_point!r}"
        return (lambda: HttpBackend(entry_point)), "http"
    if ":" not in entry_point:
        return None, f"Python entry point must look like file.py:function or module:function, got {entry_point!r}"
    if root is None:
        return None, "no agent folder to run the Python entry point in"
    return (lambda: PythonModuleBackend(Path(root), entry_point)), "python module"
