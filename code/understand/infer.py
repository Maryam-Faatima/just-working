"""Phase 1, LLM step: cross-check the rule-based V0 and add inferred constraints.

The LLM only proposes. Every proposal is checked against the code before it enters
the model: the part it names must exist in the scan, the cited lines must lie inside
that part, the quoted code must really sit on those lines, and the quote must not be
the docstring or a comment. Rejections are counted with a reason, so a hallucinated
claim is never stored silently.

A "part" is what the LLM is shown: a tool, or a workflow step (the graph node function
plus its router function, if the step has one). The call graph (understand/callgraph.py)
finds where those functions are defined and which helper functions they call, so the LLM
also sees the code a tool or step delegates to. This is the retrieval step of slide 6:
call graph, then component interactions, then LLM inference.
"""
import copy
import json
import re
from pathlib import Path

from understand import callgraph, llm
from understand.confidence import baseline_confidence
from understand.model_store import ModelError, validate_entry

SYSTEM = (
    "You analyse the source code of a conversational AI agent. "
    "Reply with JSON only. Use only facts visible in the code you are given."
)

INSTRUCTIONS = """Below are parts of an agent's code with line numbers. A part is a tool \
or a workflow step (a graph node function, plus its router function if it has one). \
Each part starts with a header such as "### tool:search_flights" or "### step:budget_critic".

A line such as "[helper (called by x) in f.py]" is a function that the part calls. You may \
cite its lines, applies_to is still the part's label. A line starting with "Reaches tools:" is \
a fact from the call graph.

Reply as {"capabilities": [...], "steps": [...], "constraints": [...]}.

1. capabilities: names of the tools (no "tool:" prefix) that really are agent capabilities.
2. steps: one item per workflow step, {"name": "<step name>", "summary": "<one sentence on \
what the code of this step does>"}.
3. constraints: rules the code ENFORCES or clearly implies, such as a required confirmation, \
a required order, input validation, a limit, a retry cap or a blocked case. Each item needs:
   - applies_to: the header label of the part, exactly as written (for example "step:budget_critic")
   - description: ONE rule, as a short sentence about what the agent must or must not do
   - file: the file of the code you cite
   - lines: "start-end", the lines of the code that enforce it
   - code: one line copied exactly from those lines

Do not list what a tool returns or what its docstring says. Never cite a docstring or a \
comment. If the code enforces no rule, return an empty list. One rule per item. Never invent a rule.

"""

MAX_PART_LINES = 80     # lines of one function shown to the LLM
MAX_BATCH_CHARS = 12000  # parts are sent in batches of about this size
MAX_CALLEES = 4         # helper functions shown per part
MIN_QUOTE_CHARS = 8
SUMMARY_LIMIT = 200
ATTEMPTS = 2            # tries per batch when the reply is unusable


# ---------------------------------------------------------------- parts of the code

def _add_function(part, function, caller=None):
    """Add one call-graph function to a part as a span the LLM can cite."""
    if any(s["file"] == function["file"] and s["start"] == function["start"] for s in part["spans"]):
        return
    what = function["name"] + (f" (called by {caller})" if caller else "")
    part["spans"].append({"file": function["file"], "start": function["start"],
                          "end": function["end"], "what": what})
    if function["docstring"]:
        part["docs"].append(function["docstring"])


def _add_callees(part, graph, by_id, function_id, caller):
    for callee_id in callgraph.callees(graph, function_id):
        if len(part["spans"]) >= 1 + MAX_CALLEES + part["routers"]:
            return
        _add_function(part, by_id[callee_id], caller)


def build_parts(scan, repo_root=None, graph=None):
    """Everything the LLM may talk about, keyed by label ("tool:x", "step:y").

    Tools come from the scan. Workflow steps need the repo, because the scan only records
    where a node is registered. The call graph locates the node function wherever it is
    defined, adds the router function, and adds the helpers they call.
    """
    if graph is None and repo_root is not None:
        graph = callgraph.build_callgraph(repo_root, scan)
    by_id = {f["id"]: f for f in graph["functions"]} if graph else {}

    parts = {}
    for tool in scan.get("tools", []):
        label = f"tool:{tool['name']}"
        if label in parts:
            continue
        part = {"kind": "tool", "name": tool["name"], "routers": 0, "note": "",
                "spans": [{"file": tool["file"], "start": tool["start_line"],
                           "end": tool["end_line"], "what": tool["name"]}],
                "docs": [tool.get("docstring") or ""]}
        function_id = f"{tool['file']}::{tool['name']}"
        if function_id in by_id:
            _add_callees(part, graph, by_id, function_id, tool["name"])
        parts[label] = part
    if graph is None:
        return parts

    interactions = {i["step"]: i for i in graph.get("interactions", [])}
    for node in scan.get("nodes", []):
        label = f"step:{node['name']}"
        if label in parts or not node.get("function"):
            continue
        part = {"kind": "step", "name": node["name"], "routers": 0, "spans": [], "docs": [], "note": ""}
        roots = [callgraph.find_function(graph, node["function"], node["file"])]
        for edge in scan.get("edges", []):
            if edge["from"] == node["name"] and edge.get("condition"):
                roots.append(callgraph.find_function(graph, edge["condition"], edge["file"]))
        roots = [r for r in dict.fromkeys(roots) if r]
        if not roots:
            continue
        for root in roots:
            _add_function(part, by_id[root])
        part["routers"] = len(roots) - 1
        for root in roots:
            _add_callees(part, graph, by_id, root, by_id[root]["name"])
        tools = [t["name"] for t in interactions.get(node["name"], {}).get("tools", [])]
        if tools:
            part["note"] = f"Reaches tools: {', '.join(tools)}"
        parts[label] = part
    return parts


