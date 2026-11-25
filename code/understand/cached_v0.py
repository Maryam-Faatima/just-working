"""Cached V0: a saved copy of the LLM-enriched Behavioral Model, for runs without an LLM.

The pipeline needs an LLM key and the network for its infer stage. The offline demo and any run
where the LLM is down use a snapshot instead: fixtures/cached_v0/<agent>.json, saved once from a
real run and committed (decision 73).

    python -m understand.cached_v0 save outputs/<agent>     save a snapshot from a finished run
    python pipeline.py <source> --cached-v0                 use the snapshot instead of the LLM

Only what the LLM added is taken from a snapshot: capabilities and workflow steps it agreed with
(detected_by rule+llm) and the constraints it inferred (detected_by llm). The rule-based entries
and the developer's rules always come from the current code and the current spec, so ids and the
rubric stay consistent. A snapshot made from an older commit is still used, with a warning.
"""
import argparse
import copy
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from understand.confidence import baseline_confidence
from understand.model_store import ModelError, ModelStore, validate_entry
from understand.outputs import safe_name

DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "cached_v0"


class SnapshotError(ValueError):
    pass


def snapshot_path(name, cache_dir=None):
    return Path(cache_dir or DEFAULT_CACHE_DIR) / f"{safe_name(name)}.json"


def save_snapshot(store, name, commit=None, cache_dir=None):
    """Write the model plus where it came from. Returns the file path."""
    path = snapshot_path(name, cache_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = store.to_dict()
    data["snapshot"] = {"commit": commit, "saved_at": datetime.now(UTC).isoformat(timespec="seconds")}
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return path


def load_snapshot(name, cache_dir=None):
    """Return the snapshot dict, or None when there is none. A broken file raises SnapshotError."""
    path = snapshot_path(name, cache_dir)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        for entry in data["entries"]:
            validate_entry(entry)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise SnapshotError(f"cached V0 {path} cannot be used: {exc}") from exc
    return data


def _constraint_key(entry):
    return (tuple(entry.get("related_tools", []) + entry.get("related_states", [])),
            " ".join(entry["description"].split()).lower())


def apply_snapshot(store, snapshot):
    """Merge the LLM's part of a snapshot into a rule-based store. Returns a report."""
    report = {"upgraded": 0, "constraints_added": 0, "constraints_skipped": 0}
    by_name = {(e["type"], e["name"]): e for e in store.entries.values()}

    for old in snapshot["entries"]:
        if old.get("detected_by") != "rule+llm" or old["type"] not in ("capability", "workflow"):
            continue
        entry = by_name.get((old["type"], old["name"]))
        if not entry or entry["detected_by"] != "rule":
            continue
        updated = copy.deepcopy(entry)
        pattern = entry["evidence"][0].get("pattern")
        updated.update(detected_by="rule+llm", description=old["description"],
                       confidence=baseline_confidence("rule+llm", pattern))
        validate_entry(updated)
        store.entries[entry["id"]] = updated
        report["upgraded"] += 1

    known = {_constraint_key(e) for e in store.find(type="constraint")}
    hosts = {(e["type"], e["name"]): e for e in store.entries.values() if e["type"] != "constraint"}
    for old in snapshot["entries"]:
        if old.get("detected_by") != "llm" or old["type"] != "constraint":
            continue
        if _constraint_key(old) in known or not _targets_exist(old, hosts):
            report["constraints_skipped"] += 1
            continue
        entry = copy.deepcopy(old)
        entry.update(id=store.next_id("constraint"), status="unverified",
                     confidence=baseline_confidence("llm"))
        try:
            store.add(entry)
        except ModelError:
            report["constraints_skipped"] += 1
            continue
        known.add(_constraint_key(entry))
        report["constraints_added"] += 1
        for host_key in _host_keys(entry):
            current = copy.deepcopy(store.get(hosts[host_key]["id"]))
            texts = current.get("constraints", [])
            if entry["description"] not in texts:
                current["constraints"] = [*texts, entry["description"]]
                store.entries[current["id"]] = current
    return report


def _host_keys(entry):
    return ([("capability", n) for n in entry.get("related_tools", [])]
            + [("workflow", n) for n in entry.get("related_states", [])])


def _targets_exist(entry, hosts):
    """A cached constraint is kept only if the tool or step it concerns still exists in the code."""
    keys = _host_keys(entry)
    return bool(keys) and all(k in hosts for k in keys)


def stale_note(snapshot, commit):
    """A warning text when the snapshot was made from another commit, else None."""
    saved = (snapshot.get("snapshot") or {}).get("commit")
    if saved and commit and saved != commit:
        return f"snapshot is from commit {saved[:8]}, the code is at {commit[:8]}"
    if not saved:
        return "snapshot does not record its commit"
    return None


def main(argv=None):
    parser = argparse.ArgumentParser(description="Save a cached V0 snapshot from a finished pipeline run.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    save = sub.add_parser("save", help="save outputs/<agent>/model_v0.json as the snapshot of that agent")
    save.add_argument("folder", help="output folder of a finished run, e.g. outputs/target_agent")
    save.add_argument("--cache-dir", help=f"where snapshots live (default: {DEFAULT_CACHE_DIR})")
    args = parser.parse_args(argv)

    folder = Path(args.folder)
    try:
        store = ModelStore.load(folder / "model_v0.json")
        summary = json.loads((folder / "run_summary.json").read_text(encoding="utf-8"))
    except (OSError, ValueError, KeyError, ModelError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    path = save_snapshot(store, store.agent, summary.get("commit"), args.cache_dir)
    print(f"saved {len(store.entries)} entries to {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
