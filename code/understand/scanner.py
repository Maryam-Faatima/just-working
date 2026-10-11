"""Phase 1 repository scanner.

Finds tools and LangGraph structure using Python's ast module.
It only parses source files. It never imports or runs the target agent.
"""
import ast
import json
import sys
from pathlib import Path

# Decorators that declare a function as a tool (matched on the last name part).
TOOL_DECORATORS = {
    "tool",
    "function_tool",
    "tool_plain",
    "kernel_function",
    "register_for_llm",
    "register_for_execution",
}
# Calls that build a tool object from a function.
TOOL_CONSTRUCTORS = {"Tool", "StructuredTool", "FunctionTool", "from_function", "from_defaults"}
# Classes that, when subclassed, define a tool.
TOOL_BASE_CLASSES = {"BaseTool", "Tool"}
# Calls whose arguments list the tools an agent can use.
REGISTRATION_CALLS = {
    "bind_tools",
    "ToolNode",
    "create_react_agent",
    "create_tool_calling_agent",
    "create_openai_tools_agent",
    "initialize_agent",
    "AgentExecutor",
    "Agent",
}
SKIP_DIRS = {".git", "__pycache__", ".venv", "venv", "node_modules", ".pytest_cache", "__MACOSX"}

def _simple_name(node):
    """Last name part of a Name, Attribute or Call: llm.function_tool(...) -> function_tool."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Call):
        return _simple_name(node.func)
    return None


def _const_str(node):
    """The value of a string constant, or None for anything else."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _label(node):
    """Readable label for an argument: a constant, a variable, or the name of a call."""
    if isinstance(node, ast.Constant):
        return str(node.value)
    if isinstance(node, (ast.Name, ast.Attribute, ast.Call)):
        return _simple_name(node)
    return None


def _entry(name, rel_path, start, end, detected_by, args=None, docstring=None):
    return {
        "name": name,
        "file": rel_path,
        "start_line": start,
        "end_line": end,
        "args": args or [],
        "docstring": docstring,
        "detected_by": detected_by,
    }


def _function_entry(node, rel_path, decorator):
    lines = [node.lineno] + [d.lineno for d in node.decorator_list]
    return _entry(
        node.name,
        rel_path,
        min(lines),
        getattr(node, "end_lineno", node.lineno),
        f"decorator:{decorator}",
        args=[a.arg for a in node.args.args],
        docstring=ast.get_docstring(node),
    )


def _class_tool_name(node):
    """A tool class names itself with `name = "..."`; fall back to the class name."""
    for stmt in node.body:
        if isinstance(stmt, ast.Assign):
            for target in stmt.targets:
                if isinstance(target, ast.Name) and target.id == "name":
                    value = _const_str(stmt.value)
                    if value:
                        return value
        elif (
            isinstance(stmt, ast.AnnAssign)
            and isinstance(stmt.target, ast.Name)
            and stmt.target.id == "name"
        ):
            value = _const_str(stmt.value)
            if value:
                return value
    return node.name


def _constructor_tool_name(call):
    """Tool name from Tool(name=...), from_function(func=...) or a first positional argument."""
    for kw in call.keywords:
        if kw.arg == "name":
            value = _const_str(kw.value)
            if value:
                return value
    for kw in call.keywords:
        if kw.arg in ("func", "coroutine"):
            value = _simple_name(kw.value)
            if value:
                return value
    if call.args:
        return _const_str(call.args[0]) or _simple_name(call.args[0])
    return None


def _dict_keys(node):
    """Map the string keys of a dict literal to their value nodes."""
    return {
        k.value: v
        for k, v in zip(node.keys, node.values)
        if isinstance(k, ast.Constant) and isinstance(k.value, str)
    }


def _schema_tool_name(node):
    """Tool name from an OpenAI or Anthropic style tool schema dict, else None."""
    keys = _dict_keys(node)
    function = keys.get("function")
    if isinstance(function, ast.Dict):
        name = _const_str(_dict_keys(function).get("name"))
        if name:
            return name
    name = _const_str(keys.get("name"))
    if name and ("parameters" in keys or "input_schema" in keys):
        return name
    return None

def _conditional_targets(call):
    """Possible destinations of add_conditional_edges: the values of its path map."""
    mapping = call.args[2] if len(call.args) > 2 else next(
        (kw.value for kw in call.keywords if kw.arg == "path_map"), None
    )
    if isinstance(mapping, ast.Dict):
        values = mapping.values
    elif isinstance(mapping, (ast.List, ast.Tuple)):
        values = mapping.elts
    else:
        values = []
    return [t for t in (_label(v) for v in values) if t]

