# Decisions Log

| # | Decision | Choice | Why | Date |
|---|----------|--------|-----|------|
| 1 | AST tool | Python built-in `ast` | No setup, enough for decorators, function definitions and direct calls. tree-sitter would add a dependency we do not need for Python-only scope | 2026-10-08 |
| 2 | Agent framework | LangGraph | Nodes, edges and tools are declared explicitly in code, so static extraction is reliable | 2026-10-08 |
| 3 | LLM API | Gemini and Groq, one as fallback | Both have free tiers. We compare quality and rate limits later and then pick the primary. Calls go through one wrapper module so switching is a config change | 2026-10-08 |
| 4 | Contract format | JSON Schema (draft 2020-12), one file per record type | Machine-checkable, language-independent, lets us validate in CI | 2026-10-06 |
| 5 | Strict schemas | additionalProperties false | Catches typos and drift between modules early | 2026-10-06 |
| 6 | Status values | Closed set of five (unverified, confirmed, contradicted, unreachable, discovered) | Matches working document Section 4.2, keeps reconciliation explicit | 2026-10-06 |
| 7 | Evidence required | Model entries need at least one evidence item | Every claim must be traceable, which is the core of the explainability goal | 2026-10-06 |
| 8 | Fixtures as test oracle | Fixtures validated by pytest in CI | Contracts cannot silently break, and teammates can build before real output exists | 2026-10-06 |
| 9 | Crash handling in trace | run_status field (completed, crashed, timeout) | Lets the system report a crashed target agent instead of hanging | 2026-10-06 |
| 10 | Reproducibility in finding | runs and failures counts | Non-deterministic agents need findings that state how often they occur | 2026-10-06 |
| 11 | Contract code | JSON Schema only, no Pydantic | Keeps one source of truth for contracts. Model store validates against the schemas on load and save | 2026-10-08 |
| 12 | Zip input | Supported, with zip-slip, symlink and size checks | Reason: developers often share code as a zip, and unpacking untrusted archives is a known attack surface. | 2026-10-08 |
>>>>>>> develop
