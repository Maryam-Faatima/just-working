# Campaign (testing/campaign.py)

Turns the runner's traces into findings. It runs as the `check` stage, after `test` and before `report`.

## What it does
For each test spec that has traces:
1. Runs the rubric checks (testing/checks.py) on every trace.
2. Reconciles all runs of that spec in one call (understand/reconcile.py).
3. Collects the finding.

It then sets ctx["findings"], writes <output folder>/findings.json, and leaves ctx["store"] updated
in place, so the report stage reads the new statuses and confidences.

## Rules
- Each trace's checks are scoped to the target entry before reconciling: the entry's own rubric rule (target_id on the item) plus the default items U1 to U3. A failed rule that belongs to another entry is not blamed on this one (decision 63).
- A contradicted entry stays contradicted when a later test passes. The passing runs are added as runtime evidence only (decision 64).
- A spec that cannot be reconciled (target not in the model) is skipped and listed. It never stops the others.
- A spec with no traces (not run) produces no finding.
- Failure rate is in the finding description ("Failed 1 of 5 runs").

## Live view
While it works the stage keeps <output folder>/model_changes.json up to date after every reconciled test: state (running or done), tests reconciled out of total, and one record per model flip (entry, status and confidence before and after, test, failed runs out of total). A tool the agent used that static analysis missed appears as a flip from nothing to discovered. The file is written atomically. The pipeline deletes the previous run's file at the scan stage. GET /api/model-changes/{name} serves it (docs/api.md), and the frontend polls it (decision 65).

When the stage finishes it also saves the updated model as model_v1.json beside the untouched model_v0.json (decision 66). The frontend shows v1 when it exists.

## Known limitations
- Running the stage twice on the same model applies the confidence steps twice.
- Developer rules and inferred entries are not yet grouped differently in the report.