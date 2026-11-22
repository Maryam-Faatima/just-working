"""Tests for judging every trace of a run (AY-4 / AY-7). A fake LLM replaces Gemini and Groq."""
import json

from testing import judge_all
from testing.judge_all import consistency, judge_all as run_all, load_traces, run, summarise


class Fake:
    """Replies with a score by the transcript text: 'LOOP' in it gives 1, anything else 5."""

    def __init__(self):
        self.calls = 0

    def __call__(self, prompt, system="", use_cache=True):
        self.calls += 1
        return {"score": 1 if "LOOP" in prompt else 5, "reasoning": "fake reasoning"}


def rubric(items=None):
    return {"agent": "demo", "version": "1", "pass_threshold": {},
            "items": items if items is not None else [
                {"rule_id": "R1", "kind": "invariant", "severity": "major", "check": "judge",
                 "description": "Be polite"},
                {"rule_id": "N1", "kind": "invariant", "severity": "critical", "check": "program",
                 "check_type": "no_crash_or_empty", "description": "Never crash"}]}


def trace(trace_id, text="hello", status="completed"):
    return {"trace_id": trace_id, "test_id": "T-" + trace_id, "run_status": status,
            "turns": [{"turn": 1, "role": "user", "content": "hi"},
                      {"turn": 2, "role": "agent", "content": text}]}


def folder_with(tmp_path, traces):
    (tmp_path / "traces").mkdir()
    for i, (name, data) in enumerate(traces):
        (tmp_path / "traces" / name).write_text(data if isinstance(data, str) else json.dumps(data), encoding="utf-8")
    return tmp_path


def test_every_completed_trace_gets_a_score_and_an_agreement(tmp_path):
    folder = folder_with(tmp_path, [("a.json", trace("A")), ("b.json", trace("B", "LOOP LOOP"))])
    report = run_all(folder, rubric(), complete_json=Fake())
    by_id = {r["trace_id"]: r for r in report["traces"]}
    assert by_id["A"]["overall_quality"]["score"] == 5 and by_id["A"]["agreement"] == "both_ok"
    assert by_id["B"]["overall_quality"]["score"] == 1
    assert by_id["B"]["agreement"] == "judge_only"     # judge fails it, no rule check did
    assert report["summary"]["agreement"]["judge_only"] == 1
    assert report["summary"]["agreement_rate"] == 0.5


def test_crashed_run_is_listed_but_not_judged(tmp_path):
    fake = Fake()
    folder = folder_with(tmp_path, [("c.json", trace("C", status="crashed"))])
    report = run_all(folder, rubric(), complete_json=fake)
    assert report["traces"][0]["agreement"] == "not_judged" and fake.calls == 0
    assert report["summary"]["not_judged"] == 1 and report["summary"]["agreement_rate"] is None


def test_unreadable_and_broken_traces_never_stop_the_rest(tmp_path):
    folder = folder_with(tmp_path, [("a.json", trace("A")), ("bad.json", "{nope"),
                                    ("no_status.json", {"trace_id": "Z", "turns": []})])
    report = run_all(folder, rubric(), complete_json=Fake())
    ids = {r["trace_id"]: r["agreement"] for r in report["traces"]}
    assert ids["A"] == "both_ok" and ids["Z"] == "not_judged" and "bad" not in str(ids)


def test_llm_down_counts_as_undecided_not_as_a_score(tmp_path):
    folder = folder_with(tmp_path, [("a.json", trace("A"))])
    report = run_all(folder, rubric(), use_llm=False)
    assert report["traces"][0]["decided"] is False
    assert report["summary"]["undecided"] == 1 and report["summary"]["mean_overall_score"] is None


def test_summary_of_no_records_is_safe():
    s = summarise([])
    assert s["traces"] == 0 and s["agreement_rate"] is None and s["mean_overall_score"] is None


def test_stage_writes_judge_all_json_and_reports_a_detail_line(tmp_path, monkeypatch):
    folder = folder_with(tmp_path, [("a.json", trace("A"))])
    monkeypatch.setattr("understand.llm.complete_json", Fake())
    detail = run({"folder": folder, "rubric": rubric(), "use_llm": True})
    assert "judged 1 of 1" in detail
    data = json.loads((folder / "judge_all.json").read_text(encoding="utf-8"))
    assert data["agent"] == "demo" and len(data["traces"]) == 1


def test_stage_without_traces_or_rubric_is_a_quiet_no_op(tmp_path):
    assert run({"folder": tmp_path, "rubric": rubric()}) == "no traces to judge"
    folder_with(tmp_path, [("a.json", trace("A"))])
    assert run({"folder": tmp_path}) == "no rubric, nothing to judge"
    assert not (tmp_path / "judge_all.json").exists()


def test_load_traces_skips_files_without_a_trace_id(tmp_path):
    folder = folder_with(tmp_path, [("a.json", trace("A")), ("x.json", {"hello": 1})])
    assert [n for n, _ in load_traces(folder)] == ["a.json"]


def test_consistency_is_perfect_for_a_steady_judge_and_flags_a_flaky_one(tmp_path):
    folder = folder_with(tmp_path, [("a.json", trace("A"))])
    steady = consistency(folder, rubric(), repeats=3, complete_json=Fake())
    assert steady["summary"]["identical_scores"] == 1 and steady["traces"][0]["scores"] == [5, 5, 5]

    scores = iter([5, 2, 4])
    flaky = consistency(folder, rubric(), repeats=3,
                        complete_json=lambda p, s="", **k: {"score": next(scores), "reasoning": "x"})
    assert flaky["traces"][0]["spread"] == 3 and flaky["traces"][0]["same_verdict"] is False
    assert flaky["summary"]["mean_spread"] == 3


def test_consistency_asks_only_the_overall_question(tmp_path):
    fake = Fake()
    consistency(folder_with(tmp_path, [("a.json", trace("A"))]), rubric(), repeats=2, complete_json=fake)
    assert fake.calls == 2     # one overall call per repeat, no per-rule calls


def test_cli_writes_both_files(tmp_path, monkeypatch, capsys):
    folder = folder_with(tmp_path, [("a.json", trace("A"))])
    (folder / "rubric.json").write_text(json.dumps(rubric()), encoding="utf-8")
    monkeypatch.setattr("understand.llm.complete_json", Fake())
    assert judge_all.main([str(folder), "--repeat", "2"]) == 0
    assert (folder / "judge_all.json").exists() and (folder / "judge_consistency.json").exists()
    assert judge_all.main([str(tmp_path / "missing")]) == 2
