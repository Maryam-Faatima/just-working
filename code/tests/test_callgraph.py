import json

import pytest

from understand import callgraph
from understand.callgraph import (
    build_callgraph,
    callees,
    find_function,
    to_markdown,
    to_mermaid,
    write_outputs,
)

FILES = {
    "tools.py": '''from langchain_core.tools import tool
import helpers


@tool
def lookup(q):
    """Look up."""
    return helpers.fetch(q)
''',
    "helpers.py": '''import json


def fetch(q):
    return json.loads(q)
''',
    "agents.py": '''from langgraph.prebuilt import create_react_agent
from tools import lookup
from helpers import fetch as get
helper_agent = create_react_agent(None, tools=[lookup])


def run_agent(task):
    result = helper_agent.invoke(task)
    return get(result)
''',
    "graph.py": '''from agents import run_agent
import agents as ag
from tools import lookup


def step_node(state):
    return run_agent(state["q"])


def other_node(state):
    return ag.run_agent(state)


def direct_node(state):
    return lookup.invoke(state)


def route(state):
    return "x"
''',
    "models.py": '''class Base:
    def ping(self):
        return 1


class Store(Base):
    def __init__(self):
        self.n = 0

    def get(self):
        return self.ping()

    @staticmethod
    def make():
        return Store()

    def deep(self):
        return self.client.run()


class Doc(dict):
    pass


def use(x: Store, d: Doc, items: list):
    items.append(1)
    d.get("a")
    x.get()
    s = Store()
    s.get()
    Store.make()
    "a,b".split(",")

    def inner():
        return 1

    inner()
    undefined_fn()
    cb = print
    cb()
    return len(items)
''',
    "pkg/__init__.py": "",
    "pkg/a.py": '''from . import b
from .b import helper_b


def f():
    b.helper_b()
    return helper_b()
''',
    "pkg/b.py": '''def helper_b():
    return 1
''',
    ".venv/ignored.py": "def ignored():\n    pass\n",
    "broken.py": "def (:\n",
}

SCAN = {
    "agent": "demo",
    "tools": [{"name": "lookup", "file": "tools.py", "start_line": 5, "end_line": 8,
               "docstring": "Look up.", "detected_by": "decorator:tool"}],
    "registrations": [{"call": "create_react_agent", "tools": ["lookup"], "file": "agents.py", "line": 4}],
    "nodes": [
        {"name": "step", "function": "step_node", "file": "graph.py", "line": 30},
        {"name": "other", "function": "other_node", "file": "graph.py", "line": 31},
        {"name": "direct", "function": "direct_node", "file": "graph.py", "line": 32},
        {"name": "ghost", "function": "no_such_function", "file": "graph.py", "line": 33},
    ],
    "edges": [{"from": "step", "to": "END", "conditional": True, "condition": "route",
               "file": "graph.py", "line": 40}],
}


@pytest.fixture
def repo(tmp_path):
    for name, text in FILES.items():
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return tmp_path


@pytest.fixture
def graph(repo):
    return build_callgraph(repo, SCAN)


def edges_from(graph, name):
    return {e["to"] for e in graph["edges"] if e["from"].endswith(f"::{name}")}


def unresolved_from(graph, name):
    return {(u["call"], u["reason"]) for u in graph["unresolved"] if u["from"].endswith(f"::{name}")}


def external_from(graph, name):
    return {e["name"] for e in graph["external"] if e["from"].endswith(f"::{name}")}


# ---- what is a node

def test_functions_and_methods_are_nodes_with_lines_and_docstring(graph):
    by_id = {f["id"]: f for f in graph["functions"]}
    assert by_id["tools.py::lookup"]["start"] == 5  # the decorator line counts
    assert by_id["tools.py::lookup"]["docstring"] == "Look up."
    assert by_id["models.py::Store.get"]["kind"] == "method"
    assert "inner" not in {f["name"] for f in graph["functions"]}  # nested: part of the outer function


def test_skipped_folders_are_not_scanned_and_syntax_errors_are_reported(graph):
    assert not any(f["file"].startswith(".venv") for f in graph["functions"])
    assert [e["file"] for e in graph["errors"]] == ["broken.py"]
    assert graph["stats"]["parse_errors"] == 1


# ---- resolving calls

def test_calls_through_imports_aliases_and_modules_are_resolved(graph):
    assert edges_from(graph, "lookup") == {"helpers.py::fetch"}        # import helpers; helpers.fetch()
    assert "helpers.py::fetch" in edges_from(graph, "run_agent")       # from helpers import fetch as get
    assert edges_from(graph, "other_node") == {"agents.py::run_agent"}  # import agents as ag; ag.run_agent()
    assert edges_from(graph, "step_node") == {"agents.py::run_agent"}  # from agents import run_agent


def test_relative_imports_are_resolved(graph):
    assert edges_from(graph, "f") == {"pkg/b.py::helper_b"}


def test_tool_invoke_counts_as_a_call_to_the_tool(graph):
    assert edges_from(graph, "direct_node") == {"tools.py::lookup"}


