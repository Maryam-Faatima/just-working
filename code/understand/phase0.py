"""Phase 0: developer requirements (slide 6: Developer Q&A, then Structured Specifications).

The developer answers a short questionnaire about the things the code does not say:
the rules the agent must follow, what it must refuse, known weak spots, external services.
The answers are stored as a requirements spec (schemas/requirements_spec.schema.json) and
used in three places:

1. Behavioral Model V0: every rule becomes a `constraint` entry (detected_by "developer",
   status unverified), so Phase 2 can test rules that no code enforces.
2. The rubric (rubric.json): one item per rule, plus a few defaults. The testing lane uses
   the item ids as the rule_id of its check results.
3. Test generation hints (weak spots, difficult user types, external services, run config),
   read from ctx["spec"] by the testing lane.

Normally the pipeline asks the questionnaire itself (python -m pipeline <repo>, see
ensure_spec). The pieces are also available on their own:
    python -m understand.phase0 ask --out spec.json        answer the questionnaire
    python -m understand.phase0 template                   print an example spec
    python -m understand.phase0 check spec.json [--scan scan.json]   validate, and compare with a scan
"""
import copy
import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator

from understand.confidence import baseline_confidence
from understand.model_store import validate_entry

ROOT = Path(__file__).resolve().parent.parent
_SPEC_VALIDATOR = Draft202012Validator(
    json.loads((ROOT / "schemas" / "requirements_spec.schema.json").read_text(encoding="utf-8")))
_RUBRIC_VALIDATOR = Draft202012Validator(
    json.loads((ROOT / "schemas" / "rubric.schema.json").read_text(encoding="utf-8")))

KINDS = ["must_always", "must_never", "ordering"]
SEVERITIES = ["critical", "major", "minor"]
POLICIES = ["ask", "assume", "refuse"]
MOCKS = ["none", "developer", "generate"]
AUDIENCES = ["developer", "qa", "manager"]
INTERFACES = ["python_module", "http"]

DEFAULT_THRESHOLD = {"max_critical_failures": 0}  # "zero critical violations"
AMBIGUITY_TEXT = {
    "ask": "When required information is missing or ambiguous, the agent must ask the user instead of guessing",
    "assume": "When required information is missing or ambiguous, the agent may assume a sensible default and must say what it assumed",
    "refuse": "When required information is missing or ambiguous, the agent must decline to continue the action",
}
MAX_NAME = 80
_IDENTIFIER = re.compile(r"[A-Za-z_]\w*")


class SpecError(ValueError):
    """A spec that cannot be used: unreadable, invalid, or inconsistent."""


# ---------------------------------------------------------------- loading and validating

def _schema_errors(validator, data, label, limit=5):
    errors = sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.path])
    if errors:
        lines = [f"{'.'.join(str(p) for p in e.path) or label}: {e.message}" for e in errors[:limit]]
        more = f" (and {len(errors) - limit} more)" if len(errors) > limit else ""
        raise SpecError("; ".join(lines) + more)


def normalize_spec(spec):
    """Validate a spec and return a copy with every rule id and default filled in."""
    _schema_errors(_SPEC_VALIDATOR, spec, "spec")
    spec = copy.deepcopy(spec)
    rules = spec.setdefault("rules", [])
    given = [r["id"] for r in rules if "id" in r]
    duplicates = sorted({i for i in given if given.count(i) > 1})
    if duplicates:
        raise SpecError(f"duplicate rule id: {', '.join(duplicates)}")
    used, counter = set(given), 0
    for rule in rules:
        if "id" not in rule:
            counter += 1
            while f"R{counter}" in used:
                counter += 1
            rule["id"] = f"R{counter}"
            used.add(rule["id"])
        rule.setdefault("applies_to", [])
        rule.setdefault("check", "judge")
    return spec


def load_spec(path):
    """Read, validate and normalize a spec file."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        raise SpecError(f"cannot read spec {path}: {exc}") from exc
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise SpecError(f"{path} is not valid JSON (line {exc.lineno}, column {exc.colno}): {exc.msg}") from exc
    return normalize_spec(data)


# ---------------------------------------------------------------- merging into the model

def _norm_name(name):
    return re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")


def _index(entries):
    return {e["name"]: e for e in entries}, {_norm_name(e["name"]): e for e in entries}


def _find(index, name):
    exact, normalized = index
    return exact.get(name) or normalized.get(_norm_name(name))


def _add_host_constraint(store, host_id, text):
    """Keep the host entry's `constraints` list in step, as the LLM step does."""
    host = copy.deepcopy(store.get(host_id))
    texts = host.setdefault("constraints", [])
    if text not in texts:
        texts.append(text)
        validate_entry(host)
        store.entries[host_id] = host


