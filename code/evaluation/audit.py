"""Blind human audit of the LLM judge (AY-7).

    python -m evaluation.audit export outputs/<agent>          # writes audit_sheet.csv + audit_key.json
    python -m evaluation.audit score  outputs/<agent>          # reads the filled sheet, writes judge_audit.json
    python -m evaluation.audit kappa  sheet_a.csv sheet_b.csv  # agreement between two reviewers

The sheet lists every run where the judge failed it but no rule check did (judge_only) and a few runs
where both failed (both_fail), shuffled, with the conversation and no judge or check result. The
reviewer fills human_verdict with: real_failure, not_failure or unsure. audit_key.json records which
group each row came from; do not open it until the sheet is filled. Nothing here calls an LLM.
"""
import argparse
import csv
import json
import random
import sys
from pathlib import Path

from evaluation.metrics import read_json, wilson

SHEET, KEY, RESULT = "audit_sheet.csv", "audit_key.json", "judge_audit.json"
COLUMNS = ["row", "trace_id", "test_id", "conversation", "human_verdict", "notes"]
VERDICTS = {"real_failure": "real_failure", "real": "real_failure", "fail": "real_failure", "yes": "real_failure",
            "not_failure": "not_failure", "ok": "not_failure", "pass": "not_failure", "no": "not_failure",
            "unsure": "unsure", "?": "unsure"}


def _conversation(trace: dict) -> str:
    parts = []
    for turn in trace.get("turns", []):
        if isinstance(turn, dict):
            parts.append(f"[{turn.get('turn', '?')}] {str(turn.get('role', '?')).upper()}: "
                         f"{str(turn.get('content', ''))[:2000]}")
    return "\n".join(parts) or "(no turns recorded)"


def export_sheet(folder: Path, both_fail_sample: int = 3, seed: int = 0) -> dict:
    folder = Path(folder)
    judge_all = read_json(folder / "judge_all.json")
    if not isinstance(judge_all, dict):
        raise FileNotFoundError(f"No judge_all.json in {folder}. Run the pipeline or testing.judge_all first.")
    records = [r for r in judge_all.get("traces", []) if isinstance(r, dict) and r.get("decided")]
    judge_only = sorted((r for r in records if r["agreement"] == "judge_only"), key=lambda r: r["trace_id"])
    both_fail = sorted((r for r in records if r["agreement"] == "both_fail"), key=lambda r: r["trace_id"])
    chosen = [(r, "judge_only") for r in judge_only] + [(r, "both_fail") for r in both_fail[:both_fail_sample]]
    random.Random(seed).shuffle(chosen)

    rows, key = [], {}
    for number, (record, group) in enumerate(chosen, start=1):
        trace = read_json(folder / "traces" / record["filename"]) or {}
        rows.append({"row": number, "trace_id": record["trace_id"], "test_id": record.get("test_id") or "",
                     "conversation": _conversation(trace), "human_verdict": "", "notes": ""})
        key[record["trace_id"]] = group
    with open(folder / SHEET, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    (folder / KEY).write_text(json.dumps(key, indent=2), encoding="utf-8")
    return {"rows": len(rows), "judge_only": len(judge_only), "both_fail_sampled": min(both_fail_sample, len(both_fail))}


def read_labels(sheet: Path) -> dict[str, str]:
    """trace_id -> real_failure | not_failure | unsure; blank or unknown values are left out."""
    labels = {}
    with open(sheet, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            value = VERDICTS.get((row.get("human_verdict") or "").strip().lower())
            if value and row.get("trace_id"):
                labels[row["trace_id"]] = value
    return labels


def score(folder: Path, sheet: Path | None = None) -> dict:
    folder = Path(folder)
    key = read_json(folder / KEY)
    if not isinstance(key, dict):
        raise FileNotFoundError(f"No {KEY} in {folder}. Run `export` first.")
    labels = read_labels(Path(sheet) if sheet else folder / SHEET)
    groups = {}
    for group in ("judge_only", "both_fail"):
        ids = [t for t, g in key.items() if g == group]
        counts = {v: sum(1 for t in ids if labels.get(t) == v) for v in ("real_failure", "not_failure", "unsure")}
        decided = counts["real_failure"] + counts["not_failure"]
        groups[group] = {
            "rows": len(ids), "confirmed": counts["real_failure"], "not_failure": counts["not_failure"],
            "unsure": counts["unsure"], "unlabelled": sum(1 for t in ids if t not in labels),
            "precision": round(counts["real_failure"] / decided, 3) if decided else None,
            "interval": wilson(counts["real_failure"], decided),
        }
    result = {"complete": all(g["unlabelled"] == 0 for g in groups.values()), "groups": groups}
    (folder / RESULT).write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def cohen_kappa(a: list[str], b: list[str]) -> float | None:
    """Agreement between two reviewers beyond chance. None when it cannot be defined."""
    if not a or len(a) != len(b):
        return None
    n = len(a)
    observed = sum(x == y for x, y in zip(a, b)) / n
    expected = sum((a.count(c) / n) * (b.count(c) / n) for c in set(a) | set(b))
    return None if expected == 1 else round((observed - expected) / (1 - expected), 3)


def compare_reviewers(sheet_a: Path, sheet_b: Path) -> dict:
    a, b = read_labels(sheet_a), read_labels(sheet_b)
    shared = sorted(set(a) & set(b))
    one, two = [a[t] for t in shared], [b[t] for t in shared]
    return {"shared_rows": len(shared), "agreement": round(sum(x == y for x, y in zip(one, two)) / len(shared), 3)
            if shared else None, "kappa": cohen_kappa(one, two),
            "disagreements": [t for t in shared if a[t] != b[t]]}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Blind human audit of the LLM judge.")
    sub = parser.add_subparsers(dest="command", required=True)
    exp = sub.add_parser("export")
    exp.add_argument("folder")
    exp.add_argument("--both-fail", type=int, default=3, help="both-fail runs to add as a spot check")
    sc = sub.add_parser("score")
    sc.add_argument("folder")
    sc.add_argument("--sheet")
    kp = sub.add_parser("kappa")
    kp.add_argument("sheet_a")
    kp.add_argument("sheet_b")
    args = parser.parse_args(argv)
    try:
        if args.command == "export":
            out = export_sheet(Path(args.folder), args.both_fail)
        elif args.command == "score":
            out = score(Path(args.folder), args.sheet)
        else:
            out = compare_reviewers(Path(args.sheet_a), Path(args.sheet_b))
    except FileNotFoundError as exc:
        print(exc, file=sys.stderr)
        return 2
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
