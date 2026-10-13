"""Adapter between GreatTest and an agent under test.

The adapter is the only way GreatTest talks to a running agent. It offers three operations:

    adapter.reset_session()        start a new conversation
    adapter.send_message(text)     send one user message, get the agent's reply
    adapter.get_trace()            the whole conversation as a trace (schemas/trace.schema.json)

How the agent is actually run is delegated to a backend. TravelAgentBackend runs the target
agent in target_agent/ in a separate Python process for every turn, so a hung agent can be
stopped (run_status "timeout") and a crashing agent cannot crash GreatTest (run_status
"crashed").
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar, Protocol

import jsonschema

REPO_ROOT = Path(__file__).resolve().parents[1]
TRACE_SCHEMA_PATH = REPO_ROOT / "schemas" / "trace.schema.json"
TARGET_AGENT_DIR = REPO_ROOT / "target_agent"
BRIDGE_SCRIPT = Path(__file__).resolve().parent / "travel_bridge.py"

MAX_ERROR_CHARS = 500


class AgentCrashed(Exception):
    """The agent under test failed while handling a message."""


class AgentTimedOut(Exception):
    """The agent under test did not answer within the time limit."""


@dataclass
class TurnResult:
    """What a backend returns for one user message."""

    reply: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


class Backend(Protocol):
    """Runs the agent under test. Raises AgentCrashed or AgentTimedOut on failure."""

    def run_turn(self, user_messages: list[str]) -> TurnResult: ...


class TravelAgentBackend:
    """Runs the travel agent in target_agent/ through testing/travel_bridge.py.

    The travel agent is stateless: it plans from one request text. A conversation is
    therefore sent as all user messages so far, joined in order, which is the same way
    the agent's own dashboard continues a conversation after a clarifying question.

    Defaults are offline (mock travel data, deterministic stub LLM), so tests and CI need
    no keys and no network. Pass env={"DATA_MODE": "live", "LLM_PROVIDER": "groq"} to use
    real data and a real LLM (keys are then read from target_agent/.env).
    """

    OFFLINE_ENV: ClassVar[dict[str, str]] = {
        "DATA_MODE": "mock",
        "LLM_PROVIDER": "stub",
        "INJECTED_TIMEOUT_DELAY_SECONDS": "0",
        "LOG_LEVEL": "WARNING",
    }

    def __init__(
        self,
        agent_dir: Path = TARGET_AGENT_DIR,
        timeout_seconds: float = 120.0,
        failure_mode: str = "none",
        simulate_booking: bool = True,
        env: dict[str, str] | None = None,
        python: str = sys.executable,
    ):
        self.agent_dir = Path(agent_dir)
        self.timeout_seconds = timeout_seconds
        self.failure_mode = failure_mode
        self.simulate_booking = simulate_booking
        self.env = {**self.OFFLINE_ENV, **(env or {})}
        self.python = python

    def run_turn(self, user_messages: list[str]) -> TurnResult:
        request = {
            "request_text": " ".join(m.strip() for m in user_messages if m.strip()),
            "failure_mode": self.failure_mode,
            "simulate_booking": self.simulate_booking,
        }
        with tempfile.TemporaryDirectory(prefix="greattest-turn-") as tmp:
            tmp_dir = Path(tmp)
            in_path, out_path = tmp_dir / "request.json", tmp_dir / "result.json"
            in_path.write_text(json.dumps(request), encoding="utf-8")
            env = {
                **os.environ,
                **self.env,
                "PYTHONPATH": str(self.agent_dir),
                "DATABASE_PATH": str(tmp_dir / "runs.db"),
                "LOG_DIR": str(tmp_dir / "logs"),
                "CACHE_DIR": str(tmp_dir / "cache"),
            }
            command = [self.python, str(BRIDGE_SCRIPT), str(in_path), str(out_path)]
            data = run_subprocess(command, self.agent_dir, env, self.timeout_seconds, out_path)
        if data.get("status") == "error":
            raise AgentCrashed(data.get("error") or "the agent reported an internal error")
        return TurnResult(reply=str(data.get("reply", "")), tool_calls=data.get("tool_calls", []))


def run_subprocess(
    command: list[str], cwd: Path, env: dict[str, str], timeout: float, out_path: Path
) -> dict[str, Any]:
    """Runs one agent turn in a child process and reads its JSON result file."""
    try:
        proc = subprocess.run(
            command, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, check=False
        )
    except subprocess.TimeoutExpired as exc:
        raise AgentTimedOut(f"agent did not answer within {timeout:g} seconds") from exc
    except OSError as exc:  # agent folder or Python executable missing
        raise AgentCrashed(f"agent process could not start: {exc}"[:MAX_ERROR_CHARS]) from exc
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
        detail = " | ".join(tail) or f"exit code {proc.returncode}"
        raise AgentCrashed(f"agent process failed: {detail}"[:MAX_ERROR_CHARS])
    try:
        return json.loads(out_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise AgentCrashed("agent process finished without a readable result") from exc


class Adapter:
    """One conversation with the agent under test, recorded as a trace."""

    def __init__(self, backend: Backend, test_id: str, modality: str = "text"):
        self.backend = backend
        self.test_id = test_id
        self.modality = modality
        self.reset_session()

    def reset_session(self) -> None:
        """Starts a new conversation: empty history, new trace id, status completed."""
        self.trace_id = f"TR-{uuid.uuid4().hex[:8]}"
        self.turns: list[dict[str, Any]] = []
        self.user_messages: list[str] = []
        self.run_status = "completed"
        self.error: str | None = None

    @property
    def finished(self) -> bool:
        """True once the agent has crashed or timed out; no more messages are sent."""
        return self.run_status != "completed"

    def send_message(self, text: str) -> str | None:
        """Sends one user message. Returns the agent's reply, or None if the run ended."""
        if self.finished:
            return None
        self.user_messages.append(text)
        self._add_turn("user", text)
        try:
            result = self.backend.run_turn(list(self.user_messages))
        except AgentTimedOut as exc:
            self._end("timeout", str(exc))
            return None
        except AgentCrashed as exc:
            self._end("crashed", str(exc))
            return None
        self._add_turn("agent", result.reply, [clean_tool_call(c) for c in result.tool_calls])
        return result.reply

    def get_trace(self) -> dict[str, Any]:
        """Returns the conversation as a trace, validated against trace.schema.json."""
        trace: dict[str, Any] = {
            "trace_id": self.trace_id,
            "test_id": self.test_id,
            "modality": self.modality,
            "run_status": self.run_status,
            "turns": [dict(t) for t in self.turns],
        }
        if self.error:
            trace["error"] = self.error
        validate_trace(trace)
        return trace

    def _add_turn(self, role: str, content: str, tool_calls: list | None = None) -> None:
        turn: dict[str, Any] = {"turn": len(self.turns) + 1, "role": role, "content": content}
        if tool_calls:
            turn["tool_calls"] = tool_calls
        self.turns.append(turn)

    def _end(self, status: str, error: str) -> None:
        self.run_status = status
        self.error = error[:MAX_ERROR_CHARS]