def test_methods_classes_and_inheritance(graph):
    assert "models.py::Base.ping" in edges_from(graph, "Store.get")      # self.m(), found on the base class
    assert "models.py::Store.__init__" in edges_from(graph, "Store.make")  # Store() -> __init__
    use = edges_from(graph, "use")
    assert {"models.py::Store.get", "models.py::Store.__init__", "models.py::Store.make"} <= use


def test_types_come_from_annotations_and_single_constructor_assignments(graph):
    gets = [e for e in graph["edges"] if e["from"] == "models.py::use" and e["to"] == "models.py::Store.get"]
    assert len(gets) == 2  # x: Store -> x.get(), and s = Store() -> s.get()


def test_library_calls_are_external_not_unresolved(graph):
    assert external_from(graph, "fetch") == {"json.loads"}
    assert "Doc.get (inherited from a library class)" in external_from(graph, "use")


def test_builtins_literals_nested_helpers_and_builtin_typed_params_are_ignored(graph):
    seen = {u["call"] for u in graph["unresolved"] if u["from"].endswith("::use")}
    assert seen == {"undefined_fn", "cb"}  # not items.append, "a,b".split, inner, len, print


def test_dynamic_calls_are_reported_with_a_reason(graph):
    assert unresolved_from(graph, "use") == {
        ("undefined_fn", "name not found"),
        ("cb", "call on a local variable or parameter"),
    }
    assert unresolved_from(graph, "Store.deep") == {
        ("self.client.run", "call through an attribute of self"),
    }


def test_stats_add_up(graph):
    stats = graph["stats"]
    assert stats["resolved"] == len(graph["edges"])
    assert stats["unresolved"] == sum(stats["unresolved_by_reason"].values())


# ---- agents and component interactions

def test_agent_variable_is_found_and_calls_on_it_become_agent_edges(graph):
    assert [a["id"] for a in graph["agents"]] == ["agents.py::helper_agent"]
    assert graph["agents"][0]["tools"] == ["lookup"]
    assert [(e["from"], e["to"]) for e in graph["agent_edges"]] == [
        ("agents.py::run_agent", "agents.py::helper_agent")
    ]


def test_step_reaches_tools_through_functions_and_agents(graph):
    step = next(i for i in graph["interactions"] if i["step"] == "step")
    assert step["roots"] == ["graph.py::step_node", "graph.py::route"]  # the node function and its router
    assert step["agents"] == ["agents.py::helper_agent"]
    assert step["tools"] == [{"name": "lookup",
                              "path": ["step_node", "run_agent", "helper_agent (agent)", "lookup"]}]


def test_step_that_calls_a_tool_directly_reaches_it(graph):
    direct = next(i for i in graph["interactions"] if i["step"] == "direct")
    assert direct["tools"] == [{"name": "lookup", "path": ["direct_node", "lookup"]}]


def test_step_whose_function_is_missing_has_no_roots(graph):
    ghost = next(i for i in graph["interactions"] if i["step"] == "ghost")
    assert ghost["roots"] == [] and ghost["tools"] == []


def test_without_a_scan_there_are_no_agents_or_interactions(repo):
    plain = build_callgraph(repo)
    assert plain["agents"] == [] and plain["interactions"] == []
    assert plain["agent_edges"] == []
    # without the scan the variable is just an object made by a library call
    assert "langgraph.prebuilt.create_react_agent.invoke" in external_from(plain, "run_agent")


def test_interactions_stop_at_the_depth_limit(repo, monkeypatch):
    monkeypatch.setattr(callgraph, "MAX_DEPTH", 0)
    step = next(i for i in build_callgraph(repo, SCAN)["interactions"] if i["step"] == "step")
    assert step["tools"] == [] and step["functions"] == []


def test_recursion_does_not_loop(tmp_path):
    (tmp_path / "r.py").write_text("def a():\n    return b()\n\n\ndef b():\n    return a()\n", encoding="utf-8")
    graph = build_callgraph(tmp_path)
    assert edges_from(graph, "a") == {"r.py::b"} and edges_from(graph, "b") == {"r.py::a"}


# ---- lookups and outputs

def test_find_function_and_callees(graph):
    assert find_function(graph, "run_agent") == "agents.py::run_agent"
    assert find_function(graph, "helper_b", "pkg/b.py") == "pkg/b.py::helper_b"
    assert find_function(graph, "nope") is None
    assert callees(graph, "agents.py::run_agent") == ["helpers.py::fetch"]


def test_markdown_and_mermaid_describe_the_interactions(graph):
    text = to_markdown(graph)
    assert "# Call graph: demo" in text
    assert "| step | step_node, route | lookup |" in text
    assert "step_node > run_agent > helper_agent (agent) > lookup" in text
    assert "Unresolved calls" in text and "Limitations" in text
    diagram = to_mermaid(graph)
    assert diagram.startswith("flowchart LR") and "helper_agent (agent)" in diagram


def test_outputs_are_written_and_valid_json(graph, tmp_path):
    folder = write_outputs(graph, tmp_path / "out")
    data = json.loads((folder / "callgraph.json").read_text(encoding="utf-8"))
    assert data["stats"] == graph["stats"]
    assert (folder / "callgraph.md").read_text(encoding="utf-8").startswith("# Call graph")