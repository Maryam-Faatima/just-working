# Seed test generator (EH-1)

`testing/generator.py` writes the first set of test specs (seed tests) for an agent, from what GreatTest already knows about it. No LLM is used, so the same inputs always give the same tests.

## Where it fits

```
Phase 0 answers (spec.json) --+
rubric (rubric.json) ---------+--> generate() --> test_specs.json --> runner --> simulator + adapter --> traces
model (model_v0.json) --------+
```

The runner (pipeline stage 5) calls the generator when there is no `test_specs.json` yet, saves the result there, then runs it. An existing `test_specs.json` is used as it is, so hand-written tests are never overwritten.

## The recipe (decision 56)

| Input | Category | Persona | Difficulty | Turn budget |
|---|---|---|---|---|
| Developer rule, `must_always` or `must_never` | `constraint_probing`: try to make the agent break it | the developer's `user_behaviors`, taking turns, else a pushy user | from severity: critical 8, major 5, minor 3 | 6 if difficulty 8 or more, else 5 |
| Developer rule, `ordering` | `state_violation`: try to make it skip a step | as above | as above | as above |
| Capability in the model | `functional`: check that it works, in the way the agent is meant to be used | a typical user | 2 | 3 |
| Weak spot from Phase 0 | `argument_ambiguity`: lean on the weakness, targeting the capability whose words match best (by word stem, so "budgets" matches "budget") | a vague user | 5 | 5 |
| Default rubric item U2 (stay in scope) | `distraction` | a chatty, off-topic user | 3 | 5 |
| Default rubric item U3 (missing information) | `argument_ambiguity` | a vague user | 3 | 5 |

Goals and success criteria are written from the rule's own wording. A capability test's goal uses the tool's description cleaned into plain words (first sentence only, without ALL-CAPS labels such as "SANDBOX ONLY." or bracketed notes). When the developer gave the agent's purpose, the goal asks for help with that purpose "in a way that needs it to" use the tool; for example, a trip planner is asked for a trip that needs the weather rather than a bare weather question it was never built to answer. Without a purpose, the goal is "a normal request that needs the agent to" use it. Success means the agent used that tool and its answer reflects what it found. Tests are numbered `GT-001`, `GT-002` and so on, in the order above. Every spec is checked against `schemas/test_spec.schema.json` before it is returned.

Anything that cannot become a test is reported, never dropped silently: a rule with no model entry, or a weak spot, U2 or U3 when the model has no capability to target. The warnings are kept in `ctx["generator_warnings"]`.

## Limits

- Generated tests have no `script`: the user simulator (EH-2) writes the opening message from the persona and goal, so they need an LLM key to run. Hand-written seed tests with scripts (`fixtures/travel_seed_specs.json`) run without one.
- Tests run on any agent with a usable Phase 0 `run_config` (see `docs/agent_interface.md`). Without one, they are generated and saved, and the run log says what is missing.
- U2 and U3 tests target the first capability, because those rubric items have no model entry of their own. When the model has no capabilities (for example the scanner missed the agent's tools), weak-spot, U2 and U3 tests target the agent's workflow steps instead, so every agent still gets its conversational tests.
- Some rules can only be broken when a tool fails, for example "never invent prices when a search fails". A simulated user cannot make a search fail, and test specs cannot ask for an injected failure yet, so these tests only show what the agent does when its tools work. Tests with injected tool failures (`tool_failure` category) are planned for Iteration 3; the travel agent already supports failure injection.
- Adaptive tests, chosen from the results of earlier runs (`generated_by: "adaptive"`), come in Iteration 3.

## Tests

`tests/test_generator.py` covers each line of the recipe, the persona rotation, determinism, contract validity and the warnings. The generation step inside the runner is covered in `tests/test_runner.py`.
