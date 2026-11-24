"""Tests for the test runner (EH-3). Fake backends stand in for the agent, so no agent runs."""
import json

import pytest

from testing.adapter import AgentCrashed, AgentTimedOut, TurnResult, validate_trace
from datetime import date
from pathlib import Path

from testing.runner import (
    DEFAULT_REPEATS,
    expand_script,
    load_test_specs,
    repeats_for,
    run,
    run_test,
    spec_problem,
)


def make_spec(test_id="RT-1", script=("hello", "my date is tomorrow"), **extra):
    spec = {"test_id": test_id, "target_id": "con_001", "category": "argument_ambiguity",
            "persona": "a traveller", "goal": "book a trip", "success_criteria": "asks for the date",
            "difficulty": 2, "turn_budget": 4, "modality": "text", "generated_by": "seed"}
    if script is not None:
        spec["script"] = list(script)
    spec.update(extra)
    return spec


class EchoBackend:
    def run_turn(self, user_messages):
        return TurnResult(reply=f"you said: {user_messages[-1]}", tool_calls=[{"name": "search_flights", "arguments": {}}])


class CrashBackend:
    def run_turn(self, user_messages):
        raise AgentCrashed("boom")


class TimeoutBackend:
    def run_turn(self, user_messages):
        raise AgentTimedOut("too slow")


def ctx_for(tmp_path, specs, backend=EchoBackend, repeats=None, simulator=None):
    # No simulator unless a test passes one: unit tests never call a real LLM.
    ctx = {"name": "fake", "folder": tmp_path, "test_specs": specs, "backend_factory": backend, "simulator": simulator}
    if repeats is not None:
        ctx["spec"] = {"run_config": {"repeats": repeats}}
    return ctx


def test_each_spec_runs_the_requested_number_of_times(tmp_path):
    ctx = ctx_for(tmp_path, [make_spec("RT-1"), make_spec("RT-2")], repeats=2)
    detail = run(ctx)
    assert detail == "2 test(s) x 2 run(s): 4 completed, 0 crashed, 0 timed out"
    assert sorted(p.name for p in (tmp_path / "traces").iterdir()) == [
        "RT-1_run1.json", "RT-1_run2.json", "RT-2_run1.json", "RT-2_run2.json"]
    assert len(ctx["traces"]) == 4


def test_saved_traces_are_valid_and_follow_the_script(tmp_path):
    run(ctx_for(tmp_path, [make_spec()], repeats=1))
    trace = json.loads((tmp_path / "traces" / "RT-1_run1.json").read_text(encoding="utf-8"))
    validate_trace(trace)
    assert [t["content"] for t in trace["turns"] if t["role"] == "user"] == ["hello", "my date is tomorrow"]
    assert trace["test_id"] == "RT-1"


def test_turn_budget_limits_the_messages_sent(tmp_path):
    spec = make_spec(script=["one", "two", "three"], turn_budget=2)
    run(ctx_for(tmp_path, [spec], repeats=1))
    trace = json.loads((tmp_path / "traces" / "RT-1_run1.json").read_text(encoding="utf-8"))
    assert [t["content"] for t in trace["turns"] if t["role"] == "user"] == ["one", "two"]


def test_crash_is_recorded_and_the_runner_carries_on(tmp_path):
    ctx = ctx_for(tmp_path, [make_spec("RT-1"), make_spec("RT-2")], backend=CrashBackend, repeats=1)
    assert run(ctx) == "2 test(s) x 1 run(s): 0 completed, 2 crashed, 0 timed out"
    assert all(t["run_status"] == "crashed" and t["error"] == "boom" for t in ctx["traces"])
    assert all(len(t["turns"]) == 1 for t in ctx["traces"])  # stopped after the first message


def test_timeout_is_recorded_never_a_hang(tmp_path):
    ctx = ctx_for(tmp_path, [make_spec()], backend=TimeoutBackend, repeats=1)
    assert run(ctx).endswith("0 completed, 0 crashed, 1 timed out")
    assert ctx["traces"][0]["run_status"] == "timeout"


def test_spec_without_script_is_listed_as_not_run(tmp_path):
    ctx = ctx_for(tmp_path, [make_spec("RT-1"), make_spec("RT-2", script=None)], repeats=1)
    assert run(ctx).endswith("; 1 not run (unscripted tests need the user simulator)")
    not_run = ctx["test_run"]["tests"][1]
    assert not_run["status"] == "not_run" and "simulator" in not_run["reason"]


