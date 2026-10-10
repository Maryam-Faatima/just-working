# LLM wrapper and V0 inference (Phase 1, step 3)

understand/llm.py is the only module that calls an LLM. understand/infer.py uses it
to cross-check the rule-based Behavioral Model V0 and to add constraints.

## Why two modules
The wrapper knows about providers, keys, caching and JSON. The inference step knows
about the model. Keeping them apart means switching provider or model is a config
change, and later phases (judge, test generator) reuse the same wrapper.

## llm.py
- Providers are tried in order: Gemini, then Groq (decision 3). The first that answers wins.
- Keys come from environment variables GEMINI_API_KEY and GROQ_API_KEY. For local work they
  are read from a .env file in the project root (copy .env.example). Variables that are
  already set are not overridden, so CI and real environments win over the file.
- Models default to gemini-3.5-flash and openai/gpt-oss-120b. Override with GEMINI_MODEL
  and GROQ_MODEL. Provider model names are retired regularly (gemini-2.0-flash and
  llama-3.3-70b-versatile both stopped working in 2026), so a 404 usually means a retired
  model name. HTTP errors include the provider's response text to make this visible.
- Every reply is cached in .llm_cache/, keyed by a hash of the system prompt and prompt.
  The same prompt never costs a second call, and the demo can run offline from the cache.
  A reply that is not valid JSON is removed from the cache so it can be retried.
- Temperature is 0 for repeatable results.
- Functions: complete (raw text), complete_json (parsed JSON), load_env.
- Errors: every failure raises LLMError. If all providers fail, the message lists why each failed.

## infer.py

Input: scan.json (from the scanner), the repo folder, and the rule-based V0.

1. build_parts: the code the LLM may talk about. A part is a tool (labelled tool:name) or a
   workflow step (labelled step:name), made of the graph node function plus its router
   function. Function spans are found with ast, because the scan only records where a node
   is registered.
2. build_prompts: each part's source with line numbers. Parts are batched (about 12000
   characters per prompt) so a large repo does not overflow the model.
3. The LLM replies with capabilities (tools it agrees are real), steps (one sentence on what
   each step does) and constraints (rules the code enforces, each with a part label, one-rule
   description, file, lines and one quoted line of code).
4. apply_inference merges the reply:
   - Agreed capabilities and steps change from detected_by rule to rule+llm, and confidence
     rises (0.90 to 0.95 for a decorator tool, 0.75 to 0.80 for a graph step). A step is only
     upgraded if its code was shown to the LLM.
   - Each constraint becomes a model entry with detected_by llm, status unverified, starting
     confidence 0.55 and evidence pattern llm:inferred. The text is also added to the
     constraints list of the capability or workflow entry it belongs to.
5. Report: capabilities_agreed, steps_agreed, constraints_added, constraints_rejected (with
   the reason), batches, batches_failed.

## Why the LLM only proposes
A constraint is accepted only if all of these hold:
- the part it names exists (a bare name is accepted when it is unambiguous)
- the cited file belongs to that part and the cited lines fall inside its code
- the quoted line really appears on the cited lines
- the quoted line is not the docstring and not a comment, and is at least 8 characters
- it is not a duplicate of a constraint already in the model
Anything else is rejected with a reason and counted. Malformed replies are covered too: a
field that is not text, or an entry that fails model_entry.schema.json, is rejected and never
raises. The rejection count is a measurable quantity for the evaluation (LLM-only precision
compared with rule+llm).

## Reliability
- A batch whose reply is unusable (provider error, not JSON, not an object) is tried twice.
- If a batch still fails, the other batches are kept and batches_failed is reported.
- If every batch fails, LLMError is raised and the CLI saves the rule-only V0.

## Running it
    python -m understand.scanner <repo or url>
    python -m understand.infer outputs/<agent>/scan.json --repo <repo folder>
The --repo folder must be the one the scan's file paths are relative to. The console prints
how many items were added and the first 10 rejection reasons.

## Known limitations (stated openly)
- Retrieval is the scanner's own index: each part's source goes into the prompt. There is no
  vector index or embeddings. A function longer than 80 lines is cut.
- A node function is only found if it is defined in the same file where the node is
  registered (or the router in the file where the edge is declared). A node imported from
  another file is not shown to the LLM and stays rule-only.
- The quote check proves the cited code exists, not that it supports the rule. A plausible
  but wrong reading of real code is still possible. Runtime tests are what confirm or
  contradict it.
- Only the code is read. Developer rules from Phase 0 are not merged yet (needs a schema
  change, see decisions.md).
- Inferred constraints start at 0.55 and stay unverified until a runtime test confirms or
  contradicts them.
- LLM output can differ between providers. The cache makes a run repeatable, but a new
  prompt can give different constraints.
- The provider calls are tested with fakes in unit tests. Live calls depend on keys, quota
  and model names being available.