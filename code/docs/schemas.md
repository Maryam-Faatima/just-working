# Schemas and Contracts

All modules communicate through JSON files validated against the schemas in /schemas.
Sample files for each live in /fixtures. Tests in /tests/test_schemas.py check that
every fixture validates, so CI fails if a contract is broken.

## Overview

| Schema | File | Producer | Consumers |
|---|---|---|---|
| Behavioral model entry | schemas/model_entry.schema.json | Phase 1 and reconciliation | Test generator, evidence graph, report |
| Test spec | schemas/test_spec.schema.json | Test generator | Testing engine |
| Trace | schemas/trace.schema.json | Testing engine | Reconciliation, evidence graph |
| Finding | schemas/finding.schema.json | Judge and reconciliation | Evidence graph, report |
| Requirements spec | schemas/requirements_spec.schema.json | Phase 0 (developer questionnaire) | Model merge, rubric, test generator |
| Rubric | schemas/rubric.schema.json | Phase 0 | Testing lane (check rule_id), judge, reconciliation |

## Data flow

repo -> model entries (V0) -> test specs -> traces -> findings -> model update -> report

Every record points to the one before it by id (target_id, test_id, trace_id).
Following these ids backwards is the evidence chain:
finding -> trace -> test -> model entry -> source file and lines.

## Key design choices

- Status is a closed set of five values (unverified, confirmed, contradicted,
  unreachable, discovered). A closed set keeps reconciliation logic explicit and testable.
- Confidence is a number from 0 to 1. The update rule lives in the model store,
  not in the schema (see decisions.md).
- additionalProperties is false everywhere. A misspelled field is rejected instead of silently ignored.
- Evidence is an array with at least one item. A claim with no evidence cannot be stored.
- Modality (text or voice) is a field on test specs and traces, so the voice extension reuses the same schemas.
- Trace has a run_status (completed, crashed, timeout), so a crashing target agent is recorded as data and not a hang.
- Finding stores reproducibility as runs and failures (for example 3 of 3), so findings state how reliable they are.

## Fields beyond the working document

The working document (Section 4.1) defines only the model entry. These fields were
added by us and should be reviewed by the team:

- test_spec: target_id, modality, generated_by
- trace: run_status, error
- finding: severity, reproducibility, status_change, confidence_change
- model_entry: detected_by (rule, llm, rule+llm, runtime), and evidence[].pattern (optional)
- requirements_spec and rubric: new contracts for Phase 0 (see docs/phase0.md)
- model_entry: detected_by and evidence[].source also accept "developer", for claims that come from the developer's answers and have no source line

## Changing a schema (change control)

1. Open an issue describing the change and who is affected.
2. Update the schema, the fixture, and the tests in the same PR.
3. All three members approve, because every module depends on these files.
4. Add a row to docs/decisions.md.
