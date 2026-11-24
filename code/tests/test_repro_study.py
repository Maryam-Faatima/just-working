"""Tests for the reproducibility study (EH-6), including a run on the LangChain example agent."""
import json
from pathlib import Path

import jsonschema
import pytest

from testing.adapter import AgentCrashed, TurnResult
from testing.backends import PythonModuleBackend
from testing.repro_study import main, rules_for, run_verdict, save, stability, study, to_markdown

ROOT = Path(__file__).resolve().parents[1]
RUBRIC = {"items": [
    {"rule_id": "U1", "target_id": None},
    {"rule_id": "R1", "target_id": "con_001"},
    {"rule_id": "R2", "target_id": "con_002"},
]}


def res(rule_id, verdict, method="program"):
    return {"rule_id": rule_id, "verdict": verdict, "method": method}


def spec(test_id="T-1", target="con_001", persona="pushy user", script=("hi", "again")):
    return {"test_id": test_id, "target_id": target, "category": "constraint_probing", "persona": persona,
            "goal": "g", "success_criteria": "s", "difficulty": 5, "turn_budget": 4, "modality": "text",
            "generated_by": "seed", "script": list(script)}


# ---------------------------------------------------------------- which rules, which verdict

def test_a_test_is_judged_on_its_target_rules_plus_u1():
    assert rules_for(spec(target="con_001"), RUBRIC) == ["R1", "U1"]


def test_a_test_with_no_matching_rule_is_judged_on_every_rule():
    assert rules_for(spec(target="cap_009"), RUBRIC) == ["U1", "R1", "R2"]


@pytest.mark.parametrize("results, verdict", [
    ([res("U1", "pass"), res("R1", "pass")], "pass"),
    ([res("U1", "pass"), res("R1", "weak")], "weak"),
    ([res("U1", "pass"), res("R1", "fail")], "fail"),
    ([res("U1", "pass"), res("R1", "weak", "none")], "unchecked"),   # U1 alone cannot pass a test
    ([res("U1", "fail"), res("R1", "weak", "none")], "fail"),        # but a crash fails it
    ([res("U1", "pass"), res("R1", "fail"), res("R2", "weak", "none")], "fail"),
])
def test_verdict_comes_from_decided_rules_only(results, verdict):
    assert run_verdict(results, ["U1", "R1", "R2"])[0] == verdict


def test_failed_and_unchecked_rules_are_listed():
    _, failed, unchecked = run_verdict([res("U1", "pass"), res("R1", "fail"), res("R2", "weak", "none")], ["U1", "R1", "R2"])
    assert failed == ["R1"] and unchecked == ["R2"]


@pytest.mark.parametrize("verdicts, modal, share, flips", [
    (["pass"] * 10, "pass", 1.0, 0),
    (["fail", "fail", "pass", "fail", "fail"], "fail", 0.8, 2),
    (["pass", "fail", "pass", "fail"], "pass", 0.5, 3),
])
def test_stability_is_the_share_of_the_most_common_verdict(verdicts, modal, share, flips):
    s = stability(verdicts)
    assert (s["modal_verdict"], s["stability"], s["flips"]) == (modal, share, flips)


# ---------------------------------------------------------------- the whole study with a fake agent and fake checks

class Echo:
    def run_turn(self, user_messages):
        return TurnResult(reply="ok", tool_calls=[])


class Crash:
    def run_turn(self, user_messages):
        raise AgentCrashed("boom")


def fake_checks(verdicts):
    """Returns the next verdict for R1 on each call, so verdicts can change between runs."""
    queue = list(verdicts)

    def check(trace, rubric):
        if trace["run_status"] != "completed":
            return [res("U1", "fail"), res("R1", "weak", "none")]
        return [res("U1", "pass"), res("R1", queue.pop(0))]
    return check


