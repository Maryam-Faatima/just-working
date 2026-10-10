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
| 13 | Detection source on model entries | Required `detected_by` field (rule, llm, rule+llm, runtime) plus optional `evidence[].pattern` | The starting-confidence rule needs to know how an entry was found. Lets us compare rule-only, LLM-only and combined detection in the evaluation | 2026-10-09 |
| 14 | LLM output is a proposal | Accepted only if the cited tool and lines exist in the scan; rejections are counted | Stops hallucinated claims entering the model, and gives a precision metric | 2026-10-09 |
| 15 | One LLM wrapper with disk cache | All calls go through understand/llm.py; replies cached in .llm_cache/ | Provider switch is config, demo runs offline, repeat runs are free | 2026-10-09 |
| 16 | Keys from .env | A small loader in llm.py, no new dependency; real environment variables win | Keys never enter git; CI and teammates can use real environment variables | 2026-10-09 |
| 17 | LLM reply fields are type-checked | Non-text fields and entries that fail the schema are rejected and counted, never raised | A malformed LLM reply must not crash the run; every rejection stays visible in the report | 2026-10-10 |
| 18 | Model names are config, errors show provider text | Defaults updated to gemini-3.5-flash and openai/gpt-oss-120b; HTTP errors keep the response body | Both original defaults were retired, and a bare 404 hid why | 2026-10-10 |
| 19 | LLM sees tools and workflow steps | Prompt includes graph node functions and routers, found with ast | The real business rules in a LangGraph agent live in nodes and routers, not tools | 2026-10-10 |
| 20 | Constraint must quote one line of code | The quote is checked against the cited lines, and rejected if it is a comment or the docstring | The old check only proved the lines were inside the function, so docstring restatements passed | 2026-10-10 |
| 21 | Batching, retry, partial failure | Parts sent in batches of about 12000 characters, 2 tries per batch, failed batches reported | Larger repos and flaky providers must not lose the whole run | 2026-10-10 |