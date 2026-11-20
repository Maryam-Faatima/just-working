"""Child-process entry point used by PythonModuleBackend. Not imported by GreatTest.

Calls the agent's function once and writes a small JSON result:
    python python_bridge.py ENTRY_POINT request.json result.json
ENTRY_POINT is "path/to/file.py:function" or "package.module:function", relative to the agent's
folder, which is the working directory and on PYTHONPATH. The function receives the user's
messages so far (a list of strings) and returns the reply as a string, or a dict with "reply"
and, optionally, "tool_calls" (a list of {"name", "arguments", "result"}).
"""

from __future__ import annotations

import importlib
import importlib.util
import json
import sys
from pathlib import Path


def load_function(entry_point: str):
    target, sep, func_name = entry_point.rpartition(":")
    if not sep or not target or not func_name:
        raise ValueError(f"entry point must look like file.py:function or module:function, got {entry_point!r}")
    if target.endswith(".py"):
        path = Path(target).resolve()
        spec = importlib.util.spec_from_file_location(path.stem, path)
        if spec is None or spec.loader is None:
            raise ImportError(f"cannot load {target}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    else:
        module = importlib.import_module(target)
    return getattr(module, func_name)


def main(entry_point: str, request_path: str, result_path: str) -> int:
    request = json.loads(Path(request_path).read_text(encoding="utf-8"))
    reply = load_function(entry_point)(list(request["messages"]))
    if isinstance(reply, dict):
        result = {"reply": str(reply.get("reply", "")), "tool_calls": reply.get("tool_calls") or []}
    else:
        result = {"reply": "" if reply is None else str(reply), "tool_calls": []}
    Path(result_path).write_text(json.dumps(result, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
