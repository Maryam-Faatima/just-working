# Decisions Log

| # | Decision | Choice | Why | Date |
|---|----------|--------|-----|------|
| 1 | AST tool | Python built-in `ast` | No setup, enough for decorators, function definitions and direct calls. tree-sitter would add a dependency we do not need for Python-only scope | 2026-10-08 |
| 2 | callgraph | Builds the call graph and the component interactions (workflow step to tools) | callgraph.json, callgraph.md |
| 3 | Agent framework | LangGraph | Nodes, edges and tools are declared explicitly in code, so static extraction is reliable | 2026-10-08 |
| 4 | LLM API | Gemini and Groq, one as fallback | Both have free tiers. We compare quality and rate limits later and then pick the primary. Calls go through one wrapper module so switching is a config change | 2026-10-08 |
| 5 | Contract format | JSON Schema (draft 2020-12), one file per record type | Machine-checkable, language-independent, lets us validate in CI | 2026-10-06 |
| 6 | Strict schemas | additionalProperties false | Catches typos and drift between modules early | 2026-10-06 |
| 7 | Status values | Closed set of five (unverified, confirmed, contradicted, unreachable, discovered) | Matches working document Section 4.2, keeps reconciliation explicit | 2026-10-06 |
| 8 | Evidence required | Model entries need at least one evidence item | Every claim must be traceable, which is the core of the explainability goal | 2026-10-06 |
| 9 | Fixtures as test oracle | Fixtures validated by pytest in CI | Contracts cannot silently break, and teammates can build before real output exists | 2026-10-06 |
| 10 | Crash handling in trace | run_status field (completed, crashed, timeout) | Lets the system report a crashed target agent instead of hanging | 2026-10-06 |
| 11 | Reproducibility in finding | runs and failures counts | Non-deterministic agents need findings that state how often they occur | 2026-10-06 |
| 12 | Contract code | JSON Schema only, no Pydantic | Keeps one source of truth for contracts. Model store validates against the schemas on load and save | 2026-10-08 |
| 13 | Zip input | Supported, with zip-slip, symlink and size checks | Reason: developers often share code as a zip, and unpacking untrusted archives is a known attack surface. | 2026-10-08 |
| 14 | Detection source on model entries | Required `detected_by` field (rule, llm, rule+llm, runtime) plus optional `evidence[].pattern` | The starting-confidence rule needs to know how an entry was found. Lets us compare rule-only, LLM-only and combined detection in the evaluation | 2026-10-09 |
| 15 | LLM output is a proposal | Accepted only if the cited tool and lines exist in the scan; rejections are counted | Stops hallucinated claims entering the model, and gives a precision metric | 2026-10-09 |
| 16 | One LLM wrapper with disk cache | All calls go through understand/llm.py; replies cached in .llm_cache/ | Provider switch is config, demo runs offline, repeat runs are free | 2026-10-09 |
| 17 | Keys from .env | A small loader in llm.py, no new dependency; real environment variables win | Keys never enter git; CI and teammates can use real environment variables | 2026-10-09 |
| 18 | LLM reply fields are type-checked | Non-text fields and entries that fail the schema are rejected and counted, never raised | A malformed LLM reply must not crash the run; every rejection stays visible in the report | 2026-10-10 |
| 19 | Model names are config, errors show provider text | Defaults updated to gemini-3.5-flash and openai/gpt-oss-120b; HTTP errors keep the response body | Both original defaults were retired, and a bare 404 hid why | 2026-10-10 |
| 20 | LLM sees tools and workflow steps | Prompt includes graph node functions and routers, found with ast | The real business rules in a LangGraph agent live in nodes and routers, not tools | 2026-10-10 |
| 21 | Constraint must quote one line of code | The quote is checked against the cited lines, and rejected if it is a comment or the docstring | The old check only proved the lines were inside the function, so docstring restatements passed | 2026-10-10 |
| 22 | Batching, retry, partial failure | Parts sent in batches of about 12000 characters, 2 tries per batch, failed batches reported | Larger repos and flaky providers must not lose the whole run | 2026-10-10 |
| 23 | A crash never changes the model | Crash or timeout writes a critical finding but leaves status and confidence alone | A crash says nothing about whether the claim holds, and must be visible, not silent | 2026-10-10 |
| 24 | Unreachable needs repeated attempts | Three completed runs without the tool being called | A single miss is weak evidence for a non-deterministic agent | 2026-10-10 |
| 25 | One failure contradicts | Any failed check on a completed run sets contradicted; passing runs are applied first | Matches the rubric rule that a test fails if any critical item fails | 2026-10-10 |
| 26 | Check result contract | {rule_id, passed, severity?, description?}, with passed mandatory | Gives the testing lane a clear output format and prevents silent passes | 2026-10-10 |
| 27 | One command for the pipeline | pipeline.py runs all stages on one acquired repo; testing and evidence plug in through testing.runner.run(ctx) and evidence.report.build(ctx) | Teammates integrate without editing the pipeline, and the repo stays open for the testing stage | 2026-10-10.
| 28 | Call graph from ast, direct calls only | understand/callgraph.py resolves direct calls and reports the rest as unresolved with a reason | Full resolution is undecidable in Python (scope item 5); stating the unresolved share is honest and measurable | 2026-10-10 |
| 29 | Pipeline order follows slide 6 | scan, callgraph, model, infer: the call graph sits between AST parsing and LLM inference | The architecture diagram defines the flow | 2026-10-10 |
| 30 | Agents are module variables from registration calls | A variable assigned from create_react_agent(...) holds its tool list, and calls on it link a function to those tools | The tool link in LangGraph agents is not a function call, so plain call edges would never reach the tools | 2026-10-10 |
| 31 | RAG here means call-graph retrieval | The LLM gets the code reached through the call graph, no vector index | Keeps retrieval explainable and traceable to lines, stated as a limitation | 2026-10-10 |