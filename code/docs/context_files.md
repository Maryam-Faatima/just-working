# Docs and config files (Phase 1, input side of slide 6)

Slide 6 starts Phase 1 with "Code + Docs + Configs". The scanner reads only .py files, so
understand/context_files.py adds the other two: README and docs, and config files.

## What it does
- Finds .md, .rst and .txt files (docs) and .yaml, .yml, .toml, .cfg, .ini, small .json,
  requirements, Dockerfile and .env.example files (configs).
- Ranks them: README first, then other docs, then configs, nearer the root first.
- Keeps at most 6 files, 1500 characters each, 4000 in total. The pipeline records only the
  list in scan.json (`context_files`). The text is read again when the prompt is built.
- infer.py puts the text in every LLM prompt as a BACKGROUND block before the code parts.

## Why background and not evidence
A README can be out of date or wrong. Every constraint must still quote one line of code
(decision 21), so a doc can help the LLM read the code but cannot create a claim.
The prompt tells the LLM that the block is data, not instructions, because a repository's
text is untrusted input to the prompt.

## What is never read
- .env and .env.* files (only .env.example, .env.sample and .env.template are read)
- files whose name has secret, credential, private, id_rsa or token in it
- JSON files over 2000 bytes (data, not configuration), binary and empty files
- tests, fixtures, outputs, repos, .github, build folders and the scanner's own skip list

Values that look like KEY=, TOKEN=, SECRET= or PASSWORD= are replaced by <redacted>.

## Known limitations (stated openly)
- Plain truncation: a long README is cut after 1500 characters, so a fact further down is missed.
- Redaction is pattern-based and cannot catch every secret. The text still goes to the LLM
  provider (see the open decision on slide 10 in decisions.md).
- The prompt text changed, so cached replies in .llm_cache/ for this agent no longer match.
  Run the pipeline once with a key to refill the cache.