def clean_tool_call(call: dict[str, Any]) -> dict[str, Any]:
    """Keeps only the fields the trace schema allows for a tool call."""
    out: dict[str, Any] = {"name": str(call.get("name", "unknown"))}
    args = call.get("arguments")
    out["arguments"] = args if isinstance(args, dict) else {}
    if "result" in call:
        out["result"] = call["result"]
    return out


def validate_trace(trace: dict[str, Any]) -> None:
    """Raises jsonschema.ValidationError if the trace breaks the contract."""
    schema = json.loads(TRACE_SCHEMA_PATH.read_text(encoding="utf-8"))
    jsonschema.validate(trace, schema)


def run_conversation(adapter: Adapter, messages: list[str], turn_budget: int | None = None) -> dict:
    """Resets the session, sends messages in order (at most turn_budget), returns the trace."""
    adapter.reset_session()
    for text in messages[:turn_budget] if turn_budget else messages:
        if adapter.send_message(text) is None:
            break
    return adapter.get_trace()


def main(argv: list[str] | None = None) -> int:
    """Command line: python -m testing.adapter "message 1" "message 2" [--out trace.json]."""
    import argparse

    parser = argparse.ArgumentParser(description="Run a conversation with the target agent.")
    parser.add_argument("messages", nargs="+", help="user messages, sent in order")
    parser.add_argument("--test-id", default="MANUAL-001")
    parser.add_argument("--failure-mode", default="none", help="e.g. hotel_timeout")
    parser.add_argument("--timeout", type=float, default=120.0, help="seconds per turn")
    parser.add_argument("--out", help="write the trace JSON to this file")
    args = parser.parse_args(argv)

    backend = TravelAgentBackend(timeout_seconds=args.timeout, failure_mode=args.failure_mode)
    trace = run_conversation(Adapter(backend, test_id=args.test_id), args.messages)
    text = json.dumps(trace, indent=2, default=str)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        status, turns = trace["run_status"], len(trace["turns"])
        print(f"run_status: {status}, turns: {turns}, saved to {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