def _scan_call(node, rel_path, result):
    fname = _simple_name(node.func)
    end = getattr(node, "end_lineno", node.lineno)

    if fname == "add_node":
        args = [_label(a) for a in node.args]
        if args and args[0]:
            result["nodes"].append(
                {
                    "name": args[0],
                    "function": args[1] if len(args) > 1 else None,
                    "file": rel_path,
                    "line": node.lineno,
                }
            )
    elif fname == "add_edge":
        args = [_label(a) for a in node.args]
        if len(args) >= 2 and all(args[:2]):
            result["edges"].append(
                {
                    "from": args[0],
                    "to": args[1],
                    "conditional": False,
                    "condition": None,
                    "file": rel_path,
                    "line": node.lineno,
                }
            )
    elif fname == "add_conditional_edges":
        source = _label(node.args[0]) if node.args else None
        condition = _label(node.args[1]) if len(node.args) > 1 else None
        if source:
            for target in _conditional_targets(node) or [None]:
                result["edges"].append(
                    {
                        "from": source,
                        "to": target,
                        "conditional": True,
                        "condition": condition,
                        "file": rel_path,
                        "line": node.lineno,
                    }
                )

    if fname in TOOL_CONSTRUCTORS:
        name = _constructor_tool_name(node)
        if name:
            result["tools"].append(
                _entry(name, rel_path, node.lineno, end, f"constructor:{fname}")
            )

    # Tool lists: registration calls, or any call with a tools=... keyword.
    if fname in REGISTRATION_CALLS:
        candidates = list(node.args) + [kw.value for kw in node.keywords]
    else:
        candidates = [kw.value for kw in node.keywords if kw.arg == "tools"]
    names, variables = [], []
    for value in candidates:
        if isinstance(value, (ast.List, ast.Tuple)):
            names += [n for n in (_simple_name(e) for e in value.elts) if n]
        elif isinstance(value, ast.Name):
            variables.append(value.id)
    if names or variables:
        result["registrations"].append(
            {
                "call": fname,
                "tools": names,
                "variables": variables,
                "file": rel_path,
                "line": node.lineno,
            }
        )

def scan_file(path, root):
    """Scan one Python file. Syntax errors are reported, not raised."""
    rel_path = path.relative_to(root).as_posix()
    result = {
        "named_lists": {},
        "file": rel_path,
        "error": None,
        "tools": [],
        "registrations": [],
        "nodes": [],
        "edges": [],
    }
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel_path)
    except (SyntaxError, UnicodeDecodeError) as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
        return result

    seen_schema_names = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                name = _simple_name(decorator)
                if name in TOOL_DECORATORS:
                    result["tools"].append(_function_entry(node, rel_path, name))
                    break
        elif isinstance(node, ast.Assign) and isinstance(node.value, (ast.List, ast.Tuple)):
            members = [n for n in (_simple_name(e) for e in node.value.elts) if n]
            if members:
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        result["named_lists"][target.id] = members
                                        
        elif isinstance(node, ast.ClassDef):
            base = next((b for b in (_simple_name(x) for x in node.bases) if b in TOOL_BASE_CLASSES), None)
            if base:
                result["tools"].append(
                    _entry(
                        _class_tool_name(node),
                        rel_path,
                        node.lineno,
                        getattr(node, "end_lineno", node.lineno),
                        f"class:{base}",
                        docstring=ast.get_docstring(node),
                    )
                )
        elif isinstance(node, ast.Call):
            _scan_call(node, rel_path, result)
        elif isinstance(node, ast.Dict):
            name = _schema_tool_name(node)
            if name and name not in seen_schema_names:
                seen_schema_names.add(name)
                result["tools"].append(
                    _entry(
                        name,
                        rel_path,
                        node.lineno,
                        getattr(node, "end_lineno", node.lineno),
                        "schema",
                    )
                )
    return result


def scan_repo(root):
    """Scan every .py file under root and return one combined result."""
    root = Path(root).resolve()
    files = []
    for path in sorted(root.rglob("*.py")):
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        files.append(scan_file(path, root))

    # Resolve variables like bind_tools(tools) to the list they were assigned (any file).
    named_lists = {}
    for f in files:
        named_lists.update(f["named_lists"])
    registrations = []
    for f in files:
        for r in f["registrations"]:
            names = list(r["tools"])
            for variable in r["variables"]:
                names += named_lists.get(variable, [])
            names = list(dict.fromkeys(names))  # remove duplicates, keep order
            if names:
                registrations.append(
                    {"call": r["call"], "tools": names, "file": r["file"], "line": r["line"]}
                )

    tools = [t for f in files for t in f["tools"]]
    defined = {t["name"] for t in tools}
    referenced = {n for r in registrations for n in r["tools"]}
    return {
        "root": str(root),
        "files_scanned": len(files),
        "errors": [{"file": f["file"], "error": f["error"]} for f in files if f["error"]],
        "tools": tools,
        "registrations": registrations,
        "nodes": [n for f in files for n in f["nodes"]],
        "edges": [e for f in files for e in f["edges"]],
        "referenced_but_not_defined": sorted(referenced - defined),
        "defined_but_not_referenced": sorted(defined - referenced),
    }


if __name__ == "__main__":
    import argparse
    from datetime import UTC, datetime

    from understand.acquire import AcquireError, head_commit, open_source
    from understand.outputs import agent_name, render_console, write_scan_outputs

    parser = argparse.ArgumentParser(description="Scan an agent repo: folder, .zip file or git URL.")
    parser.add_argument("source", nargs="?", default=".")
    parser.add_argument("--name", help="agent name for the output folder (default: from the source)")
    parser.add_argument("--out", help="base output folder (default: <repo>/outputs)")
    parser.add_argument("--json", action="store_true", help="print the full JSON instead of the summary")
    parser.add_argument("--open", action="store_true", help="open the HTML report in the browser")
    args = parser.parse_args()

    try:
        with open_source(args.source) as repo_root:
            scan = scan_repo(repo_root)
            scan["source"] = args.source
            scan["commit"] = head_commit(repo_root)
    except AcquireError as exc:
        sys.exit(f"error: {exc}")

    name = args.name or agent_name(args.source)
    scan["agent"] = name
    scan["scanned_at"] = datetime.now(UTC).isoformat(timespec="seconds")
    folder = write_scan_outputs(scan, name, args.out)
    if args.open:
        import webbrowser

        webbrowser.open((folder / "scan.html").as_uri())
    print(json.dumps(scan, indent=2) if args.json else render_console(scan, folder))
