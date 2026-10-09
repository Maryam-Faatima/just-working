"""Self-contained HTML report for a scan.

One file, no internet and no JavaScript needed: double-click it and it opens in a browser.
The workflow graph is drawn as inline SVG.
"""
from collections import defaultdict, deque
from html import escape

NODE_W = 176
NODE_H = 54
MIN_GAP_X = 110
GAP_Y = 34
PAD = 28
LOOP_LIFT = 40
START_NAMES = {"START", "__start__"}
END_NAMES = {"END", "__end__"}

CSS = """
:root{--bg:#f6f7f9;--card:#fff;--ink:#1c2330;--muted:#667085;--line:#e3e7ee;--accent:#2f6fed;
--accent-soft:#e8f0ff;--ok:#1a7f4b;--ok-soft:#e5f6ec;--warn:#a15c00;--warn-soft:#fff3dd;
--bad:#b42318;--bad-soft:#fde8e6;--node:#fff;--node-line:#9aa7bd;--special:#eef1f6;
--toolnode:#fff6e0;--toolnode-line:#d9a441;--edge:#667085;--edge-cond:#2f6fed}
@media (prefers-color-scheme:dark){:root{--bg:#10141b;--card:#171c26;--ink:#e8ecf3;--muted:#98a2b3;
--line:#283042;--accent:#7aa2ff;--accent-soft:#1d2a47;--ok:#5fd39a;--ok-soft:#143323;--warn:#f0b24d;
--warn-soft:#3a2b10;--bad:#ff8a80;--bad-soft:#3b1a17;--node:#1d2330;--node-line:#4a566e;
--special:#232b3b;--toolnode:#33290f;--toolnode-line:#b98a2e;--edge:#98a2b3;--edge-cond:#7aa2ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:18px;margin:36px 0 12px}
a{color:var(--accent)}
.meta{color:var(--muted);font-size:13.5px;word-break:break-all}
.meta span+span::before{content:"  |  ";white-space:pre}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:22px 0 4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card b{display:block;font-size:28px;line-height:1.1}
.card small{color:var(--muted)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}
th{text-align:left;color:var(--muted);font-weight:600;font-size:12.5px;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
code,.mono,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
.name{font-weight:650}
.chip{display:inline-block;background:var(--accent-soft);color:var(--accent);border-radius:999px;
padding:1px 9px;margin:1px 4px 1px 0;font-size:12.5px;font-family:ui-monospace,Menlo,Consolas,monospace}
.chip.warn{background:var(--warn-soft);color:var(--warn)}
.muted{color:var(--muted)}
details summary{cursor:pointer;color:var(--ink)}
details pre{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;margin:8px 0 0}
.badge{display:inline-block;border-radius:8px;padding:3px 10px;font-size:13px;font-weight:600}
.badge.ok{background:var(--ok-soft);color:var(--ok)}
.badge.warn{background:var(--warn-soft);color:var(--warn)}
.badge.bad{background:var(--bad-soft);color:var(--bad)}
.check{display:flex;gap:12px;align-items:flex-start;padding:8px 0}
.check .what{min-width:300px;color:var(--muted)}
.legend{display:flex;gap:22px;flex-wrap:wrap;color:var(--muted);font-size:13px;margin-top:10px}
.legend svg{vertical-align:middle;margin-right:6px}
svg.graph{display:block;margin:0 auto;max-width:100%;height:auto}
.node rect{fill:var(--node);stroke:var(--node-line);stroke-width:1.4}
.node.special rect{fill:var(--special)}
.node.toolnode rect{fill:var(--toolnode);stroke:var(--toolnode-line)}
.node text{fill:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.node .sub{fill:var(--muted);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px}
.edge{fill:none;stroke:var(--edge);stroke-width:1.7}
.edge.cond{stroke:var(--edge-cond);stroke-dasharray:6 5}
.arrow{fill:var(--edge)}
.arrow.cond{fill:var(--edge-cond)}
.elabel rect{fill:var(--card);stroke:var(--edge-cond);stroke-width:1}
.elabel text{fill:var(--edge-cond);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px}
"""


def _esc(value):
    return escape(str(value), quote=True)


def _first_line(text, limit=110):
    if not text:
        return ""
    first = text.strip().splitlines()[0].strip()
    return first if len(first) <= limit else first[: limit - 3] + "..."