def test_invalid_spec_is_reported_not_run(tmp_path):
    bad = make_spec(difficulty=11)  # the schema allows 1 to 10
    ctx = ctx_for(tmp_path, [bad], repeats=1)
    run(ctx)
    result = ctx["test_run"]["tests"][0]
    assert result["status"] == "invalid" and result["runs"] == 0
    assert spec_problem(bad).startswith("invalid test spec")


def test_test_run_summary_is_written_without_trace_bodies(tmp_path):
    run(ctx_for(tmp_path, [make_spec()], repeats=2))
    record = json.loads((tmp_path / "test_run.json").read_text(encoding="utf-8"))
    assert record["repeats"] == 2 and record["totals"] == {"completed": 2, "crashed": 0, "timeout": 0}
    assert record["tests"][0]["traces"] == ["RT-1_run1.json", "RT-1_run2.json"]
    assert "_traces" not in record["tests"][0]


def test_no_specs_means_nothing_to_run(tmp_path):
    assert run({"name": "fake", "folder": tmp_path}) == "no test specs yet"
    assert not (tmp_path / "test_run.json").exists()


def test_specs_are_loaded_from_the_output_folder(tmp_path):
    (tmp_path / "test_specs.json").write_text(json.dumps([make_spec()]), encoding="utf-8")
    assert [s["test_id"] for s in load_test_specs({"folder": tmp_path})] == ["RT-1"]


@pytest.mark.parametrize("given, expected", [(None, DEFAULT_REPEATS), (5, 5), (0, 1), (99, 20), ("x", DEFAULT_REPEATS)])
def test_repeats_come_from_phase0_and_stay_in_range(given, expected):
    ctx = {} if given is None else {"spec": {"run_config": {"repeats": given}}}
    assert repeats_for(ctx) == expected


def test_run_test_counts_each_outcome(tmp_path):
    summary = run_test(make_spec(), EchoBackend, 3, tmp_path)
    assert summary["status"] == "ran" and summary["completed"] == 3 and summary["runs"] == 3


def test_date_placeholder_becomes_a_future_date():
    out = expand_script(["leave on {date+40}", "back on {date+45}", "no date"], today=date(2026, 11, 14))
    assert out == ["leave on 2026-12-24", "back on 2026-12-29", "no date"]


def test_placeholder_is_filled_in_before_sending(tmp_path):
    run(ctx_for(tmp_path, [make_spec(script=["fly on {date+1}"])], repeats=1))
    trace = json.loads((tmp_path / "traces" / "RT-1_run1.json").read_text(encoding="utf-8"))
    assert "{date" not in trace["turns"][0]["content"]


SEEDS = Path(__file__).resolve().parents[1] / "fixtures" / "travel_seed_specs.json"


def test_travel_seed_specs_are_valid_and_scripted():
    specs = json.loads(SEEDS.read_text(encoding="utf-8"))
    assert len({s["test_id"] for s in specs}) == len(specs) >= 6  # unique ids
    assert all(spec_problem(s) is None for s in specs)  # valid and every one has a script


class ScriptedSimulator:
    """Returns the given messages in order, then None (done). Records what it was shown."""

    def __init__(self, messages, error=None):
        self.messages, self.error, self.seen = list(messages), error, []

    def next_message(self, spec, turns):
        self.seen.append(list(turns))
        if self.error:
            raise self.error
        return self.messages.pop(0) if self.messages else None


def user_messages(tmp_path, name="RT-1_run1.json"):
    trace = json.loads((tmp_path / "traces" / name).read_text(encoding="utf-8"))
    return [t["content"] for t in trace["turns"] if t["role"] == "user"]


def test_simulator_continues_after_the_script(tmp_path):
    sim = ScriptedSimulator(["simulated one", "simulated two"])
    ctx = ctx_for(tmp_path, [make_spec(script=["scripted"])], repeats=1, simulator=sim)
    run(ctx)
    assert user_messages(tmp_path) == ["scripted", "simulated one", "simulated two"]
    assert ctx["test_run"]["tests"][0]["simulated_messages"] == 2
    assert len(sim.seen[0]) == 2  # it saw the scripted message and the agent's reply


def test_simulator_writes_the_opening_message_when_there_is_no_script(tmp_path):
    run(ctx_for(tmp_path, [make_spec(script=None)], repeats=1, simulator=ScriptedSimulator(["hello there"])))
    assert user_messages(tmp_path) == ["hello there"]


def test_turn_budget_also_limits_simulated_messages(tmp_path):
    sim = ScriptedSimulator(["s1", "s2", "s3", "s4", "s5"])
    run(ctx_for(tmp_path, [make_spec(script=["scripted"], turn_budget=3)], repeats=1, simulator=sim))
    assert user_messages(tmp_path) == ["scripted", "s1", "s2"]


