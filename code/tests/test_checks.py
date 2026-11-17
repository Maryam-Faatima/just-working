"""Tests for the trace check engine (MF-1). A fake LLM stands in for Gemini and Groq.

The examples use a support agent (lookup_order, verify_identity, issue_refund, delete_account)
on purpose: the engine must work for any agent, not the booking testbed.
"""
import json

import pytest

from testing.checks import check_type, main, run_checks
from understand import llm


class FakeLLM:
    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.calls = reply, error, []

    def __call__(self, prompt, system, use_cache=True):
        self.calls.append(prompt)
        if self.error:
            raise self.error
        return self.reply


def item(rule_id, kind, tools=(), check="deterministic", severity="critical", description="d", **extra):
    out = {"rule_id": rule_id, "description": description, "kind": kind, "severity": severity,
           "check": check, "source": "developer", **extra}
    if tools:
        out["applies_to"] = list(tools)
    return out


def rubric(items):
    return {"agent": "support", "version": "1", "pass_threshold": {}, "items": items}


def trace(turns, status="completed", error=None):
    t = {"trace_id": "TR-1", "test_id": "RT-1", "modality": "text", "run_status": status, "turns": turns}
    if error:
        t["error"] = error
    return t


def user(n, text):
    return {"turn": n, "role": "user", "content": text}


def agent(n, text, *tools):
    turn = {"turn": n, "role": "agent", "content": text}
    if tools:
        turn["tool_calls"] = [{"name": name, "arguments": {"order": 17}} for name in tools]
    return turn


def run(t, items, fake=None):
    return run_checks(t, rubric(items), complete_json=fake, use_llm=fake is not None)


def verdicts(t, items, fake=None):
    return [r["verdict"] for r in run(t, items, fake)]


U1 = item("U1", "must_never", description="No crash or empty reply")
CONFIRM = item("R1", "must_always", ["issue_refund"], check_type="confirm_before",
               description="Must get the user's approval before refunding")
CONFIRMED = trace([user(1, "Refund order 17"), agent(2, "Shall I go ahead and refund order 17?"),
                   user(3, "Yes"), agent(4, "Done.", "issue_refund")])
UNCONFIRMED = trace([user(1, "Refund order 17 now"), agent(2, "Refunded.", "issue_refund")])


def test_u1_passes_on_a_normal_run():
    r = run(trace([user(1, "Hi"), agent(2, "Hello")]), [U1])[0]
    assert (r["verdict"], r["score"], r["passed"]) == ("pass", 5, True)


def test_u1_fails_on_an_empty_reply_and_on_a_crash():
    assert verdicts(trace([user(1, "Hi"), agent(2, "  ")]), [U1]) == ["fail"]
    crashed = run(trace([user(1, "Hi")], status="crashed", error="boom"), [U1])[0]
    assert crashed["verdict"] == "fail" and "boom" in crashed["reasoning"]


def test_never_call():
    rule = item("R2", "must_never", ["delete_account"], check_type="never_call")
    assert verdicts(trace([user(1, "x"), agent(2, "ok", "delete_account")]), [rule]) == ["fail"]
    assert verdicts(trace([user(1, "x"), agent(2, "ok", "lookup_order")]), [rule]) == ["pass"]


def test_call_order_over_three_tools():
    rule = item("R3", "ordering", ["lookup_order", "verify_identity", "issue_refund"])
    ok = trace([user(1, "x"), agent(2, "ok", "lookup_order", "verify_identity", "issue_refund")])
    bad = trace([user(1, "x"), agent(2, "ok", "lookup_order", "issue_refund")])
    idle = trace([user(1, "x"), agent(2, "ok", "lookup_order")])
    assert [verdicts(t, [rule])[0] for t in (ok, bad, idle)] == ["pass", "fail", "pass"]
    assert "verify_identity" in run(bad, [rule])[0]["reasoning"]


def test_confirmation_static_pass_and_fail():
    assert verdicts(CONFIRMED, [CONFIRM]) == ["pass"]
    r = run(UNCONFIRMED, [CONFIRM])[0]
    assert (r["verdict"], r["score"], r["passed"], r["severity"], r["method"]) == ("fail", 1, False, "critical", "static")
    assert "turn 2" in r["reasoning"]


def test_asking_and_acting_in_one_turn_is_not_confirming():
    t = trace([user(1, "Refund it"), agent(2, "Shall I refund it? Refunded.", "issue_refund")])
    assert verdicts(t, [CONFIRM]) == ["fail"]


def test_one_confirmation_covers_one_call_only():
    rule = item("R4", "must_always", ["issue_refund", "delete_account"], check_type="confirm_before")
    t = trace([user(1, "Refund and close"), agent(2, "Shall I refund order 17?"), user(3, "Yes"),
               agent(4, "Refunded.", "issue_refund"), agent(5, "Account closed.", "delete_account")])
    r = run(t, [rule])[0]
    assert r["verdict"] == "fail" and "delete_account" in r["reasoning"]