def _snippet(repo_root, span):
    """Source of one span with line numbers, so the LLM can cite lines."""
    try:
        text = (Path(repo_root) / span["file"]).read_text(encoding="utf-8")
    except OSError:
        return ""
    chunk = text.splitlines()[span["start"] - 1 : span["end"]][:MAX_PART_LINES]
    return "\n".join(f"{span['start'] + i}: {line}" for i, line in enumerate(chunk))


def build_prompts(parts, repo_root):
    """One or more prompts. Parts are batched so a large repo does not overflow the model."""
    texts = []
    for label, part in parts.items():
        body = "\n".join(
            f"[{s['what']} in {s['file']}]\n{_snippet(repo_root, s)}" for s in part["spans"]
        )
        note = f"{part['note']}\n" if part.get("note") else ""
        texts.append(f"### {label}\n{note}{body}")
    batches, current, size = [], [], 0
    for text in texts:
        if current and size + len(text) > MAX_BATCH_CHARS:
            batches.append(current)
            current, size = [], 0
        current.append(text)
        size += len(text)
    if current:
        batches.append(current)
    return [INSTRUCTIONS + "\n\n".join(batch) for batch in batches]


# ---------------------------------------------------------------- checking a proposal

def _norm(text):
    return " ".join(str(text).split())


def _resolve(applies_to, parts):
    """The part a label points to. A bare name is accepted when it is unambiguous."""
    if applies_to in parts:
        return parts[applies_to]
    matches = [p for p in parts.values() if p["name"] == applies_to]
    return matches[0] if len(matches) == 1 else None


def _reject_reason(c, parts, repo_root):
    """Why a proposed constraint must not enter the model, or None if it is acceptable."""
    if not isinstance(c, dict):
        return "not an object"
    fields = ("applies_to", "description", "file", "lines", "code")
    missing = [k for k in fields if not c.get(k)]
    if missing:
        return f"missing {', '.join(missing)}"
    not_text = [k for k in fields if not isinstance(c[k], str) and k != "lines"]
    if not_text:
        return f"not text: {', '.join(not_text)}"
    part = _resolve(c["applies_to"], parts)
    if part is None:
        return f"unknown part {c['applies_to']!r}"
    found = re.fullmatch(r"(\d+)(?:\s*-\s*(\d+))?", str(c["lines"]).strip())
    if not found:
        return "lines not in 'start-end' form"
    start = int(found.group(1))
    end = int(found.group(2) or start)
    same_file = [s for s in part["spans"] if s["file"] == c["file"]]
    if not same_file:
        return "cited file is not the part's file"
    if not any(s["start"] <= start <= end <= s["end"] for s in same_file):
        return "cited lines are outside the part's code"

    code = _norm(c["code"])
    if len(code) < MIN_QUOTE_CHARS:
        return "quoted code is too short to check"
    if code.startswith("#"):
        return "quoted line is a comment"
    if any(code in _norm(doc) for doc in part["docs"]):
        return "quoted line is the docstring, not code"
    if repo_root is not None:
        try:
            lines = (Path(repo_root) / c["file"]).read_text(encoding="utf-8").splitlines()
        except OSError:
            return "cited file cannot be read"
        if code not in _norm("\n".join(lines[start - 1 : end])):
            return "quoted code is not on the cited lines"
    return None


# ---------------------------------------------------------------- merging a reply

def _as_list(value):
    return value if isinstance(value, list) else []


def _upgrade(store, entry, **changes):
    updated = copy.deepcopy(entry)
    updated.update(changes)
    validate_entry(updated)
    store.entries[entry["id"]] = updated


