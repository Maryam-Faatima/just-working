import json

import pytest

from understand.outputs import (
    agent_name,
    render_console,
    render_markdown,
    write_scan_outputs,
)
from understand.scanner import scan_repo

SOURCE = '''
@tool
def cancel_booking(booking_id):
    """Cancel | a booking."""


g.add_node("agent", agent_node)
g.add_node("tools", ToolNode(tools))
g.add_edge(START, "agent")
g.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
'''


@pytest.fixture
def scan(tmp_path):
    (tmp_path / "agent.py").write_text(SOURCE, encoding="utf-8")
    result = scan_repo(tmp_path)
    result.update(agent="demo", source="x", commit=None, scanned_at="now")
    return result


@pytest.mark.parametrize(
    "source, expected",
    [
        ("https://github.com/aperritano/langgraph-customer-support-agent", "langgraph-customer-support-agent"),
        ("https://github.com/user/repo.git", "repo"),
        ("https://github.com/user/repo/", "repo"),
        ("git@github.com:user/repo.git", "repo"),
    ],
)
def test_agent_name_from_git_url(source, expected):
    assert agent_name(source) == expected


def test_agent_name_from_zip_and_folder(tmp_path):
    assert agent_name(tmp_path / "booking-main.zip") == "booking-main"
    folder = tmp_path / "My Agent (v2)"
    folder.mkdir()
    assert agent_name(folder) == "My-Agent-v2"


def test_markdown_has_tables_and_a_graph(scan):
    md = render_markdown(scan)
    assert "cancel_booking" in md
    assert "Cancel \\| a booking." in md  # pipe is escaped so the table does not break
    assert "flowchart TD" in md
    assert '-. "should_continue" .->' in md  # conditional edges are dotted and labelled
    assert "agent (agent_node)" in md
    assert '(["START"])' in md  # START gets its own shape


def test_console_summary_shows_the_workflow(scan, tmp_path):
    text = render_console(scan, tmp_path)
    assert "START --> agent" in text
    assert "agent --(should_continue)--> tools" in text
    assert "cancel_booking" in text


def test_outputs_are_written_into_a_folder_named_after_the_agent(scan, tmp_path):
    folder = write_scan_outputs(scan, "demo", tmp_path / "outputs")
    assert folder == tmp_path / "outputs" / "demo"
    assert json.loads((folder / "scan.json").read_text(encoding="utf-8"))["agent"] == "demo"
    assert (folder / "scan.md").read_text(encoding="utf-8").startswith("# Scan report: demo")
    assert (folder / "scan.html").read_text(encoding="utf-8").startswith("<!doctype html>")