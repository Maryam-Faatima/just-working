"""Turn a raw scan into readable files, saved in one folder per agent."""
import json
import re
from pathlib import Path

from understand.acquire import is_git_url
from understand.html_report import render_html

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "outputs"
SPECIAL_NODES = {"START", "END", "__start__", "__end__"}


def agent_name(source):
    """Folder-safe agent name taken from a git URL, a zip file or a folder."""
    if is_git_url(source):
        name = re.split(r"[/:]", str(source).rstrip("/"))[-1].removesuffix(".git")
    else:
        path = Path(source).resolve()
        name = path.stem if path.suffix.lower() == ".zip" else path.name
    return re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-.") or "agent"


def _cell(text):
    """Make text safe inside a Markdown table cell."""
    return str(text).replace("|", "\\|").replace("\n", " ").strip()


def _short(docstring, limit=100):
    """First line of a docstring, shortened."""
    if not docstring:
        return ""
    first = docstring.strip().splitlines()[0].strip()
    return first if len(first) <= limit else first[: limit - 3] + "..."


def _table(headers, rows):
    if not rows:
        return "_none_\n"
    lines = [
        "| " + " | ".join(headers) + " |",
        "|" + "|".join("---" for _ in headers) + "|",
    ]
    lines += ["| " + " | ".join(_cell(c) for c in row) + " |" for row in rows]
    return "\n".join(lines) + "\n"


def _edge_line(edge):
    target = edge["to"] or "(not resolved)"
    if edge["conditional"]:
        return f"{edge['from']} --({edge['condition'] or 'conditional'})--> {target}"
    return f"{edge['from']} --> {target}"


def _mermaid(scan):
    """A Mermaid flowchart of the workflow graph. GitHub and VS Code can draw it."""
    ids = {}

    def ref(name):
        return ids.setdefault(name, f"n{len(ids)}")

    labels = {
        n["name"]: f"{n['name']} ({n['function']})" if n["function"] else n["name"]
        for n in scan["nodes"]
    }
    body = []
    for edge in scan["edges"]:
        if not edge["to"]:
            continue
        src, dst = ref(edge["from"]), ref(edge["to"])
        if edge["conditional"]:
            text = (edge["condition"] or "conditional").replace('"', "'")
            body.append(f'    {src} -. "{text}" .-> {dst}')
        else:
            body.append(f"    {src} --> {dst}")
    for node in scan["nodes"]:
        ref(node["name"])
    declarations = []
    for name, node_id in ids.items():
        label = labels.get(name, name).replace('"', "'")
        shape = f'{node_id}(["{label}"])' if name in SPECIAL_NODES else f'{node_id}["{label}"]'
        declarations.append("    " + shape)
    return "\n".join(["flowchart TD", *declarations, *body])


def render_markdown(scan):
    """The readable report: tools, registrations, workflow graph, checks, errors."""
    tools, nodes, edges = scan["tools"], scan["nodes"], scan["edges"]
    commit = scan.get("commit") or "n/a (not a git checkout)"
    parts = [
        f"# Scan report: {scan.get('agent', 'agent')}",
        "",
        f"- **Source:** {scan.get('source')}",
        f"- **Commit:** {commit}",
        f"- **Scanned at:** {scan.get('scanned_at', 'n/a')}",
        f"- **Files scanned:** {scan['files_scanned']}",
        (
            f"- **Tools:** {len(tools)} | **Graph nodes:** {len(nodes)} | "
            f"**Edges:** {len(edges)} | **Parse errors:** {len(scan['errors'])}"
        ),
        "",
        "## Tools",
        "",
        _table(
            ["Tool", "Where", "Arguments", "Found by", "What it says it does"],
            [
                [
                    t["name"],
                    f"{t['file']}:{t['start_line']}-{t['end_line']}",
                    ", ".join(a for a in t["args"] if a not in ("self", "cls")) or "-",
                    t["detected_by"],
                    _short(t["docstring"]),
                ]
                for t in tools
            ],
        ),
        "## Tool registrations",
        "",
        "_Where the agent is given its tools (bind_tools, ToolNode, tools=[...])._",
        "",
        _table(
            ["Call", "Where", "Tools"],
            [
                [r["call"], f"{r['file']}:{r['line']}", ", ".join(r["tools"])]
                for r in scan["registrations"]
            ],
        ),
        "## Workflow graph",
        "",
    ]
    if nodes or edges:
        parts += ["```mermaid", _mermaid(scan), "```", "", "In plain text:", ""]
        parts += [f"- `{_edge_line(e)}`" for e in edges]
        parts += ["", "### Nodes", ""]
        parts += [
            _table(
                ["Node", "Runs", "Where"],
                [[n["name"], n["function"] or "-", f"{n['file']}:{n['line']}"] for n in nodes],
            )
        ]
        parts += ["### Edges", ""]
        parts += [
            _table(
                ["From", "To", "Type", "Decided by", "Where"],
                [
                    [
                        e["from"],
                        e["to"] or "(not resolved)",
                        "conditional" if e["conditional"] else "always",
                        e["condition"] or "-",
                        f"{e['file']}:{e['line']}",
                    ]
                    for e in edges
                ],
            )
        ]
    else:
        parts += ["_No graph structure found._", ""]
    parts += [
        "## Checks",
        "",
        "- **Used as tools but not defined in this repo:** "
        + (", ".join(scan["referenced_but_not_defined"]) or "none"),
        "- **Defined as tools but never registered:** "
        + (", ".join(scan["defined_but_not_referenced"]) or "none"),
        "",
        "## Parse errors",
        "",
        _table(["File", "Error"], [[e["file"], e["error"]] for e in scan["errors"]]),
    ]
    return "\n".join(parts) + "\n"


def render_console(scan, folder):
    """Short summary for the terminal."""
    tools, edges = scan["tools"], scan["edges"]
    commit = (scan.get("commit") or "n/a")[:8]
    lines = [
        f"Scan of {scan['agent']} (commit {commit})",
        (
            f"  {scan['files_scanned']} files, {len(tools)} tools, {len(scan['nodes'])} nodes, "
            f"{len(edges)} edges, {len(scan['errors'])} errors"
        ),
        "",
    ]
    if edges:
        lines += ["", "Workflow:"] + [f"  {_edge_line(e)}" for e in edges]
    if tools:
        width = max(len(t["name"]) for t in tools)
        lines += ["", "Tools:"]
        lines += [
            f"  {t['name']:<{width}}  {t['file']}:{t['start_line']}-{t['end_line']}" for t in tools
        ]
    lines += [
        "",
        f"Saved to {folder}",
        "  scan.html  open this in a browser",
        "  scan.md    same report as Markdown",
        "  scan.json  full data",
    ]
    return "\n".join(lines)

def write_scan_outputs(scan, name, base_dir=None):
    """Write scan.json and scan.md into <base_dir>/<name>/ and return that folder."""
    folder = Path(base_dir or DEFAULT_OUTPUT_DIR) / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "scan.json").write_text(json.dumps(scan, indent=2), encoding="utf-8")
    (folder / "scan.html").write_text(render_html(scan), encoding="utf-8")
    (folder / "scan.md").write_text(render_markdown(scan), encoding="utf-8")
    return folder