import json
import subprocess
import sys
import types
from pathlib import Path

import pytest

import pipeline
from understand import acquire, llm
from understand.acquire import AcquireError
from understand.phase0 import SpecError

AGENT = '''from langchain_core.tools import tool


@tool
def search_things(query: str) -> str:
    """Search for things."""
    return "ok"


@tool
def delete_thing(thing_id: str) -> str:
    """Delete a thing."""
    return "deleted"
'''


@pytest.fixture(autouse=True)
def no_terminal(monkeypatch):
    """Tests never have a person at the keyboard, even under pytest -s."""
    monkeypatch.setattr(pipeline, "_interactive", lambda: False)


@pytest.fixture
def repo(tmp_path):
    folder = tmp_path / "my-agent"
    folder.mkdir()
    (folder / "agent.py").write_text(AGENT, encoding="utf-8")
    return folder


def run(repo, tmp_path, **kw):
    lines = []
    summary = pipeline.run_pipeline(str(repo), out=str(tmp_path / "out"), log=lines.append, **kw)
    return summary, lines


def statuses(summary):
    return {s["stage"]: s["status"] for s in summary["stages"]}


def test_runs_every_stage_without_llm_and_writes_outputs(repo, tmp_path):
    summary, lines = run(repo, tmp_path, use_llm=False)
    folder = tmp_path / "out" / "my-agent"
    for name in ("scan.json", "scan.html", "scan.md", "model_v0_rule.json", "model_v0.json",
                 "callgraph.json", "callgraph.md", "rubric.json", "run_summary.json"):
        assert (folder / name).exists(), name
    assert not (folder / "spec.json").exists()  # no spec, so no spec copy
    assert summary["ok"] is True
    assert statuses(summary) == {"spec": "skipped", "scan": "ok", "callgraph": "ok", "model": "ok",
                                 "infer": "skipped", "test": "skipped", "report": "skipped"}
    assert len(lines) == 7
    model = json.loads((folder / "model_v0.json").read_text(encoding="utf-8"))
    assert {e["name"] for e in model["entries"]} == {"search_things", "delete_thing"}


def test_llm_failure_keeps_the_rule_based_model(repo, tmp_path, monkeypatch):
    def broken(scan, repo_root, store, graph=None):
        raise llm.LLMError("no key")

    monkeypatch.setattr(pipeline.infer, "infer_v0", broken)
    summary, _ = run(repo, tmp_path, use_llm=True)
    assert statuses(summary)["infer"] == "warning"
    assert summary["ok"] is True
    assert (tmp_path / "out" / "my-agent" / "model_v0.json").exists()


def test_llm_result_overwrites_model_v0(repo, tmp_path, monkeypatch):
    def fake(scan, repo_root, store, graph=None):
        store.entries[next(iter(store.entries))]["description"] = "changed by llm"
        return {"capabilities_agreed": 1, "constraints_added": 0, "constraints_rejected": [],
                "batches": 1, "batches_failed": 0}

    monkeypatch.setattr(pipeline.infer, "infer_v0", fake)
    summary, _ = run(repo, tmp_path)
    folder = tmp_path / "out" / "my-agent"
    assert statuses(summary)["infer"] == "ok"
    assert "changed by llm" in (folder / "model_v0.json").read_text(encoding="utf-8")
    assert "changed by llm" not in (folder / "model_v0_rule.json").read_text(encoding="utf-8")


def test_optional_stage_runs_when_the_module_exists(repo, tmp_path, monkeypatch):
    seen = {}
    fake = types.ModuleType("testing.runner")

    def hook(ctx):
        seen["tools"] = len(ctx["store"].find(type="capability"))
        seen["repo_exists"] = ctx["repo_root"].exists()
        return "2 tests run"

    fake.run = hook
    monkeypatch.setitem(sys.modules, "testing.runner", fake)
    summary, _ = run(repo, tmp_path, use_llm=False)
    assert statuses(summary)["test"] == "ok"
    assert seen == {"tools": 2, "repo_exists": True}


def test_failing_optional_stage_is_reported_and_later_stages_still_run(repo, tmp_path, monkeypatch):
    fake = types.ModuleType("testing.runner")

    def boom(ctx):
        raise RuntimeError("agent crashed")

    fake.run = boom
    monkeypatch.setitem(sys.modules, "testing.runner", fake)
    summary, _ = run(repo, tmp_path, use_llm=False)
    result = statuses(summary)
    assert result["test"] == "failed" and result["report"] == "skipped"
    assert summary["ok"] is False


