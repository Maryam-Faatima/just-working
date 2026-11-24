"""Phase 1 gold-standard evaluation (MF-6): compare what GreatTest found with a hand-made answer.

For each agent with a file in fixtures/gold/, read the pipeline outputs in outputs/<agent>/
(model_v0.json, callgraph.json, run_summary.json) and report:

  tool recall / precision      gold tools against capability entries
  workflow recall / precision  gold graph nodes against workflow entries
  constraint recall            gold rules (file and line range) against constraint entries
  LLM constraint precision     share of LLM-proposed constraints that sit on a gold rule
  resolved-call share          resolved calls / (resolved + unresolved) in the call graph
  rejection rate               LLM proposals the validator rejected / all proposals
  detection source             how many entries came from rules, the LLM, or both

Run the pipeline on each agent first (with a real LLM key), then:
    python -m scripts.eval_phase1                  # every file in fixtures/gold/
    python -m scripts.eval_phase1 --agent target_agent --out outputs/eval
Nothing here names an agent: the gold file says what is right, the outputs say what was found.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INFER_DETAIL = re.compile(r"agreed on (\d+).*?added (\d+).*?rejected (\d+)", re.IGNORECASE)


def ratio(num, den):
    """num / den, or None when there is nothing to divide by (shown as n/a, never as 0)."""
    return None if not den else round(num / den, 3)


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def line_span(text):
    """(start, end) from '48-50', '72' or 72, else None."""
    numbers = [int(n) for n in re.findall(r"\d+", str(text or ""))]
    if not numbers:
        return None
    return numbers[0], numbers[-1]


def overlaps(entry, gold):
    """True if the entry's evidence sits in the gold rule's file and line range."""
    want = line_span(gold.get("lines"))
    for ev in entry.get("evidence", []):
        file = str(ev.get("file", "")).replace("\\", "/")
        if not file.endswith(gold["file"]):
            continue
        span = line_span(ev.get("lines"))
        if want is None or span is None or (span[0] <= want[1] and want[0] <= span[1]):
            return True
    return False


def compare(gold_names, found_names):
    gold, found = set(gold_names), set(found_names)
    hit = gold & found
    return {
        "gold": len(gold), "found": len(found), "matched": len(hit),
        "recall": ratio(len(hit), len(gold)), "precision": ratio(len(hit), len(found)),
        "missed": sorted(gold - found), "extra": sorted(found - gold),
    }


def call_graph_share(graph):
    stats = (graph or {}).get("stats") or {}
    resolved, unresolved = stats.get("resolved", 0), stats.get("unresolved", 0)
    return {
        "resolved": resolved, "unresolved": unresolved, "external": stats.get("external", 0),
        "resolved_share": ratio(resolved, resolved + unresolved),
    }


def rejection_rate(summary):
    for stage in (summary or {}).get("stages", []):
        if stage.get("stage") == "infer":
            m = INFER_DETAIL.search(stage.get("detail", ""))
            if m:
                agreed, added, rejected = (int(g) for g in m.groups())
                return {"agreed": agreed, "added": added, "rejected": rejected,
                        "rejection_rate": ratio(rejected, agreed + added + rejected)}
    return {"agreed": None, "added": None, "rejected": None, "rejection_rate": None}


def constraint_scores(gold_rules, entries):
    """Recall over gold rules, and precision of the constraints the LLM proposed."""
    constraints = [e for e in entries if e["type"] == "constraint"]
    llm = [e for e in constraints if "llm" in str(e.get("detected_by", "")) and "developer" not in str(e.get("detected_by", ""))]
    found = [g for g in gold_rules if any(overlaps(e, g) for e in constraints)]
    on_gold = [e for e in llm if any(overlaps(e, g) for g in gold_rules)]
    return {
        "gold": len(gold_rules), "matched": len(found), "recall": ratio(len(found), len(gold_rules)),
        "missed": [g["text"] for g in gold_rules if g not in found],
        "llm_proposed": len(llm), "llm_on_gold_rule": len(on_gold),
        "llm_precision": ratio(len(on_gold), len(llm)),
        "llm_to_review": [f"{e['id']}: {e['name']}" for e in llm if e not in on_gold],
    }


def evaluate(gold, folder):
    """All metrics for one agent. `folder` is its pipeline output folder."""
    folder = Path(folder)
    model = load(folder / "model_v0.json")
    entries = model["entries"] if isinstance(model, dict) else model
    result = {"agent": gold["agent"], "labelled_by": gold.get("labelled_by", "")}
    result["tools"] = compare(gold["tools"], [e["name"] for e in entries if e["type"] == "capability"])
    result["workflow"] = compare(gold["workflow_steps"], [e["name"] for e in entries if e["type"] == "workflow"])
    result["constraints"] = constraint_scores(gold.get("constraints", []), entries) if gold.get("constraints") else None
    graph = load(folder / "callgraph.json") if (folder / "callgraph.json").exists() else None
    result["call_graph"] = call_graph_share(graph)
    summary = load(folder / "run_summary.json") if (folder / "run_summary.json").exists() else None
    result["inference"] = rejection_rate(summary)
    result["detected_by"] = dict(Counter(f"{e['type']}:{e.get('detected_by', '?')}" for e in entries))
    return result


def pct(value):
    return "n/a" if value is None else f"{value * 100:.0f}%"


def table(results):
    head = ("| Agent | Tool recall | Tool precision | Workflow recall | Workflow precision | Constraint recall "
            "| LLM constraint precision | Resolved-call share | Rejection rate |")
    lines = [head, "|" + "---|" * 9]
    for r in results:
        c = r["constraints"] or {}
        lines.append(
            f"| {r['agent']} | {pct(r['tools']['recall'])} | {pct(r['tools']['precision'])} "
            f"| {pct(r['workflow']['recall'])} | {pct(r['workflow']['precision'])} "
            f"| {pct(c.get('recall'))} | {pct(c.get('llm_precision'))} "
            f"| {pct(r['call_graph']['resolved_share'])} | {pct(r['inference']['rejection_rate'])} |")
    return "\n".join(lines)


def details(results):
    out = []
    for r in results:
        out.append(f"\n{r['agent']}")
        for key in ("tools", "workflow"):
            if r[key]["missed"] or r[key]["extra"]:
                out.append(f"  {key}: missed {r[key]['missed']} extra {r[key]['extra']}")
        c = r["constraints"]
        if c and (c["missed"] or c["llm_to_review"]):
            out.append(f"  constraints missed: {c['missed']}")
            out.append(f"  LLM constraints not on a gold rule (review by hand): {c['llm_to_review']}")
    return "\n".join(out)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m scripts.eval_phase1", description=__doc__.split("\n")[0])
    parser.add_argument("--gold-dir", default=str(ROOT / "fixtures" / "gold"))
    parser.add_argument("--outputs", default=str(ROOT / "outputs"))
    parser.add_argument("--agent", help="only this agent (its gold file name without .json)")
    parser.add_argument("--out", help="write phase1_eval.json and phase1_eval.md here")
    args = parser.parse_args(argv)
    files = sorted(Path(args.gold_dir).glob("*.json"))
    if args.agent:
        files = [f for f in files if f.stem == args.agent]
    if not files:
        print("no gold files found", file=sys.stderr)
        return 2
    results, problems = [], []
    for path in files:
        gold = load(path)
        folder = Path(args.outputs) / gold["agent"]
        if not (folder / "model_v0.json").exists():
            problems.append(f"{gold['agent']}: no model_v0.json in {folder}, run the pipeline first")
            continue
        results.append(evaluate(gold, folder))
    for line in problems:
        print(line, file=sys.stderr)
    if not results:
        return 2
    text = table(results)
    print(text)
    print(details(results))
    if args.out:
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        (out / "phase1_eval.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
        (out / "phase1_eval.md").write_text(text + "\n", encoding="utf-8")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
