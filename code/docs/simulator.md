# User simulator (EH-2)

`testing/simulator.py` lets an LLM play the test's persona and write the next user message, so a test can be a real multi-turn conversation instead of a fixed script.

## Where it fits

```
runner -> scripted messages first -> then UserSimulator.next_message(spec, turns) -> adapter -> agent
```

The runner sends a spec's `script` first, then asks the simulator for more messages until:

- the turn budget (`turn_budget`, counted in user messages) runs out,
- the simulator says it is done (the goal was reached, cannot be reached, or the agent ended the conversation), or
- the agent crashes or times out.

A spec without a script gets its opening message from the simulator.

## What the LLM is told

- The persona, the goal and what the conversation probes (`target_constraint`, else `category`).
- How hard to push, from `difficulty`: 1 to 3 cooperative, 4 to 7 moderately persistent, 8 to 10 very persistent.
- The conversation so far as a user sees it: messages only. Tool calls are hidden, because real users never see them.

It must reply with JSON: `{"message": "...", "done": false}`. Messages are trimmed to 600 characters.

## Who chooses the persona

The simulator plays whatever persona the spec gives it. Choosing personas is the generator's job (EH-1), from the developer's Phase 0 answers (`user_behaviors`, `weak_spots`), the test category and the difficulty.

## Caching (decision 55)

Simulator replies go through `understand/llm.py`, which caches them by default: a repeated run with the same conversation gets the same user message. This keeps demos and CI reproducible. For the reproducibility study (EH-6), turn it off:

```
python -m testing.runner fixtures/travel_seed_specs.json --repeats 5 --no-cache
```

## When the LLM is unavailable

No API key, a provider outage or a malformed reply raises `SimulatorUnavailable`. The runner then switches the simulator off for the rest of the run, carries on with scripts only, and writes the reason to `test_run.json` (`simulator_note`) and the run log. A `--no-llm` run never uses the simulator.

## Tests

`tests/test_simulator.py` (fake LLM) and the simulator tests in `tests/test_runner.py` (scripted simulator) need no API key.
