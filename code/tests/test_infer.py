import pytest

from understand import infer, llm
from understand.infer import apply_inference, build_parts, build_prompts, infer_v0
from understand.model_store import ModelError, build_v0

AGENT_PY = '''from langchain_core.tools import tool
from helpers import do_cancel
@tool
def cancel_booking(booking_id):
    """Cancel a booking. Always asks the user first."""
    if not state.confirmed:
        return "Please confirm before cancelling."
    return do_cancel(booking_id)
'''

HELPERS_PY = '''def do_cancel(booking_id):
    """Cancel it."""
    if not booking_exists(booking_id):
        raise ValueError("unknown booking")
    return True


def remote_node(state):
    return state
'''

GRAPH_PY = '''MAX_RETRIES = 2

def critic_node(state):
    state["critique"] = review(state["plan"])
    return state

def route_after_critic(state):
    if state["over_budget"] and state["attempt"] < MAX_RETRIES:
        return "generate"
    return "output"
'''

SCAN = {
    "agent": "demo",
    "tools": [{
        "name": "cancel_booking", "docstring": "Cancel a booking. Always asks the user first.",
        "file": "agent.py", "start_line": 3, "end_line": 8, "detected_by": "decorator:tool",
    }],
    "nodes": [
        {"name": "critic", "function": "critic_node", "file": "graph.py", "line": 20},
        {"name": "orphan", "function": "not_defined_anywhere", "file": "graph.py", "line": 21},
    ],
    "edges": [{"from": "critic", "to": "generate", "conditional": True,
               "condition": "route_after_critic", "file": "graph.py", "line": 22}],
}

TOOL_RULE = {
    "applies_to": "cancel_booking", "description": "Must confirm before cancelling",
    "file": "agent.py", "lines": "6-7", "code": "if not state.confirmed:",
}
STEP_RULE = {
    "applies_to": "step:critic", "description": "Retries at most MAX_RETRIES times when over budget",
    "file": "graph.py", "lines": "8-9",
    "code": 'if state["over_budget"] and state["attempt"] < MAX_RETRIES:',
}


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "agent.py").write_text(AGENT_PY, encoding="utf-8")
    (tmp_path / "graph.py").write_text(GRAPH_PY, encoding="utf-8")
    (tmp_path / "helpers.py").write_text(HELPERS_PY, encoding="utf-8")
    return tmp_path


def constraint(**changes):
    return {**TOOL_RULE, **changes}


# ---- what the LLM is shown

def test_parts_cover_tools_and_steps_with_their_router(repo):
    parts = build_parts(SCAN, repo)
    assert set(parts) == {"tool:cancel_booking", "step:critic"}  # orphan has no code to show
    assert [s["what"] for s in parts["step:critic"]["spans"]] == ["critic_node", "route_after_critic"]


def test_parts_without_repo_are_tools_only():
    assert set(build_parts(SCAN)) == {"tool:cancel_booking"}


def test_prompt_has_labels_and_numbered_lines(repo):
    (prompt,) = build_prompts(build_parts(SCAN, repo), repo)
    assert "### tool:cancel_booking" in prompt and "### step:critic" in prompt
    assert "[route_after_critic in graph.py]" in prompt
    assert '8:     if state["over_budget"]' in prompt


def test_large_repos_are_split_into_batches(repo, monkeypatch):
    monkeypatch.setattr(infer, "MAX_BATCH_CHARS", 10)
    assert len(build_prompts(build_parts(SCAN, repo), repo)) == 2


def test_helper_a_tool_calls_is_shown_and_can_be_cited(repo):
    parts = build_parts(SCAN, repo)
    assert [s["what"] for s in parts["tool:cancel_booking"]["spans"]] == [
        "cancel_booking", "do_cancel (called by cancel_booking)"]
    rule = {**TOOL_RULE, "file": "helpers.py", "lines": "3-4",
            "description": "Refuses to cancel a booking that does not exist",
            "code": "if not booking_exists(booking_id):"}
    report = apply_inference(build_v0(SCAN), SCAN, {"constraints": [rule]}, repo)
    assert report["constraints_added"] == 1


