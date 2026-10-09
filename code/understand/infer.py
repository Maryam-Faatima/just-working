"""Phase 1, LLM step: cross-check the rule-based V0 and add inferred constraints.

The LLM only proposes. Every proposal is checked against what the scanner found
(known tool, cited lines inside that tool's code) before it enters the model, so
a hallucinated claim is rejected and counted instead of silently stored.
"""
import copy
import json
from pathlib import Path

from understand import llm
from understand.confidence import baseline_confidence
from understand.model_store import validate_entry

SYSTEM = (
    "You analyse the source code of a conversational AI agent. "
    "Reply with JSON only. Use only facts visible in the code you are given."
)


def _snippet(repo_root, tool, limit=60):
    """Source of one tool with line numbers, so the LLM can cite lines."""
    try:
        text = (Path(repo_root) / tool["file"]).read_text(encoding="utf-8")
    except OSError:
        return ""
    start = tool["start_line"]
    chunk = text.splitlines()[start - 1 : tool["end_line"]][:limit]
    return "\n".join(f"{start + i}: {line}" for i, line in enumerate(chunk))


def build_prompt(scan, repo_root):
    parts, seen = [], set()
    for tool in scan.get("tools", []):
        if tool["name"] in seen:
            continue
        seen.add(tool["name"])
        parts.append(f"### tool: {tool['name']} ({tool['file']})\n{_snippet(repo_root, tool)}")
    return (
        "Below are the tools of an agent, with line numbers.\n"
        "1. In `capabilities`, list the tool names you agree are real agent capabilities.\n"
        "2. In `constraints`, list rules the code itself enforces or implies "
        "(a confirmation step, an ordering requirement, a validation). Each needs: "
        'applies_to (a tool name from below), description, file, lines (like "72-80").\n'
        'Reply as {"capabilities": ["name"], "constraints": [{...}]}.\n\n'
        + "\n\n".join(parts)
    )


def _reject_reason(c, tools):
    if not isinstance(c, dict):
        return "not an object"
    missing = [k for k in ("applies_to", "description", "file", "lines") if not c.get(k)]
    if missing:
        return f"missing {', '.join(missing)}"
    tool = tools.get(c["applies_to"])
    if tool is None:
        return f"unknown tool {c['applies_to']!r}"
    if c["file"] != tool["file"]:
        return "cited file is not the tool's file"
    try:
        start, end = (int(x) for x in str(c["lines"]).split("-"))
    except ValueError:
        return "lines not in 'start-end' form"
    if not tool["start_line"] <= start <= end <= tool["end_line"]:
        return "cited lines are outside the tool's code"
    return None


def apply_inference(store, scan, reply):
    """Merge an LLM reply into the store. Returns a report of what was kept."""
    tools = {t["name"]: t for t in scan.get("tools", [])}
    report = {"capabilities_agreed": 0, "constraints_added": 0, "constraints_rejected": []}
    if not isinstance(reply, dict):
        raise llm.LLMError("reply is not a JSON object")

    caps = {e["name"]: e for e in store.find(type="capability")}
    for name in reply.get("capabilities", []):
        entry = caps.get(name)
        if entry and entry["detected_by"] == "rule":
            updated = copy.deepcopy(entry)
            updated["detected_by"] = "rule+llm"
            pattern = entry["evidence"][0].get("pattern")
            updated["confidence"] = baseline_confidence("rule+llm", pattern)
            validate_entry(updated)
            store.entries[entry["id"]] = updated
            report["capabilities_agreed"] += 1

    for c in reply.get("constraints", []):
        reason = _reject_reason(c, tools)
        if reason:
            report["constraints_rejected"].append({"constraint": c, "reason": reason})
            continue
        entry = {
            "id": store.next_id("constraint"),
            "type": "constraint",
            "name": c["description"][:80],
            "description": c["description"],
            "evidence": [{
                "source": "static", "file": c["file"], "lines": str(c["lines"]),
                "pattern": "llm:inferred",
            }],
            "confidence": baseline_confidence("llm"),
            "status": "unverified",
            "detected_by": "llm",
            "related_tools": [c["applies_to"]],
        }
        store.add(entry)
        cap = caps.get(c["applies_to"])
        if cap:
            current = store.get(cap["id"])
            updated = copy.deepcopy(current)
            updated.setdefault("constraints", [])
            if c["description"] not in updated["constraints"]:
                updated["constraints"].append(c["description"])
            validate_entry(updated)
            store.entries[cap["id"]] = updated
        report["constraints_added"] += 1
    return report


def infer_v0(scan, repo_root, store):
    reply = llm.complete_json(build_prompt(scan, repo_root), SYSTEM)
    return apply_inference(store, scan, reply)


if __name__ == "__main__":
    import argparse
    import sys

    from understand.model_store import build_v0

    parser = argparse.ArgumentParser(description="Rule-based V0 plus LLM inference.")
    parser.add_argument("scan_json")
    parser.add_argument("--repo", required=True, help="path of the scanned repo")
    parser.add_argument("--out", help="output file (default: model_v0.json next to scan.json)")
    args = parser.parse_args()

    scan = json.loads(Path(args.scan_json).read_text(encoding="utf-8"))
    store = build_v0(scan)
    try:
        report = infer_v0(scan, args.repo, store)
    except llm.LLMError as exc:
        print(f"warning: LLM step skipped, saving rule-only V0 ({exc})", file=sys.stderr)
        report = None
    out = Path(args.out) if args.out else Path(args.scan_json).with_name("model_v0.json")
    store.save(out)
    print(f"saved {out} ({len(store.entries)} entries)")
    if report:
        print(f"LLM agreed on {report['capabilities_agreed']} capabilities, "
              f"added {report['constraints_added']} constraints, "
              f"rejected {len(report['constraints_rejected'])}")