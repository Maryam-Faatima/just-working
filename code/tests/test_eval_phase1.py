"""Tests for the Phase 1 gold-standard evaluation (MF-6). Synthetic outputs, no agent and no LLM."""
import json

import pytest

from scripts import eval_phase1 as ev


def entry(id_, type_, name, detected_by="rule", file="a.py", lines="10-12"):
    return {"id": id_, "type": type_, "name": name, "detected_by": detected_by,
            "evidence": [{"source": "static", "file": file, "lines": lines}]}


GOLD = {
    "agent": "demo", "tools": ["a", "b", "c"], "workflow_steps": ["n1", "n2"],
    "constraints": [
        {"text": "rule one", "file": "agents.py", "lines": "10-20"},
        {"text": "rule two", "file": "gates.py", "lines": "5-9"},
    ],
}


def write_outputs(folder, entries, stats=None, infer="agreed on 3 capabilities, added 2 constraints, rejected 1"):
    folder.mkdir(parents=True)
    (folder / "model_v0.json").write_text(json.dumps({"entries": entries}), encoding="utf-8")
    if stats is not None:
        (folder / "callgraph.json").write_text(json.dumps({"stats": stats}), encoding="utf-8")
    if infer:
        summary = {"stages": [{"stage": "infer", "status": "ok", "detail": infer}]}
        (folder / "run_summary.json").write_text(json.dumps(summary), encoding="utf-8")


def test_ratio_never_divides_by_zero():
    assert ev.ratio(1, 0) is None and ev.ratio(0, 4) == 0 and ev.ratio(1, 3) == 0.333


@pytest.mark.parametrize("a,b,expected", [("10-20", "15-30", True), ("10-20", "20-30", True),
                                           ("10-20", "21-30", False), ("72", "70-75", True)])
def test_line_ranges_overlap(a, b, expected):
    e = entry("c1", "constraint", "x", lines=a)
    assert ev.overlaps(e, {"file": "a.py", "lines": b}) is expected


def test_overlap_needs_the_same_file_even_with_a_path_prefix():
    e = entry("c1", "constraint", "x", file="shopbot/agents.py", lines="12")
    assert ev.overlaps(e, {"file": "agents.py", "lines": "10-20"})
    assert not ev.overlaps(e, {"file": "gates.py", "lines": "10-20"})


def test_tool_and_workflow_recall_and_precision(tmp_path):
    entries = [entry("c1", "capability", "a"), entry("c2", "capability", "b"), entry("c3", "capability", "z"),
               entry("w1", "workflow", "n1"), entry("w2", "workflow", "n2")]
    write_outputs(tmp_path / "demo", entries, {"resolved": 30, "unresolved": 70, "external": 5})
    r = ev.evaluate(GOLD, tmp_path / "demo")
    assert (r["tools"]["recall"], r["tools"]["precision"]) == (0.667, 0.667)
    assert r["tools"]["missed"] == ["c"] and r["tools"]["extra"] == ["z"]
    assert (r["workflow"]["recall"], r["workflow"]["precision"]) == (1.0, 1.0)


def test_constraint_recall_and_llm_precision_use_file_and_lines(tmp_path):
    entries = [
        entry("k1", "constraint", "on rule one", "llm", "src/agents.py", "12-14"),
        entry("k2", "constraint", "somewhere else", "rule+llm", "src/agents.py", "90-95"),
        entry("k3", "constraint", "from the developer", "developer", "agents.py", "300"),
    ]
    write_outputs(tmp_path / "demo", entries, {"resolved": 1, "unresolved": 1})
    c = ev.evaluate(GOLD, tmp_path / "demo")["constraints"]
    assert (c["matched"], c["recall"]) == (1, 0.5) and c["missed"] == ["rule two"]
    assert (c["llm_proposed"], c["llm_on_gold_rule"], c["llm_precision"]) == (2, 1, 0.5)
    assert c["llm_to_review"] == ["k2: somewhere else"]  # developer rules are not counted as LLM claims


def test_call_graph_share_and_rejection_rate(tmp_path):
    write_outputs(tmp_path / "demo", [], {"resolved": 416, "unresolved": 659, "external": 317})
    r = ev.evaluate({**GOLD, "constraints": []}, tmp_path / "demo")
    assert r["call_graph"]["resolved_share"] == 0.387
    assert r["inference"] == {"agreed": 3, "added": 2, "rejected": 1, "rejection_rate": 0.167}
    assert r["constraints"] is None


def test_missing_optional_files_give_none_not_zero(tmp_path):
    write_outputs(tmp_path / "demo", [], stats=None, infer="")
    r = ev.evaluate({**GOLD, "constraints": []}, tmp_path / "demo")
    assert r["call_graph"]["resolved_share"] is None and r["inference"]["rejection_rate"] is None


def test_cli_writes_the_table_and_reports_a_missing_run(tmp_path, capsys):
    gold_dir = tmp_path / "gold"
    gold_dir.mkdir()
    (gold_dir / "demo.json").write_text(json.dumps({**GOLD, "constraints": []}), encoding="utf-8")
    (gold_dir / "other.json").write_text(json.dumps({**GOLD, "agent": "other"}), encoding="utf-8")
    write_outputs(tmp_path / "outputs" / "demo", [entry("c1", "capability", "a")], {"resolved": 1, "unresolved": 1})
    code = ev.main(["--gold-dir", str(gold_dir), "--outputs", str(tmp_path / "outputs"), "--out", str(tmp_path / "eval")])
    out = capsys.readouterr()
    assert code == 1 and "other: no model_v0.json" in out.err
    assert "| demo | 33% |" in out.out
    saved = json.loads((tmp_path / "eval" / "phase1_eval.json").read_text(encoding="utf-8"))
    assert [r["agent"] for r in saved] == ["demo"]
    assert (tmp_path / "eval" / "phase1_eval.md").read_text(encoding="utf-8").startswith("| Agent |")


def test_every_gold_file_in_the_repo_is_well_formed():
    from pathlib import Path
    for path in sorted((Path(ev.ROOT) / "fixtures" / "gold").glob("*.json")):
        gold = json.loads(path.read_text(encoding="utf-8"))
        assert gold["agent"] == path.stem and gold["tools"] and gold["workflow_steps"]
        for rule in gold.get("constraints", []):
            assert rule["file"] and ev.line_span(rule["lines"])