def test_required_stage_failure_stops_the_run(repo, tmp_path, monkeypatch):
    def broken(root):
        raise ValueError("bad file")

    monkeypatch.setattr(pipeline, "scan_repo", broken)
    summary, _ = run(repo, tmp_path, use_llm=False)
    assert [s["stage"] for s in summary["stages"]] == ["spec", "scan"]
    assert summary["ok"] is False
    assert (tmp_path / "out" / "my-agent" / "run_summary.json").exists()


def test_main_exit_codes(repo, tmp_path, capsys):
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm"]) == 0
    assert pipeline.main([str(tmp_path / "does-not-exist")]) == 2
    assert "error:" in capsys.readouterr().err


def test_bad_source_raises_acquire_error(tmp_path):
    with pytest.raises(AcquireError):
        pipeline.run_pipeline(str(tmp_path / "nope"), out=str(tmp_path))


# ---------------------------------------------------------------- Phase 0 in the pipeline

SPEC = {
    "purpose": "Help users find and delete things.",
    "capabilities": ["search_things", "restore_thing"],
    "rules": [
        {"text": "Must ask the user to confirm before deleting", "kind": "must_always",
         "severity": "critical", "applies_to": ["delete_thing"], "check": "deterministic"},
        {"text": "Never delete something the user did not name", "kind": "must_never",
         "severity": "major", "applies_to": ["delet_thing"]},
    ],
    "out_of_scope": ["Anything unrelated to things"],
    "ambiguity_policy": "ask",
}


@pytest.fixture
def spec_file(tmp_path):
    path = tmp_path / "spec.json"
    path.write_text(json.dumps(SPEC), encoding="utf-8")
    return path


def test_spec_adds_developer_constraints_and_a_rubric(repo, tmp_path, spec_file):
    summary, _ = run(repo, tmp_path, use_llm=False, spec_path=spec_file)
    folder = tmp_path / "out" / "my-agent"
    assert statuses(summary)["spec"] == "ok" and summary["ok"] is True
    model = json.loads((folder / "model_v0.json").read_text(encoding="utf-8"))
    developer = [e for e in model["entries"] if e["detected_by"] == "developer"]
    assert {e["type"] for e in developer} == {"constraint", "capability"}
    delete_rule = next(e for e in developer if e["description"].startswith("Must ask"))
    assert delete_rule["related_tools"] == ["delete_thing"] and delete_rule["status"] == "unverified"
    rubric = json.loads((folder / "rubric.json").read_text(encoding="utf-8"))
    assert [i["rule_id"] for i in rubric["items"]] == ["U1", "R1", "R2", "U2", "U3"]
    assert next(i for i in rubric["items"] if i["rule_id"] == "R1")["target_id"] == delete_rule["id"]
    assert json.loads((folder / "spec.json").read_text(encoding="utf-8"))["rules"][0]["id"] == "R1"


def test_rule_only_model_stays_free_of_developer_entries(repo, tmp_path, spec_file):
    run(repo, tmp_path, use_llm=False, spec_path=spec_file)
    rule_only = (tmp_path / "out" / "my-agent" / "model_v0_rule.json").read_text(encoding="utf-8")
    assert "developer" not in rule_only


def test_spec_problems_are_warnings_in_the_summary(repo, tmp_path, spec_file):
    summary, _ = run(repo, tmp_path, use_llm=False, spec_path=spec_file)
    assert statuses(summary)["model"] == "warning" and summary["ok"] is True
    assert len(summary["spec_warnings"]) == 2  # restore_thing is not a tool, delet_thing is a typo
    assert any("delet_thing" in w for w in summary["spec_warnings"])
    assert summary["spec"] == str(spec_file)


def test_hooks_receive_the_spec_and_the_rubric(repo, tmp_path, spec_file, monkeypatch):
    seen = {}
    fake = types.ModuleType("testing.runner")

    def hook(ctx):
        seen["rules"] = len(ctx["spec"]["rules"])
        seen["items"] = len(ctx["rubric"]["items"])

    fake.run = hook
    monkeypatch.setitem(sys.modules, "testing.runner", fake)
    run(repo, tmp_path, use_llm=False, spec_path=spec_file)
    assert seen == {"rules": 2, "items": 5}


def test_invalid_spec_stops_before_any_work(repo, tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"purpose": "Help users.", "rules": [{"text": "Must confirm", "kind": "x"}]}),
                   encoding="utf-8")
    with pytest.raises(SpecError):
        run(repo, tmp_path, use_llm=False, spec_path=bad)
    assert not (tmp_path / "out").exists()
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm", "--spec", str(bad)]) == 2
    assert not (tmp_path / "o").exists()


def test_main_accepts_a_spec(repo, tmp_path, spec_file):
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm", "--spec", str(spec_file)]) == 0
    assert (tmp_path / "o" / "my-agent" / "rubric.json").exists()


