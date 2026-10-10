import json
import sys
import types

import pytest

import pipeline
from understand import llm
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
    assert not (folder / "spec.json").exists()  # no --spec, so no spec copy
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