def _source_link(scan, file, start, end=None):
    """Link to the exact lines on GitHub at the scanned commit, when the source is a GitHub URL."""
    source = str(scan.get("source") or "")
    commit = scan.get("commit")
    if not (commit and source.startswith("https://github.com/")):
        return None
    base = source.rstrip("/").removesuffix(".git")
    anchor = f"#L{start}" + (f"-L{end}" if end and end != start else "")
    return f"{base}/blob/{commit}/{file}{anchor}"


def _where(scan, file, start, end=None):
    label = f"{file}:{start}" + (f"-{end}" if end and end != start else "")
    link = _source_link(scan, file, start, end)
    if link:
        return f'<a class="mono" href="{_esc(link)}" target="_blank" rel="noopener">{_esc(label)}</a>'
    return f'<span class="mono">{_esc(label)}</span>'


def _label_width(chars):
    return 6.8 * chars + 16


def _layout(scan, gap_x):
    """Place nodes in columns by distance from the start. Returns (positions, ranks)."""
    names = []
    pairs = []
    for node in scan["nodes"]:
        if node["name"] not in names:
            names.append(node["name"])
    for edge in scan["edges"]:
        if not edge["to"]:
            continue
        for name in (edge["from"], edge["to"]):
            if name not in names:
                names.append(name)
        pairs.append((edge["from"], edge["to"]))
    if not names:
        return {}, {}

    targets = {dst for _, dst in pairs}
    roots = [n for n in names if n in START_NAMES] or [n for n in names if n not in targets] or names[:1]
    rank = {}
    queue = deque()
    for root in roots:
        rank[root] = 0
        queue.append(root)
    while queue:
        current = queue.popleft()
        for src, dst in pairs:
            if src == current and dst not in rank:
                rank[dst] = rank[current] + 1
                queue.append(dst)
    for name in names:
        rank.setdefault(name, 0)

    columns = defaultdict(list)
    for index, name in enumerate(names):
        columns[rank[name]].append((name in END_NAMES, index, name))
    positions = {}
    tallest = max(len(members) for members in columns.values())
    column_height = tallest * NODE_H + (tallest - 1) * GAP_Y
    for column, members in columns.items():
        members.sort()
        height = len(members) * NODE_H + (len(members) - 1) * GAP_Y
        top = (column_height - height) / 2
        for row, (_, _, name) in enumerate(members):
            positions[name] = (PAD + column * (NODE_W + gap_x), top + row * (NODE_H + GAP_Y))
    return positions, rank


