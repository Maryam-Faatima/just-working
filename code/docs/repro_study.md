# Reproducibility study (EH-6)

LLM agents do not answer the same way every time, so a single run of a test proves little. `testing/repro_study.py` runs every test several times, marks each run with the checks (`testing/checks.py`), and reports how stable the verdicts are, per test, per persona and overall.

## What is measured (decision 75)

- **Run verdict.** The checks mark every rubric item the test is judged on: the items whose `target_id` is the test's `target_id`, plus U1 (no crash or empty reply). If no item targets the test, every item is used. The verdict is the worst *decided* result: fail beats weak beats pass. A rule the checks could not decide (method `none`, for example the LLM judge was off) does not count. U1 can fail a run, but cannot pass it on its own: if none of the test's own rules was decided, the verdict is `unchecked`.
- **Stability** of a test: the share of its *decided* runs that got its most common verdict. 10 out of 10 the same is 100%; 5 pass and 5 fail is 50%. Runs whose verdict is `unchecked` (for example the LLM judge was unavailable or out of quota) are left out and reported separately as decided runs, so an outage is never counted as instability. A test with no decided run has no stability.
- **Flips**: how often the verdict changed between consecutive decided runs.
- Results are grouped per persona (mean stability) and overall (mean stability, fully stable tests, flips, crashed and timed-out runs).

## Running it

The study reaches the agent exactly as the pipeline's test stage does (`testing/backends.choose_backend`), so it works for any agent the pipeline can test: a LangGraph app (found from the agent's `langgraph.json`, or named with `--entry-point`), an `AgentExecutor`, a plain Python function, or an HTTP endpoint. It reads the agent's Phase 0 run config from `outputs/<name>/spec.json` when the pipeline has run, and `--entry-point` / `--interface` override it. Nothing in the study is specific to one agent.

```
# an agent the pipeline has already run: tests, rubric and run config come from outputs/<name>/
python -m testing.repro_study --name myagent --agent-dir path/to/agent --repeats 10

# a LangGraph agent with a langgraph.json: no entry point needed
python -m testing.repro_study --name myagent --agent-dir path/to/langgraph/project --repeats 10

# the LangChain example agent, with its own tests and rubric
python -m testing.repro_study --name orders --agent-dir fixtures/agents/langchain_agent --entry-point agent.py:graph \
    --specs fixtures/langchain_seed_specs.json --rubric fixtures/langchain_rubric.json --repeats 10

# an agent served over HTTP
python -m testing.repro_study --name myagent --interface http --entry-point http://localhost:8000/chat --repeats 10
```

`--agent-env KEY=VALUE` (repeatable) passes settings to the agent, for example a mode switch; each turn's process inherits them. The team's travel agent is one such case: it uses sample data unless told otherwise, so its live study is

```
python -m testing.repro_study --name travel --agent-dir target_agent --agent-env DATA_MODE=live --agent-env LLM_PROVIDER=groq \
    --specs fixtures/travel_seed_specs.json --rubric fixtures/travel_rubric.json --repeats 10 --pause 3
```

**Live runs measure real variation; an offline run is a control.** An agent running on sample data with a stand-in LLM answers the same way every time, so a study of it shows that GreatTest itself adds no randomness. Real variation needs the agent's real LLM and the user simulator: GreatTest's `.env` (repo root) needs `GEMINI_API_KEY` and/or `GROQ_API_KEY` for the simulator and the LLM judge, and the agent needs its own keys (for the travel agent, `target_agent/.env`). `--pause` spreads calls for free-tier limits. `--no-llm` runs scripted tests with rule checks only.

If the first 3 runs all time out or crash, the study stops with the error instead of continuing: that points to a problem with the agent, its API keys or the network, not with reproducibility (`--max-setup-failures 0` turns this off).

Without `--specs` and `--rubric` it reads `outputs/<name>/test_specs.json` and `outputs/<name>/rubric.json` from a pipeline run. The simulator runs without its cache (decision 55), so each run gets fresh user messages.

## Output

In `outputs/<name>/`: `repro_study.json` (all results), `repro_study.md` (tables for the report), `repro_study.png` (a stability chart, saved when `matplotlib` is installed: `pip install matplotlib`), and every conversation in `repro_traces/`. The web interface shows the results at the top of the Test Runs screen.

## Offline control results

With the rule-based checks only (no LLM), both example agents are fully stable, as expected:

Two agents of different kinds, as a check that the study is not tied to one agent:

| Agent | Tests x runs | Mean stability | Decided verdicts |
|---|---|---|---|
| Travel agent (offline) | 6 x 3 | 100% | RT-103 fail (books without confirmation, R3), RT-106 pass (searches before booking, R5); the rest need the LLM judge |
| LangChain example agent (LangGraph) | 5 x 3 | 100% | LC-102 and LC-104 fail (cancels without asking to confirm, R1, even when the customer is impatient); LC-101 passes; the rest need the LLM judge |

## Tests

`tests/test_repro_study.py` covers the verdict rule, stability and flips, a full study with a fake agent whose verdicts change, persona grouping, saving, and a study of the LangChain example agent.
