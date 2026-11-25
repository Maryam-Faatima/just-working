# TRACKING.md: GreatTest FYP-1 Final

Last updated: 21 Nov 2026. Update this file in every PR that finishes or moves a task.
Key dates: poster due 20 Nov (week 13), FYP-1 Final about 4 Dec (week 15).
Status key: DONE (merged, tests pass), BUILT (code exists in repo, tick not confirmed), TODO, LATE (past target date).
Last verified: ruff clean, 405 passed, 2 skipped on develop. CD workflow and the checks CLI were not verified.

## Maryam (MF)
| ID | Task | Target | Status | Notes / next action |
|---|---|---|---|---|
| MF-1 | Trace check engine (testing/checks.py) | 9 Nov | BUILT | Code, docs/checks.md and tests exist. Tick the checklist, confirm PR reviewed by EH |
| MF-2 | Checks CLI | 10 Nov | DONE | 21 Nov: `python -m testing.checks trace.json rubric.json` run on a real trace, prints results and exits 0, 1 or 2; tests/test_checks.py::test_cli_exit_codes covers it |
| MF-8 | Cached V0 fallback | 12 Nov | DONE | 21 Nov: understand/cached_v0.py, `--cached-v0` flag plus automatic fallback when the LLM fails, snapshot fixtures/cached_v0/target_agent.json, docs/cached_v0.md, decision 73, tests/test_cached_v0.py. ruff and pytest pass (21 Nov) |
| MF-3 | Multi-run reconciliation, constraint entries | 14 Nov | BUILT | Campaign stage reconciles all runs per test. Checks scoped to the target entry (dec 63), contradicted is sticky across tests (dec 64). Open: rerunning the check stage applies confidence steps twice. Unblocks MF-4 and MF-5 once merged |
| MF-4 | Live flip demo on real target agent | 17 Nov | DONE | 21 Nov: scripted test GT-101 (fixtures/travel_flip_test.json, spec_travel.json) moved con_001 (confirm before booking) from unverified to contradicted on the real target agent, 0.6 to 0.075, failed 3 of 3 runs, critical finding. Found and fixed a checker gap on the way: rules without check_type went to the LLM alone and passed the violation (decision 70). Evidence saved in outputs/target_agent_flip |
| MF-7 | Release pipeline (CD only if CI passes, Docker, tag v0.2-final) | 19 Nov | REVIEWED, run on GitHub pending | 21 Nov: cd.yml re-runs ci.yml and builds, smoke-tests and pushes the image only if it passes, and creates a release on v* tags. Not yet seen running: check the Actions tab after a merge to main, then push the tag. Note: v0.2-final is not strict semver, so the semver image tag is skipped, the sha and latest tags still push |
| MF-6 | Phase 1 gold-standard mini eval, 3 agents, real LLM key | 24 Nov | BUILT, run pending | Gold files for target_agent, customer-service-agent, trip-planner-agent (fixtures/gold/) and `python -m scripts.eval_phase1` (tool and workflow recall/precision, constraint recall, LLM constraint precision, resolved-call share, rejection rate). Docs in docs/evaluation.md. Still to do: rerun the pipeline on the 3 agents with a real key and record the numbers |
| MF-5 | Confidence calibration study | 25 Nov | TODO | 14 failure scenarios x N repeats, Brier or ECE, justify rates in decisions.md. Answers co-supervisor |
| MF-9 | Traceability and setup chapters | 27 Nov | TODO | Test setup on a fresh machine |

