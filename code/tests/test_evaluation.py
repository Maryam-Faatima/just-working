"""Tests for the evaluation harness: metrics and the blind judge audit. No LLM is involved."""
import csv
import json
import math

import pytest

from evaluation import audit, metrics


# ---------------------------------------------------------------- statistics

def test_wilson_interval_brackets_the_proportion_and_handles_no_trials():
    low, high = metrics.wilson(6, 14)
    assert low < 6 / 14 < high and low >= 0 and high <= 1
    assert metrics.wilson(0, 0) is None
    assert metrics.wilson(0, 5)[0] == 0 and metrics.wilson(5, 5)[1] == 1


def test_brier_and_ece_on_known_values():
    assert metrics.brier([(1.0, 1), (0.0, 0)]) == 0
    assert metrics.brier([(0.8, 1), (0.8, 0)]) == pytest.approx((0.04 + 0.64) / 2)
    assert metrics.brier([]) is None and metrics.ece([]) is None
    # confidence 0.8, right half the time: gap 0.3
    assert metrics.ece([(0.8, 1), (0.8, 0)]) == pytest.approx(0.3)
    assert metrics.ece([(1.0, 1)]) == 0          # confidence 1.0 lands in the last bin


def test_pass_hat_k_matches_the_combinatorial_definition():
    runs = {"t1": [True, True, True], "t2": [True, True, False], "t3": [False, False, False]}
    expected = (1 + math.comb(2, 3) / math.comb(3, 3) + 0) / 3
    assert metrics.pass_hat_k(runs, 3) == pytest.approx(round(expected, 3))
    assert metrics.pass_hat_k(runs, 1) == pytest.approx(round((1 + 2 / 3 + 0) / 3, 3))
    assert metrics.pass_hat_k({"t": [True]}, 3) is None     # fewer than k runs


# ---------------------------------------------------------------- a small finished run

def make_run(tmp_path):
    nodes = [{"id": "cap_1", "kind": "model_entry", "entry_type": "capability"},
             {"id": "cap_2", "kind": "model_entry", "entry_type": "capability"},
             {"id": "con_1", "kind": "model_entry", "entry_type": "constraint"}]
    edges = [{"from": "cap_1", "to": "test:T1", "relation": "targeted_by"},
             {"from": "cap_2", "to": "finding:F1", "relation": "has_finding"}]
    (tmp_path / "evidence_graph.json").write_text(json.dumps({"nodes": nodes, "edges": edges}), encoding="utf-8")
    findings = [{"finding_id": "F1", "result": "fail", "severity": "major", "reproducibility": {"runs": 3, "failures": 3}},
                {"finding_id": "F2", "result": "fail", "severity": "minor", "reproducibility": {"runs": 3, "failures": 1}},
                {"finding_id": "F3", "result": "pass", "severity": "info", "reproducibility": {"runs": 3, "failures": 0}}]
    (tmp_path / "findings.json").write_text(json.dumps(findings), encoding="utf-8")
    (tmp_path / "traces").mkdir()
    records = []
    specs = [("TR1", "T1", "completed", [], "both_ok", "ok"), ("TR2", "T1", "completed", ["R1"], "both_fail", "x"),
             ("TR3", "T1", "crashed", None, "not_judged", ""), ("TR4", "T2", "completed", [], "judge_only", "loop"),
             ("TR5", "T2", "completed", [], "judge_only", "loop"), ("TR6", "T2", "completed", [], "both_ok", "ok")]
    for trace_id, test_id, status, failed, agreement, text in specs:
        trace = {"trace_id": trace_id, "test_id": test_id, "run_status": status,
                 "turns": [{"turn": 1, "role": "user", "content": "hi"}, {"turn": 2, "role": "agent", "content": text}]}
        (tmp_path / "traces" / f"{trace_id}.json").write_text(json.dumps(trace), encoding="utf-8")
        rec = {"filename": f"{trace_id}.json", "trace_id": trace_id, "test_id": test_id, "run_status": status,
               "agreement": agreement}
        if status == "completed":
            rec.update(decided=True, checks_failed=failed, overall_quality={"score": 1, "verdict": "fail"})
        records.append(rec)
    summary = {"traces": 6, "judged": 5, "undecided": 0,
               "agreement": {"both_ok": 2, "both_fail": 1, "judge_only": 2, "checks_only": 0}, "agreement_rate": 0.6}
    (tmp_path / "judge_all.json").write_text(json.dumps({"summary": summary, "traces": records}), encoding="utf-8")
    return tmp_path


def test_compute_reads_coverage_findings_reliability_and_judge(tmp_path):
    result = metrics.compute(make_run(tmp_path), k=3)
    assert result["missing"] == []
    assert result["coverage"]["tested"] == 2 and result["coverage"]["entries"] == 3
    assert result["coverage"]["by_type"]["constraint"] == {"entries": 1, "tested": 0}
    assert result["findings"] == {"findings": 3, "failed": 2, "always_failed": 1, "sometimes_failed": 1,
                                  "by_severity": {"critical": 0, "major": 1, "minor": 1, "info": 0}}
    # T1: ok, check-failed, crashed -> 1 of 3 succeed. T2: all three completed with no failed check.
    assert result["reliability"]["tests"] == 2 and result["reliability"]["successful_runs"] == 4
    assert result["reliability"]["pass^3"] == 0.5
    assert result["judge"]["agreement"]["agreement_interval"] is not None


