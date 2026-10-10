# Static-runtime reconciliation (Phase 2)

understand/reconcile.py compares what the repository claimed (a model entry) with what a
test run showed (a trace plus check results), updates the model, and writes a finding.
This is the step that turns the model from a guess into evidence.

## Input and output
reconcile(store, spec, runs, finding_id=None)
- store: the ModelStore holding the behavioral model.
- spec: the test spec that targeted one entry (spec["target_id"]).
- runs: a list of {"trace": trace, "checks": [check results]}, one per execution of the test.
  Check result: {"rule_id", "passed", "severity"?, "description"?}. A result without "passed"
  is an error, never a silent pass.
- Returns {"outcome", "finding", "discovered"}. The store is updated in place.

## Rules
| Situation | Outcome | Model changes |
|---|---|---|
| Any check failed on a completed run | contradicted | Confidence moves down by the bounded rule, one step per failing run |
| No failures, the claim's tool was called | confirmed | Confidence moves up, one step per passing run |
| No failures, tool never called, 3 or more completed runs | unreachable | Confidence moves down |
| No failures, tool never called, fewer than 3 runs | none (inconclusive) | None |
| Run crashed or timed out | none | None. A critical finding is still written |
| Agent called a tool the model lacks | discovered entry added | New entry, status discovered, runtime evidence |

With several runs, passing runs are applied first and failing runs last, so one failure always
leaves the entry contradicted. This matches the rubric: a test fails if any critical item fails.

## Finding
Built to finding.schema.json and validated before it is returned.
- result: fail if any run failed a check or crashed, otherwise pass.
- severity: the highest severity among failed checks (default major), critical for a crash,
  info for a pass.
- reproducibility: runs and failures (a crash counts as a failed run).
- status_change and confidence_change are present only when the model changed.
- trace_id points at the first failing run, so the evidence chain leads to the proof.

## Design choices
- A crash is not evidence about the claim, so it never moves status or confidence. It is
  reported separately, so a crash cannot pass silently or hang the demo.
- "Unreachable" needs repeated attempts, because one run that missed the tool proves little
  for a non-deterministic agent.
- The entry updated is the one named by spec["target_id"]. For a developer rule that is the constraint entry (con_xxx), so a failed check marks the constraint contradicted and leaves the capability it concerns untouched (working document, Section 5). Rubric item ids are the check rule_ids (docs/phase0.md).

## Running one test by hand (demo and debugging)
    python -m understand.reconcile model_v0.json spec.json trace.json checks.json --finding-out finding.json
This updates model_v0.json in place (version set to v1) and prints the finding.

## Known limitations (stated openly)
- Reconciliation trusts the check results it is given. It does not judge conversations itself.
- Only the targeted entry is updated. Constraints the LLM found in the code are also entries, so a test for one of them should target its own entry, not the capability.
- One test spec is reconciled at a time. Choosing what to test next is a separate step.
- Confidence steps use the fixed rates in confidence.py. They are not yet tuned on data.