# ---------------------------------------------------------------- the questionnaire in the pipeline


def _no_questions(*args, **kwargs):
    raise AssertionError("the questionnaire must not run here")


def test_terminal_run_starts_with_the_questionnaire(repo, tmp_path, monkeypatch):
    answers = tmp_path / "answers.json"
    answers.write_text(json.dumps(SPEC), encoding="utf-8")
    seen = {}

    def fake_ensure(folder, force=False, **kwargs):
        seen.update(folder=folder, force=force)
        return answers

    monkeypatch.setattr(pipeline, "_interactive", lambda: True)
    monkeypatch.setattr(pipeline.phase0, "ensure_spec", fake_ensure)
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm"]) == 0
    assert seen == {"folder": tmp_path / "o" / "my-agent", "force": False}
    rubric = json.loads((tmp_path / "o" / "my-agent" / "rubric.json").read_text(encoding="utf-8"))
    assert "R1" in [i["rule_id"] for i in rubric["items"]]


def test_ask_flag_forces_the_questionnaire_without_a_terminal(repo, tmp_path, monkeypatch):
    seen = {}

    def fake_ensure(folder, force=False, **kwargs):
        seen["force"] = force
        path = tmp_path / "answers.json"
        path.write_text(json.dumps(SPEC), encoding="utf-8")
        return path

    monkeypatch.setattr(pipeline.phase0, "ensure_spec", fake_ensure)
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm", "--ask"]) == 0
    assert seen == {"force": True}


@pytest.mark.parametrize("extra, terminal", [(["--no-ask"], True), ([], False)])
def test_no_questions_with_no_ask_or_without_a_terminal(repo, tmp_path, monkeypatch, extra, terminal):
    monkeypatch.setattr(pipeline, "_interactive", lambda: terminal)
    monkeypatch.setattr(pipeline.phase0, "ensure_spec", _no_questions)
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm", *extra]) == 0


def test_explicit_spec_skips_the_questionnaire(repo, tmp_path, spec_file, monkeypatch):
    monkeypatch.setattr(pipeline, "_interactive", lambda: True)
    monkeypatch.setattr(pipeline.phase0, "ensure_spec", _no_questions)
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm", "--spec", str(spec_file)]) == 0


def test_bad_path_fails_before_any_question(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "_interactive", lambda: True)
    monkeypatch.setattr(pipeline.phase0, "ensure_spec", _no_questions)
    assert pipeline.main([str(tmp_path / "nope"), "--out", str(tmp_path / "o")]) == 2


def test_cancelling_the_questionnaire_exits_cleanly(repo, tmp_path, monkeypatch):
    def cancel(folder, force=False, **kwargs):
        raise KeyboardInterrupt

    monkeypatch.setattr(pipeline, "_interactive", lambda: True)
    monkeypatch.setattr(pipeline.phase0, "ensure_spec", cancel)
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm"]) == 1
    assert not (tmp_path / "o").exists()


# ---------------------------------------------------------------- cloning a git URL


def fake_git_clone():
    calls = []

    def run_git(cmd, **kwargs):
        calls.append(cmd)
        if cmd[1] == "clone":
            dest = Path(cmd[-1])
            dest.mkdir(parents=True)
            (dest / "agent.py").write_text(AGENT, encoding="utf-8")
            return subprocess.CompletedProcess(cmd, 0, "", "")
        return subprocess.CompletedProcess(cmd, 0, "abc123\n", "")

    return run_git, calls


def test_git_url_is_cloned_into_repos_and_replaced_on_every_run(tmp_path, monkeypatch):
    run_git, calls = fake_git_clone()
    monkeypatch.setattr(acquire.subprocess, "run", run_git)
    url = "https://github.com/user/repo.git"
    first_lines, second_lines = [], []
    first = pipeline.run_pipeline(url, out=str(tmp_path / "out"), repos=str(tmp_path / "repos"),
                                  use_llm=False, log=first_lines.append)
    assert (tmp_path / "repos" / "repo" / "agent.py").exists()  # kept after the run
    assert (tmp_path / "out" / "repo" / "model_v0.json").exists()
    assert any("Cloning" in line for line in first_lines)
    second = pipeline.run_pipeline(url, out=str(tmp_path / "out"), repos=str(tmp_path / "repos"),
                                   use_llm=False, log=second_lines.append)
    assert any("Replacing" in line for line in second_lines)
    assert len([c for c in calls if c[1] == "clone"]) == 2  # cloned again, not reused
    assert statuses(first)["scan"] == "ok" and statuses(second)["scan"] == "ok"