"""Tests for the LLM Judge (AY-1). A fake LLM replaces Gemini and Groq everywhere.

The examples use three different agent domains on purpose:
  - A customer support agent
  - A code review agent
  - A travel planning agent
This proves the judge is agent-agnostic: it has no domain-specific logic.

All tests run offline (no real LLM calls). The fake LLM is injected via
the complete_json parameter of run_judge.
"""


from testing.judge import run_judge, _verdict, _transcript
from understand import llm

# ---------------------------------------------------------------------- helpers


class FakeLLM:
    """Inject a fixed reply or a fixed error into the judge."""

    def __init__(self, reply=None, error=None):
        self.reply = reply
        self.error = error
        self.calls = []  # records every prompt sent

    def __call__(self, prompt, system="", use_cache=True):
        self.calls.append({"prompt": prompt, "system": system})
        if self.error:
            raise self.error
        return self.reply


def rubric(agent="support-agent", items=(), purpose="", failure_definition=""):
    base = {"agent": agent, "version": "1", "pass_threshold": {}, "items": list(items)}
    if purpose:
        base["purpose"] = purpose
    if failure_definition:
        base["failure_definition"] = failure_definition
    return base


def item(rule_id, kind="must_always", check="judge", severity="major", description="d", tools=()):
    out = {
        "rule_id": rule_id, "description": description, "kind": kind,
        "severity": severity, "check": check, "source": "developer",
    }
    if tools:
        out["applies_to"] = list(tools)
    return out


def trace(turns, trace_id="TR-T1", status="completed"):
    return {
        "trace_id": trace_id,
        "test_id": "RT-T1",
        "modality": "text",
        "run_status": status,
        "turns": turns,
    }


def user(n, text):
    return {"turn": n, "role": "user", "content": text}


def agent_turn(n, text, *tools):
    t = {"turn": n, "role": "agent", "content": text}
    if tools:
        t["tool_calls"] = [{"name": name, "arguments": {}, "result": {}} for name in tools]
    return t


# ---------------------------------------------------------------------- _verdict helper

def test_verdict_mapping():
    assert _verdict(5) == "pass"
    assert _verdict(4) == "pass"
    assert _verdict(3) == "weak"
    assert _verdict(2) == "fail"
    assert _verdict(1) == "fail"


# ---------------------------------------------------------------------- _transcript helper

def test_transcript_includes_user_and_agent_text():
    t = trace([user(1, "Hello"), agent_turn(2, "Hi there")])
    tx = _transcript(t)
    assert "User: Hello" in tx
    assert "Agent: Hi there" in tx


def test_transcript_includes_tool_calls():
    t = trace([
        user(1, "Look up ticket TK-100"),
        agent_turn(2, "Looking up...", "lookup_ticket"),
    ])
    tx = _transcript(t)
    assert "lookup_ticket" in tx


def test_transcript_works_with_no_turns():
    t = trace([])
    assert _transcript(t) == ""


# ---------------------------------------------------------------------- result structure

def test_result_always_has_required_keys():
    """run_judge always returns the required top-level keys."""
    r = rubric("my-agent")
    t = trace([user(1, "hi"), agent_turn(2, "hello")])
    result = run_judge(t, r, use_llm=False)
    assert "trace_id" in result
    assert "agent" in result
    assert "overall_quality" in result
    assert "rule_scores" in result


def test_result_trace_id_and_agent_match_inputs():
    r = rubric("code-review-agent")
    t = trace([user(1, "Review my PR"), agent_turn(2, "Looks good.")], trace_id="TR-XYZ")
    result = run_judge(t, r, use_llm=False)
    assert result["trace_id"] == "TR-XYZ"
    assert result["agent"] == "code-review-agent"


def test_overall_quality_always_present_and_weak_when_llm_off():
    r = rubric()
    t = trace([user(1, "hi"), agent_turn(2, "hello")])
    result = run_judge(t, r, use_llm=False)
    oq = result["overall_quality"]
    assert oq["score"] == 3
    assert oq["verdict"] == "weak"
    assert isinstance(oq["reasoning"], str) and oq["reasoning"]


# ---------------------------------------------------------------------- no-llm mode

def test_no_llm_mode_all_rule_scores_weak():
    """With use_llm=False every judge-labelled item gets score=3 (weak)."""
    r = rubric(items=[
        item("U2", description="Decline out-of-scope requests"),
        item("U3", description="Handle missing info per policy"),
    ])
    t = trace([user(1, "What's the weather?"), agent_turn(2, "I can only help with tickets.")])
    result = run_judge(t, r, use_llm=False)
    for rs in result["rule_scores"]:
        assert rs["score"] == 3
        assert rs["verdict"] == "weak"
        assert rs["method"] == "none"


