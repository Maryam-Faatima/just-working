"""Phase 1, call graph construction (slide 6: AST parsing -> call graph -> component
interactions -> RAG + LLM inference).

Input: the repo folder and, optionally, the scan (it tells us which module variables hold
a tool-using agent and which functions are workflow steps).
Output: a dict (written as callgraph.json and callgraph.md) with
  functions     every module-level function and class method, with file, lines, docstring
  edges         direct calls between those functions
  agent_edges   calls on a variable that holds an agent built from a tool list
  external      calls into libraries (json.loads, ChatOllama, ...)
  unresolved    calls we could not follow, each with a reason (never silently dropped)
  agents        module variables built by a registration call, with their tools
  interactions  per workflow step: functions reached, agents reached, tools reached, and a path

It only parses source files. It never imports or runs the target agent.
Direct calls only. Dynamic dispatch is not resolved, it is reported as unresolved.
"""
import ast
import builtins
import json
from collections import deque
from pathlib import Path

from understand.scanner import SKIP_DIRS

MAX_DEPTH = 6        # how far interactions follow calls from a workflow step
MAX_DIAGRAM_NODES = 60
MAX_UNRESOLVED_ROWS = 50
TOOL_CALL_METHODS = {"invoke", "ainvoke", "run", "arun", "func", "__call__"}

LIMITATIONS = [
    "Direct calls only: foo(), self.foo(), module.foo(), Class.foo(), tool.invoke().",
    ("Calls on local variables, parameters, call results and attributes of self are reported "
     "as unresolved unless the variable has a known type (see below)."),
    ("Types are only known from a single constructor call (x = Foo()) or a parameter "
     "annotation (x: Foo). Dynamic dispatch cannot be decided from source."),
    "Nested functions are not nodes of their own, their calls belong to the enclosing function.",
    "Calls to a repo class without __init__, and to builtins, are not recorded.",
    "Imports are matched to files under the repo root only. Anything else counts as external.",
]


# ---------------------------------------------------------------- reading the repo

def _py_files(root):
    found = {}
    for path in sorted(Path(root).rglob("*.py")):
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        found[rel.as_posix()] = path
    return found


def _module_file(dotted, files):
    base = dotted.replace(".", "/")
    for candidate in (f"{base}.py", f"{base}/__init__.py"):
        if candidate in files:
            return candidate
    return None


def _from_base(current_file, level, module):
    """Dotted name of the module an ImportFrom points to, or None if it leaves the repo root."""
    if level == 0:
        return module or ""
    package = list(Path(current_file).parent.parts)
    if level - 1 > len(package):
        return None
    package = package[: len(package) - (level - 1)]
    return ".".join(package + (module.split(".") if module else []))


def _collect_imports(tree, current_file, files):
    """local name -> ("module", dotted) | ("symbol", module dotted, name) | ("external", dotted)."""
    imports = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname:
                    imports[alias.asname] = ("module", alias.name)
                else:
                    first = alias.name.split(".")[0]
                    imports[first] = ("module", first)
        elif isinstance(node, ast.ImportFrom):
            base = _from_base(current_file, node.level, node.module)
            for alias in node.names:
                if alias.name == "*":
                    continue
                local = alias.asname or alias.name
                if base is None:
                    imports[local] = ("external", alias.name)
                elif _module_file(f"{base}.{alias.name}" if base else alias.name, files):
                    imports[local] = ("module", f"{base}.{alias.name}" if base else alias.name)
                else:
                    imports[local] = ("symbol", base, alias.name)
    return imports


def _start_line(node):
    return min([node.lineno] + [d.lineno for d in node.decorator_list])


def _function_record(node, rel, qualname, kind):
    return {
        "id": f"{rel}::{qualname}",
        "name": qualname,
        "file": rel,
        "start": _start_line(node),
        "end": node.end_lineno,
        "kind": kind,
        "docstring": ast.get_docstring(node, clean=False) or "",
    }