def test_study_measures_stability_per_test_and_persona(tmp_path):
    specs = [spec("T-1", persona="pushy user"), spec("T-2", persona="pushy user")]
    result = study(specs, RUBRIC, Echo, 4, tmp_path, None,
                   fake_checks(["fail", "fail", "pass", "fail", "pass", "pass", "pass", "pass"]))
    t1, t2 = result["tests"]
    assert [r["verdict"] for r in t1["runs"]] == ["fail", "fail", "pass", "fail"]
    assert (t1["stability"], t1["flips"], t2["stability"]) == (0.75, 2, 1.0)
    assert result["by_persona"] == [{"persona": "pushy user", "tests": ["T-1", "T-2"], "mean_stability": 0.875}]
    assert result["overall"]["fully_stable_tests"] == 1 and result["overall"]["runs"] == 8
    assert len(list((tmp_path / "repro_traces").iterdir())) == 8


def test_crashes_count_as_failed_runs(tmp_path):
    result = study([spec()], RUBRIC, Crash, 2, tmp_path, None, fake_checks([]))
    assert [r["verdict"] for r in result["tests"][0]["runs"]] == ["fail", "fail"]
    assert result["overall"]["crashed"] == 2


def test_unscripted_spec_without_simulator_is_not_run(tmp_path):
    result = study([spec(script=())], RUBRIC, Echo, 2, tmp_path, None, fake_checks([]))
    assert result["tests"][0]["status"] == "not_run" and result["overall"]["tests_not_run"] == 1


def test_results_are_saved_as_json_and_markdown(tmp_path):
    result = study([spec()], RUBRIC, Echo, 2, tmp_path, None, fake_checks(["pass", "fail"]))
    result["meta"] = {"agent": "fake", "mode": "test"}
    paths = save(result, tmp_path)
    assert json.loads(paths[0].read_text(encoding="utf-8"))["overall"]["runs"] == 2
    assert "| T-1 | pushy user | P F | pass | 50% | 1 |" in to_markdown(result)


def test_python_target_needs_an_entry_point(tmp_path):
    (tmp_path / "x").mkdir()
    for name in ("test_specs.json", "rubric.json"):
        (tmp_path / "x" / name).write_text(json.dumps([] if name.startswith("test") else {"items": []}), encoding="utf-8")
    with pytest.raises(SystemExit):
        main(["--name", "x", "--out", str(tmp_path), "--target", "python", "--agent-dir", str(tmp_path)])


# ---------------------------------------------------------------- the LangChain example agent (GreatTest is not travel-specific)

LANGCHAIN_AGENT = ROOT / "fixtures" / "agents" / "langchain_agent"


def test_study_on_a_langchain_agent_finds_the_planted_flaw(tmp_path):
    pytest.importorskip("langgraph")
    specs = json.loads((ROOT / "fixtures" / "langchain_seed_specs.json").read_text(encoding="utf-8"))
    rubric = json.loads((ROOT / "fixtures" / "langchain_rubric.json").read_text(encoding="utf-8"))
    from testing.checks import run_checks
    result = study(specs, rubric, lambda: PythonModuleBackend(LANGCHAIN_AGENT, "agent.py:graph"), 2, tmp_path, None,
                   lambda trace, rub: run_checks(trace, rub, use_llm=False))
    verdicts = {t["test_id"]: t["modal_verdict"] for t in result["tests"]}
    assert verdicts["LC-102"] == "fail" and verdicts["LC-104"] == "fail"  # cancels without asking to confirm
    assert verdicts["LC-101"] == "pass"
    assert result["overall"]["mean_stability"] == 1.0


def test_fixtures_fit_the_contracts():
    spec_schema = json.loads((ROOT / "schemas" / "test_spec.schema.json").read_text(encoding="utf-8"))
    for s in json.loads((ROOT / "fixtures" / "langchain_seed_specs.json").read_text(encoding="utf-8")):
        jsonschema.validate(s, spec_schema)
    for name in ("langchain_rubric.json", "travel_rubric.json"):
        jsonschema.validate(json.loads((ROOT / "fixtures" / name).read_text(encoding="utf-8")),
                            json.loads((ROOT / "schemas" / "rubric.schema.json").read_text(encoding="utf-8")))
