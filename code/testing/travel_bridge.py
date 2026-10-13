"""Child-process entry point used by TravelAgentBackend. Not imported by GreatTest.

Runs one request through the travel agent in target_agent/ and writes a small JSON result:
    python travel_bridge.py request.json result.json
It runs with target_agent/ as the working directory and on PYTHONPATH, so the agent's own
`app` package is imported here and never inside the GreatTest process.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main(request_path: str, result_path: str) -> int:
    from app.agent.runner import AgentRunner
    from app.config import Settings
    from app.schemas.run import RunRequest

    request = json.loads(Path(request_path).read_text(encoding="utf-8"))
    runner = AgentRunner(Settings())
    record = runner.run(RunRequest(
        request_text=request["request_text"],
        failure_mode=request.get("failure_mode", "none"),
        simulate_booking=request.get("simulate_booking", True),
    ))
    tool_calls = []
    for event in record.tool_trace:
        ok = event.get("status") == "success"
        tool_calls.append({
            "name": event.get("tool_name") or "unknown",
            "arguments": event.get("arguments") or {},
            "result": event.get("result") if ok else {"error": event.get("error")},
        })
    result = {
        "status": record.status,
        "reply": record.final_response,
        "tool_calls": tool_calls,
        "error": "; ".join(record.errors) if record.status == "error" else None,
    }
    Path(result_path).write_text(json.dumps(result, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
