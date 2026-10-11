"""Behavioral model store (Phase 1, step 2).

Builds Behavioral Model V0 from a scan, keeps every entry valid against
schemas/model_entry.schema.json, and applies the bounded confidence update
after each runtime outcome.
"""
import copy
import json
import os
import tempfile
from pathlib import Path

from jsonschema import Draft202012Validator

from understand.confidence import baseline_confidence, tool_to_capability

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "model_entry.schema.json"
_VALIDATOR = Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))

PREFIX = {"capability": "cap", "workflow": "wf", "constraint": "con"}
OUTCOMES = {"confirmed", "contradicted", "unreachable"}

# Bounded update: move a fraction of the remaining distance toward 1 (confirm)
# or toward 0 (contradict, unreachable). Placeholders to tune (open decision 3).
CONFIRM_RATE = 0.30
CONTRADICT_RATE = 0.50
UNREACHABLE_RATE = 0.20
MIN_CONFIDENCE = 0.01
MAX_CONFIDENCE = 0.99


class ModelError(ValueError):
    """An entry or an operation that would break the model's contract."""


def validate_entry(entry):
    """Raise ModelError with a readable message if the entry breaks the schema."""
    errors = sorted(_VALIDATOR.iter_errors(entry), key=lambda e: list(e.path))
    if errors:
        first = errors[0]
        where = ".".join(str(p) for p in first.path) or "entry"
        raise ModelError(f"{entry.get('id', '?')}: {where}: {first.message}")


def update_confidence(confidence, outcome):
    """One bounded step. Never a hard overwrite, never exactly 0 or 1."""
    if outcome == "confirmed":
        new = confidence + CONFIRM_RATE * (1 - confidence)
    elif outcome == "contradicted":
        new = confidence - CONTRADICT_RATE * confidence
    elif outcome == "unreachable":
        new = confidence - UNREACHABLE_RATE * confidence
    else:
        raise ModelError(f"unknown outcome: {outcome!r}")
    return round(min(max(new, MIN_CONFIDENCE), MAX_CONFIDENCE), 4)


