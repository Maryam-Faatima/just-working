# Mid Eval Checklist (FYP-1 Mid, Oct 16, 2026)

## Handoff context (read this first)
- Project: GreatTest, an evidence-based adaptive testing framework for conversational agents.
- Pipeline: Phase 0 requirements, Phase 1 static understanding (Behavioral Model V0),
  Phase 2 persona-driven testing + reconciliation, Phase 3 evidence graph + report.
- Decisions: Python `ast`, LangGraph, JSON Schema only (no Pydantic), Gemini/Groq via one wrapper. See docs/decisions.md.
- Statuses: unverified, confirmed, contradicted, unreachable, discovered.
- Rules for helpers: no em dashes in prose, small PRs, every change needs a unit test,
  never commit .env, run `ruff check --fix .` then `pytest -v` before every commit.
- Demo story: build V0 from a booking agent repo, run an adversarial persona test,
  cancel_booking flips unverified to contradicted (confidence drops by the bounded rule),
  show the evidence chain, show the crash edge case, show CI green.

## Status snapshot (update this each session)
Last updated: 2026-10-09
- Done: schemas + fixtures, acquire, scanner (AST + LangGraph edges), confidence baseline,
  model_store (build_v0, apply_outcome, discover, save/load), md/console/mermaid/html outputs, CI, 71 tests.
- Not started: target agent, adapter/personas/traces/checks, LLM inference, call graph,
  reconcile.py, evidence graph, report, CLI entry point, CD, tag.

## A. Repo hygiene
- [x] main protected, develop branch, CI on push/PR (ruff + pytest)
- [ ] README: replace "early development" with real status, setup steps, run commands
- [ ] README: CI badge points to the correct repo and is green
- [ ] Issue board: one issue per item below, each assigned to a member
- [ ] Every member has PRs and commits in the real repo history
- [ ] Release tag v0.1-mid

## B. Contracts and decisions
- [x] 4 schemas + fixtures validated in CI
- [x] AST tool, framework, LLM API, contract format decided
- [ ] Confidence rates (CONFIRM/CONTRADICT/UNREACHABLE) justified in decisions.md

## C. Phase 1 (understand)
- [x] Repo acquisition (git URL, zip, local path)
- [x] Scanner: tools, registrations, LangGraph edges
- [ ] Function-level call graph for direct calls (tests incl. an unresolved call case)
- [ ] LLM wrapper: one function, Gemini primary, Groq fallback, disk cache
- [ ] LLM inference producing V0 entries (capabilities, workflows, constraints) with evidence + confidence
- [ ] Validate LLM output against model_entry schema; reject and retry on invalid
- [ ] Cached V0 output saved as demo fallback
- [x] Model store with five statuses and bounded confidence update (unit tested)

## D. Reconciliation
- [ ] understand/reconcile.py: trace + rubric item to outcome to ModelStore.apply_outcome
- [ ] Unit tests: confirmed, contradicted, unreachable, discovered
- [ ] Live flip: cancel_booking unverified to contradicted on a real trace
- [ ] Recorded-good trace kept as demo fallback

## E. Testing lane (Eman)
- [ ] Booking target agent with 3 mock tools and a planted cancel-without-confirmation bug
- [ ] Adapter: send message, reset session, return trace
- [ ] 1 to 2 persona tests (frustrated customer)
- [ ] Deterministic check: cancel_booking called without prior confirmation
- [ ] Crash/timeout edge case reported via trace run_status, not a hang
- [ ] (extra) LLM judge, 3/3 style re-runs

## F. Evidence and report lane (Aliza)
- [ ] Phase 0 questionnaire + rubric.json
- [ ] Evidence graph: code to model entry to test to trace to finding
- [ ] Basic final report
- [ ] CLI/API entry point for the full path

## G. Integration
- [ ] Full path run with all modules, one command
- [ ] Failures found during integration fixed or logged

## H. CD
- [ ] CD workflow runs only if CI passes, on merge to main or tag
- [ ] Docker image or release artifact (fallback if no deploy target)

## I. Paperwork (costs marks if missed)
- [ ] Action register (proposal feedback: action, status, evidence link)
- [ ] Milestone log with recovery dates for anything late
- [ ] AI/API/pretrained model disclosure sheet, plus per-person AI usage log
- [ ] Diagrams match the code, with "what changed since proposal"
- [ ] Form 3 report: setup, test plan + early results, risks, requirements, architecture, deployment diagram, scope table
- [ ] Anti-plagiarism declaration, ToC, references

## J. Demo prep
- [ ] 15 minute flow rehearsed with timing: action register, live demo, edge case, pipeline, code walkthrough, plan
- [ ] Each member can explain their own code file by file
- [ ] Offline fallbacks ready (cached V0, recorded trace)

## Cut line (drop in this order)
CD, viewer UI, LLM judge, report polish. Never cut the live flip or the evidence chain.