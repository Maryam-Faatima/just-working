from understand.html_report import _layout, _source_link, render_html


def edge(src, dst, conditional=False, condition=None):
    return {"from": src, "to": dst, "conditional": conditional, "condition": condition, "file": "agent.py", "line": 7}


def make_scan(**overrides):
    scan = {
        "agent": "demo",
        "source": "https://github.com/user/demo",
        "commit": "a" * 40,
        "scanned_at": "2026-10-09T08:00:00+00:00",
        "files_scanned": 3,
        "errors": [],
        "tools": [
            {
                "name": "cancel_booking",
                "file": "tools.py",
                "start_line": 10,
                "end_line": 20,
                "args": ["self", "booking_id"],
                "docstring": "Cancel a booking.\n\nLong details here.",
                "detected_by": "decorator:tool",
            }
        ],
        "registrations": [{"call": "ToolNode", "tools": ["cancel_booking", "ghost"], "file": "agent.py", "line": 5}],
        "nodes": [
            {"name": "agent", "function": "agent_node", "file": "agent.py", "line": 3},
            {"name": "tools", "function": "ToolNode", "file": "agent.py", "line": 4},
        ],
        "edges": [
            edge("START", "agent"),
            edge("agent", "tools", True, "should_continue"),
            edge("agent", "END", True, "should_continue"),
            edge("tools", "agent"),
        ],
        "referenced_but_not_defined": ["ghost"],
        "defined_but_not_referenced": [],
    }
    scan.update(overrides)
    return scan


def test_report_is_self_contained():
    html = render_html(make_scan())
    assert "<script" not in html  # no JavaScript
    assert "<link" not in html and "@import" not in html  # no external stylesheets or fonts
    assert "src=" not in html  # no external images


def test_html_in_docstrings_and_names_is_escaped():
    scan = make_scan()
    scan["tools"][0]["docstring"] = "<script>alert(1)</script>"
    scan["tools"][0]["name"] = "<b>x</b>"
    html = render_html(scan)
    assert "<script>alert" not in html
    assert "&lt;script&gt;alert(1)" in html
    assert "<b>x</b>" not in html


def test_github_links_point_to_the_scanned_commit():
    link = _source_link(make_scan(), "tools.py", 10, 20)
    assert link == f"https://github.com/user/demo/blob/{'a' * 40}/tools.py#L10-L20"
    assert _source_link(make_scan(source="D:/local/agent"), "tools.py", 10) is None
    assert _source_link(make_scan(commit=None), "tools.py", 10) is None
    assert 'href="https://github.com/user/demo/blob/' in render_html(make_scan())


def test_graph_draws_every_node_and_edge_with_conditional_edges_dashed():
    html = render_html(make_scan())
    for name in ("START", "agent", "tools", "END", "agent_node", "ToolNode"):
        assert name in html
    assert html.count('<path class="edge"') == 2
    assert html.count('<path class="edge cond"') == 2
    assert html.count("should_continue") >= 3  # one label on the graph, plus the tables


def test_layout_puts_nodes_in_columns_from_left_to_right():
    positions, rank = _layout(make_scan(), 110)
    assert rank["START"] == 0 and rank["agent"] == 1 and rank["tools"] == 2 and rank["END"] == 2
    assert positions["START"][0] < positions["agent"][0] < positions["tools"][0]
    assert positions["tools"][1] < positions["END"][1]  # END sits below the other node in its column


def test_unknown_registered_tools_are_flagged():
    html = render_html(make_scan())
    assert 'class="chip warn">ghost' in html


def test_report_without_a_graph_says_so():
    html = render_html(make_scan(nodes=[], edges=[]))
    assert "No graph structure found" in html


def test_report_for_a_local_folder_has_no_links():
    html = render_html(make_scan(source="D:/agent", commit=None))
    assert "github.com" not in html
    assert "no commit" in html
