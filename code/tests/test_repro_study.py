"""Tests for the reproducibility study (EH-6), including a run on the LangChain example agent."""
import json
from pathlib import Path

import jsonschema
import pytest

from testing.adapter import AgentCrashed, TurnResult
from testing.backends import PythonModuleBackend
from testing.repro_study import SetupProblem, main, rules_for, run_verdict, save, stability, study, to_markdown

ROOT = Path(__file__).resolve().parents[1]
LANGCHAIN_AGENT = ROOT / "fixtures" / "agents" / "langchain_agent"
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
    result = study([spec()], RUBRIC, Crash, 2, tmp_path, None, fake_checks([]), max_setup_failures=0)
    assert [r["verdict"] for r in result["tests"][0]["runs"]] == ["fail", "fail"]
    assert result["overall"]["crashed"] == 2


def test_study_stops_early_when_the_first_runs_all_fail_to_complete(tmp_path):
    with pytest.raises(SetupProblem, match="first 3 runs all ended as crashed"):
        study([spec("T-1"), spec("T-2")], RUBRIC, Crash, 5, tmp_path, None, fake_checks([]))
    assert len(list((tmp_path / "repro_traces").iterdir())) == 3  # stopped after 3 runs, not 10


def test_one_completed_run_among_the_first_ones_lets_the_study_continue(tmp_path):
    class Flaky:
        calls = 0

        def run_turn(self, user_messages):
            Flaky.calls += 1
            if Flaky.calls <= 2:  # the first conversation crashes, the rest work
                raise AgentCrashed("boom")
            return TurnResult(reply="ok", tool_calls=[])
    result = study([spec()], RUBRIC, Flaky, 3, tmp_path, None, fake_checks(["pass", "pass", "pass"]))
    assert result["overall"]["runs"] == 3


def test_unscripted_spec_without_simulator_is_not_run(tmp_path):
    result = study([spec(script=())], RUBRIC, Echo, 2, tmp_path, None, fake_checks([]))
    assert result["tests"][0]["status"] == "not_run" and result["overall"]["tests_not_run"] == 1


def test_results_are_saved_as_json_and_markdown(tmp_path):
    result = study([spec()], RUBRIC, Echo, 2, tmp_path, None, fake_checks(["pass", "fail"]))
    result["meta"] = {"agent": "fake", "mode": "test"}
    paths = save(result, tmp_path)
    assert json.loads(paths[0].read_text(encoding="utf-8"))["overall"]["runs"] == 2
    assert "| T-1 | pushy user | P F | pass | 50% (2) | 1 |" in to_markdown(result)


def _write_inputs(folder, specs, rubric=None):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "test_specs.json").write_text(json.dumps(specs), encoding="utf-8")
    (folder / "rubric.json").write_text(json.dumps(rubric or {"items": [{"rule_id": "U1", "description": "x", "kind": "must_always",
                                                    "severity": "critical", "check": "deterministic", "source": "default",
                                                    "check_type": "no_crash_or_empty"}]}), encoding="utf-8")


def test_the_study_says_how_to_reach_an_agent_when_none_is_given(tmp_path):
    _write_inputs(tmp_path / "x", [spec()])
    with pytest.raises(SystemExit):
        main(["--name", "x", "--out", str(tmp_path), "--no-llm"])


def test_agent_settings_must_be_key_value(tmp_path):
    _write_inputs(tmp_path / "x", [spec()])
    with pytest.raises(SystemExit):
        main(["--name", "x", "--out", str(tmp_path), "--agent-dir", str(tmp_path), "--entry-point", "a.py:f",
              "--agent-env", "NOEQUALS", "--no-llm"])


def test_agent_settings_reach_any_python_agent(tmp_path, monkeypatch):
    agent = tmp_path / "agent"
    agent.mkdir()
    (agent / "bot.py").write_text("import os\n\ndef respond(messages):\n    return 'mode=' + os.environ.get('MY_AGENT_MODE', 'none')\n",
                                  encoding="utf-8")
    monkeypatch.delenv("MY_AGENT_MODE", raising=False)
    _write_inputs(tmp_path / "out" / "x", [spec(script=("hi",))])
    assert main(["--name", "x", "--out", str(tmp_path / "out"), "--agent-dir", str(agent), "--entry-point", "bot.py:respond",
                 "--agent-env", "MY_AGENT_MODE=live", "--repeats", "1", "--no-llm"]) == 0
    trace = json.loads((tmp_path / "out" / "x" / "repro_traces" / "T-1_run1.json").read_text(encoding="utf-8"))
    assert trace["turns"][1]["content"] == "mode=live"
    result = json.loads((tmp_path / "out" / "x" / "repro_study.json").read_text(encoding="utf-8"))
    assert "MY_AGENT_MODE=live" in result["meta"]["mode"]


def test_a_langgraph_agent_is_found_from_langgraph_json_with_no_entry_point(tmp_path):
    pytest.importorskip("langgraph")
    import shutil

    from testing.repro_study import choose_agent
    agent = tmp_path / "agent"
    shutil.copytree(LANGCHAIN_AGENT, agent)
    (agent / "langgraph.json").write_text(json.dumps({"graphs": {"orders": "./agent.py:graph"}}), encoding="utf-8")
    factory, how = choose_agent(str(agent), {}, None, None, {})
    assert factory is not None and "langgraph.json" in how
    assert "shipped" in factory().run_turn(["Where is my order A100?"]).reply


def test_the_travel_agent_gets_its_settings_like_any_other(tmp_path):
    from testing.adapter import TARGET_AGENT_DIR
    from testing.repro_study import choose_agent
    factory, how = choose_agent(str(TARGET_AGENT_DIR), {}, None, None, {"DATA_MODE": "live"})
    assert how == "travel agent" and factory().env["DATA_MODE"] == "live"


# ---------------------------------------------------------------- the LangChain example agent (GreatTest is not travel-specific)

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


def test_unchecked_runs_are_not_counted_as_flips():
    s = stability(["pass", "pass", "unchecked", "unchecked", "pass"])
    assert (s["modal_verdict"], s["stability"], s["flips"], s["decided_runs"]) == ("pass", 1.0, 0, 3)


def test_a_test_with_no_decided_run_has_no_stability():
    s = stability(["unchecked"] * 4)
    assert s["stability"] is None and s["modal_verdict"] == "unchecked" and s["decided_runs"] == 0