class ModelStore:
    """The one persistent behavioral model for one agent."""

    def __init__(self, agent, version="v0", entries=None):
        self.agent = agent
        self.version = version
        self.entries = {}
        for entry in entries or []:
            self.add(entry)

    def next_id(self, entry_type):
        prefix = PREFIX[entry_type]
        used = [int(i.split("_")[1]) for i in self.entries if i.startswith(prefix + "_")]
        return f"{prefix}_{max(used, default=0) + 1:03d}"

    def add(self, entry):
        validate_entry(entry)
        if entry["id"] in self.entries:
            raise ModelError(f"duplicate id: {entry['id']}")
        self.entries[entry["id"]] = entry
        return entry

    def get(self, entry_id):
        try:
            return self.entries[entry_id]
        except KeyError:
            raise ModelError(f"no entry with id {entry_id!r}") from None

    def find(self, type=None, status=None, name=None, max_confidence=None):
        """Entries matching all given filters. Test generation uses this to pick gaps."""
        result = []
        for e in self.entries.values():
            if type and e["type"] != type:
                continue
            if status and e["status"] != status:
                continue
            if name and e["name"] != name:
                continue
            if max_confidence is not None and e["confidence"] > max_confidence:
                continue
            result.append(e)
        return result

    def apply_outcome(self, entry_id, outcome, test_id=None, trace_id=None, runs=1):
        """Reconcile one test outcome: update status and confidence, add runtime evidence.

        runs applies the confidence step once per run, so "confirmed on 3 of 3 runs"
        is three steps. Call it separately per outcome if runs disagree.
        """
        if outcome not in OUTCOMES:
            raise ModelError(f"unknown outcome: {outcome!r}")
        if runs < 1:
            raise ModelError("runs must be at least 1")
        updated = copy.deepcopy(self.get(entry_id))
        for _ in range(runs):
            updated["confidence"] = update_confidence(updated["confidence"], outcome)
        updated["status"] = outcome
        if test_id or trace_id:
            item = {"source": "runtime"}
            if test_id:
                item["test_id"] = test_id
            if trace_id:
                item["trace_id"] = trace_id
            updated["evidence"].append(item)
        validate_entry(updated)
        self.entries[entry_id] = updated
        return updated

    def discover(self, entry_type, name, description, test_id, trace_id, related_tools=None):
        """Add an entry that runtime revealed and static analysis missed."""
        entry = {
            "id": self.next_id(entry_type),
            "type": entry_type,
            "name": name,
            "description": description,
            "evidence": [{"source": "runtime", "test_id": test_id, "trace_id": trace_id}],
            "confidence": baseline_confidence("runtime"),
            "status": "discovered",
            "detected_by": "runtime",
        }
        if related_tools:
            entry["related_tools"] = related_tools
        return self.add(entry)

    def to_dict(self):
        return {"agent": self.agent, "version": self.version, "entries": list(self.entries.values())}

    def save(self, path):
        """Write atomically, so a crash never leaves a half-written model."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)
        os.replace(tmp, path)

    @classmethod
    def load(cls, path):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data["agent"], data.get("version", "v0"), data["entries"])


def build_v0(scan, agent=None):
    """Rule-based V0: one capability per tool, one workflow entry per graph node."""
    store = ModelStore(agent or scan.get("agent", "agent"))

    nodes = {}
    for n in scan.get("nodes", []):
        nodes.setdefault(n["name"], n)
    states_for_function = {}
    for n in nodes.values():
        if n.get("function"):
            states_for_function.setdefault(n["function"], []).append(n["name"])

    seen = set()
    for tool in scan.get("tools", []):
        if tool["name"] in seen:  # the same tool found by two rules: keep the first
            continue
        seen.add(tool["name"])
        capability = tool_to_capability(tool, index=len(seen))
        if tool["name"] in states_for_function:
            capability["related_states"] = states_for_function[tool["name"]]
        store.add(capability)

    edges_from = {}
    for e in scan.get("edges", []):
        edges_from.setdefault(e["from"], []).append(e)

    for name, node in nodes.items():
        out = edges_from.get(name, [])
        evidence = [{"source": "static", "file": node["file"], "lines": str(node["line"]),
                     "pattern": "graph:add_node"}]
        seen_ev = {(node["file"], str(node["line"]), "graph:add_node")}
        for e in out:
            pattern = "graph:add_conditional_edges" if e["conditional"] else "graph:add_edge"
            key = (e["file"], str(e["line"]), pattern)
            if key not in seen_ev:
                seen_ev.add(key)
                evidence.append({"source": "static", "file": e["file"],
                                 "lines": str(e["line"]), "pattern": pattern})
        description = f"Workflow step '{name}'"
        if node.get("function"):
            description += f" runs {node['function']}"
        entry = {
            "id": store.next_id("workflow"),
            "type": "workflow",
            "name": name,
            "description": description,
            "evidence": evidence,
            "confidence": baseline_confidence("rule", "graph:add_node"),
            "status": "unverified",
            "detected_by": "rule",
        }
        targets = list(dict.fromkeys(e["to"] for e in out if e["to"]))
        if targets:
            entry["related_states"] = targets
        store.add(entry)
    return store


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Build Behavioral Model V0 from a scan.json.")
    parser.add_argument("scan_json")
    parser.add_argument("--out", help="output file (default: model_v0.json next to scan.json)")
    args = parser.parse_args()

    scan = json.loads(Path(args.scan_json).read_text(encoding="utf-8"))
    try:
        model = build_v0(scan)
    except ModelError as exc:
        sys.exit(f"error: {exc}")
    out = Path(args.out) if args.out else Path(args.scan_json).with_name("model_v0.json")
    model.save(out)
    caps = len(model.find(type="capability"))
    flows = len(model.find(type="workflow"))
    print(f"{model.agent}: {caps} capabilities, {flows} workflow steps -> {out}")