def _index_module(tree, rel):
    """Module-level functions, classes with their methods, and module-level variable names."""
    info = {"functions": {}, "classes": {}, "vars": {}, "var_values": {}, "records": []}
    for stmt in tree.body:
        if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
            info["functions"][stmt.name] = stmt
            info["records"].append((stmt, _function_record(stmt, rel, stmt.name, "function"), None))
        elif isinstance(stmt, ast.ClassDef):
            methods = {}
            for item in stmt.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods[item.name] = item
                    record = _function_record(item, rel, f"{stmt.name}.{item.name}", "method")
                    info["records"].append((item, record, stmt.name))
            info["classes"][stmt.name] = {"methods": methods, "bases": stmt.bases}
        elif isinstance(stmt, (ast.Assign, ast.AnnAssign)):
            targets = stmt.targets if isinstance(stmt, ast.Assign) else [stmt.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    again = target.id in info["vars"]
                    info["vars"][target.id] = getattr(stmt.value, "lineno", None)
                    # keep the value only if the variable is assigned exactly once
                    info["var_values"][target.id] = None if again else stmt.value
    return info


def _find_agents(modules, scan):
    """Module variables assigned from a registration call (create_react_agent(...) and so on)."""
    agents = {}
    for reg in (scan or {}).get("registrations", []):
        module = modules.get(reg["file"])
        if not module:
            continue
        for stmt in module["tree"].body:
            if (isinstance(stmt, ast.Assign) and isinstance(stmt.value, ast.Call)
                    and stmt.value.lineno == reg["line"]
                    and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name)):
                variable = stmt.targets[0].id
                agents[f"{reg['file']}::{variable}"] = {
                    "id": f"{reg['file']}::{variable}", "variable": variable,
                    "file": reg["file"], "line": reg["line"],
                    "call": reg["call"], "tools": list(reg["tools"]),
                }
    return agents


# ---------------------------------------------------------------- resolving one call

