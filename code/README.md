# GreatTest

![CI](https://github.com/Maryam-Faatima/GreatTest/actions/workflows/ci.yml/badge.svg)

Evidence-based adaptive testing framework for conversational AI agents (text primary, voice secondary).
It statically analyzes an agent's repository to build a behavioral model, tests the running agent
with persona-driven dialogue, and reconciles what the code claims against what the agent actually does.

## Status
Early development (FYP-1).

## Structure
| Folder | Purpose |
|--------|---------|
| `schemas/` | JSON schemas for model, test spec, trace, and finding |
| `fixtures/` | Sample JSON outputs for others to build and test against |
| `target_agent/` | Sample booking agent used as the test target |
| `understand/` | Phase 1 — parsing, call graph, RAG, model store, reconciliation |
| `testing/` | Phase 2 — adapter, personas, execution, judging |
| `evidence/` | Phase 3 — evidence graph, report, API/CLI |
| `tests/` | Unit tests |
| `docs/` | `decisions.md`, diagrams, action register |

## Documentation
- docs/schemas.md: data contracts between modules and why they are shaped this way
- docs/decisions.md: log of design decisions with reasons