# LLM judge, judge-all stage and judge audit (AY-1, AY-7)

The deterministic checks (`testing/checks.py`) give every rule a pass, weak or fail. The judge adds what a rule cannot: a 1 to 5 quality score with reasoning. It never moves a model entry (decision 62).

## Scores (`testing/judge.py`, AY-1)

- Scale: 5 and 4 pass, 3 weak, 2 and 1 fail. A 3 is shown but never counted as a failure.
- `run_judge(trace, rubric)` scores every rubric item with `check = judge` and no `check_type` (a program already decided those), and one `overall_quality` score for the whole conversation: helpfulness, safety, clarity, goal completion. A rule that never came up in the conversation scores 5.
- If the LLM is off or unavailable, the answer is 3 with the reasoning "Not decided". It is never a pass or a fail. Every prompt goes through `understand/llm.py`, so a repeat is cached and free.
- The UI's Evaluate button on Test Runs and LLM Judge runs the checks, then the judge, on one trace and writes `judge_results.json` and `check_results.json`.

## Every trace (`testing/judge_all.py`, pipeline stage `judge`)

Stage 8 runs after `check` and before `report`. For each `traces/*.json` it runs the checks and the judge and writes `judge_all.json`: one record per trace, and a summary.

| Field | Meaning |
|---|---|
| `agreement` | `both_ok`, `both_fail`, `judge_only` (judge fails it, no rule check did), `checks_only`, or `not_judged` (the run crashed or timed out) |
| `decided` | False when the LLM did not answer. Such a record has no score and is counted as `undecided`, never averaged in |
| `overall_quality`, `judge_rule_scores`, `check_results` | What each reader said |
| `summary` | counts, mean score, score counts, agreement counts and rate |

One unreadable trace never stops the others. A stage with no traces or no rubric does nothing. The report (`evidence/report.py`) turns the file into the "Judge Scores by Run" section, and the PDF shows it as section 8.

Run alone: `python -m testing.judge_all outputs/<agent>`. Add `--repeat 3 --limit 5` for the consistency check below.

## Consistency

`consistency()` asks the judge for the overall score N times per trace with the cache off, and writes `judge_consistency.json`: identical scores, same verdict, mean spread. An answer the LLM did not give is the fallback 3, not a judgment, so a trace with any such repeat is listed under `incomplete_traces` and left out of the statistics (decision 78). It uses new LLM calls on every run.

## Is the judge right? (`evaluation/`, decision 79)

Agreeing with the checks does not make the judge correct, so a person reads the runs.

1. `python -m evaluation.audit export outputs/<agent>` writes `audit_sheet.csv`: every `judge_only` run and 3 `both_fail` runs, shuffled, with the conversation only. No score and no group is shown. `audit_key.json` holds the groups; do not open it until the sheet is filled.
2. Fill `human_verdict` with `real_failure`, `not_failure` or `unsure`. A second reviewer fills a copy.
3. `python -m evaluation.audit score outputs/<agent>` writes `judge_audit.json`: precision per group (confirmed / confirmed plus not_failure) with a 95% Wilson interval, and whether every row was labelled.
4. `python -m evaluation.audit kappa a.csv b.csv` gives agreement and Cohen's kappa between two reviewers.
5. `python -m evaluation.metrics outputs/<agent>` collects coverage, findings, pass^k, judge agreement, consistency and audit precision into `evaluation_metrics.json` and `.md`. It reads existing files, calls no LLM, and lists any missing input instead of guessing. `brier()` and `ece()` are plain functions for the calibration study (MF-5).

## Limits

- The judge reads one conversation at a time, so position bias does not apply. Verbosity bias and a judge that shares a model family with the agent are not yet tested.
- A free-tier outage leaves traces undecided. Run the stage again later: cached traces cost nothing, only the missing ones use quota.
- Audit precision on about 20 rows has a wide interval. Report the counts with it.

## Tests

`tests/test_judge.py`, `tests/test_judge_all.py` and `tests/test_evaluation.py` use a fake LLM and synthetic runs, so they need no key and no agent.
