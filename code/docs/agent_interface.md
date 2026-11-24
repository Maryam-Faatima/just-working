# Connecting any agent (universal adapter, EH-4)

GreatTest talks to the agent under test through the adapter (`testing/adapter.py`). Which backend it uses is chosen by `testing/backends.py` from the Phase 0 start-up answers, `run_config` in `spec.json`:

| `interface` | `entry_point` | What GreatTest does each turn |
|---|---|---|
| `python_module` (default) | `file.py:function` or `package.module:function`, relative to the agent's folder | Runs `function(messages)` in a fresh child process, with the agent's folder as working directory and on `PYTHONPATH` |
| `http` | a URL, for example `http://localhost:8000/chat` | POSTs `{"messages": [...]}` as JSON |

The travel agent in `target_agent/` keeps its own backend (`TravelAgentBackend`), which also records its tool calls and supports failure injection.

## What an agent must provide (decision 57)

- It receives `messages`: every user message so far, oldest first. It needs no memory between calls.
- It returns the reply as plain text, or a JSON object `{"reply": "...", "tool_calls": [{"name": "...", "arguments": {...}, "result": ...}]}`. `tool_calls` is optional, but checks that look for tool use (for example "confirm before booking") can only work if the agent reports its tools.
- Over HTTP, a plain-text body is taken as the reply. HTTP status 400 or above counts as a crash.

The smallest example is `fixtures/agents/simple_agent/agent.py`.

## Failures

| What happens | Recorded as |
|---|---|
| The agent takes longer than the time limit (120 seconds) | `run_status: timeout` |
| The function raises an error, the process fails, the entry point is wrong, the server cannot be reached, or it answers HTTP 400 or above | `run_status: crashed`, with the error |

Either way no further messages are sent in that conversation, and the runner carries on with the next test. Nothing can hang a run.

## How the backend is chosen

1. A backend passed in `ctx["backend_factory"]` (used by tests).
2. The travel agent in `target_agent/`: `TravelAgentBackend`.
3. Otherwise `run_config`: Python module or HTTP, as above.
4. No usable `run_config`: the tests are generated and saved but not run, and the run log says what is missing.

## Running by hand

```
python -m testing.runner fixtures/travel_seed_specs.json --agent-dir fixtures/agents/simple_agent --entry-point agent.py:respond
python -m testing.runner fixtures/travel_seed_specs.json --interface http --entry-point http://localhost:8000/chat
```

## Tests

`tests/test_backends.py` covers both backends (replies, tool calls, crashes, timeouts, unreachable servers, a real local HTTP server) and how the backend is chosen. The end-to-end crash and timeout test for generated tests (EH-5) is in `tests/test_runner.py`.
