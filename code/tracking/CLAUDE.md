# CLAUDE.md: GreatTest

Read this file first, then TRACKING.md, then docs/iteration2_checklist. Paths are relative to the folder that holds pipeline.py.

## What this project is
GreatTest (FAST-NUCES Islamabad, FYP F26-196) is an evidence-based adaptive testing system for LLM conversational agents. It reads an agent's code, builds a Behavioral Model, tests the running agent with persona conversations, reconciles what the code claims against what happened, and keeps evidence for every finding.

Team: Maryam Fatima (MF, understanding), Eman Ul Huda (EH, dynamic testing), Aliza Yasser (AY, requirements, evidence, frontend). Supervisor Dr. Ahmad Raza Shahid, co-supervisor Ms. Sadia Saad.

## The four phases
- Phase 0 (understand/phase0.py): questionnaire to spec.json, rubric.json, developer rules as constraint entries.
- Phase 1 (understand/): acquire, scanner, context_files, callgraph, rule-based model, llm + infer (verified LLM claims), model_store + confidence, reconcile.
- Phase 2 (testing/): adapter, checks, generator, simulator, runner (judge.py is planned).
- Phase 3 (evidence/): evidence graph and report.
- pipeline.py runs all stages with one command. Testing and evidence stages are plug-ins: testing.runner.run(ctx) and evidence.report.build(ctx).

## Hard rules (do not break)
1. JSON Schema in schemas/ is the single source of truth for contracts. No Pydantic. Schema changes need an issue, schema + fixture + tests in one PR, approval by all three, and a decisions.md entry.
2. LLM output is a proposal. A claim enters the model only if its cited code exists and the quoted line is real code (not a comment or docstring). Count every rejection.
3. A crash or timeout of the agent under test never changes the model. It writes a critical finding only.
4. Target code is parsed in Phase 1, never imported or run. Secret files are never read. Keys come from the environment or .env and are never committed, logged or written to outputs.
5. Everything stays agent-agnostic. No rule, tool name or check may be hardcoded to the travel agent or any one agent.
6. All LLM calls go through understand/llm.py (Gemini first, Groq fallback, disk cache). Model names are configuration.
7. A rule that cannot be decided scores 3 (weak). It is never skipped and never a failure (decision 53).
8. Every change needs a unit test and a doc line. Run `ruff check --fix .` and `pytest -v` before every commit. No unsafe ruff fixes. Small PRs into develop, never push to main.
9. No em dashes or long dashes anywhere in writing (reports, docs, messages).
10. Never claim anything the code does not do. The report describes the implemented system, not the intended one.

## Domain facts to keep consistent
- Statuses: unverified, confirmed, contradicted, unreachable, discovered.
- Starting confidence: tool by decorator 0.90 (0.95 with LLM), workflow step 0.75 (0.80), developer rule 0.60, LLM-only constraint 0.55.
- Update steps: confirmed moves 30% of the way to 1, contradicted halves it, unreachable lowers it 20%. Passing runs apply before failing runs. Three completed runs without the tool call are needed for unreachable. These rates are not yet justified by data (MF-5).
- Scope: Python agents, LangGraph first, text primary, voice is an extension. Jailbreak and prompt-injection testing is out of scope (confirmed with supervisor).
- Handbook marks: FYP-1 Final is 50 marks (42.5 demo and defense, 7.5 report). Each member must explain their own files without AI open.

## Repo map
schemas/ and fixtures/ (contracts + samples), understand/, testing/, evidence/, target_agent/ (our testbed, has its own CI job and 95 tests), frontend/ + api.py (extension), tests/, docs/ (one doc per module, decisions.md has 56 entries), scripts/.
Outputs go to outputs/<agent>/ and are git-ignored.

## Commands
- Run: `python pipeline.py <git URL | zip | folder> --name <agent> --open` (`--no-ask`, `--spec FILE`, `--no-llm`)
- Test: `ruff check --fix .` then `pytest -v`
- Adapter by hand: `python -m testing.adapter "message" --out trace.json`
- API: `uvicorn api:app --host 127.0.0.1 --port 8000 --reload`, frontend: `cd frontend && npm install && npm run dev`

## Known issues to fix
- .llm_cache/ is committed to the repo but the report says it is excluded. Gitignore it and remove from the index, or fix the report.
- docs/iteration2_checklist is out of date (see TRACKING.md).

## How to work in a new chat
1. Read this file, TRACKING.md and the checklist.
2. Check `git log -15` and run the tests before trusting any status.
3. Agree the next task with the user, do it, then update TRACKING.md (status, date, next action) in the same PR.
4. Log any new design decision in docs/decisions.md with date and reason.
