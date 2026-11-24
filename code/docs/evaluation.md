# Phase 1 gold-standard evaluation (MF-6)

How well does Behavioral Model V0 match what an agent really does? The answer comes from a hand-made
"gold" description of each agent, written from its source code, compared with what GreatTest found.

## What is compared

| Metric | Meaning |
|---|---|
| Tool recall / precision | Gold tools against capability entries |
| Workflow recall / precision | Gold graph nodes against workflow entries |
| Constraint recall | Gold rules (file and line range) that some constraint entry sits on |
| LLM constraint precision | Share of LLM-proposed constraints that sit on a gold rule |
| Resolved-call share | resolved / (resolved + unresolved) calls in the call graph (external calls left out) |
| Rejection rate | LLM proposals the validator rejected / all proposals (agreed + added + rejected) |

A constraint "sits on" a gold rule when its evidence is in the same file and its lines overlap the gold range.
Constraints the LLM proposed that match no gold rule are listed for a person to review: they may be wrong, or
a real rule the gold file missed (add it to the gold file, then the numbers update).
`n/a` means there was nothing to divide by, for example an agent with no LLM run has no LLM precision.

## The gold files

`fixtures/gold/<agent>.json`, one per agent, named like its output folder. Each lists `tools`, `workflow_steps`
(graph nodes from `add_node`) and `constraints` (text, file, lines) read from the source. They were written
without looking at GreatTest's output. Agents:

| Agent | Source | Tools | Nodes | Gold rules |
|---|---|---|---|---|
| target_agent | this repository | 10 | 16 | none (its rules come from the developer spec) |
| customer-service-agent | Bessiedelight/customer-service-agent | 3 | 18 | 10 |
| trip-planner-agent | AnshikaaaSh/trip-planner-agent | 3 | 6 | 9 |

## Running it

Run the pipeline on each agent with a real LLM key, then compare:

    python -m pipeline D:\FYP\GreatTest\target_agent --name target_agent --no-ask --spec spec_travel.json
    python -m pipeline https://github.com/Bessiedelight/customer-service-agent --name customer-service-agent --no-ask
    python -m pipeline https://github.com/AnshikaaaSh/trip-planner-agent --name trip-planner-agent --no-ask
    python -m scripts.eval_phase1 --out outputs/eval

The first command prints a table and details. `--out` writes `phase1_eval.json` and `phase1_eval.md`.
`--agent NAME` runs one agent. Exit code 0 is a complete run, 1 means an agent had no output yet, 2 means no gold file.

## Limits

- Three agents is a mini evaluation. It shows the method works and gives first numbers, not a benchmark.
- The gold files are one person's reading of the code. A second reader would make the labels more trustworthy.
- Matching is by file and line range, so a correct constraint placed on different lines than the gold range counts
  as a miss until it is reviewed.
- Recall for tools and workflow steps is usually high because rules find them directly. The informative numbers are
  the constraint recall and precision, which depend on the LLM.

## Tests

`tests/test_eval_phase1.py` uses synthetic outputs, so it needs no agent and no LLM.