def test_simulator_done_ends_the_conversation_early(tmp_path):
    run(ctx_for(tmp_path, [make_spec(script=["scripted"])], repeats=1, simulator=ScriptedSimulator([])))
    assert user_messages(tmp_path) == ["scripted"]


def test_failing_simulator_falls_back_to_scripts_and_says_why(tmp_path):
    from testing.simulator import SimulatorUnavailable
    sim = ScriptedSimulator([], error=SimulatorUnavailable("GEMINI_API_KEY not set"))
    ctx = ctx_for(tmp_path, [make_spec("RT-1"), make_spec("RT-2", script=None)], repeats=1, simulator=sim)
    detail = run(ctx)
    assert "user simulator off: GEMINI_API_KEY not set" in detail
    assert ctx["test_run"]["tests"][0]["status"] == "ran"  # the scripted test still ran
    assert ctx["test_run"]["tests"][1]["status"] == "not_run"  # nothing could start the unscripted one
    assert ctx["test_run"]["simulator_note"].startswith("user simulator off")
    assert len(sim.seen) == 1  # switched off after the first failure, not retried for every test


def test_crash_stops_the_simulated_conversation(tmp_path):
    sim = ScriptedSimulator(["never sent"])
    ctx = ctx_for(tmp_path, [make_spec(script=["hi"])], backend=CrashBackend, repeats=1, simulator=sim)
    run(ctx)
    assert user_messages(tmp_path) == ["hi"] and sim.seen == []


def test_no_llm_runs_have_no_simulator():
    from testing.runner import make_simulator
    assert make_simulator({"use_llm": False}) is None


def test_cache_can_be_turned_off_for_the_reproducibility_study():
    from testing.runner import make_simulator
    assert make_simulator({}).use_cache is True
    assert make_simulator({"simulator_cache": False}).use_cache is False


def model_ctx(tmp_path, **extra):
    """A ctx as the pipeline leaves it after stage 4: a rubric and a model, but no test specs."""
    store = {"entries": [{"id": "cap_001", "type": "capability", "name": "search_flights",
                          "description": "Agent can search flights"}]}
    ctx = {"name": "fake", "folder": tmp_path, "rubric": {"items": []}, "store": store, "simulator": None}
    ctx.update(extra)
    return ctx


def test_seed_tests_are_generated_when_there_are_none(tmp_path):
    ctx = model_ctx(tmp_path)
    detail = run(ctx)
    assert detail == "generated 1 seed test(s); not run: no entry point: add langgraph.json, or answer the Phase 0 start-up questions (run_config)"
    saved = json.loads((tmp_path / "test_specs.json").read_text(encoding="utf-8"))
    assert saved == ctx["test_specs"] and saved[0]["target_id"] == "cap_001"


def test_generated_tests_run_when_the_agent_can_be_started(tmp_path):
    ctx = model_ctx(tmp_path, backend_factory=EchoBackend, simulator=ScriptedSimulator(["find me a flight"]),
                    spec={"run_config": {"repeats": 1}})
    assert run(ctx).startswith("generated 1 seed test(s); 1 test(s) x 1 run(s): 1 completed")


def test_an_existing_test_list_is_used_not_regenerated(tmp_path):
    (tmp_path / "test_specs.json").write_text(json.dumps([make_spec("MY-1")]), encoding="utf-8")
    ctx = model_ctx(tmp_path)
    run(ctx)
    assert [s["test_id"] for s in ctx["test_specs"]] == ["MY-1"]


@pytest.mark.parametrize("body, status", [
    ("def respond(messages):\n    raise RuntimeError('agent bug')\n", "crashed"),
    ("import time\n\ndef respond(messages):\n    time.sleep(10)\n", "timeout"),
])
def test_generated_tests_record_crashes_and_timeouts_never_hang(tmp_path, body, status):
    """EH-5: seed tests from the generator, run on a real failing agent through the Python backend."""
    from testing.backends import PythonModuleBackend
    agent = tmp_path / "agent"
    agent.mkdir()
    (agent / "bot.py").write_text(body, encoding="utf-8")
    ctx = model_ctx(tmp_path / "out", simulator=ScriptedSimulator(["find me a flight", "again"]),
                    backend_factory=lambda: PythonModuleBackend(agent, "bot.py:respond", timeout_seconds=1),
                    spec={"run_config": {"repeats": 1}})
    detail = run(ctx)
    assert detail.startswith("generated 1 seed test(s); 1 test(s) x 1 run(s)")
    trace = ctx["traces"][0]
    assert trace["run_status"] == status and trace["error"]
    assert len(trace["turns"]) == 1  # stopped after the failing turn: no further messages, no hang
