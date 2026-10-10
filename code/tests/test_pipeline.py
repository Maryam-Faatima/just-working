import json
import sys
import types

import pytest

import pipeline
from understand import llm
from understand.acquire import AcquireError

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
    for name in ("scan.json", "scan.html", "scan.md", "model_v0_rule.json",
                 "model_v0.json", "run_summary.json"):
        assert (folder / name).exists(), name
    assert summary["ok"] is True
    assert statuses(summary) == {"scan": "ok", "model": "ok", "infer": "skipped",
                                 "test": "skipped", "report": "skipped"}
    assert len(lines) == 5
    model = json.loads((folder / "model_v0.json").read_text(encoding="utf-8"))
    assert {e["name"] for e in model["entries"]} == {"search_things", "delete_thing"}


def test_llm_failure_keeps_the_rule_based_model(repo, tmp_path, monkeypatch):
    def broken(scan, repo_root, store):
        raise llm.LLMError("no key")

    monkeypatch.setattr(pipeline.infer, "infer_v0", broken)
    summary, _ = run(repo, tmp_path, use_llm=True)
    assert statuses(summary)["infer"] == "warning"
    assert summary["ok"] is True
    assert (tmp_path / "out" / "my-agent" / "model_v0.json").exists()


def test_llm_result_overwrites_model_v0(repo, tmp_path, monkeypatch):
    def fake(scan, repo_root, store):
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
    assert [s["stage"] for s in summary["stages"]] == ["scan"]
    assert summary["ok"] is False
    assert (tmp_path / "out" / "my-agent" / "run_summary.json").exists()


def test_main_exit_codes(repo, tmp_path, capsys):
    assert pipeline.main([str(repo), "--out", str(tmp_path / "o"), "--no-llm"]) == 0
    assert pipeline.main([str(tmp_path / "does-not-exist")]) == 2
    assert "error:" in capsys.readouterr().err


def test_bad_source_raises_acquire_error(tmp_path):
    with pytest.raises(AcquireError):
        pipeline.run_pipeline(str(tmp_path / "nope"), out=str(tmp_path))