def test_node_function_defined_in_another_file_is_found(repo):
    remote = {"name": "remote", "function": "remote_node", "file": "graph.py", "line": 23}
    scan = {**SCAN, "nodes": SCAN["nodes"] + [remote]}
    spans = build_parts(scan, repo)["step:remote"]["spans"]
    assert [(s["file"], s["what"]) for s in spans] == [("helpers.py", "remote_node")]


def test_prompt_says_which_tools_a_step_reaches(tmp_path):
    (tmp_path / "tools.py").write_text("@tool\ndef lookup(q):\n    return q\n", encoding="utf-8")
    (tmp_path / "agent.py").write_text(
        "from tools import lookup\nbot = create_react_agent(None, tools=[lookup])\n\n\n"
        "def run(t):\n    return bot.invoke(t)\n", encoding="utf-8")
    (tmp_path / "graph.py").write_text(
        "from agent import run\n\n\ndef work_node(s):\n    return run(s)\n", encoding="utf-8")
    scan = {"tools": [{"name": "lookup", "file": "tools.py", "start_line": 1, "end_line": 3, "docstring": ""}],
            "registrations": [{"call": "create_react_agent", "tools": ["lookup"], "file": "agent.py", "line": 2}],
            "nodes": [{"name": "work", "function": "work_node", "file": "graph.py", "line": 9}],
            "edges": []}
    parts = build_parts(scan, tmp_path)
    assert parts["step:work"]["note"] == "Reaches tools: lookup"
    (prompt,) = build_prompts(parts, tmp_path)
    assert "Reaches tools: lookup" in prompt


# ---- accepting proposals

def test_tool_constraint_is_added_and_attached_to_the_capability(repo):
    store = build_v0(SCAN)
    report = apply_inference(store, SCAN, {"constraints": [TOOL_RULE]}, repo)
    added = store.find(type="constraint")[0]
    assert report["constraints_added"] == 1
    assert (added["detected_by"], added["status"], added["confidence"]) == ("llm", "unverified", 0.55)
    assert added["evidence"][0] == {"source": "static", "file": "agent.py", "lines": "6-7",
                                    "pattern": "llm:inferred"}
    assert added["related_tools"] == ["cancel_booking"]
    assert "Must confirm before cancelling" in store.find(type="capability")[0]["constraints"]


def test_step_constraint_is_added_and_attached_to_the_workflow_entry(repo):
    store = build_v0(SCAN)
    report = apply_inference(store, SCAN, {"constraints": [STEP_RULE]}, repo)
    added = store.find(type="constraint")[0]
    assert report["constraints_added"] == 1
    assert added["related_states"] == ["critic"]
    assert STEP_RULE["description"] in store.find(type="workflow", name="critic")[0]["constraints"]


def test_agreement_upgrades_capability_and_step(repo):
    store = build_v0(SCAN)
    reply = {"capabilities": ["tool:cancel_booking"],
             "steps": [{"name": "critic", "summary": "Reviews the plan."}]}
    report = apply_inference(store, SCAN, reply, repo)
    cap = store.find(type="capability")[0]
    step = store.find(type="workflow", name="critic")[0]
    assert report["capabilities_agreed"] == 1 and report["steps_agreed"] == 1
    assert (cap["detected_by"], cap["confidence"]) == ("rule+llm", 0.95)
    assert (step["detected_by"], step["confidence"]) == ("rule+llm", 0.8)
    assert step["description"].endswith("Reviews the plan.")


def test_step_the_llm_never_saw_cannot_be_upgraded(repo):
    store = build_v0(SCAN)
    reply = {"steps": [{"name": "orphan", "summary": "Does something."}]}
    assert apply_inference(store, SCAN, reply, repo)["steps_agreed"] == 0


# ---- rejecting proposals