## Eman (EH)
| ID | Task | Target | Status | Notes |
|---|---|---|---|---|
| EH-8 | Target agent CI step | 10 Nov | DONE | |
| EH-1 | Test spec generator (testing/generator.py) | 12 Nov | DONE | Decision 56; follow-up fixes merged 17 Nov |
| EH-2 | Persona and user simulator | 14 Nov | DONE | Cached, decision 55 |
| EH-3 | Test runner, run(ctx), repeats as passes/total | 15 Nov | DONE | Plugged into pipeline stage 5 |
| EH-7 | Recorded trace fallback | 17 Nov | DONE | fixtures/recorded |
| EH-4 | Universal agent adapter (any agent, module and HTTP) | 14 Nov | DONE | Decision 57; LangGraph (72) and AgentExecutor (76) entry points |
| EH-5 | Crash and timeout inside generated tests | 17 Nov | DONE | Via run_status, never a hang; end-to-end test in tests/test_runner.py |
| EH-6 | Reproducibility study | 25 Nov | BUILT | testing/repro_study.py, decision 75; live run on the travel agent still to do |
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
2. .llm_cache/ is now in .gitignore (decision 67). The 77 cached files are removed from the git index (21 Nov, staged, commit pending); your local copies are kept.
3. Most Iteration 2 dates have slipped. Per the handbook, record delays with new owners and dates in the milestone log (SH-4).
4. judge.py and the universal adapter block the live flip demo and findings in the report. Use fixtures until they land.
5. Report fixes outstanding: Table C.2 format, target-agent test count (93 vs 95), per-member AI entries, screenshots, contribution table vs commit history. FYP-1 Final report must match the demo.

## Cut line (drop in this order)
UI polish, judge extras, Docker deploy, report polish.
Never cut: generated persona test, deterministic check, live flip, evidence chain, calibration evidence.

## Change log
- 20 Nov 2026: file created from repo review (405 tests passing).
- 21 Nov 2026: MF-6 built: gold files for 3 agents and scripts/eval_phase1.py. On the older saved outputs: tool and workflow recall 100% on all three, customer-service constraint recall 70% (the three gates.py validators missed), 7 of 7 LLM constraints on gold rules, resolved-call share 39% on target_agent and 0% on the old customer-service run. Numbers to be redone with fresh runs.
- 21 Nov 2026: Run on a git link (open_deep_research) changed nothing: the test stage reported 'not run' because only the travel agent had a backend and the launch form sent no entry point. Added LangGraph support to the Python backend and bridge (graph found from langgraph.json, whole conversation sent each turn, tool calls read from messages), optional `python`/`timeout_seconds` in run_config, and an entry point field in the launch form (decision 72, touches EH-4 code, branch Maryam-langgraph-adapter). Not yet tried on open_deep_research itself: it needs its own keys and dependencies.
- 21 Nov 2026: scripted flip test showed R1 (confirm before booking) passing although the agent booked with no confirmation: the rule had no check_type and the LLM read passed it. Added rule-based check_type inference (Phase 0 and checks) and made a confirmed entry sticky against unreachable (decision 70). Rerun done: con_001 contradicted 3 of 3 (0.6 to 0.075). MF-4 done. Also made LLM transport errors (dropped connection) retry once and fall back instead of crashing the check stage.
- 21 Nov 2026: MF-3 scoped checks per target entry and made contradicted sticky across tests (decisions 63, 64).
- 21 Nov 2026: live model changes (model_changes.json, /api/model-changes, frontend panel, decision 65).
- 21 Nov 2026: check stage saves model_v1.json, Behavioral Model screen shows entry status and version (decision 66).
- 21 Nov 2026: first live run on the target agent. Judge-scored default rules made findings only (decision 68), pipeline --no-sim-cache (decision 69).
- 21 Nov 2026: second live run (cache off) agreed with decision 68. Judge verdicts varied between runs (con_002 and con_003 failed 3 of 3, then passed 3 of 3), evidence for MF-5 and EH-6.
- 21 Nov 2026: MF-3 rerun bug fixed: check stage rebuilds from the pre-check model each run (decision 74).
- 21 Nov 2026: .llm_cache removed from the git index (decision 67 follow-up).
- 21 Nov 2026: MF-8 built: cached V0 snapshot, `--cached-v0`, fallback when the LLM is down (decision 73).
