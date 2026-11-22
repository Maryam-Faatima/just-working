"""Compute the FYP-2 evaluation plan's metrics from one agent's output folder.

    python -m evaluation.metrics outputs/<agent> [--k 3]

Reads what the pipeline already wrote (evidence_graph.json, findings.json, traces/, judge_all.json,
judge_consistency.json, judge_audit.json) and writes evaluation_metrics.json and evaluation_metrics.md.
Nothing here calls an LLM, so it costs no quota. A metric whose input file is missing is left out and
listed under `missing`, never guessed.
"""
import argparse
import json
import math
import sys
from pathlib import Path


def read_json(path: Path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


# ---------------------------------------------------------------------- pure statistics

def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    """95% Wilson score interval for a proportion; None when there are no trials."""
    if n <= 0:
        return None
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return round(max(0.0, centre - half), 3), round(min(1.0, centre + half), 3)


def brier(pairs: list[tuple[float, int]]) -> float | None:
    """Mean squared gap between a confidence and a 0/1 outcome. Lower is better."""
    return round(sum((p - o) ** 2 for p, o in pairs) / len(pairs), 4) if pairs else None


def ece(pairs: list[tuple[float, int]], bins: int = 10) -> float | None:
    """Expected calibration error with equal-width confidence bins."""
    if not pairs:
        return None
    total = len(pairs)
    error = 0.0
    for b in range(bins):
        low, high = b / bins, (b + 1) / bins
        inside = [(p, o) for p, o in pairs if (low <= p < high) or (b == bins - 1 and p == 1.0)]
        if inside:
            conf = sum(p for p, _ in inside) / len(inside)
            acc = sum(o for _, o in inside) / len(inside)
            error += len(inside) / total * abs(acc - conf)
    return round(error, 4)


def pass_hat_k(runs_by_test: dict[str, list[bool]], k: int) -> float | None:
    """tau-bench reliability: chance that all k repeats of a test succeed, averaged over tests.

    For a test with n runs and c successes the estimate is C(c, k) / C(n, k). Tests with fewer
    than k runs are skipped.
    """
    scores = [math.comb(sum(runs), k) / math.comb(len(runs), k)
              for runs in runs_by_test.values() if len(runs) >= k]
    return round(sum(scores) / len(scores), 3) if scores else None


# ---------------------------------------------------------------------- readers per metric

def coverage(graph: dict) -> dict:
    """Model entries reached by at least one test or finding, by entry type."""
    entries = [n for n in graph.get("nodes", []) if n.get("kind") == "model_entry"]
    reached = {e["from"] for e in graph.get("edges", []) if e.get("relation") in ("targeted_by", "has_finding")}
    by_type: dict[str, dict] = {}
    for n in entries:
        row = by_type.setdefault(n.get("entry_type", "?"), {"entries": 0, "tested": 0})
        row["entries"] += 1
        row["tested"] += n["id"] in reached
    total = sum(r["entries"] for r in by_type.values())
    tested = sum(r["tested"] for r in by_type.values())
    return {"entries": total, "tested": tested, "rate": round(tested / total, 3) if total else None,
            "interval": wilson(tested, total), "by_type": by_type}


def reproducibility(findings: list[dict]) -> dict:
    rows = [f["reproducibility"] for f in findings if isinstance(f.get("reproducibility"), dict)]
    failed = [r for r in rows if r.get("failures")]
    return {"findings": len(findings),
            "failed": sum(1 for f in findings if f.get("result") == "fail"),
            "always_failed": sum(1 for r in failed if r["failures"] == r["runs"]),
            "sometimes_failed": sum(1 for r in failed if r["failures"] < r["runs"]),
            "by_severity": {s: sum(1 for f in findings if f.get("severity") == s and f.get("result") == "fail")
                            for s in ("critical", "major", "minor", "info")}}


def run_outcomes(folder: Path, judge_all) -> dict[str, list[bool]]:
    """Per test: one True/False per run. A run succeeds if it completed and no rule check failed."""
    failed_checks = {r["trace_id"]: r.get("checks_failed") or []
                     for r in (judge_all or {}).get("traces", []) if isinstance(r, dict) and "trace_id" in r}
    runs: dict[str, list[bool]] = {}
    traces_dir = Path(folder) / "traces"
    for path in sorted(traces_dir.glob("*.json")) if traces_dir.is_dir() else []:
        trace = read_json(path)
        if not isinstance(trace, dict) or not trace.get("trace_id"):
            continue
        ok = trace.get("run_status") == "completed" and not failed_checks.get(str(trace["trace_id"]))
        runs.setdefault(str(trace.get("test_id", "?")), []).append(bool(ok))
    return runs


def judge_section(judge_all, consistency, audit) -> dict:
    out: dict = {}
    if isinstance(judge_all, dict):
        s = judge_all.get("summary", {})
        decided = sum((s.get("agreement") or {}).values())
        agree = (s.get("agreement") or {}).get("both_ok", 0) + (s.get("agreement") or {}).get("both_fail", 0)
        out["agreement"] = {**s, "agreement_interval": wilson(agree, decided)}
    if isinstance(consistency, dict):
        out["consistency"] = consistency.get("summary")
    if isinstance(audit, dict):
        out["audit"] = audit.get("groups")
    return out


# ---------------------------------------------------------------------- assemble + render

def compute(folder: Path, k: int = 3) -> dict:
    folder = Path(folder)
    graph, findings = read_json(folder / "evidence_graph.json"), read_json(folder / "findings.json")
    judge_all = read_json(folder / "judge_all.json")
    result: dict = {"agent": folder.name, "k": k, "missing": []}

    for name, value in (("evidence_graph.json", graph), ("findings.json", findings), ("judge_all.json", judge_all)):
        if value is None:
            result["missing"].append(name)
    if isinstance(graph, dict):
        result["coverage"] = coverage(graph)
    if isinstance(findings, list):
        result["findings"] = reproducibility([f for f in findings if isinstance(f, dict)])
    runs = run_outcomes(folder, judge_all)
    if runs:
        total = sum(len(v) for v in runs.values())
        result["reliability"] = {
            "tests": len(runs), "runs": total, "successful_runs": sum(sum(v) for v in runs.values()),
            "pass^" + str(k): pass_hat_k(runs, k),
            "basis": "a run succeeds if it completed and no rule check failed"
                     if judge_all else "a run succeeds if it completed (no check results found)",
        }
    result["judge"] = judge_section(judge_all, read_json(folder / "judge_consistency.json"),
                                    read_json(folder / "judge_audit.json"))
    return result


def _pct(x) -> str:
    return "not measured" if x is None else f"{round(100 * x)}%"


def to_markdown(r: dict) -> str:
    lines = [f"# Evaluation metrics: {r['agent']}", ""]
    if r["missing"]:
        lines += [f"Missing inputs (metrics left out): {', '.join(r['missing'])}", ""]
    lines += ["| Metric | Value |", "|---|---|"]
    if "coverage" in r:
        c = r["coverage"]
        by = "; ".join(f"{t} {v['tested']}/{v['entries']}" for t, v in sorted(c["by_type"].items()))
        lines.append(f"| Model coverage | {_pct(c['rate'])} ({c['tested']} of {c['entries']}); {by}; 95% interval {c['interval']} |")
    if "findings" in r:
        f = r["findings"]
        lines.append(f"| Findings | {f['findings']} ({f['failed']} failed; {f['always_failed']} failed on every run, "
                     f"{f['sometimes_failed']} on some runs) |")
    if "reliability" in r:
        rel = r["reliability"]
        name = "pass^" + str(r["k"])
        lines.append(f"| {name} | {rel[name]} over {rel['tests']} tests, {rel['runs']} runs |")
    j = r["judge"]
    if "agreement" in j:
        a = j["agreement"]
        lines.append(f"| Judge and checks agree | {_pct(a.get('agreement_rate'))} "
                     f"(both fine {a['agreement']['both_ok']}, both fail {a['agreement']['both_fail']}, "
                     f"judge only {a['agreement']['judge_only']}, checks only {a['agreement']['checks_only']}); "
                     f"undecided {a.get('undecided', 0)}; 95% interval {a['agreement_interval']} |")
    if j.get("consistency"):
        c = j["consistency"]
        lines.append(f"| Judge self-consistency | identical scores on {c['identical_scores']} of {c['traces']} traces, "
                     f"same verdict on {c['same_verdict']}, mean spread {c['mean_spread']}, incomplete {c.get('incomplete', 0)} |")
    for group, g in (j.get("audit") or {}).items():
        lines.append(f"| Judge precision, {group} | {_pct(g.get('precision'))} ({g['confirmed']} of "
                     f"{g['confirmed'] + g['not_failure']} confirmed by a human; {g['unsure']} unsure; "
                     f"{g['unlabelled']} unlabelled); 95% interval {g.get('interval')} |")
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Compute evaluation metrics for one agent run.")
    parser.add_argument("folder", help="outputs/<agent>")
    parser.add_argument("--k", type=int, default=3, help="k for pass^k (default 3)")
    args = parser.parse_args(argv)
    folder = Path(args.folder)
    if not folder.is_dir():
        print(f"No such folder: {folder}", file=sys.stderr)
        return 2
    result = compute(folder, args.k)
    (folder / "evaluation_metrics.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (folder / "evaluation_metrics.md").write_text(to_markdown(result), encoding="utf-8")
    print(to_markdown(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