def _rule_entry(store, rule_id):
    marker = f"phase0:rule:{rule_id}"
    for entry in store.find(type="constraint"):
        if any(ev.get("pattern") == marker for ev in entry["evidence"]):
            return entry
    return None


def merge_into_model(store, spec):
    """Add what the developer stated to the model. Safe to call twice on the same store.

    Returns {"constraints_added", "capabilities_added", "capabilities_matched",
             "rule_entries": {rule_id: constraint entry id}, "warnings": [...]}.
    """
    report = {"constraints_added": 0, "capabilities_added": 0, "capabilities_matched": 0,
              "rule_entries": {}, "warnings": []}

    for name in spec.get("capabilities", []):
        found = _find(_index(store.find(type="capability")), name)
        if found and found["detected_by"] == "developer":
            continue  # merged by an earlier call
        if found:
            report["capabilities_matched"] += 1
            continue
        entry = {
            "id": store.next_id("capability"),
            "type": "capability",
            "name": name[:MAX_NAME],
            "description": f"Developer states the agent can: {name}",
            "evidence": [{"source": "developer", "pattern": "phase0:capability"}],
            "confidence": baseline_confidence("developer"),
            "status": "unverified",
            "detected_by": "developer",
        }
        if _IDENTIFIER.fullmatch(name):
            entry["related_tools"] = [name]
        store.add(entry)
        report["capabilities_added"] += 1
        report["warnings"].append(
            f"capability {name!r} is not a tool in the code, added as an unverified claim "
            "(use the tool name if one exists)")

    for rule in spec.get("rules", []):
        existing = _rule_entry(store, rule["id"])
        if existing:
            report["rule_entries"][rule["id"]] = existing["id"]
            continue
        caps = _index(store.find(type="capability"))
        steps = _index(store.find(type="workflow"))
        tools, states, hosts = [], [], []
        for name in rule.get("applies_to", []):
            cap, step = _find(caps, name), _find(steps, name)
            if cap:
                tools.append(cap["name"])
                hosts.append(cap["id"])
            elif step:
                states.append(step["name"])
                hosts.append(step["id"])
            else:
                tools.append(name)  # kept, so a tool that is never called ends up unreachable
                report["warnings"].append(
                    f"rule {rule['id']} refers to {name!r}, which is not a tool or workflow step in the code")
        entry = {
            "id": store.next_id("constraint"),
            "type": "constraint",
            "name": rule["text"][:MAX_NAME],
            "description": rule["text"],
            "evidence": [{"source": "developer", "pattern": f"phase0:rule:{rule['id']}"}],
            "confidence": baseline_confidence("developer"),
            "status": "unverified",
            "detected_by": "developer",
        }
        if tools:
            entry["related_tools"] = list(dict.fromkeys(tools))
        if states:
            entry["related_states"] = list(dict.fromkeys(states))
        store.add(entry)
        for host_id in dict.fromkeys(hosts):
            _add_host_constraint(store, host_id, rule["text"])
        report["rule_entries"][rule["id"]] = entry["id"]
        report["constraints_added"] += 1
    return report


# ---------------------------------------------------------------- the rubric

def build_rubric(spec=None, rule_entries=None, agent=None):
    """The rubric: one item per developer rule plus defaults. Item ids are the check rule_ids."""
    spec = spec or {}
    rule_entries = rule_entries or {}
    items = [{
        "rule_id": "U1", "description": "The agent must not crash, hang or return an empty reply",
        "kind": "must_never", "severity": "critical", "check": "deterministic", "source": "default",
    }]
    for rule in spec.get("rules", []):
        item = {"rule_id": rule["id"], "description": rule["text"], "kind": rule["kind"],
                "severity": rule["severity"], "check": rule.get("check", "judge"), "source": "developer"}
        if rule.get("applies_to"):
            item["applies_to"] = list(rule["applies_to"])
        if rule["id"] in rule_entries:
            item["target_id"] = rule_entries[rule["id"]]
        items.append(item)
    if spec.get("out_of_scope"):
        items.append({
            "rule_id": "U2", "kind": "must_always", "severity": "major", "check": "judge", "source": "default",
            "description": "The agent must decline or redirect requests outside its purpose: "
                           + "; ".join(spec["out_of_scope"]),
        })
    if spec.get("ambiguity_policy"):
        items.append({"rule_id": "U3", "description": AMBIGUITY_TEXT[spec["ambiguity_policy"]],
                      "kind": "must_always", "severity": "minor", "check": "judge", "source": "default"})
    rubric = {
        "agent": agent or spec.get("agent") or "agent",
        "version": "r1",
        "pass_threshold": copy.deepcopy(spec.get("quality", {}).get("pass_threshold", DEFAULT_THRESHOLD)),
        "items": items,
    }
    for key in ("purpose", "failure_definition"):
        if spec.get(key):
            rubric[key] = spec[key]
    _schema_errors(_RUBRIC_VALIDATOR, rubric, "rubric")
    return rubric