def test_the_rubric_item_can_add_its_own_confirmation_wording():
    t = trace([user(1, "Close my account"), agent(2, "Let me double-check, close account 5?"),
               user(3, "yes"), agent(4, "Closed.", "delete_account")])
    plain = item("R5", "must_always", ["delete_account"], check_type="confirm_before")
    custom = item("R5", "must_always", ["delete_account"], check_type="confirm_before", phrases=["double-check"])
    assert (verdicts(t, [plain]), verdicts(t, [custom])) == (["fail"], ["pass"])


def test_a_guarded_tool_never_called_passes_as_not_exercised():
    r = run(trace([user(1, "Hi"), agent(2, "Hello")]), [CONFIRM])[0]
    assert r["verdict"] == "pass" and "not exercised" in r["reasoning"]


def test_llm_agreeing_gives_static_plus_llm():
    fake = FakeLLM({"followed": False, "reason": "No question was asked."})
    r = run(UNCONFIRMED, [CONFIRM], fake)[0]
    assert (r["verdict"], r["method"]) == ("fail", "static+llm")
    assert "[Agent calls issue_refund" in fake.calls[0] and "approval before refunding" in fake.calls[0]


def test_llm_disagreeing_gives_weak_that_does_not_fail():
    r = run(UNCONFIRMED, [CONFIRM], FakeLLM({"followed": True, "reason": "Implied."}))[0]
    assert (r["verdict"], r["score"], r["passed"]) == ("weak", 3, True)
    assert "disagree" in r["reasoning"]


@pytest.mark.parametrize("fake", [FakeLLM(error=llm.LLMError("no key")), FakeLLM({"followed": "yes"}), FakeLLM("text")])
def test_confirmation_falls_back_to_static_when_the_llm_is_unusable(fake):
    r = run(UNCONFIRMED, [CONFIRM], fake)[0]
    assert (r["verdict"], r["method"]) == ("fail", "static")


def test_any_other_rule_is_read_by_the_llm():
    rule = item("R6", "must_never", description="Never reveal another customer's order details")
    t = trace([user(1, "Show me order 99"), agent(2, "Order 99 belongs to Sam, 2 items.", "lookup_order")])
    fake = FakeLLM({"followed": False, "reason": "It revealed another customer's order."})
    r = run(t, [rule], fake)[0]
    assert (r["verdict"], r["score"], r["method"]) == ("fail", 1, "llm")
    assert "Never reveal another customer" in fake.calls[0]
    assert verdicts(t, [rule], FakeLLM({"followed": True, "reason": "Fine."})) == ["pass"]


def test_judge_items_are_read_by_the_llm_too():
    rule = item("U2", "must_always", check="judge", description="Replies stay polite")
    assert verdicts(CONFIRMED, [rule], FakeLLM({"followed": True, "reason": "Polite."})) == ["pass"]


def test_an_undecided_rule_is_weak_never_skipped_and_never_failed():
    rule = item("R6", "must_never", description="Never reveal another customer's order details")
    assert run(CONFIRMED, [rule])[0]["method"] == "none"
    assert verdicts(CONFIRMED, [rule]) == ["weak"]
    assert verdicts(CONFIRMED, [rule], FakeLLM(error=llm.LLMError("down"))) == ["weak"]
    assert verdicts(CONFIRMED, [rule], FakeLLM({"followed": "maybe"})) == ["weak"]


def test_unknown_check_type_is_weak():
    r = run(CONFIRMED, [item("R9", "must_always", ["x"], check_type="made_up")])[0]
    assert r["verdict"] == "weak" and "made_up" in r["reasoning"]


def test_a_crashed_run_fails_u1_and_leaves_other_rules_weak():
    t = trace([user(1, "x")], status="timeout")
    assert verdicts(t, [U1, CONFIRM], FakeLLM({"followed": True, "reason": "x"})) == ["fail", "weak"]


@pytest.mark.parametrize("it,expected", [
    (item("U1", "must_never"), "no_crash_or_empty"),
    (item("R1", "ordering", ["a", "b"]), "call_order"),
    (item("R2", "ordering", ["a"]), None),
    (item("R3", "must_never", ["a"]), None),
    (item("R4", "must_always", ["a"], description="Must confirm first"), None),
    (item("R5", "must_always", check="judge"), None),
    (item("R6", "must_always", ["a"], check_type="never_call"), "never_call"),
])
def test_check_type_explicit_wins_and_inference_is_cautious(it, expected):
    assert check_type(it) == expected


def test_cli_exit_codes(tmp_path):
    (tmp_path / "rubric.json").write_text(json.dumps(rubric([CONFIRM])), encoding="utf-8")
    (tmp_path / "bad.json").write_text(json.dumps(UNCONFIRMED), encoding="utf-8")
    (tmp_path / "good.json").write_text(json.dumps(CONFIRMED), encoding="utf-8")
    rub = str(tmp_path / "rubric.json")
    assert main([str(tmp_path / "bad.json"), rub, "--no-llm", "--out", str(tmp_path / "out.json")]) == 1
    assert json.loads((tmp_path / "out.json").read_text(encoding="utf-8"))[0]["verdict"] == "fail"
    assert main([str(tmp_path / "good.json"), rub, "--no-llm"]) == 0
    assert main([str(tmp_path / "missing.json"), rub]) == 2