class _Resolver:
    def __init__(self, modules, files, agents):
        self.modules = modules
        self.files = files
        self.agents = agents

    # what does `name` mean inside module `file`?
    def lookup(self, file, name):
        """("function", id) | ("class", file, name) | ("agent", id) | ("var", type) | None."""
        module = self.modules.get(file)
        if module is None:
            return None
        if name in module["functions"]:
            return ("function", f"{file}::{name}")
        if name in module["classes"]:
            return ("class", file, name)
        if f"{file}::{name}" in self.agents:
            return ("agent", f"{file}::{name}")
        if name in module["vars"]:
            return ("var", self.var_type(file, name))
        return None

    def var_type(self, file, name):
        """Type of a module variable built by one constructor call, else None."""
        module = self.modules[file]
        value = module["var_values"].get(name)
        if isinstance(value, ast.Call):
            return self.value_type(value, file, module["imports"])
        return None

    def target_of(self, chain, file, imports):
        """What a dotted name points to (class, function, external...), or None."""
        root, rest = chain[0], chain[1:]
        target = self.lookup(file, root)
        if target is None and root in imports:
            target = self._imported(imports[root])
        while target and target[0] == "module" and rest:
            module_file, dotted = target[1], target[2]
            while rest and _module_file(f"{dotted}.{rest[0]}", self.files):
                dotted = f"{dotted}.{rest[0]}"
                module_file = _module_file(dotted, self.files)
                rest = rest[1:]
            if not rest:
                return None
            target = self.lookup(module_file, rest[0]) or ("missing",)
            rest = rest[1:]
        if target and target[0] == "external":
            return ("external", ".".join([target[1]] + rest))
        return target if not rest else None

    def value_type(self, call, file, imports):
        """Type of `x = Something(...)`: a repo class or an external class, else None."""
        chain = _chain(call.func)
        target = self.target_of(chain, file, imports) if chain else None
        return target if target and target[0] in ("class", "external") else None

    def annotation_type(self, annotation, file, imports):
        """Type from a parameter annotation: builtin container, repo class or external class."""
        node = annotation.value if isinstance(annotation, ast.Subscript) else annotation
        chain = _chain(node)
        if not chain:
            return None
        if len(chain) == 1 and chain[0] in BUILTIN_TYPES and chain[0] not in imports:
            return ("builtin",)
        target = self.target_of(chain, file, imports)
        return target if target and target[0] in ("class", "external") else None

    def foreign_base(self, file, cls, depth=0):
        """True if the class inherits from something outside the repo (TypedDict, BaseModel...)."""
        module = self.modules.get(file)
        if module is None or depth > 5:
            return True
        for base in module["classes"][cls]["bases"]:
            chain = _chain(base)
            target = self.target_of(chain, file, module["imports"]) if chain else None
            if target and target[0] == "class":
                if self.foreign_base(target[1], target[2], depth + 1):
                    return True
            elif not (chain and len(chain) == 1 and hasattr(builtins, chain[0]) and chain[0] == "object"):
                return True
        return False

    def instance_call(self, kind, rest):
        """A call on a variable whose type is known."""
        if kind[0] == "builtin":
            return None
        if kind[0] == "external":
            return ("external", ".".join([kind[1]] + rest))
        file, cls = kind[1], kind[2]
        if len(rest) != 1:
            return ("unresolved", "call through an attribute of an instance")
        found = self.method(file, cls, rest[0])
        if found:
            return ("call", found)
        if self.foreign_base(file, cls):
            return ("external", f"{cls}.{rest[0]} (inherited from a library class)")
        return ("unresolved", "method not found on the class")

    def method(self, file, cls, name, depth=0):
        """id of Class.name, looking through base classes inside the repo."""
        module = self.modules.get(file)
        if module is None or cls not in module["classes"] or depth > 5:
            return None
        info = module["classes"][cls]
        if name in info["methods"]:
            return f"{file}::{cls}.{name}"
        for base in info["bases"]:
            if isinstance(base, ast.Name):
                target = self.lookup(file, base.id)
                if target is None and base.id in module["imports"]:
                    target = self._imported(module["imports"][base.id])
                if target and target[0] == "class":
                    found = self.method(target[1], target[2], name, depth + 1)
                    if found:
                        return found
        return None

    def _imported(self, entry):
        """Resolve an import entry to a lookup result, or ("external", dotted) / None."""
        kind = entry[0]
        if kind == "external":
            return ("external", entry[1])
        if kind == "module":
            file = _module_file(entry[1], self.files)
            return ("module", file, entry[1]) if file else ("external", entry[1])
        file = _module_file(entry[1], self.files)
        if file is None:
            return ("external", f"{entry[1]}.{entry[2]}")
        return self.lookup(file, entry[2]) or ("missing", file, entry[2])

    def _end(self, target, rest):
        """Finish a resolution once `target` is known and `rest` are the remaining attributes."""
        if target is None:
            return ("unresolved", "name not found")
        kind = target[0]
        if kind == "external":
            return ("external", ".".join([target[1]] + rest))
        if kind == "missing":
            return ("unresolved", "imported name not found in its module")
        if kind == "function":
            if not rest or (len(rest) == 1 and rest[0] in TOOL_CALL_METHODS):
                return ("call", target[1])
            return ("unresolved", "attribute call on a function")
        if kind == "class":
            if not rest:
                init = self.method(target[1], target[2], "__init__")
                return ("call", init) if init else None
            if len(rest) == 1:
                found = self.method(target[1], target[2], rest[0])
                if found:
                    return ("call", found)
                if self.foreign_base(target[1], target[2]):
                    return ("external", f"{target[2]}.{rest[0]} (inherited from a library class)")
                return ("unresolved", "method not found on the class")
            return ("unresolved", "call through an attribute of a class")
        if kind == "agent":
            return ("agent", target[1])
        if kind == "var":
            if target[1] is not None:
                return self.instance_call(target[1], rest)
            return ("unresolved", "call on a module variable")
        if kind == "module":
            if not rest:
                return ("unresolved", "a module is called like a function")
            return self._through_module(target, rest)
        return ("unresolved", "unsupported call shape")

    def _through_module(self, target, rest):
        file, dotted = target[1], target[2]
        while rest and _module_file(f"{dotted}.{rest[0]}", self.files):
            dotted = f"{dotted}.{rest[0]}"
            file = _module_file(dotted, self.files)
            rest = rest[1:]
        if not rest:
            return ("unresolved", "a module is called like a function")
        return self._end(self.lookup(file, rest[0]) or ("missing",), rest[1:])

    def resolve(self, call, ctx):
        """Classify one call. Returns None (ignore), or (kind, value, ...) as above."""
        chain = _chain(call.func)
        if chain is None:
            literal = _receiver_root(call.func)
            if isinstance(literal, LITERALS):
                return None  # a method of a str, list or dict literal
            return ("unresolved", "receiver is an expression")
        root, rest = chain[0], chain[1:]
        if root in ctx["nested"]:
            return None  # a helper defined inside the same function, already part of its body
        if root in ("self", "cls") and ctx["cls"]:
            if len(rest) == 1:
                found = self.method(ctx["file"], ctx["cls"], rest[0])
                return ("call", found) if found else ("unresolved", "method not found on the class or its bases")
            return ("unresolved", "call through an attribute of self")
        if root in ctx["types"]:
            return self.instance_call(ctx["types"][root], rest)
        if root in ctx["locals"]:
            return ("unresolved", "call on a local variable or parameter")
        target = self.lookup(ctx["file"], root)
        if target is None and root in ctx["imports"]:
            target = self._imported(ctx["imports"][root])
        if target is None and hasattr(builtins, root):
            return None
        return self._end(target, rest)