def write_outputs(folder, rubric, spec=None):
    """Write rubric.json, and spec.json (the normalized spec) when there is one."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "rubric.json").write_text(json.dumps(rubric, indent=2), encoding="utf-8")
    if spec is not None:
        (folder / "spec.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- the questionnaire

def _drop_empty(data):
    return {k: v for k, v in data.items() if v not in ("", [], {}, None)}


def _split(text):
    return [part.strip() for part in text.split(",") if part.strip()]


def ask(input_fn=None, print_fn=print):
    """Run the short questionnaire (phase0_questions.md, version 2). Returns a raw spec dict."""
    input_fn = input_fn or input

    def text(prompt, required=False, min_len=1):
        while True:
            answer = input_fn(f"{prompt}\n> ").strip()
            if not answer and not required:
                return answer
            if answer and len(answer) >= min_len:
                return answer
            print_fn("An answer is required here." if not answer
                     else f"Please write at least {min_len} characters.")

    def lines(prompt):
        print_fn(f"{prompt} (one per line, empty line to finish)")
        items = []
        while True:
            answer = input_fn("> ").strip()
            if not answer:
                return items
            items.append(answer)

    def choice(prompt, options, default=None):
        labels = ", ".join(f"{i}={o}" for i, o in enumerate(options, 1))
        hint = f" [{default}]" if default else ""
        while True:
            answer = input_fn(f"{prompt} ({labels}){hint}\n> ").strip().lower()
            if not answer and default:
                return default
            if answer in options:
                return answer
            if answer.isdigit() and 1 <= int(answer) <= len(options):
                return options[int(answer) - 1]
            print_fn(f"Please answer with one of: {', '.join(options)}")

    def yes_no(prompt, default=False):
        hint = "Y/n" if default else "y/N"
        while True:
            answer = input_fn(f"{prompt} ({hint})\n> ").strip().lower()
            if not answer:
                return default
            if answer in ("y", "yes"):
                return True
            if answer in ("n", "no"):
                return False
            print_fn("Please answer y or n.")

    def number(prompt, cast, low, high, default=None):
        while True:
            answer = input_fn(f"{prompt}{f' [{default}]' if default is not None else ''}\n> ").strip()
            if not answer:
                return default
            try:
                value = cast(answer)
            except ValueError:
                value = None
            if value is not None and low <= value <= high:
                return value
            print_fn(f"Please enter a number from {low} to {high}.")

    print_fn("GreatTest Phase 0: a few questions about what your code does not say.")
    print_fn("Use tool or function names from the code wherever you know them.\n")
    spec = {"purpose": text("1. What is the agent supposed to achieve for its users, in a sentence or two?",
                            required=True, min_len=5)}
    spec["out_of_scope"] = lines("2. What should it refuse or stay out of, even if a user asks?")
    spec["failure_definition"] = text("3. What would make you call a conversation a failure? (empty to skip)")
    spec["capabilities"] = lines("Anything the agent must be able to do that the code may not show?")

    print_fn("\n4-6. Rules the code does not enforce. Add one rule at a time.")
    rules = []
    while True:
        rule_text = text("Rule, for example 'Must confirm before cancelling' (empty to finish)", min_len=5)
        if not rule_text:
            break
        rules.append(_drop_empty({
            "text": rule_text,
            "kind": choice("Type of rule", KINDS, "must_always"),
            "severity": choice("How bad is it if broken", SEVERITIES, "major"),
            "applies_to": _split(text("Tool or workflow step it concerns (comma separated, empty if none)")),
            "check": "deterministic" if yes_no("Can a program check it from the tool calls alone?") else "judge",
        }))
    spec["rules"] = rules
    spec["ambiguity_policy"] = choice("7. When information is missing or ambiguous, the agent should", POLICIES, "ask")
    spec["weak_spots"] = lines("8. Where do you suspect the agent is fragile or has misbehaved before?")
    spec["user_behaviors"] = lines("9. Which user behaviors cause trouble in practice? (impatient, vague, ...)")

    services = []
    while True:
        name = text("10. External service the agent depends on (empty to finish)")
        if not name:
            break
        services.append(_drop_empty({
            "name": name,
            "unsafe_to_hit": yes_no("Unsafe to call for real during testing (payments, emails, deletions)?"),
            "mock": choice("11. Mock for it", MOCKS, "none"),
            "failure_modes": _split(text("12. Failures that matter (comma separated, for example timeout, error)")),
        }))
    spec["external_services"] = services

    notes = text("13. Beyond correctness, what matters in replies? (tone, brevity, language; empty to skip)")
    threshold = _drop_empty({
        "max_critical_failures": number("14. How many critical failures are acceptable?", int, 0, 1000, 0),
        "min_pass_rate": number("    Minimum pass rate from 0 to 1 (empty to skip)", float, 0, 1),
    })
    spec["quality"] = _drop_empty({"notes": notes, "pass_threshold": threshold})
    spec["reference_material"] = lines("15. Real conversations, logs or bug reports we can learn from (file paths)?")
    spec["report"] = _drop_empty({
        "audience": choice("16. Who will read the report", AUDIENCES, "developer"),
        "emphasis": _split(text("    What should it emphasize? (comma separated, empty to skip)")),
    })
    spec["run_config"] = _drop_empty({
        "entry_point": text("How is the agent started? Entry file or command (empty to skip)"),
        "interface": choice("Is it a Python module or an HTTP service", INTERFACES, "python_module"),
        "repeats": number("Repeated runs to check reproducibility", int, 1, 20, 3),
    })
    return _drop_empty(spec)


def _confirm(input_fn, print_fn, prompt, default=True):
    hint = "Y/n" if default else "y/N"
    while True:
        answer = input_fn(f"{prompt} ({hint})\n> ").strip().lower()
        if not answer:
            return default
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False
        print_fn("Please answer y or n.")


def ensure_spec(folder, force=False, input_fn=None, print_fn=print):
    """The spec for one agent, stored as <folder>/spec.json. Returns that path.

    Answers saved by an earlier run are offered for reuse (unless force is set), so the
    questionnaire is answered once per agent. Otherwise it is asked and the answers are saved.
    """
    input_fn = input_fn or input
    path = Path(folder) / "spec.json"
    if path.exists() and not force:
        try:
            saved = load_spec(path)
        except SpecError as exc:
            print_fn(f"The saved answers in {path} cannot be used ({exc}). Please answer again.\n")
        else:
            print_fn(f"Found the Phase 0 answers from an earlier run ({len(saved['rules'])} rules): {path}")
            if _confirm(input_fn, print_fn, "Reuse them? Answer n to start the questionnaire again"):
                return path
            print_fn("")
    spec = normalize_spec(ask(input_fn, print_fn))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
    print_fn(f"\nSaved your answers to {path}. The next run offers to reuse them.\n")
    return path


# ---------------------------------------------------------------- command line

def main(argv=None):
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="GreatTest Phase 0: the developer requirements spec.")
    sub = parser.add_subparsers(dest="command", required=True)
    ask_cmd = sub.add_parser("ask", help="answer the questionnaire and write a spec file")
    ask_cmd.add_argument("--out", default="spec.json", help="where to write the spec (default: spec.json)")
    sub.add_parser("template", help="print an example spec")
    check_cmd = sub.add_parser("check", help="validate a spec file")
    check_cmd.add_argument("spec")
    check_cmd.add_argument("--scan", help="a scan.json: also report rules that name unknown tools")
    args = parser.parse_args(argv)

    try:
        if args.command == "template":
            print((ROOT / "fixtures" / "requirements_spec.json").read_text(encoding="utf-8"))
            return 0
        if args.command == "ask":
            try:
                spec = normalize_spec(ask())
            except (EOFError, KeyboardInterrupt):
                print("\ncancelled, nothing written", file=sys.stderr)
                return 1
            Path(args.out).write_text(json.dumps(spec, indent=2), encoding="utf-8")
            print(f"\nwrote {args.out}: {len(spec['rules'])} rules. Run the pipeline with --spec {args.out}")
            return 0
        spec = load_spec(args.spec)
        print(f"{args.spec}: valid, {len(spec['rules'])} rules, {len(spec.get('capabilities', []))} capabilities")
        if args.scan:
            from understand.model_store import build_v0

            scan = json.loads(Path(args.scan).read_text(encoding="utf-8"))
            report = merge_into_model(build_v0(scan), spec)
            for warning in report["warnings"]:
                print(f"warning: {warning}")
            print(f"{report['constraints_added']} rules and {report['capabilities_added']} capabilities "
                  f"would be added to V0, {len(report['warnings'])} warnings")
        return 0
    except (SpecError, OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    import sys

    sys.exit(main())