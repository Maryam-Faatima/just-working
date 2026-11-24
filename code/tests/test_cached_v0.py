import json

import pytest

import pipeline
from understand import cached_v0, llm
from understand.model_store import ModelStore


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


@pytest.fixture(autouse=True)
def no_terminal(monkeypatch):
    monkeypatch.setattr(pipeline, "_interactive", lambda: False)


def rule_run(repo, tmp_path):
    """A normal run without the LLM; returns the model it saved."""
    summary, _ = run(repo, tmp_path, use_llm=False)
    return ModelStore.load(tmp_path / "out" / "my-agent" / "model_v0.json"), summary


def make_snapshot(store, cache_dir, commit="abc12345def"):
    """A snapshot as the LLM would leave it: one agreed capability and one inferred constraint."""
    data = store.to_dict()
    for e in data["entries"]:
        if e["name"] == "delete_thing":
            e["detected_by"] = "rule+llm"
            e["description"] = "Deletes a thing, as read by the LLM"
    data["entries"].append({
        "id": "con_001", "type": "constraint", "name": "Must not delete twice",
        "description": "Must not delete twice", "evidence": [{"source": "static", "file": "agent.py",
        "lines": "11-13", "pattern": "llm:inferred"}], "confidence": 0.55, "status": "unverified",
        "detected_by": "llm", "related_tools": ["delete_thing"]})
    data["entries"].append({
        "id": "con_002", "type": "constraint", "name": "About a tool that is gone",
        "description": "About a tool that is gone", "evidence": [{"source": "static", "file": "x.py",
        "lines": "1-2", "pattern": "llm:inferred"}], "confidence": 0.55, "status": "unverified",
        "detected_by": "llm", "related_tools": ["removed_tool"]})
    path = cached_v0.snapshot_path("my-agent", cache_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    data["snapshot"] = {"commit": commit, "saved_at": "2026-11-21T00:00:00+00:00"}
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_save_and_load_round_trip(repo, tmp_path):
    store, _ = rule_run(repo, tmp_path)
    cached_v0.save_snapshot(store, "my-agent", "deadbeef", tmp_path / "cache")
    data = cached_v0.load_snapshot("my-agent", tmp_path / "cache")
    assert data["snapshot"]["commit"] == "deadbeef"
    assert len(data["entries"]) == len(store.entries)


def test_missing_snapshot_is_none_and_broken_one_raises(tmp_path):
    assert cached_v0.load_snapshot("nope", tmp_path) is None
    (tmp_path / "bad.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(cached_v0.SnapshotError):
        cached_v0.load_snapshot("bad", tmp_path)


def test_apply_takes_only_the_llm_part(repo, tmp_path):
    store, _ = rule_run(repo, tmp_path)
    make_snapshot(store, tmp_path / "cache")
    fresh, _ = rule_run(repo, tmp_path)
    snapshot = cached_v0.load_snapshot("my-agent", tmp_path / "cache")
    report = cached_v0.apply_snapshot(fresh, snapshot)
    assert report == {"upgraded": 1, "constraints_added": 1, "constraints_skipped": 1}
    delete = fresh.find(type="capability", name="delete_thing")[0]
    assert delete["detected_by"] == "rule+llm"
    assert "read by the LLM" in delete["description"]
    assert "Must not delete twice" in delete["constraints"]
    added = fresh.find(type="constraint")
    assert [c["name"] for c in added] == ["Must not delete twice"]  # the removed tool's constraint is dropped
    assert added[0]["status"] == "unverified"


def test_applying_twice_adds_nothing_new(repo, tmp_path):
    store, _ = rule_run(repo, tmp_path)
    make_snapshot(store, tmp_path / "cache")
    fresh, _ = rule_run(repo, tmp_path)
    snapshot = cached_v0.load_snapshot("my-agent", tmp_path / "cache")
    cached_v0.apply_snapshot(fresh, snapshot)
    again = cached_v0.apply_snapshot(fresh, snapshot)
    assert again["constraints_added"] == 0 and len(fresh.find(type="constraint")) == 1


def test_stale_note():
    assert cached_v0.stale_note({"snapshot": {"commit": "aaaaaaaa1"}}, "bbbbbbbb2") is not None
    assert cached_v0.stale_note({"snapshot": {"commit": "same"}}, "same") is None
    assert "does not record" in cached_v0.stale_note({}, "x")


def test_cached_flag_skips_the_llm_and_uses_the_snapshot(repo, tmp_path, monkeypatch):
    store, _ = rule_run(repo, tmp_path)
    make_snapshot(store, tmp_path / "cache", commit=None)

    def never(*a, **k):
        raise AssertionError("the LLM must not be called with --cached-v0")

    monkeypatch.setattr(pipeline.infer, "infer_v0", never)
    summary, _ = run(repo, tmp_path, cached=True, cached_dir=tmp_path / "cache")
    infer_stage = next(s for s in summary["stages"] if s["stage"] == "infer")
    assert infer_stage["status"] == "warning"  # the snapshot has no commit, said openly
    assert "used the cached V0" in infer_stage["detail"] and "does not record" in infer_stage["detail"]
    saved = ModelStore.load(tmp_path / "out" / "my-agent" / "model_v0.json")
    assert len(saved.find(type="constraint")) == 1
    rule_only = ModelStore.load(tmp_path / "out" / "my-agent" / "model_v0_rule.json")
    assert not rule_only.find(type="constraint")  # the code-only copy stays code-only (decision 36)


def test_llm_failure_falls_back_to_the_snapshot(repo, tmp_path, monkeypatch):
    store, _ = rule_run(repo, tmp_path)
    make_snapshot(store, tmp_path / "cache")

    def broken(scan, repo_root, store, graph=None):
        raise llm.LLMError("no key")

    monkeypatch.setattr(pipeline.infer, "infer_v0", broken)
    summary, _ = run(repo, tmp_path, use_llm=True, cached_dir=tmp_path / "cache")
    infer_stage = next(s for s in summary["stages"] if s["stage"] == "infer")
    assert "LLM unavailable" in infer_stage["detail"] and "used the cached V0" in infer_stage["detail"]
    assert summary["ok"] is True


def test_no_snapshot_keeps_the_rule_based_model(repo, tmp_path, monkeypatch):
    summary, _ = run(repo, tmp_path, cached=True, cached_dir=tmp_path / "empty")
    infer_stage = next(s for s in summary["stages"] if s["stage"] == "infer")
    assert infer_stage["status"] == "warning" and "no snapshot" in infer_stage["detail"]
    assert summary["ok"] is True


def test_broken_snapshot_does_not_stop_the_run(repo, tmp_path):
    (tmp_path / "cache").mkdir()
    (tmp_path / "cache" / "my-agent.json").write_text("[]", encoding="utf-8")
    summary, _ = run(repo, tmp_path, cached=True, cached_dir=tmp_path / "cache")
    assert statuses(summary)["infer"] == "warning" and summary["ok"] is True


def test_save_cli(repo, tmp_path, capsys):
    rule_run(repo, tmp_path)
    folder = tmp_path / "out" / "my-agent"
    assert cached_v0.main(["save", str(folder), "--cache-dir", str(tmp_path / "cache")]) == 0
    assert (tmp_path / "cache" / "my-agent.json").exists()
    assert cached_v0.main(["save", str(tmp_path / "missing")]) == 2