def _chain(node):
    """['a', 'b', 'c'] for a.b.c, or None if the root is not a plain name."""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        return [node.id] + parts[::-1]
    return None


BUILTIN_TYPES = {"dict", "list", "str", "int", "float", "bool", "set", "tuple", "bytes", "frozenset"}
LITERALS = (ast.Constant, ast.JoinedStr, ast.List, ast.Dict, ast.Set, ast.Tuple,
            ast.ListComp, ast.DictComp, ast.SetComp)


def _receiver_root(node):
    while isinstance(node, ast.Attribute):
        node = node.value
    return node


def _local_types(fn, resolver, file, imports):
    """name -> type for parameters with an annotation and variables assigned exactly once
    from a constructor call. Everything else stays unknown."""
    types = {}
    args = fn.args
    for arg in args.posonlyargs + args.args + args.kwonlyargs:
        if arg.annotation is not None:
            kind = resolver.annotation_type(arg.annotation, file, imports)
            if kind:
                types[arg.arg] = kind
    stores = {}
    for node in ast.walk(fn):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            stores[node.id] = stores.get(node.id, 0) + 1
    for node in ast.walk(fn):
        if (isinstance(node, ast.Assign) and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name) and isinstance(node.value, ast.Call)):
            name = node.targets[0].id
            if stores.get(name) == 1:
                kind = resolver.value_type(node.value, file, imports)
                if kind:
                    types[name] = kind
    return types


def _local_names(fn):
    names, nested = set(), set()
    args = fn.args
    for arg in args.posonlyargs + args.args + args.kwonlyargs + [args.vararg, args.kwarg]:
        if arg:
            names.add(arg.arg)
    for node in ast.walk(fn):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node is not fn:
            nested.add(node.name)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            names.update((a.asname or a.name).split(".")[0] for a in node.names)
    return names, nested


# ---------------------------------------------------------------- building the graph

def build_callgraph(root, scan=None):
    root = Path(root).resolve()
    files = _py_files(root)
    modules, errors = {}, []
    for rel, path in files.items():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel)
        except (SyntaxError, UnicodeDecodeError, ValueError) as exc:
            errors.append({"file": rel, "error": f"{type(exc).__name__}: {exc}"})
            continue
        module = _index_module(tree, rel)
        module["tree"] = tree
        module["imports"] = _collect_imports(tree, rel, files)
        modules[rel] = module

    agents = _find_agents(modules, scan)
    resolver = _Resolver(modules, files, agents)
    graph = {
        "agent": (scan or {}).get("agent"),
        "functions": [], "edges": [], "agent_edges": [], "external": [], "unresolved": [],
        "agents": list(agents.values()),
        "errors": errors, "limitations": LIMITATIONS,
    }
    seen = set()
    for rel, module in modules.items():
        for fn, record, cls in module["records"]:
            graph["functions"].append(record)
            locals_, nested = _local_names(fn)
            ctx = {"file": rel, "cls": cls, "imports": module["imports"],
                   "locals": locals_, "nested": nested,
                   "types": _local_types(fn, resolver, rel, module["imports"])}
            for stmt in fn.body:
                for node in ast.walk(stmt):
                    if not isinstance(node, ast.Call):
                        continue
                    outcome = resolver.resolve(node, ctx)
                    if outcome is None:
                        continue
                    key = (record["id"], node.lineno, ast.dump(node.func))
                    if key in seen:
                        continue
                    seen.add(key)
                    kind, value = outcome[0], outcome[1]
                    where = {"from": record["id"], "line": node.lineno}
                    if kind == "call":
                        graph["edges"].append({**where, "to": value})
                    elif kind == "agent":
                        graph["agent_edges"].append({**where, "to": value})
                    elif kind == "external":
                        graph["external"].append({**where, "name": value})
                    else:
                        graph["unresolved"].append(
                            {**where, "call": ast.unparse(node.func), "reason": value}
                        )
    graph["interactions"] = component_interactions(graph, scan)
    graph["stats"] = {
        "files": len(modules), "functions": len(graph["functions"]),
        "resolved": len(graph["edges"]), "agent_calls": len(graph["agent_edges"]),
        "external": len(graph["external"]), "unresolved": len(graph["unresolved"]),
        "parse_errors": len(errors),
        "unresolved_by_reason": {
            reason: sum(1 for u in graph["unresolved"] if u["reason"] == reason)
            for reason in sorted({u["reason"] for u in graph["unresolved"]})
        },
    }
    return graph


