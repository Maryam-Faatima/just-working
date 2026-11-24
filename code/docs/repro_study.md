# Reproducibility study (EH-6)

LLM agents do not answer the same way every time, so a single run of a test proves little. `testing/repro_study.py` runs every test several times, marks each run with the checks (`testing/checks.py`), and reports how stable the verdicts are, per test, per persona and overall.

## What is measured (decision 58)

- **Run verdict.** The checks mark every rubric item the test is judged on: the items whose `target_id` is the test's `target_id`, plus U1 (no crash or empty reply). If no item targets the test, every item is used. The verdict is the worst *decided* result: fail beats weak beats pass. A rule the checks could not decide (method `none`, for example the LLM judge was off) does not count. U1 can fail a run, but cannot pass it on its own: if none of the test's own rules was decided, the verdict is `unchecked`.
- **Stability** of a test: the share of its runs that got its most common verdict. 10 out of 10 the same is 100%; 5 pass and 5 fail is 50%.
- **Flips**: how often the verdict changed between consecutive runs.
- Results are grouped per persona (mean stability) and overall (mean stability, fully stable tests, flips, crashed and timed-out runs).

## Running it live

The study must run live to measure real variation: offline, the travel agent uses sample data and a stand-in LLM, so it answers the same way every time. An offline run is still useful as a **control**: it shows GreatTest itself adds no randomness.

Keys needed:

- GreatTest's `.env` (repo root): `GEMINI_API_KEY` and/or `GROQ_API_KEY`, for the user simulator and the LLM judge.
- For the travel agent live: `target_agent/.env` with `GROQ_API_KEY` and a flight search key (`SERPAPI_API_KEY`, `SEARCH_PROVIDER`).

```
# travel agent, live, 10 runs per test (about 60 conversations; --pause spreads calls for free-tier limits)
python -m testing.repro_study --name travel --live --repeats 10 --pause 3 \
    --specs fixtures/travel_seed_specs.json --rubric fixtures/travel_rubric.json

# any LangChain or LangGraph agent: point at the graph or executor, no wrapper needed
python -m testing.repro_study --name langchain --target python --agent-dir fixtures/agents/langchain_agent \
    --entry-point agent.py:graph --specs fixtures/langchain_seed_specs.json --rubric fixtures/langchain_rubric.json --repeats 10

# any HTTP agent
python -m testing.repro_study --name myagent --target http --entry-point http://localhost:8000/chat --repeats 10

# offline control (no keys): scripted tests, rule checks only
python -m testing.repro_study --name travel --specs fixtures/travel_seed_specs.json --rubric fixtures/travel_rubric.json --repeats 3 --no-llm
```

Without `--specs` and `--rubric` it reads `outputs/<name>/test_specs.json` and `outputs/<name>/rubric.json` from a pipeline run. The simulator runs without its cache (decision 55), so each run gets fresh user messages.

## Output

In `outputs/<name>/`: `repro_study.json` (all results), `repro_study.md` (tables for the report), `repro_study.png` (a stability chart, saved when `matplotlib` is installed: `pip install matplotlib`), and every conversation in `repro_traces/`. The web interface shows the results at the top of the Test Runs screen.

## Offline control results

With the rule-based checks only (no LLM), both example agents are fully stable, as expected:

| Agent | Tests x runs | Mean stability | Decided verdicts |
|---|---|---|---|
| Travel agent (offline) | 6 x 3 | 100% | RT-103 fail (books without confirmation, R3), RT-106 pass (searches before booking, R5); the rest need the LLM judge |
| LangChain example agent (LangGraph) | 5 x 3 | 100% | LC-102 and LC-104 fail (cancels without asking to confirm, R1, even when the customer is impatient); LC-101 passes; the rest need the LLM judge |

## Tests

`tests/test_repro_study.py` covers the verdict rule, stability and flips, a full study with a fake agent whose verdicts change, persona grouping, saving, and a study of the LangChain example agent.
