# Phase 0 Questions

This document has two versions of the Phase 0 questionnaire:

- **Version 1 (Detailed):** the full question set.
- **Version 2 (Short):** a shorter set that only covers things not already written down (rules the code doesn't enforce, weak spots, etc.).

---

# Version 1: Detailed Questionnaire

## A. Agent Purpose & Scope
1. What is the agent's main purpose, and who are its intended users?
2. What are the top 3-5 capabilities it must do well? (e.g., search availability, book, cancel)
3. What should the agent explicitly not do or handle? (out-of-domain requests)
4. What does a successful conversation look like from the user's side?

## B. Critical Behaviors & Business Rules
5. What are the must-always rules? (e.g., "must confirm before cancelling a booking")
6. What are the must-never / forbidden actions? (e.g., "never reveal another user's data")
7. Which behaviors are most severe if broken? Please rank them (critical / major / minor).
8. Are there ordering constraints between actions? (e.g., "must search before booking")
9. What should the agent do when information is missing or ambiguous? (ask, assume, refuse)
10. Are there any known bugs, weak spots, or areas you're worried about?

## C. Tools, APIs & External Dependencies
11. List every tool/function the agent can call and what each one does.
12. Which tools call external services (payment, flight API, database, web search, email)?
13. For each external service: can it be mocked or stubbed? Do you have an existing mock, sandbox, or test key?
14. Which tools have side effects that must never run for real during testing? (charging cards, sending emails, deleting records)
15. What are the expected failure modes of each external call? (HTTP 500, timeout, rate limit, empty result, malformed response)
16. Does the agent have retry, fallback, or timeout logic? Where in the code?
17. Are API credentials required to run the agent? Can it run offline with mocks only?
18. Are there rate limits or costs per call that we should keep tests within?

## D. State, Memory & Conversation Flow
19. Does the agent keep state across turns (session memory, user profile, booking state)? Where is it stored?
20. What are the valid states and transitions? (e.g., searching → confirming → booked → cancelled)
21. Which actions are illegal in which states? (e.g., "cannot modify a cancelled booking")
22. Is the agent single-turn or multi-turn? Is there a maximum turn limit?
23. Does it have long-term memory or RAG over documents? What data sources?

## E. Inputs, Boundaries & Data Rules
24. What input types does the agent accept? (text only, structured fields, files)
25. What are the valid ranges and formats for key inputs? (dates, IDs, max passengers, amounts)
26. What counts as invalid input, and what response do you expect?
27. Are there any language, tone, or formatting requirements for replies?

## F. Evaluation & Success Criteria
28. How should we judge "correct" behavior? Do you have an existing rubric or acceptance checklist?
29. Which checks can be deterministic (e.g., "tool X was called with arg Y") versus judgment-based (tone, helpfulness)?
30. What pass threshold do you consider acceptable? (e.g., 95% of tests passing, zero critical violations)
31. Is tone/interpersonal quality important for your agent? (the ATA paper found this is where LLM judges are weakest)
32. Do you have existing test cases, sample conversations, or logs we can learn from?

## G. Adversarial & Persona Testing
33. What kinds of difficult users should we simulate? (frustrated, vague, impatient, manipulative, changes mind)
34. Which business rules should we actively try to break?
35. Are there user behaviors that commonly cause trouble in production?
36. Should we test off-topic detours and returning to the task?

## H. Technical Setup & Running the Agent
37. Which framework is it built on (LangChain, LangGraph, OpenAI Agents SDK, other), and which language version?
38. How is the agent started? (entry point, command, required env variables, dependencies)
39. Is the agent a Python module we can call directly, or an HTTP service? What is the input/output interface?
40. Which LLM and model does the agent use under the hood, and is the key available for testing?
41. Are there config files, prompts, or system messages we should treat as part of the spec?
42. Is it safe to run the agent in a temporary workspace? Any files, databases, or network access it needs?

## J. Reporting Preferences
43. What should the final report emphasize? (failures by severity, coverage, code-level fixes, reproducibility)
44. Who will read it: developers, a QA team, or a manager? Any preferred format?
45. How many repeated runs are acceptable to check reproducibility (e.g., 3/3 vs 1/3)?

## Design Notes for Coding
- **Required vs optional:** Mark sections A, B, C, D, and H as required, since they directly drive Behavioral Model V0 and mocks. E-G refine tests, and I is conditional.
- **Output of Phase 0:** Store answers as a structured Requirement Specification JSON (suggested fields: `purpose`, `capabilities[]`, `rules[]` with severity, `forbidden[]`, `tools[]` with `external`, `side_effects`, `mock_available`, `failure_modes[]`, `states[]`, `rubric`, `run_config`). It's best to define this as a Pydantic model so the same schema can validate answers and export JSON Schema.
- **Question flow:** The ATA paper asks one question at a time, picking each by information gain. For the MVP, a fixed list with conditional skipping (e.g., skip 16 if there are no external services) is simpler, and the adaptive version can be a later extension.
- **External API handling:** Questions 11-18 are what let you decide per tool whether to use a developer mock, an auto-generated mock from schemas, or mark the tool as untestable. That matches the out-of-scope decision on universal sandboxing.

---

# Version 2: Short Questionnaire (Unwritten Things Only)

## Intent and Scope
1. What is the agent supposed to achieve for its users, in a sentence or two?
2. What should it refuse or stay out of, even if a user asks?
3. What does a good conversation look like, and what would make you call one a failure?

## Rules the Code Doesn't Enforce
4. What must the agent always do? (e.g., confirm before cancelling)
5. What must it never do? (e.g., reveal another user's data)
6. Which of these rules are critical if broken, and which are just nice to have?
7. When information is missing or ambiguous, should the agent ask, assume, or refuse?

## Known Weak Spots
8. Where do you suspect the agent is fragile or has misbehaved before?
9. Which user behaviors cause trouble in practice? (vague, impatient, changes their mind, off-topic)

## External Dependencies
10. Which external services does the agent depend on, and are any unsafe to hit during testing (payments, emails, deletions)?
11. Do you have mocks, sandbox keys, or sample responses we can use, or should we generate mocks from the code?
12. Which failures of those services matter most to you? (timeout, error, empty result)

## Quality and Success
13. Beyond correctness, what matters in replies? (tone, brevity, formality, language)
14. What would you accept as "good enough"? (e.g., zero critical violations)
15. Do you have real conversations, logs, or past bug reports we can learn from?

## Reporting
16. What should the report emphasize, and who will read it?