def test_no_llm_mode_no_llm_calls(monkeypatch):
    """With use_llm=False the LLM is never called."""
    called = []
    monkeypatch.setattr("understand.llm.complete_json", lambda *a, **k: called.append(1))
    r = rubric(items=[item("U2")])
    t = trace([user(1, "hi"), agent_turn(2, "hello")])
    run_judge(t, r, use_llm=False)
    assert called == []


# ---------------------------------------------------------------------- deterministic items are excluded

def test_deterministic_items_excluded_from_rule_scores():
    """Items with check='deterministic' are excluded; the judge skips them."""
    r = rubric(items=[
        {"rule_id": "R1", "description": "confirm before cancel", "kind": "must_always",
         "severity": "critical", "check": "deterministic", "source": "developer",
         "check_type": "confirm_before", "applies_to": ["cancel_booking"]},
        item("U2", description="Decline out-of-scope requests"),
    ])
    t = trace([user(1, "cancel booking"), agent_turn(2, "Done.", "cancel_booking")])
    result = run_judge(t, r, use_llm=False)
    rule_ids = [rs["rule_id"] for rs in result["rule_scores"]]
    assert "R1" not in rule_ids   # deterministic — belongs to checks.py
    assert "U2" in rule_ids       # judge item — present


# ---------------------------------------------------------------------- fake LLM pass/fail/weak