def test_missing_inputs_are_reported_not_invented(tmp_path):
    result = metrics.compute(tmp_path)
    assert set(result["missing"]) == {"evidence_graph.json", "findings.json", "judge_all.json"}
    assert "coverage" not in result and "reliability" not in result
    assert "Missing inputs" in metrics.to_markdown(result)


def test_cli_writes_json_and_markdown(tmp_path, capsys):
    folder = make_run(tmp_path)
    assert metrics.main([str(folder), "--k", "2"]) == 0
    assert (folder / "evaluation_metrics.json").exists()
    text = (folder / "evaluation_metrics.md").read_text(encoding="utf-8")
    assert "| Model coverage | 67% (2 of 3)" in text and "| pass^2 |" in text
    assert metrics.main([str(tmp_path / "missing")]) == 2


# ---------------------------------------------------------------- blind audit

def fill(sheet, answers):
    with open(sheet, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for row in rows:
        row["human_verdict"] = answers.get(row["trace_id"], "")
    with open(sheet, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=audit.COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def test_export_lists_judge_only_and_a_both_fail_sample_without_revealing_groups(tmp_path):
    folder = make_run(tmp_path)
    info = audit.export_sheet(folder, both_fail_sample=1)
    assert info == {"rows": 3, "judge_only": 2, "both_fail_sampled": 1}
    sheet = (folder / "audit_sheet.csv").read_text(encoding="utf-8")
    assert "judge_only" not in sheet and "both_fail" not in sheet and "score" not in sheet.lower()
    assert "AGENT: loop" in sheet and "[1] USER: hi" in sheet
    assert json.loads((folder / "audit_key.json").read_text(encoding="utf-8")) == {
        "TR2": "both_fail", "TR4": "judge_only", "TR5": "judge_only"}


def test_export_is_repeatable_and_needs_judge_all(tmp_path):
    folder = make_run(tmp_path)
    audit.export_sheet(folder)
    first = (folder / "audit_sheet.csv").read_text(encoding="utf-8")
    audit.export_sheet(folder)
    assert (folder / "audit_sheet.csv").read_text(encoding="utf-8") == first
    with pytest.raises(FileNotFoundError):
        audit.export_sheet(tmp_path / "empty")


def test_score_computes_precision_per_group_and_flags_an_unfinished_sheet(tmp_path):
    folder = make_run(tmp_path)
    audit.export_sheet(folder)
    fill(folder / "audit_sheet.csv", {"TR4": "real_failure", "TR5": "Not_Failure", "TR2": "yes"})
    result = audit.score(folder)
    jo = result["groups"]["judge_only"]
    assert (jo["confirmed"], jo["not_failure"], jo["precision"]) == (1, 1, 0.5)
    assert result["groups"]["both_fail"]["precision"] == 1.0 and result["complete"] is True
    fill(folder / "audit_sheet.csv", {"TR4": "unsure"})
    partial = audit.score(folder)
    assert partial["complete"] is False
    assert partial["groups"]["judge_only"]["unsure"] == 1 and partial["groups"]["judge_only"]["unlabelled"] == 1
    assert partial["groups"]["judge_only"]["precision"] is None


def test_score_needs_the_key_and_the_metrics_report_includes_the_audit(tmp_path):
    folder = make_run(tmp_path)
    with pytest.raises(FileNotFoundError):
        audit.score(folder)
    audit.export_sheet(folder)
    fill(folder / "audit_sheet.csv", {"TR4": "real_failure", "TR5": "real_failure", "TR2": "real_failure"})
    audit.score(folder)
    text = metrics.to_markdown(metrics.compute(folder))
    assert "Judge precision, judge_only | 100% (2 of 2 confirmed" in text


def test_cohen_kappa_and_reviewer_comparison(tmp_path):
    assert audit.cohen_kappa(["a", "b", "a", "b"], ["a", "b", "a", "b"]) == 1.0
    assert audit.cohen_kappa(["a", "a"], ["a", "a"]) is None      # no variation, kappa undefined
    assert audit.cohen_kappa(["a"], []) is None
    assert audit.cohen_kappa(["a", "b", "a", "b"], ["a", "a", "b", "b"]) == 0.0
    folder = make_run(tmp_path)
    audit.export_sheet(folder)
    other = tmp_path / "other.csv"
    other.write_text((folder / "audit_sheet.csv").read_text(encoding="utf-8"), encoding="utf-8")
    fill(folder / "audit_sheet.csv", {"TR4": "real_failure", "TR5": "real_failure", "TR2": "not_failure"})
    fill(other, {"TR4": "real_failure", "TR5": "not_failure", "TR2": "not_failure"})
    result = audit.compare_reviewers(folder / "audit_sheet.csv", other)
    assert result["shared_rows"] == 3 and result["disagreements"] == ["TR5"]


def test_audit_cli_round_trip(tmp_path, capsys):
    folder = make_run(tmp_path)
    assert audit.main(["export", str(folder)]) == 0
    assert audit.main(["score", str(folder), "--sheet", str(folder / "audit_sheet.csv")]) == 0
    assert audit.main(["score", str(tmp_path / "nowhere")]) == 2