def _graph_svg(scan):
    longest = max((len(e["condition"]) for e in scan["edges"] if e["conditional"] and e["condition"]), default=0)
    gap_x = max(MIN_GAP_X, _label_width(longest) + 40) if longest else MIN_GAP_X
    positions, rank = _layout(scan, gap_x)
    if not positions:
        return '<p class="muted">No graph structure found in this repo.</p>'

    # Unique edges, split into forward edges and loops (edges that go back to an earlier column).
    seen = set()
    edges = []
    for edge in scan["edges"]:
        key = (edge["from"], edge["to"], edge["conditional"], edge["condition"])
        if edge["to"] and key not in seen:
            seen.add(key)
            edges.append(edge)
    loops = [e for e in edges if rank[e["to"]] <= rank[e["from"]]]
    lift = (LOOP_LIFT + 26 * (len(loops) - 1) + 22) if loops else 0

    width = PAD * 2 + (max(rank.values()) + 1) * NODE_W + max(rank.values()) * gap_x
    inner_h = max(y for _, y in positions.values()) + NODE_H
    height = inner_h + PAD * 2 + lift
    oy = PAD + lift  # vertical offset for everything

    def point(name, side):
        x, y = positions[name]
        y += oy
        return {
            "right": (x + NODE_W, y + NODE_H / 2),
            "left": (x, y + NODE_H / 2),
            "top": (x + NODE_W / 2, y),
        }[side]

    parts = [
        (
            f'<svg class="graph" viewBox="0 0 {width} {height}" width="{width}" role="img" '
            'aria-label="Workflow graph"><defs>'
            '<marker id="ah" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
            '<path class="arrow" d="M0,0 L9,4.5 L0,9 z"/></marker>'
            '<marker id="ahc" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">'
            '<path class="arrow cond" d="M0,0 L9,4.5 L0,9 z"/></marker></defs>'
        )
    ]

    labelled = set()
    loop_index = 0
    for edge in edges:
        src, dst = edge["from"], edge["to"]
        cond = edge["conditional"]
        cls = "edge cond" if cond else "edge"
        marker = "ahc" if cond else "ah"
        if rank[dst] > rank[src]:
            (x1, y1), (x2, y2) = point(src, "right"), point(dst, "left")
            xm = (x1 + x2) / 2
            path = f"M{x1:.1f},{y1:.1f} C{xm:.1f},{y1:.1f} {xm:.1f},{y2:.1f} {x2:.1f},{y2:.1f}"
            mid = ((x1 + x2) / 2, (y1 + y2) / 2)
        else:
            (x1, y1), (x2, y2) = point(src, "top"), point(dst, "top")
            if src == dst:
                x1, x2 = x1 - 20, x2 + 20
            peak = min(y1, y2) - LOOP_LIFT - 26 * loop_index
            loop_index += 1
            path = f"M{x1:.1f},{y1:.1f} C{x1:.1f},{peak:.1f} {x2:.1f},{peak:.1f} {x2:.1f},{y2:.1f}"
            mid = ((x1 + x2) / 2, (y1 + y2 + 6 * peak) / 8)
        parts.append(f'<path class="{cls}" d="{path}" marker-end="url(#{marker})"/>')
        label_key = (src, edge["condition"])
        if cond and edge["condition"] and label_key not in labelled:
            labelled.add(label_key)
            text = _esc(edge["condition"])
            w = _label_width(len(edge["condition"]))
            parts.append(
                f'<g class="elabel"><rect x="{mid[0] - w / 2:.1f}" y="{mid[1] - 10:.1f}" '
                f'width="{w}" height="20" rx="10"/><text x="{mid[0]:.1f}" y="{mid[1] + 4:.1f}" '
                f'text-anchor="middle">{text}</text></g>'
            )

    functions = {n["name"]: n["function"] for n in scan["nodes"]}
    for name, (x, y) in positions.items():
        y += oy
        function = functions.get(name)
        special = name in START_NAMES | END_NAMES
        cls = "node special" if special else ("node toolnode" if function == "ToolNode" else "node")
        radius = NODE_H / 2 if special else 10
        if function and not special:
            lines = (
                f'<text x="{x + NODE_W / 2}" y="{y + 23}" text-anchor="middle" font-size="14" '
                f'font-weight="650">{_esc(name)}</text>'
                f'<text class="sub" x="{x + NODE_W / 2}" y="{y + 40}" text-anchor="middle">'
                f"{_esc(function)}</text>"
            )
        else:
            lines = (
                f'<text x="{x + NODE_W / 2}" y="{y + NODE_H / 2 + 5}" text-anchor="middle" '
                f'font-size="14" font-weight="650">{_esc(name)}</text>'
            )
        parts.append(
            f'<g class="{cls}"><rect x="{x}" y="{y}" width="{NODE_W}" height="{NODE_H}" '
            f'rx="{radius}"/>{lines}</g>'
        )
    parts.append("</svg>")
    return "".join(parts)


