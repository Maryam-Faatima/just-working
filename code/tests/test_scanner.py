from understand.scanner import scan_repo

TOOLS_SOURCE = '''from langchain_core.tools import tool


@tool
def search_availability(city: str) -> str:
    """Search rooms."""
    return "ok"


@tool
def cancel_booking(booking_id: str) -> str:
    """Cancel a booking."""
    return "cancelled"
'''

GRAPH_SOURCE = '''builder.add_node("agent", call_model)
builder.add_node("tools", run_tools)
builder.add_edge(START, "agent")
builder.add_edge("agent", "tools")
'''


def test_finds_tools_with_line_ranges(tmp_path):
    (tmp_path / "agent.py").write_text(TOOLS_SOURCE, encoding="utf-8")
    result = scan_repo(tmp_path)
    tools = {t["name"]: t for t in result["tools"]}
    assert set(tools) == {"search_availability", "cancel_booking"}
    assert (tools["search_availability"]["start_line"], tools["search_availability"]["end_line"]) == (4, 7)
    assert (tools["cancel_booking"]["start_line"], tools["cancel_booking"]["end_line"]) == (10, 13)
    assert tools["cancel_booking"]["args"] == ["booking_id"]


def test_finds_graph_nodes_and_edges(tmp_path):
    (tmp_path / "graph.py").write_text(GRAPH_SOURCE, encoding="utf-8")
    result = scan_repo(tmp_path)
    assert {n["name"] for n in result["nodes"]} == {"agent", "tools"}
    assert {(e["from"], e["to"]) for e in result["edges"]} == {("START", "agent"), ("agent", "tools")}


def test_syntax_error_is_reported_not_raised(tmp_path):
    (tmp_path / "broken.py").write_text("def oops(:\n", encoding="utf-8")
    (tmp_path / "agent.py").write_text(TOOLS_SOURCE, encoding="utf-8")
    result = scan_repo(tmp_path)
    assert len(result["errors"]) == 1
    assert result["errors"][0]["file"] == "broken.py"
    assert len(result["tools"]) == 2  # the good file is still scanned


def test_virtualenv_folders_are_skipped(tmp_path):
    venv = tmp_path / ".venv"
    venv.mkdir()
    (venv / "lib.py").write_text(TOOLS_SOURCE, encoding="utf-8")
    assert scan_repo(tmp_path)["tools"] == []

CLASS_SOURCE = '''from livekit.agents import llm


class HealthAgent:
    @llm.function_tool
    async def book_slot(self, day: str) -> str:
        """Book a slot."""
        return "ok"

    @llm.function_tool(name="lookup")
    async def lookup_record(self, record_id: str) -> str:
        return "found"
'''


def test_finds_function_tool_methods_inside_a_class(tmp_path):
    (tmp_path / "agent.py").write_text(CLASS_SOURCE, encoding="utf-8")
    result = scan_repo(tmp_path)
    tools = {t["name"]: t for t in result["tools"]}
    assert set(tools) == {"book_slot", "lookup_record"}
    assert tools["book_slot"]["args"] == ["self", "day"]
def tool_names(result):
    return {t["name"] for t in result["tools"]}


def test_constructor_style_tools(tmp_path):
    source = (
        "from langchain.tools import Tool, StructuredTool\n"
        'a = Tool(name="lookup", func=do_lookup, description="x")\n'
        "b = StructuredTool.from_function(func=refund_order)\n"
    )
    (tmp_path / "agent.py").write_text(source, encoding="utf-8")
    assert tool_names(scan_repo(tmp_path)) == {"lookup", "refund_order"}


def test_raw_function_calling_schemas(tmp_path):
    source = (
        "TOOLS = [\n"
        '    {"type": "function", "function": {"name": "cancel_booking", "parameters": {}}},\n'
        '    {"name": "search", "description": "d", "input_schema": {}},\n'
        "]\n"
    )
    (tmp_path / "agent.py").write_text(source, encoding="utf-8")
    result = scan_repo(tmp_path)
    assert tool_names(result) == {"cancel_booking", "search"}
    assert len(result["tools"]) == 2  # the nested dict is not counted twice


def test_tool_subclass(tmp_path):
    source = 'class CancelTool(BaseTool):\n    name = "cancel_booking"\n    description = "x"\n'
    (tmp_path / "agent.py").write_text(source, encoding="utf-8")
    assert tool_names(scan_repo(tmp_path)) == {"cancel_booking"}


def test_tool_lists_are_recorded_as_registrations(tmp_path):
    source = (
        "llm_with_tools = llm.bind_tools([search_availability, cancel_booking])\n"
        "agent = create_react_agent(model, tools=[refund_order])\n"
        "node = ToolNode([lookup])\n"
    )
    (tmp_path / "agent.py").write_text(source, encoding="utf-8")
    result = scan_repo(tmp_path)
    registered = {n for r in result["registrations"] for n in r["tools"]}
    assert registered == {"search_availability", "cancel_booking", "refund_order", "lookup"}
    assert result["tools"] == []  # lists reference tools, they do not define them


def test_referenced_but_not_defined_is_reported(tmp_path):
    source = (
        "from tools import ghost\n"
        "agent = create_react_agent(model, tools=[ghost, real_tool])\n"
        "@tool\n"
        "def real_tool():\n"
        "    pass\n"
    )
    (tmp_path / "agent.py").write_text(source, encoding="utf-8")
    result = scan_repo(tmp_path)
    assert result["referenced_but_not_defined"] == ["ghost"]
    assert result["defined_but_not_referenced"] == []

def test_variable_tool_list_is_resolved_across_files(tmp_path):
    (tmp_path / "tools.py").write_text(
        "@tool\ndef a():\n    pass\n\n\n@tool\ndef b():\n    pass\n\n\ntools = [a, b]\n",
        encoding="utf-8",
    )
    (tmp_path / "agent.py").write_text(
        "from tools import tools\nllm.bind_tools(tools)\nnode = ToolNode(tools)\n",
        encoding="utf-8",
    )
    result = scan_repo(tmp_path)
    registered = {n for r in result["registrations"] for n in r["tools"]}
    assert registered == {"a", "b"}
    assert result["defined_but_not_referenced"] == []


def test_conditional_edges_are_recorded(tmp_path):
    source = 'g.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})\n'
    (tmp_path / "graph.py").write_text(source, encoding="utf-8")
    edges = scan_repo(tmp_path)["edges"]
    assert {(e["from"], e["to"]) for e in edges} == {("agent", "tools"), ("agent", "END")}
    assert all(e["conditional"] and e["condition"] == "should_continue" for e in edges)


def test_node_built_from_a_call_gets_a_function_name(tmp_path):
    (tmp_path / "graph.py").write_text('g.add_node("tools", ToolNode(tools))\n', encoding="utf-8")
    assert scan_repo(tmp_path)["nodes"][0]["function"] == "ToolNode"


def test_unresolvable_variables_do_not_create_registrations(tmp_path):
    (tmp_path / "agent.py").write_text("agent = create_react_agent(model, tools)\n", encoding="utf-8")
    assert scan_repo(tmp_path)["registrations"] == []