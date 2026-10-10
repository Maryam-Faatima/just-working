# One-command pipeline

    python pipeline.py <git URL | .zip file | folder> [--spec FILE] [--name N] [--out DIR] [--no-llm] [--open]

pipeline.py runs every stage on one agent repo and writes the results to outputs/<agent>/.

## Why one command
Each stage already had its own command. A reviewer or a new teammate should not need to know
seven commands and their order. One command also proves the stages fit together, and it is the
entry point the demo and CI use.

## Stages
The order follows slide 6: Phase 0 first, then Phase 1 (scan, call graph, model, LLM inference).

| # | Stage | What it does | Writes |
|---|---|---|---|
| 1 | spec | Phase 0: loads and validates the developer spec (--spec). Skipped without one | none |
| 2 | scan | Opens the source (git URL, zip or folder) once and scans it | scan.json, scan.html, scan.md |
| 3 | callgraph | Builds the call graph and the component interactions | callgraph.json, callgraph.md |
| 4 | model | Builds the rule-based model, adds the developer's rules, writes the rubric | model_v0_rule.json, model_v0.json, rubric.json, spec.json (with --spec) |
| 5 | infer | Asks the LLM to cross-check V0 and add constraints | model_v0.json (updated) |
| 6 | test | Optional hook: testing.runner.run(ctx) | defined by the testing lane |
| 7 | report | Optional hook: evidence.report.build(ctx) | defined by the evidence lane |

Every run also writes run_summary.json: per stage the status, a detail line and the time taken,
plus the spec path and the spec warnings.

## The spec comes first
The spec is validated before the repo is opened, so a typo in it costs nothing: exit code 2, no output.
See docs/phase0.md.

## The repo stays open for the whole run
For a git URL or zip the code is extracted to a temporary folder that is deleted at the end.
The pipeline keeps it open until the last stage finishes, so the testing stage can start the
agent from its real folder (ctx["repo_root"]).

## Plug-in contract for stages 6 and 7
Create the module and the function. No change to pipeline.py is needed.
- testing/runner.py with run(ctx)
- evidence/report.py with build(ctx)
The folders need an __init__.py.
ctx is a dict: source, name, use_llm, repo_root, folder, scan, callgraph, store (the ModelStore),
spec (the normalized spec, or None), rubric, spec_report.
The function returns a short text, shown on the stage line, or None.
If the module does not exist the stage is "skipped". If the function raises, the stage is
"failed", the run continues, and the exit code is 1.

## Status values
ok, warning (finished but something degraded, such as the LLM being unavailable or the spec naming
a tool the code lacks), skipped, failed.

## Failure behaviour
- A spec that cannot be used stops the run before it starts (exit code 2).
- scan or model failing stops the run, since nothing can follow.
- A failing infer, test or report stage does not stop later stages.
- If the LLM has no key or is down, infer is a warning and the model without LLM constraints stays in
  model_v0.json. A run never fails only because of a missing key.

## Exit codes
0 all stages ok, warning or skipped. 1 at least one stage failed. 2 the source or the spec could not be used.

## Known limitations (stated openly)
- Stages 6 and 7 are placeholders until the testing and evidence modules exist.
- One agent per run. There is no batch mode and no parallelism.
- Git URLs are cloned fresh each run. There is no cache for cloned repos (the LLM replies are cached).
- The pipeline does not yet feed a test run's results back into the model. That is the reconcile
  step, which the testing stage will call once traces exist.