def _tools_table(scan):
    if not scan["tools"]:
        return '<p class="muted">No tools found by the rules in this repo.</p>'
    rows = []
    for tool in scan["tools"]:
        args = "".join(
            f'<span class="chip">{_esc(a)}</span>' for a in tool["args"] if a not in ("self", "cls")
        ) or '<span class="muted">none</span>'
        doc = tool.get("docstring") or ""
        if doc:
            summary = _esc(_first_line(doc))
            about = f"<details><summary>{summary}</summary><pre>{_esc(doc)}</pre></details>"
        else:
            about = '<span class="muted">no docstring</span>'
        rows.append(
            f'<tr><td class="name">{_esc(tool["name"])}</td>'
            f'<td>{_where(scan, tool["file"], tool["start_line"], tool["end_line"])}</td>'
            f"<td>{args}</td><td>{about}</td>"
            f'<td class="muted mono">{_esc(tool["detected_by"])}</td></tr>'
        )
    return (
        "<table><thead><tr><th>Tool</th><th>Where (click for the code)</th><th>Arguments</th>"
        "<th>What it says it does</th><th>Found by</th></tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )


def _registrations(scan):
    if not scan["registrations"]:
        return '<p class="muted">No tool lists found (bind_tools, ToolNode, tools=[...]).</p>'
    defined = {t["name"] for t in scan["tools"]}
    blocks = []
    for reg in scan["registrations"]:
        chips = "".join(
            f'<span class="chip{"" if name in defined else " warn"}">{_esc(name)}</span>'
            for name in reg["tools"]
        )
        blocks.append(
            f'<div class="check"><div class="what"><b>{_esc(reg["call"])}</b><br>'
            f'{_where(scan, reg["file"], reg["line"])}</div><div>{chips}</div></div>'
        )
    return "".join(blocks)


def _checks(scan):
    def row(label, names, bad_cls):
        if names:
            chips = "".join(f'<span class="chip warn">{_esc(n)}</span>' for n in names)
            badge = f'<span class="badge {bad_cls}">{len(names)}</span> {chips}'
        else:
            badge = '<span class="badge ok">none</span>'
        return f'<div class="check"><div class="what">{label}</div><div>{badge}</div></div>'

    return (
        row("Registered as tools, but not defined in this repo", scan["referenced_but_not_defined"], "warn")
        + row("Defined as tools, but never given to the agent", scan["defined_but_not_referenced"], "warn")
    )


def _details_tables(scan):
    node_rows = "".join(
        f'<tr><td class="name">{_esc(n["name"])}</td><td class="mono">{_esc(n["function"] or "-")}</td>'
        f'<td>{_where(scan, n["file"], n["line"])}</td></tr>'
        for n in scan["nodes"]
    )
    edge_rows = "".join(
        f'<tr><td>{_esc(e["from"])}</td><td>{_esc(e["to"] or "(not resolved)")}</td>'
        f'<td>{"decided by a function" if e["conditional"] else "always"}</td>'
        f'<td class="mono">{_esc(e["condition"] or "-")}</td><td>{_where(scan, e["file"], e["line"])}</td></tr>'
        for e in scan["edges"]
    )
    if not node_rows and not edge_rows:
        return ""
    return (
        "<details style=\"margin-top:14px\"><summary>Nodes and edges as tables</summary>"
        "<table><thead><tr><th>Node</th><th>Runs</th><th>Where</th></tr></thead><tbody>"
        f"{node_rows}</tbody></table><br>"
        "<table><thead><tr><th>From</th><th>To</th><th>Type</th><th>Decided by</th><th>Where</th></tr>"
        f"</thead><tbody>{edge_rows}</tbody></table></details>"
    )


def _errors(scan):
    if not scan["errors"]:
        return '<span class="badge ok">No parse errors</span>'
    rows = "".join(
        f'<tr><td class="mono">{_esc(e["file"])}</td><td>{_esc(e["error"])}</td></tr>' for e in scan["errors"]
    )
    return f"<table><thead><tr><th>File</th><th>Error</th></tr></thead><tbody>{rows}</tbody></table>"


def _legend():
    return (
        '<div class="legend">'
        '<span><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" class="edge"/></svg>always follows</span>'
        '<span><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" class="edge cond"/></svg>'
        "chosen by the named function</span></div>"
    )


def render_html(scan):
    agent = _esc(scan.get("agent", "agent"))
    source = str(scan.get("source") or "")
    source_html = (
        f'<a href="{_esc(source)}" target="_blank" rel="noopener">{_esc(source)}</a>'
        if source.startswith("https://")
        else _esc(source)
    )
    commit = scan.get("commit")
    commit_html = f'<span class="mono">{_esc(commit[:10])}</span>' if commit else "no commit (not a git checkout)"
    cards = [
        (len(scan["tools"]), "tools"),
        (len(scan["nodes"]), "graph nodes"),
        (len(scan["edges"]), "edges"),
        (scan["files_scanned"], "files scanned"),
        (len(scan["errors"]), "parse errors"),
    ]
    cards_html = "".join(f'<div class="card"><b>{n}</b><small>{label}</small></div>' for n, label in cards)
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>Scan report: {agent}</title><style>{CSS}</style></head><body><main>"
        f"<h1>Scan report: {agent}</h1>"
        f'<div class="meta"><span>{source_html}</span><span>commit {commit_html}</span>'
        f"<span>{_esc(scan.get('scanned_at', ''))}</span></div>"
        f'<div class="cards">{cards_html}</div>'
        f'<h2>Workflow</h2><div class="panel">{_graph_svg(scan)}{_legend()}{_details_tables(scan)}</div>'
        f'<h2>Tools</h2><div class="panel">{_tools_table(scan)}</div>'
        f'<h2>How the agent receives its tools</h2><div class="panel">{_registrations(scan)}</div>'
        f'<h2>Checks</h2><div class="panel">{_checks(scan)}</div>'
        f'<h2>Parse errors</h2><div class="panel">{_errors(scan)}</div>'
        "</main></body></html>"
    )