# ---------------------------------------------------------------- component interactions

def find_function(graph, name, prefer_file=None):
    """id of a module-level function by name. Prefers `prefer_file`, else must be unique."""
    matches = [f["id"] for f in graph["functions"] if f["name"] == name]
    if prefer_file and f"{prefer_file}::{name}" in matches:
        return f"{prefer_file}::{name}"
    return matches[0] if len(matches) == 1 else None


def callees(graph, function_id):
    """Ids of the repo functions this function calls directly, in order of first call."""
    return list(dict.fromkeys(e["to"] for e in graph["edges"] if e["from"] == function_id))


def _short(function_id):
    return function_id.split("::", 1)[1]


def component_interactions(graph, scan):
    """For each workflow step: which functions, agents and tools it reaches through calls."""
    if not scan:
        return []
    tool_ids = {f"{t['file']}::{t['name']}": t["name"] for t in scan.get("tools", [])}
    agents = {a["id"]: a for a in graph["agents"]}
    outgoing, agent_calls = {}, {}
    for e in graph["edges"]:
        outgoing.setdefault(e["from"], []).append(e["to"])
    for e in graph["agent_edges"]:
        agent_calls.setdefault(e["from"], []).append(e["to"])

    steps = {}
    for node in scan.get("nodes", []):
        steps.setdefault(node["name"], node)
    result = []
    for name, node in steps.items():
        roots = [find_function(graph, node.get("function"), node["file"])] if node.get("function") else []
        for edge in scan.get("edges", []):
            if edge["from"] == name and edge.get("condition"):
                roots.append(find_function(graph, edge["condition"], edge["file"]))
        roots = [r for r in dict.fromkeys(roots) if r]

        path_to = {r: [_short(r)] for r in roots}
        queue = deque((r, 0) for r in roots)
        tools, used_agents = {}, []
        while queue:
            current, depth = queue.popleft()
            for agent_id in agent_calls.get(current, []):
                agent = agents[agent_id]
                if agent_id not in used_agents:
                    used_agents.append(agent_id)
                for tool in agent["tools"]:
                    tools.setdefault(tool, path_to[current] + [f"{agent['variable']} (agent)", tool])
            if depth >= MAX_DEPTH:
                continue
            for nxt in outgoing.get(current, []):
                if nxt in tool_ids:
                    tools.setdefault(tool_ids[nxt], path_to[current] + [tool_ids[nxt]])
                if nxt not in path_to:
                    path_to[nxt] = path_to[current] + [_short(nxt)]
                    queue.append((nxt, depth + 1))
        result.append({
            "step": name,
            "roots": roots,
            "functions": [f for f in path_to if f not in roots],
            "agents": used_agents,
            "tools": [{"name": t, "path": p} for t, p in tools.items()],
        })
    return result


# ---------------------------------------------------------------- outputs

def _cell(text):
    return str(text).replace("|", "\\|").replace("\n", " ").strip()


