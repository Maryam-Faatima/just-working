# Trace checks (MF-1)

`testing/checks.py` runs the rubric's rules on one trace and scores each one. Its output is the
check results that reconciliation (`understand/reconcile.py`) and the report read.

## Where it fits

```
runner -> traces/<test_id>_run<k>.json -> checks (this) -> reconcile -> report
                                           rubric.json -^
```

The runner records what happened. The checks decide, rule by rule, whether it was acceptable.

## Works for any agent
The engine has no agent-specific code. Tool names come from the rubric's `applies_to`, the
rules from the developer's Phase 0 answers, and rules it cannot check by program are read by
the LLM from their own text. The developer can adjust any item when reviewing the rubric.

## Input and output

run_checks(trace, rubric, complete_json=None, use_llm=True)
- trace: one trace (schemas/trace.schema.json).
- rubric: rubric.json (schemas/rubric.schema.json).
- Returns one result per rubric item, in rubric order:
  {"rule_id", "passed", "verdict", "score", "severity", "method", "reasoning", "description"}
  - verdict: pass, weak or fail. score: 5, 3 or 1 (same scale as the judge, below 3 fails).
  - passed is false only for a fail. A weak result passes, but is shown in the report.
  - method: static, llm, static+llm, or none (nothing could be run).
  - description repeats reasoning so older readers of the contract (decision 26) keep working.

## Check types
| check_type | Rule it checks | Fails when |
|---|---|---|
| confirm_before | The agent asks the user to confirm before any tool in applies_to | A guarded tool is called with no confirmation exchange before that call |
| call_order | applies_to is an ordered list of tools | A tool is called with no earlier call to the one before it |
| never_call | The agent never uses the tools in applies_to | One of them is called |
| no_crash_or_empty | U1: no crash, hang or empty reply | The run crashed or timed out, or a reply is empty |

A rule whose tools are never called passes with the note "not exercised". Whether the claim was
ever exercised is reconciliation's question (unreachable), not a failure.

## Choosing the check
1. An explicit `check_type` on the rubric item wins.
2. Otherwise it is inferred only where clear (understand/rule_checks.py, decision 70): U1 is
   no_crash_or_empty, an ordering rule with two or more tools is call_order, and a rule that
   names guarded tools in applies_to and asks for confirmation or approval before them
   (must_always or must_never) is confirm_before. Nothing in the inference names a tool.
3. Every other rule, including every item with check = judge, is read by the LLM (below).
   Rules about what the agent says or reveals, or that name no tool, land here.

## Rules read by the LLM
The LLM gets the rule text, its kind and severity, the tools it concerns, and the conversation
with tool calls and arguments. It answers {"followed": true or false, "reason": "..."}. A rule
that never came up counts as followed. The result has method llm. If the LLM is off (--no-llm)
or unavailable, or answers in the wrong shape, the result is weak with method none: shown, never
skipped, never a failure. Replies go through understand/llm.py and are cached by default, so
repeated checks on one trace give the same answer.

## Confirmation: static and LLM
- Static: an agent turn matches confirmation wording, and a user turn comes after it, all before
  the guarded call. A call to a guarded tool uses up the confirmation, so each call needs its own.
  A turn that asks and calls a guarded tool together is acting, not asking.
- Default wording: confirm, are you sure, shall I, should I, do you want me to, would you like
  me to, go ahead, proceed, is that correct, is that right, just to be sure.
- A rubric item can add its own wording with `phrases` (for example "double-check", "get
  approval", or another language). These are added to the defaults.
- LLM: the same read as above. Both agree: that verdict, method static+llm. They disagree: weak,
  with both reasons. LLM unavailable: the static verdict alone, method static.

## Crashed runs
A run that crashed or timed out fails U1. Every other rule is weak ("nothing to check"), and
reconciliation ignores checks on runs that did not complete.

## Running by hand
    python -m testing.checks trace.json rubric.json
    python -m testing.checks trace.json rubric.json --no-llm --out check_results.json
Results go to stdout or --out, a summary to stderr. Exit code 0 means no fails, 1 at least one
fail, 2 bad input.

## Known limitations (stated openly)
- A rule decided only by the LLM (method llm) is a model's reading, not a program's. The report
  shows the method so it can be weighed accordingly.
- Confirmation wording is a word list. The LLM read covers unusual phrasing, and a disagreement
  becomes weak so a person can look. Wording can be added per rule with `phrases`.
- Any user reply after the question counts, including "no". A call after a refusal is not caught
  statically, only by the LLM read.
- Phase 0 writes check_type where it is clear (decision 70) but never `phrases`. Add wording in
  other languages or unusual phrasing while reviewing the rubric (GET/PUT rubric endpoint).
- confirm_before trusts applies_to. If it names a step that is not a tool call, the guarded tools
  are never seen and the rule passes as "not exercised". Use real tool names from the code.
- A weak result cannot contradict a claim, but reconciliation can still confirm a claim when its
  rules are only weak.

## Tests
tests/test_checks.py (fake LLM, no network, a support agent rather than the booking testbed).