"""Judge every trace of one agent run (AY-4, AY-7).

Pipeline stage `judge` (testing.judge_all.run) runs after `check` and before `report`.
For each traces/*.json it runs the deterministic checks and then the LLM judge, and writes
everything to judge_all.json so the report and the UI can show one score per run:

    {"agent", "generated", "summary": {...}, "traces": [one record per trace]}

Each record says how the two readings relate (`agreement`):
    both_ok      neither the checks nor the judge found a failure
    both_fail    both found a failure
    judge_only   the judge found a failure that no rule check found (a gap in the rubric)
    checks_only  a rule check failed, the judge did not
    not_judged   the run crashed or timed out, so there is nothing to judge

`consistency()` re-asks the judge the same question several times without the disk cache and
reports how often it gives the same score (judge_consistency.json). Both outputs are the data
for the AY-7 reliability study.

Command line:  python -m testing.judge_all outputs/<agent> [--repeat 3] [--no-llm]
"""
import argparse
import json
import sys
from datetime import datetime, UTC
from pathlib import Path

from testing import checks, judge
from understand import llm


def _read_json(path: Path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def load_traces(folder: Path) -> list[tuple[str, dict]]:
    """(file name, trace) for every readable traces/*.json, in name order."""
    traces_dir = Path(folder) / "traces"
    found = []
    for path in sorted(traces_dir.glob("*.json")) if traces_dir.is_dir() else []:
        data = _read_json(path)
        if isinstance(data, dict) and data.get("trace_id"):
            found.append((path.name, data))
    return found


def _undecided(overall: dict) -> bool:
    return "not decided" in str(overall.get("reasoning", "")).lower()


def _judge_one(filename: str, trace: dict, rubric: dict, use_llm: bool, complete_json=None) -> dict:
    record = {
        "filename": filename,
        "trace_id": str(trace.get("trace_id", "unknown")),
        "test_id": trace.get("test_id"),
        "run_status": trace.get("run_status", "unknown"),
    }
    if record["run_status"] != "completed":
        record.update(agreement="not_judged", note=f"The run {record['run_status']}, nothing to judge.")
        return record
    try:
        check_results = checks.run_checks(trace, rubric, complete_json=complete_json, use_llm=use_llm)
        judged = judge.run_judge(trace, rubric, complete_json=complete_json, use_llm=use_llm)
    except Exception as exc:  # noqa: BLE001  one odd trace must not stop the other 29
        record.update(agreement="not_judged", note=f"Could not be judged: {type(exc).__name__}: {str(exc)[:120]}")
        return record

    checks_failed = [str(c.get("rule_id", "?")) for c in check_results if c.get("verdict") == "fail"]
    judge_failed = [str(r.get("rule_id", "?")) for r in judged["rule_scores"] if r.get("verdict") == "fail"]
    overall = judged["overall_quality"]
    judge_fails = overall.get("verdict") == "fail" or bool(judge_failed)
    checks_fail = bool(checks_failed)
    if judge_fails and checks_fail:
        agreement = "both_fail"
    elif judge_fails:
        agreement = "judge_only"
    elif checks_fail:
        agreement = "checks_only"
    else:
        agreement = "both_ok"
    record.update(
        overall_quality=overall,
        decided=not _undecided(overall),
        judge_rule_scores=judged["rule_scores"],
        check_results=check_results,
        checks_failed=checks_failed,
        judge_failed_rules=judge_failed,
        agreement=agreement,
    )
    return record


def summarise(records: list[dict]) -> dict:
    judged = [r for r in records if r["agreement"] != "not_judged"]
    decided = [r for r in judged if r.get("decided")]
    scores = [r["overall_quality"]["score"] for r in decided]
    agreement = {k: sum(1 for r in decided if r["agreement"] == k)
                 for k in ("both_ok", "both_fail", "judge_only", "checks_only")}
    agree = agreement["both_ok"] + agreement["both_fail"]
    return {
        "traces": len(records),
        "judged": len(judged),
        "not_judged": len(records) - len(judged),
        "undecided": len(judged) - len(decided),
        "mean_overall_score": round(sum(scores) / len(scores), 2) if scores else None,
        "score_counts": {str(s): scores.count(s) for s in range(1, 6)},
        "agreement": agreement,
        "agreement_rate": round(agree / len(decided), 3) if decided else None,
    }


def judge_all(folder: Path, rubric: dict, use_llm: bool = True, complete_json=None) -> dict:
    records = [_judge_one(name, trace, rubric, use_llm, complete_json) for name, trace in load_traces(folder)]
    return {
        "agent": str(rubric.get("agent", "unknown")),
        "generated": datetime.now(UTC).isoformat(),
        "summary": summarise(records),
        "traces": records,
    }


def _uncached(prompt, system="", **_):
    return llm.complete_json(prompt, system, use_cache=False)


def consistency(folder: Path, rubric: dict, repeats: int = 3, complete_json=None, limit: int | None = None) -> dict:
    """Ask the judge for the overall score `repeats` times per trace, skipping the cache."""
    ask = complete_json or _uncached
    rows = []
    completed = [(n, t) for n, t in load_traces(folder) if t.get("run_status") == "completed"]
    for filename, trace in completed[:limit]:
        scores = [judge.run_judge(trace, {**rubric, "items": []}, complete_json=ask, use_llm=True)
                  ["overall_quality"]["score"] for _ in range(repeats)]
        rows.append({"filename": filename, "trace_id": str(trace["trace_id"]), "scores": scores,
                     "spread": max(scores) - min(scores),
                     "same_verdict": len({judge._verdict(s) for s in scores}) == 1})
    return {
        "agent": str(rubric.get("agent", "unknown")),
        "repeats": repeats,
        "summary": {
            "traces": len(rows),
            "identical_scores": sum(1 for r in rows if r["spread"] == 0),
            "same_verdict": sum(1 for r in rows if r["same_verdict"]),
            "mean_spread": round(sum(r["spread"] for r in rows) / len(rows), 3) if rows else None,
        },
        "traces": rows,
    }


# ---------------------------------------------------------------------- pipeline stage + CLI

def run(ctx: dict) -> str:
    """Pipeline stage hook: judge every trace in ctx['folder'] and write judge_all.json."""
    folder = Path(ctx["folder"])
    rubric = ctx.get("rubric") or _read_json(folder / "rubric.json")
    if not isinstance(rubric, dict):
        return "no rubric, nothing to judge"
    if not load_traces(folder):
        return "no traces to judge"
    report = judge_all(folder, rubric, use_llm=ctx.get("use_llm", True))
    (folder / "judge_all.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    s = report["summary"]
    return (f"judged {s['judged']} of {s['traces']} traces; mean quality {s['mean_overall_score']}; "
            f"agreement with checks {s['agreement_rate']}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Judge every trace of one agent run.")
    parser.add_argument("folder", help="outputs/<agent> folder with rubric.json and traces/")
    parser.add_argument("--repeat", type=int, default=0, help="also measure self-consistency with N repeats")
    parser.add_argument("--limit", type=int, help="with --repeat, only the first N completed traces")
    parser.add_argument("--no-llm", action="store_true")
    args = parser.parse_args(argv)
    folder = Path(args.folder)
    rubric = _read_json(folder / "rubric.json")
    if not isinstance(rubric, dict):
        print(f"No rubric.json in {folder}", file=sys.stderr)
        return 2
    report = judge_all(folder, rubric, use_llm=not args.no_llm)
    (folder / "judge_all.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    if args.repeat and not args.no_llm:
        result = consistency(folder, rubric, args.repeat, limit=args.limit)
        (folder / "judge_consistency.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result["summary"], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