def to_mermaid(graph):
    """Flowchart of workflow steps -> functions -> agents -> tools (what interactions found)."""
    ids, lines = {}, []

    def ref(label, shape):
        if label not in ids:
            ids[label] = f"n{len(ids)}"
            open_, close = {"step": ("[[", "]]"), "agent": ("{{", "}}"), "tool": ("([", "])")}.get(shape, ("[", "]"))
            lines.append(f'    {ids[label]}{open_}"{label}"{close}')
        return ids[label]

    edges = set()
    for item in graph.get("interactions", []):
        step = ref(f"step: {item['step']}", "step")
        for tool in item["tools"]:
            previous = step
            for part in tool["path"]:
                shape = "agent" if part.endswith("(agent)") else ("tool" if part == tool["name"] else "fn")
                label = part if shape != "tool" else f"tool: {part}"
                current = ref(label, shape)
                edges.add((previous, current))
                previous = current
        if not item["tools"]:
            for root in item["roots"]:
                edges.add((step, ref(_short(root), "fn")))
        if len(ids) >= MAX_DIAGRAM_NODES:
            break
    body = [f"    {a} --> {b}" for a, b in sorted(edges)]
    return "flowchart LR\n" + "\n".join(lines + body) + "\n"


def to_markdown(graph):
    stats = graph["stats"]
    out = [f"# Call graph: {graph.get('agent') or 'agent'}", "",
           "| Functions | Resolved calls | Agent calls | External calls | Unresolved calls |",
           "|---|---|---|---|---|",
           (f"| {stats['functions']} | {stats['resolved']} | {stats['agent_calls']} | "
            f"{stats['external']} | {stats['unresolved']} |"), "",
           "## Component interactions (workflow step to tools)", ""]
    rows = []
    for item in graph.get("interactions", []):
        roots = ", ".join(_short(r) for r in item["roots"]) or "(function not found)"
        tools = ", ".join(t["name"] for t in item["tools"]) or "none"
        via = "; ".join(" > ".join(t["path"]) for t in item["tools"]) or ""
        rows.append(f"| {_cell(item['step'])} | {_cell(roots)} | {_cell(tools)} | {_cell(via)} |")
    if rows:
        out += ["| Step | Function | Reaches tools | Path |", "|---|---|---|---|"] + rows
    else:
        out.append("_none (no workflow steps in the scan)_")
    out += ["", "## Diagram", "", "```mermaid", to_mermaid(graph).rstrip(), "```", "",
            f"## Unresolved calls ({len(graph['unresolved'])})", ""]
    rows = [f"| {_cell(_short(u['from']))} | {_cell(u['call'])} | {u['line']} | {_cell(u['reason'])} |"
            for u in graph["unresolved"][:MAX_UNRESOLVED_ROWS]]
    if rows:
        out += ["| In function | Call | Line | Why |", "|---|---|---|---|"] + rows
        if len(graph["unresolved"]) > MAX_UNRESOLVED_ROWS:
            out.append(f"\n_{len(graph['unresolved']) - MAX_UNRESOLVED_ROWS} more in callgraph.json_")
    else:
        out.append("_none_")
    out += ["", "## Limitations", ""] + [f"- {text}" for text in graph["limitations"]]
    return "\n".join(out) + "\n"


def write_outputs(graph, folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "callgraph.json").write_text(json.dumps(graph, indent=2), encoding="utf-8")
    (folder / "callgraph.md").write_text(to_markdown(graph), encoding="utf-8")
    return folder


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build the call graph of an agent repo.")
    parser.add_argument("repo", help="repo folder")
    parser.add_argument("--scan", help="scan.json of this repo (adds agents and component interactions)")
    parser.add_argument("--out", help="output folder (default: next to --scan, else current folder)")
    args = parser.parse_args()

    scan = json.loads(Path(args.scan).read_text(encoding="utf-8")) if args.scan else None
    graph = build_callgraph(args.repo, scan)
    folder = args.out or (Path(args.scan).parent if args.scan else ".")
    write_outputs(graph, folder)
    s = graph["stats"]
    print(f"saved {Path(folder) / 'callgraph.json'}: {s['functions']} functions, {s['resolved']} resolved, "
          f"{s['agent_calls']} agent calls, {s['external']} external, {s['unresolved']} unresolved")