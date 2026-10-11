# Scanner (Phase 1, step 1)

understand/scanner.py reads a repository with Python's ast module and extracts:
- tools: functions decorated with @tool, with name, file, line range, args, docstring
- graph nodes and edges: add_node and add_edge calls (LangGraph)

It never imports or executes the target agent, so scanning is safe.

## Why these outputs
Tool name, file and line range become the `evidence` field of a model entry
(for example booking_agent.py lines 72-91). Nodes and edges become workflow and state entries.

## Detected patterns
Decorators (tool, function_tool, tool_plain, kernel_function, register_for_llm), tool constructors
(Tool, StructuredTool.from_function, FunctionTool.from_defaults), BaseTool subclasses, tool lists
(bind_tools, ToolNode, create_react_agent, any tools=[...]), and raw function-calling schemas.

## Known limitations (stated openly)
- Static only: tools built in loops, named by variables, loaded from JSON or YAML, or
  registered through dynamic dispatch are not found by the rules.
- Python only, direct patterns only.
- Name-based matching can give false positives (for example an unrelated function called from_function).
- Backstop: Phase 1 LLM inference reads the code as well. Each model entry records how it was found in
  `detected_by` (rule, llm, rule+llm or runtime), and `understand/confidence.py` gives LLM-only entries a lower
  starting confidence than rule-detected ones. The scanner's own label (for example `decorator:tool`) is kept
  as `pattern` on the evidence item.
- Supporting a new style means adding one entry to the sets at the top of scanner.py.