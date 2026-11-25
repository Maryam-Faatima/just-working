# Cached V0 (MF-8)

Offline fallback for the infer stage. A real run needs an LLM key and the network. A snapshot of an
earlier run lets the demo, CI and any run with the LLM down still produce the LLM-enriched model.

## Use
    python -m understand.cached_v0 save outputs/<agent>     save a snapshot after a real run with a key
    python pipeline.py <source> --cached-v0                 use the snapshot, never call the LLM

The snapshot is fixtures/cached_v0/<agent>.json (agent name as in outputs/<agent>). It is a normal model
file plus a `snapshot` block with the commit it was made from and when. It is committed on purpose:
unlike .llm_cache/ (decision 67) it is one small file chosen by hand, not a pile of generated replies.

## When it is used
| Situation | What happens |
|---|---|
| `--cached-v0` | The LLM is not called. The snapshot is merged. No snapshot: warning, rule-based model kept |
| LLM unavailable (no key, network, quota) | The snapshot is merged if one exists, with the reason in the stage detail. Otherwise as before |
| Normal run, LLM works | Snapshot not touched |

## What is taken from it
Only what the LLM added: capabilities and workflow steps it agreed with (detected_by rule+llm, with the
LLM's description) and constraints it inferred (detected_by llm, status unverified, baseline confidence).
Rule entries and the developer's rules come from the current code and spec, so ids and rubric target_ids
stay consistent. A cached constraint whose tool or step is no longer in the code is dropped. Applying a
snapshot twice adds nothing. model_v0_rule.json stays code-only (decision 36).

## Stale snapshots
If the snapshot commit differs from the code's commit, or it records none, the stage reports a warning
that says so and still uses it (decision 73). The report should not present such a run as a fresh LLM run.

## Limits
- The target_agent snapshot comes from the real run of 21 Nov 2026: the LLM agreed with 10 capabilities and
  added no constraints, so the snapshot carries no inferred constraints.
- Snapshots are per agent name. A renamed agent needs its own snapshot.