def apply_inference(store, scan, reply, repo_root=None, parts=None):
    """Merge one LLM reply into the store. Returns a report of what was kept."""
    if not isinstance(reply, dict):
        raise llm.LLMError("reply is not a JSON object")
    parts = parts if parts is not None else build_parts(scan, repo_root)
    report = {"capabilities_agreed": 0, "steps_agreed": 0,
              "constraints_added": 0, "constraints_rejected": []}

    caps = {e["name"]: e for e in store.find(type="capability")}
    flows = {e["name"]: e for e in store.find(type="workflow")}

    for name in _as_list(reply.get("capabilities")):
        if not isinstance(name, str):
            continue
        entry = caps.get(name.removeprefix("tool:"))
        if entry and entry["detected_by"] == "rule":
            pattern = entry["evidence"][0].get("pattern")
            _upgrade(store, entry, detected_by="rule+llm",
                     confidence=baseline_confidence("rule+llm", pattern))
            report["capabilities_agreed"] += 1

    for item in _as_list(reply.get("steps")):
        if not isinstance(item, dict):
            continue
        name, summary = item.get("name"), item.get("summary")
        if not isinstance(name, str) or not isinstance(summary, str) or not summary.strip():
            continue
        name = name.removeprefix("step:")
        entry = flows.get(name)
        if entry and entry["detected_by"] == "rule" and f"step:{name}" in parts:
            pattern = entry["evidence"][0].get("pattern")
            _upgrade(store, entry, detected_by="rule+llm",
                     description=f"{entry['description']}. {summary.strip()[:SUMMARY_LIMIT]}",
                     confidence=baseline_confidence("rule+llm", pattern))
            report["steps_agreed"] += 1

    known = {
        (tuple(e.get("related_tools", []) + e.get("related_states", [])), _norm(e["description"]).lower())
        for e in store.find(type="constraint")
    }
    for c in _as_list(reply.get("constraints")):
        reason = _reject_reason(c, parts, repo_root)
        part = None if reason else _resolve(c["applies_to"], parts)
        if part:
            key = ((part["name"],), _norm(c["description"]).lower())
            if key in known:
                reason = "duplicate of a constraint already in the model"
        if reason:
            report["constraints_rejected"].append({"constraint": c, "reason": reason})
            continue

        start, _, end = str(c["lines"]).strip().partition("-")
        entry = {
            "id": store.next_id("constraint"),
            "type": "constraint",
            "name": c["description"][:80],
            "description": c["description"],
            "evidence": [{
                "source": "static", "file": c["file"],
                "lines": f"{start.strip()}-{(end or start).strip()}", "pattern": "llm:inferred",
            }],
            "confidence": baseline_confidence("llm"),
            "status": "unverified",
            "detected_by": "llm",
        }
        entry["related_tools" if part["kind"] == "tool" else "related_states"] = [part["name"]]
        try:
            store.add(entry)
        except ModelError as exc:
            report["constraints_rejected"].append(
                {"constraint": c, "reason": f"invalid entry: {exc}"}
            )
            continue
        known.add(key)

        host = (caps if part["kind"] == "tool" else flows).get(part["name"])
        if host:
            current = store.get(host["id"])
            texts = list(current.get("constraints", []))
            if c["description"] not in texts:
                _upgrade(store, current, constraints=texts + [c["description"]])
        report["constraints_added"] += 1
    return report


# ---------------------------------------------------------------- running it

def infer_v0(scan, repo_root, store, graph=None):
    """Ask the LLM about every part of the agent and merge what survives the checks."""
    parts = build_parts(scan, repo_root, graph)
    prompts = build_prompts(parts, repo_root)
    total = {"capabilities_agreed": 0, "steps_agreed": 0, "constraints_added": 0,
             "constraints_rejected": [], "batches": len(prompts), "batches_failed": 0}
    last_error = None
    for prompt in prompts:
        for _ in range(ATTEMPTS):
            try:
                reply = llm.complete_json(prompt, SYSTEM)
                part_report = apply_inference(store, scan, reply, repo_root, parts)
            except llm.LLMError as exc:
                last_error = exc
                continue
            for key in ("capabilities_agreed", "steps_agreed", "constraints_added"):
                total[key] += part_report[key]
            total["constraints_rejected"] += part_report["constraints_rejected"]
            break
        else:
            total["batches_failed"] += 1
    if prompts and total["batches_failed"] == len(prompts):
        raise last_error
    return total


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
        print(f"LLM agreed on {report['capabilities_agreed']} capabilities and "
              f"{report['steps_agreed']} steps, added {report['constraints_added']} constraints, "
              f"rejected {len(report['constraints_rejected'])}")
        if report["batches_failed"]:
            print(f"warning: {report['batches_failed']} of {report['batches']} LLM batches failed")
        for item in report["constraints_rejected"][:10]:
            label = item["constraint"].get("applies_to") if isinstance(item["constraint"], dict) else "?"
            print(f"  rejected [{label}]: {item['reason']}")