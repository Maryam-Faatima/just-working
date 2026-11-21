# TRACKING.md: GreatTest FYP-1 Final

Last updated: 21 Nov 2026. Update this file in every PR that finishes or moves a task.
Key dates: poster due 20 Nov (week 13), FYP-1 Final about 4 Dec (week 15).
Status key: DONE (merged, tests pass), BUILT (code exists in repo, tick not confirmed), TODO, LATE (past target date).
Last verified: ruff clean, 405 passed, 2 skipped on develop. CD workflow and the checks CLI were not verified.

## Maryam (MF)
| ID | Task | Target | Status | Notes / next action |
|---|---|---|---|---|
| MF-1 | Trace check engine (testing/checks.py) | 9 Nov | BUILT | Code, docs/checks.md and tests exist. Tick the checklist, confirm PR reviewed by EH |
| MF-2 | Checks CLI | 10 Nov | LATE, verify | Confirm `python -m testing.checks trace.json rubric.json` works, add a test |
| MF-8 | Cached V0 fallback | 12 Nov | LATE | Save a cached V0 and make the offline demo use it |
| MF-3 | Multi-run reconciliation, constraint entries | 14 Nov | BUILT | Campaign stage reconciles all runs per test. Checks scoped to the target entry (dec 63), contradicted is sticky across tests (dec 64). Open: rerunning the check stage applies confidence steps twice. Unblocks MF-4 and MF-5 once merged |
| MF-4 | Live flip demo on real target agent | 17 Nov | LATE | MF-3 done. Live view built (decision 65). Run on a machine with LLM keys: seed tests need the simulator and the confirm rule needs the judge. Then record the flip |
| MF-7 | Release pipeline (CD only if CI passes, Docker, tag v0.2-final) | 19 Nov | LATE, verify | cd.yml exists, check it gates on CI and runs the image |
| MF-6 | Phase 1 gold-standard mini eval, 3 agents, real LLM key | 24 Nov | TODO | Resolved-call share, tool recall, rejection rate |
| MF-5 | Confidence calibration study | 25 Nov | TODO | 14 failure scenarios x N repeats, Brier or ECE, justify rates in decisions.md. Answers co-supervisor |
| MF-9 | Traceability and setup chapters | 27 Nov | TODO | Test setup on a fresh machine |

## Eman (EH)
| ID | Task | Target | Status | Notes |
|---|---|---|---|---|
| EH-8 | Target agent CI step | 10 Nov | DONE | |
| EH-1 | Test spec generator (testing/generator.py) | 12 Nov | BUILT | Docs and tests exist, decision 56. Tick checklist |
| EH-2 | Persona and user simulator | 14 Nov | DONE | Cached, decision 55 |
| EH-3 | Test runner, run(ctx), repeats as passes/total | 15 Nov | DONE | Plugged into pipeline stage 5 |
| EH-7 | Recorded trace fallback | 17 Nov | DONE | fixtures/recorded |
| EH-4 | Universal agent adapter (any agent, module and HTTP) | 14 Nov | LATE | Adapter still starts only the team target agent |
| EH-5 | Crash and timeout inside generated tests | 17 Nov | TODO | Via run_status, never a hang |
| EH-6 | Reproducibility study | 25 Nov | TODO | |
| EH-9 | Testing and design chapters, diagrams | 27 Nov | TODO | |

## Aliza (AY)
| ID | Task | Target | Status | Notes |
|---|---|---|---|---|
| AY-1 | LLM judge (testing/judge.py) | 14 Nov | LATE | File does not exist yet. Scores 1 to 5, below 3 fail, 3 weak, cached, safe if LLM down |
| AY-2 | Judge contract extension (change-control PR) | 9 Nov | LATE | Needs MF and AY approval |
| AY-3 | Real findings in evidence graph | 17 Nov | TODO | Needs runner and judge output |
| AY-4 | Report on real runs | 18 Nov | TODO | |
| AY-5 | UI on real runs, remove SIMULATION label | 19 Nov | TODO | |
| AY-6 | Conference poster, 22.5 x 34.5 in portrait, source + JPEG | 20 Nov | DUE TODAY | Needs supervisor approval |
| AY-7 | Judge reliability study | 25 Nov | TODO | |
| AY-8 | FYP-2 evaluation plan | 26 Nov | TODO | |
| AY-9 | Requirements and scope chapters | 27 Nov | TODO | |

## Shared
| ID | Task | Status | Notes |
|---|---|---|---|
| SH-1 | Contract fixtures | DONE (EH part), verify MF and AY fixtures | check_results.json, judge_results.json |
| SH-2 | One command runs Phases 0 to 3 on target agent | TODO | Integration, 17 to 20 Nov window already passing |
| SH-3 | Same path on one external LangGraph agent | TODO | |
| SH-4 | Action register + milestone log, paste supervisor and co-supervisor mid-eval feedback | TODO | MF |
| SH-5 | Tool/API/GenAI disclosure sheet and per-person AI log | TODO | All |
| SH-6 | FYP-2 rebalance agreed with supervisor | TODO | Voice EH, chatbot AY, gold standard + paper MF |
| SH-7 | Demo prep and two timed rehearsals (28 Nov to 3 Dec) | TODO | |
| Decision 53 | Logged in decisions.md | DONE | Tick the checklist |

## Open problems
1. Checklist file is behind the code. Tick MF-1, EH-1, decision 53 after confirming.
2. .llm_cache/ is committed, contradicting report Section 8.10. Fix before submission.
3. Most Iteration 2 dates have slipped. Per the handbook, record delays with new owners and dates in the milestone log (SH-4).
4. judge.py and the universal adapter block the live flip demo and findings in the report. Use fixtures until they land.
5. Report fixes outstanding: Table C.2 format, target-agent test count (93 vs 95), per-member AI entries, screenshots, contribution table vs commit history. FYP-1 Final report must match the demo.

## Cut line (drop in this order)
UI polish, judge extras, Docker deploy, report polish.
Never cut: generated persona test, deterministic check, live flip, evidence chain, calibration evidence.

## Change log
- 20 Nov 2026: file created from repo review (405 tests passing).
- 21 Nov 2026: MF-3 scoped checks per target entry and made contradicted sticky across tests (decisions 63, 64).
- 21 Nov 2026: live model changes (model_changes.json, /api/model-changes, frontend panel, decision 65).
- 21 Nov 2026: check stage saves model_v1.json, Behavioral Model screen shows entry status and version (decision 66).