def test_fake_llm_pass_score():
    fake = FakeLLM(reply={"score": 5, "reasoning": "Agent was exemplary."})
    r = rubric(items=[item("U2", description="Decline out-of-scope")])
    t = trace([user(1, "What is 2+2?"), agent_turn(2, "That's out of scope, I handle support tickets.")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    rs = result["rule_scores"][0]
    assert rs["score"] == 5
    assert rs["verdict"] == "pass"
    assert rs["passed"] is True
    assert rs["method"] == "llm"
    assert "exemplary" in rs["reasoning"]


def test_fake_llm_fail_score():
    fake = FakeLLM(reply={"score": 1, "reasoning": "Agent clearly violated the rule."})
    r = rubric(items=[item("U2", description="Decline out-of-scope")])
    t = trace([user(1, "Write my essay"), agent_turn(2, "Sure, here you go...")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    rs = result["rule_scores"][0]
    assert rs["score"] == 1
    assert rs["verdict"] == "fail"
    assert rs["passed"] is False


def test_fake_llm_weak_score():
    fake = FakeLLM(reply={"score": 3, "reasoning": "Cannot determine from this conversation."})
    r = rubric(items=[item("U3", description="Handle ambiguity per policy")])
    t = trace([user(1, "Help me"), agent_turn(2, "What do you need help with?")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    rs = result["rule_scores"][0]
    assert rs["score"] == 3
    assert rs["verdict"] == "weak"
    assert rs["passed"] is False   # score 3 does not count as passed


# ---------------------------------------------------------------------- LLM failure safety

def test_llm_error_falls_back_to_weak_not_crash():
    """If the LLM raises LLMError the judge returns weak (3), never raises."""
    fake = FakeLLM(error=llm.LLMError("API down"))
    r = rubric(items=[item("U2"), item("U3")])
    t = trace([user(1, "hi"), agent_turn(2, "hello")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    for rs in result["rule_scores"]:
        assert rs["score"] == 3
        assert rs["verdict"] == "weak"
    assert result["overall_quality"]["score"] == 3


def test_llm_bad_json_reply_falls_back_to_weak():
    """A reply without the expected keys is treated as unavailable → weak."""
    fake = FakeLLM(reply={"unexpected": "junk"})
    r = rubric(items=[item("U2")])
    t = trace([user(1, "hi"), agent_turn(2, "hello")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    assert result["rule_scores"][0]["score"] == 3


def test_llm_invalid_score_value_falls_back_to_weak():
    """A score outside {1,3,5} for rule items is rejected → weak."""
    fake = FakeLLM(reply={"score": 4, "reasoning": "good"})  # 4 not in {1,3,5} for rule check
    r = rubric(items=[item("U2")])
    t = trace([user(1, "hi"), agent_turn(2, "hello")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    assert result["rule_scores"][0]["score"] == 3


# ---------------------------------------------------------------------- overall quality

def test_overall_quality_uses_llm():
    fake = FakeLLM(reply={"score": 4, "reasoning": "Agent was helpful and clear."})
    r = rubric(purpose="Help users with their support tickets.")
    t = trace([user(1, "My order is late"), agent_turn(2, "Let me check that for you.")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    oq = result["overall_quality"]
    assert oq["score"] == 4
    assert oq["verdict"] == "pass"
    assert "helpful" in oq["reasoning"]


def test_overall_quality_includes_purpose_in_prompt():
    """Agent purpose is forwarded to the LLM so it can judge appropriateness."""
    fake = FakeLLM(reply={"score": 5, "reasoning": "Perfect."})
    r = rubric(purpose="Assist with legal document review.")
    t = trace([user(1, "Review this clause"), agent_turn(2, "Clause 4 looks problematic.")])
    run_judge(t, r, complete_json=fake, use_llm=True)
    overall_prompt = fake.calls[-1]["prompt"]  # last call is overall quality
    assert "legal document review" in overall_prompt


def test_overall_score_1_is_fail():
    fake = FakeLLM(reply={"score": 1, "reasoning": "Agent was harmful."})
    r = rubric()
    t = trace([user(1, "help"), agent_turn(2, "No.")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    assert result["overall_quality"]["verdict"] == "fail"


def test_overall_score_3_is_weak():
    fake = FakeLLM(reply={"score": 3, "reasoning": "Acceptable but not great."})
    r = rubric()
    t = trace([user(1, "help"), agent_turn(2, "Here.")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    assert result["overall_quality"]["verdict"] == "weak"


# ---------------------------------------------------------------------- agent agnosticism

def test_travel_agent_no_domain_specific_code():
    """Travel agent trace scores correctly with no domain-specific judge logic."""
    fake = FakeLLM(reply={"score": 5, "reasoning": "Provided a clear and safe itinerary."})
    r = rubric(
        agent="trip-planner-agent",
        purpose="Plan travel itineraries for users.",
        items=[
            item("U2", description="Only plan travel; decline medical or legal advice"),
            item("U3", description="If destination is unclear, ask once before proceeding"),
        ],
    )
    t = trace([
        user(1, "Plan a 3-day trip to Paris"),
        agent_turn(2, "Here's a 3-day Paris itinerary...", "search_flights", "search_hotels"),
    ])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    assert result["agent"] == "trip-planner-agent"
    assert len(result["rule_scores"]) == 2
    assert all(rs["method"] == "llm" for rs in result["rule_scores"])


def test_code_review_agent_no_domain_specific_code():
    """Code review agent trace scores correctly."""
    fake = FakeLLM(reply={"score": 1, "reasoning": "Agent approved dangerous code without warning."})
    r = rubric(
        agent="code-review-agent",
        purpose="Review code for bugs and security issues.",
        items=[item("R1", description="Always flag potential SQL injection vulnerabilities")],
    )
    t = trace([
        user(1, "Review this: SELECT * FROM users WHERE id=" + "'" + " + user_id"),
        agent_turn(2, "Code looks fine, no issues found."),
    ])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    assert result["agent"] == "code-review-agent"
    rs = result["rule_scores"][0]
    assert rs["verdict"] == "fail"
    assert rs["score"] == 1


def test_empty_rule_scores_when_no_judge_items():
    """If the rubric has no judge items, rule_scores is empty but overall_quality is present."""
    fake = FakeLLM(reply={"score": 4, "reasoning": "Good overall."})
    r = rubric(items=[
        {"rule_id": "R1", "description": "confirm before cancel", "kind": "must_always",
         "severity": "critical", "check": "deterministic", "source": "developer",
         "check_type": "confirm_before", "applies_to": ["cancel"]},
    ])
    t = trace([user(1, "cancel"), agent_turn(2, "Are you sure?"), user(3, "Yes"), agent_turn(4, "Done.", "cancel")])
    result = run_judge(t, r, complete_json=fake, use_llm=True)
    assert result["rule_scores"] == []
    assert result["overall_quality"]["score"] == 4


# ---------------------------------------------------------------------- severity field preserved

def test_severity_is_preserved_in_result():
    for sev in ("critical", "major", "minor"):
        fake = FakeLLM(reply={"score": 5, "reasoning": "ok"})
        r = rubric(items=[item("U2", severity=sev)])
        t = trace([user(1, "hi"), agent_turn(2, "hi")])
        result = run_judge(t, r, complete_json=fake, use_llm=True)
        assert result["rule_scores"][0]["severity"] == sev


# ---------------------------------------------------------------------- multiple rule items

def test_multiple_judge_items_all_scored():
    """All judge-labelled items get a score, even if some fail and some pass."""
    replies = [
        {"score": 5, "reasoning": "Followed rule."},
        {"score": 1, "reasoning": "Broke rule."},
        {"score": 3, "reasoning": "Could not decide."},
        {"score": 4, "reasoning": "Mostly fine."},  # overall quality
    ]
    call_count = 0

    def fake_llm(prompt, system="", use_cache=True):
        nonlocal call_count
        r = replies[min(call_count, len(replies) - 1)]
        call_count += 1
        return r

    r = rubric(items=[
        item("U2", description="Decline out-of-scope requests"),
        item("U3", description="Handle ambiguity per policy"),
    ])
    t = trace([user(1, "help"), agent_turn(2, "here")])
    result = run_judge(t, r, complete_json=fake_llm, use_llm=True)
    assert len(result["rule_scores"]) == 2
    assert result["rule_scores"][0]["verdict"] == "pass"
    assert result["rule_scores"][1]["verdict"] == "fail"
