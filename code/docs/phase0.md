# Phase 0: developer requirements

understand/phase0.py turns the developer's answers about the agent into a requirements spec,
adds those answers to the Behavioral Model, and builds the rubric that the testing lane checks
against. This is the "Developer Q&A -> Structured Specifications" box of slide 6.

## Why Phase 0 exists
Code shows what an agent does, not what it must do. A rule such as "confirm before cancelling"
is often written nowhere, and a rule that no code enforces is the one most likely to be broken.
Only the developer can say which rules matter, what counts as a failure, and which external
services are unsafe to call during testing.

## Using it
    python -m understand.phase0 ask --out spec.json     answer the questionnaire (16 questions)
    python -m understand.phase0 template                print an example spec to edit by hand
    python -m understand.phase0 check spec.json --scan outputs/<agent>/scan.json
    python pipeline.py <agent repo> --spec spec.json

`ask` is version 2 of phase0_questions.md (only what the code does not already say), with
conditional skipping: the questions about a service are asked only for services the developer names.
`check` validates a spec, and with --scan lists rules that name tools the code does not have.
Without --spec the pipeline still runs: the spec stage is skipped and the rubric holds only the defaults.

## The spec (schemas/requirements_spec.schema.json)
Only `purpose` is required. Every other field is optional.

| Field | Answers | Used by |
|---|---|---|
| purpose | Q1 | rubric.purpose |
| out_of_scope | Q2 | rubric item U2 |
| failure_definition | Q3 | rubric.failure_definition, for the judge |
| capabilities | extra | V0: matched to tools, or added as unverified claims |
| rules (text, kind, severity, applies_to, check) | Q4-6 | V0 constraint entries, rubric items R1... |
| ambiguity_policy | Q7 | rubric item U3 |
| weak_spots, user_behaviors | Q8, Q9 | test generation (Phase 2, not built yet) |
| external_services | Q10-12 | mocks and tool-failure tests (Phase 2, not built yet) |
| quality (notes, pass_threshold) | Q13, Q14 | rubric.pass_threshold |
| reference_material | Q15 | not used yet |
| report | Q16 | report (Phase 3, not built yet) |
| run_config (entry_point, interface, repeats) | start-up questions | testing lane: how to start the agent, how many repeats |

Rule ids (R1, R2, ...) are assigned in order when the developer gives none. A rule has a kind
(must_always, must_never, ordering), a severity (critical, major, minor), an optional list of tools
or workflow steps it concerns (applies_to), and a check type (deterministic when a program can decide
it from the tool calls, otherwise judge).

## What the pipeline does with it
1. spec stage: the file is loaded and validated before the repo is opened. An invalid spec exits with
   code 2 and writes nothing.
2. model stage: after the code-only model_v0_rule.json is saved, the developer's answers are added:
   - each rule becomes a `constraint` entry (detected_by developer, status unverified, confidence 0.60,
     evidence {source developer, pattern phase0:rule:R1}), linked to the tools in related_tools or
     the workflow steps in related_states. The rule text is also added to the host entry's `constraints`.
   - each declared capability that matches a tool is left alone. One that matches no tool is added as an
     unverified claim, with a warning.
3. rubric.json (and spec.json, the normalized spec) are written, then model_v0.json.

## The rubric (schemas/rubric.schema.json)
Item ids are the rule_id of the testing lane's check results (decision 26).

| Item | Source | Severity | Check |
|---|---|---|---|
| U1 no crash, hang or empty reply | always | critical | deterministic |
| R1, R2, ... one per developer rule | spec rules | from the rule | from the rule |
| U2 decline out-of-scope requests | spec out_of_scope | major | judge |
| U3 handle missing information as the policy says | spec ambiguity_policy | minor | judge |

Every developer item has a target_id: the constraint entry a test for that rule must target.
pass_threshold defaults to zero critical failures. The developer can edit rubric.json before testing.

## The evidence chain starts at the developer
For a rule the code never enforces there is no source line to start from. The chain is:
developer rule R1 -> con_001 (evidence phase0:rule:R1) -> test -> trace -> finding.
When a test for R1 fails, the constraint con_001 becomes contradicted and the capability it concerns
keeps its own status (working document, Section 5).

## Design choices
- The spec is plain JSON checked by a JSON Schema, no Pydantic (decision 32).
- Developer entries are only in model_v0.json. model_v0_rule.json stays code-only for the evaluation (decision 36).
- A mismatch between spec and code is a warning, not an error. A rule that names an unknown tool keeps the
  name, so a tool that is never called ends as unreachable.
- Merging twice on the same model adds nothing (each rule is found by its phase0:rule:R<n> marker).

## Known limitations (stated openly)
- A developer rule and an LLM-inferred constraint about the same behaviour become two entries. An LLM step
  that checks whether the code enforces each developer rule would join them. Not built yet.
- A rule with no tool and no workflow step counts as exercised on any completed run, so a general rule
  could be confirmed by a run that never touched the scenario. The test generator must make that scenario
  part of the test.
- Tool names are matched by exact name or by lower-case words joined with underscores. A free-text
  capability such as "book rooms" will not match reserve_room.
- The confidence of 0.60 is a placeholder (open decision 3).
- Weak spots, user behaviors, external services, reference material and report preferences are stored
  and validated, but nothing consumes them until Phase 2 and Phase 3 exist.