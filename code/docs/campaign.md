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
- A spec that cannot be reconciled (target not in the model) is skipped and listed. It never stops the others.
- A spec with no traces (not run) produces no finding.
- Failure rate is in the finding description ("Failed 1 of 5 runs").

## Known limitations
- Running the stage twice on the same model applies the confidence steps twice.
- Developer rules and inferred entries are not yet grouped differently in the report.