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
- Models default to gemini-2.0-flash and llama-3.3-70b-versatile. Override with GEMINI_MODEL
  and GROQ_MODEL.
- Every reply is cached in .llm_cache/, keyed by a hash of the system prompt and prompt.
  The same prompt never costs a second call, and the demo can run offline from the cache.
  A reply that is not valid JSON is removed from the cache so it can be retried.
- Temperature is 0 for repeatable results.
- Functions: complete (raw text), complete_json (parsed JSON), load_env.
- Errors: every failure raises LLMError. If all providers fail, the message lists why each failed.

## infer.py
Input: scan.json (from the scanner), the repo folder, and the rule-based V0.

1. build_prompt: for each tool, the source lines with line numbers (up to 60 lines), so the
   LLM can cite lines.
2. The LLM replies with `capabilities` (tool names it agrees are real) and `constraints`
   (rules the code enforces or implies, each with the tool, description, file and lines).
3. apply_inference merges the reply:
   - Agreed capabilities change from detected_by rule to rule+llm, and confidence rises
     (for example 0.90 to 0.95).
   - Each constraint becomes a model entry with detected_by llm, status unverified,
     starting confidence 0.55, and evidence pattern llm:inferred. The text is also added to the
     related capability's constraints list.
4. Report: capabilities_agreed, constraints_added, constraints_rejected (with the reason).

## Why the LLM only proposes
A constraint is accepted only if its tool exists in the scan, the cited file is that tool's
file, and the cited lines fall inside the tool's code. Anything else is rejected and counted.
This stops a hallucinated claim from entering the model with fake evidence. The rejection
count is a measurable quantity for the evaluation (LLM-only precision compared with rule+llm).

## Running it
    python -m understand.scanner <repo or url>
    python -m understand.infer outputs/<agent>/scan.json --repo <repo folder>
The --repo folder must be the one the scan's file paths are relative to.
If every provider fails, a warning is printed and the rule-only V0 is still saved.

## Known limitations (stated openly)
- Retrieval is the scanner's own index: each tool's source span goes into the prompt.
  There is no vector index or embeddings. Large tools are cut at 60 lines.
- Only the code is read. Developer rules from Phase 0 are not merged yet (needs a schema
  change, see decisions.md).
- Inferred constraints start at 0.55 and are only as good as the model. They stay
  unverified until a runtime test confirms or contradicts them.
- LLM output can differ between providers. The cache makes a run repeatable, but a fresh run
  on a new prompt can give different constraints.
- The provider calls were checked with fakes in unit tests. Live calls depend on your keys,
  quota and the model names being available.