@pytest.mark.parametrize("changes, reason", [
    ({"applies_to": "refund_booking"}, "unknown part"),
    ({"lines": "90-99"}, "outside"),
    ({"file": "other.py"}, "not the part's file"),
    ({"lines": "abc"}, "start-end"),
    ({"code": ""}, "missing code"),
    ({"code": "if x"}, "too short"),
    ({"code": "# check that the user confirmed"}, "comment"),
    ({"code": "Always asks the user first."}, "docstring"),
    ({"code": "return something_else(booking_id)"}, "not on the cited lines"),
])
def test_bad_proposals_are_rejected_and_counted(repo, changes, reason):
    store = build_v0(SCAN)
    report = apply_inference(store, SCAN, {"constraints": [constraint(**changes)]}, repo)
    assert report["constraints_added"] == 0
    assert reason in report["constraints_rejected"][0]["reason"]
    assert store.find(type="constraint") == []


def test_non_object_items_are_rejected(repo):
    report = apply_inference(build_v0(SCAN), SCAN, {"constraints": ["text", 5]}, repo)
    assert [r["reason"] for r in report["constraints_rejected"]] == ["not an object"] * 2


def test_the_same_rule_twice_is_stored_once(repo):
    store = build_v0(SCAN)
    again = constraint(description="  must   CONFIRM before cancelling ")
    report = apply_inference(store, SCAN, {"constraints": [TOOL_RULE, again]}, repo)
    assert report["constraints_added"] == 1
    assert "duplicate" in report["constraints_rejected"][0]["reason"]


def test_non_text_fields_are_rejected_not_raised(repo):
    reply = {
        "capabilities": [["cancel_booking"], 5],
        "constraints": [constraint(description=123), constraint(applies_to=["cancel_booking"]),
                        constraint(file=7), constraint(code=9)],
    }
    report = apply_inference(build_v0(SCAN), SCAN, reply, repo)
    assert report["constraints_added"] == 0 and report["capabilities_agreed"] == 0
    assert len(report["constraints_rejected"]) == 4


def test_entry_that_fails_the_schema_is_rejected_not_raised(repo, monkeypatch):
    store = build_v0(SCAN)

    def refuse(entry):
        raise ModelError("schema says no")

    monkeypatch.setattr(store, "add", refuse)
    report = apply_inference(store, SCAN, {"constraints": [TOOL_RULE]}, repo)
    assert report["constraints_added"] == 0
    assert report["constraints_rejected"][0]["reason"].startswith("invalid entry")


def test_reply_that_is_not_an_object_raises_llm_error():
    with pytest.raises(llm.LLMError):
        apply_inference(build_v0(SCAN), SCAN, ["not", "an", "object"])


# ---- running it

def test_infer_v0_merges_every_batch(repo, monkeypatch):
    monkeypatch.setattr(infer, "MAX_BATCH_CHARS", 10)  # one call per part
    replies = iter([{"constraints": [TOOL_RULE]}, {"constraints": [STEP_RULE]}])
    monkeypatch.setattr(llm, "complete_json", lambda prompt, system: next(replies))
    report = infer_v0(SCAN, repo, build_v0(SCAN))
    assert (report["batches"], report["batches_failed"], report["constraints_added"]) == (2, 0, 2)


def test_unusable_reply_is_retried_once(repo, monkeypatch):
    answers = iter([llm.LLMError("bad json"), {"constraints": [TOOL_RULE]}])

    def flaky(prompt, system):
        answer = next(answers)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(llm, "complete_json", flaky)
    report = infer_v0(SCAN, repo, build_v0(SCAN))
    assert (report["batches_failed"], report["constraints_added"]) == (0, 1)


def test_one_failed_batch_does_not_lose_the_others(repo, monkeypatch):
    monkeypatch.setattr(infer, "MAX_BATCH_CHARS", 10)

    def second_part_fails(prompt, system):
        if "### step:critic" in prompt:
            raise llm.LLMError("down")
        return {"constraints": [TOOL_RULE]}

    monkeypatch.setattr(llm, "complete_json", second_part_fails)
    report = infer_v0(SCAN, repo, build_v0(SCAN))
    assert (report["batches"], report["batches_failed"], report["constraints_added"]) == (2, 1, 1)


def test_every_batch_failing_raises(repo, monkeypatch):
    def down(prompt, system):
        raise llm.LLMError("down")

    monkeypatch.setattr(llm, "complete_json", down)
    with pytest.raises(llm.LLMError, match="down"):
        infer_v0(SCAN, repo, build_v0(SCAN))