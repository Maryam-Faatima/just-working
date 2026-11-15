# Test runner (EH-3)

`testing/runner.py` runs test specs against the agent under test and saves every conversation as a trace.

## Where it fits

Pipeline stage 5 (`test`) calls `testing.runner.run(ctx)`. Before the runner existed the stage was skipped.

```
test specs  ->  runner  ->  adapter  ->  agent under test
                  |
                  +-> traces/<test_id>_run<k>.json, test_run.json, ctx["traces"]
                         -> checks (MF), judge (AY), reconciliation, report
```

## What it does

1. Loads test specs from `ctx["test_specs"]`, or from `<output folder>/test_specs.json`. If there are none, the seed generator (EH-1, see `docs/generator.md`) writes them from the rubric and model first. Until the universal adapter (EH-4) exists, tests are only run against the travel agent in `target_agent/`; for other agents they are generated and saved but not run.
2. Checks each spec against `schemas/test_spec.schema.json`. An invalid spec is reported as `invalid` and not run.
3. Sends the spec's `script` messages through the adapter (a `{date+N}` in a message becomes the date N days from today, so scripted tests never expire), then lets the user simulator (EH-2, see `docs/simulator.md`) continue the conversation. `turn_budget` limits the total number of user messages.
4. Repeats each test `run_config.repeats` times (Phase 0 answer, default 3, kept within 1 to 20), so results can be reported as passes out of total runs.
5. Saves each trace to `<output folder>/traces/<test_id>_run<k>.json` and writes `<output folder>/test_run.json` with counts of completed, crashed and timed-out runs.
6. Puts `test_specs`, `traces` and `test_run` into `ctx` for the next stages.

A spec without a `script` gets its opening message from the simulator. If the simulator is unavailable (no LLM key, or a `--no-llm` run), the runner carries on with scripts only, notes why in `test_run.json`, and lists unscripted specs as `not_run`. Crashes and timeouts come from the adapter: they are recorded in the trace's `run_status` and never stop or hang the runner.

The runner does not decide pass or fail. That is the job of the checks (MF-1) and the judge (AY), which read the saved traces.

## Running it by hand

```
python -m testing.runner fixtures/travel_test_spec.json --repeats 3 --out outputs/manual_run
python -m testing.runner fixtures/travel_seed_specs.json --repeats 3 --out outputs/seed_run
python -m testing.runner fixtures/travel_seed_specs.json --no-llm      # scripts only
python -m testing.runner fixtures/travel_seed_specs.json --no-cache    # fresh simulator replies (EH-6)
```

`fixtures/travel_seed_specs.json` holds six seed tests for the travel agent (RT-101 to RT-106). RT-103 checks that the agent asks for confirmation before booking; in testing it books the flight and hotel without asking, so it is expected to fail once the checks (MF-1) run.

## Tests

`tests/test_runner.py` uses fake backends (one that answers, one that crashes, one that times out), so it runs in under a second and needs no agent.
