# Call graph and component interactions (Phase 1, step 2)

Slide 6 order: AST parsing, call graph construction, component interactions, RAG + LLM
inference, Behavioral Model V0. This module is the call graph and component interaction part.

    python -m understand.callgraph <repo folder> --scan outputs/<agent>/scan.json
    (also runs as stage 2 of: python pipeline.py <source>)

## Why it exists
The scanner knows tools and graph edges, but not which function calls which. Real rules often
live in a helper a tool or node calls (sorting in get_flights, blocked terms in input_guardrail).
The call graph lets inference retrieve that code, and it records which tools a workflow step can
reach, which is the evidence behind the Behavioral Model's workflows.

## What is built
- functions: every module-level function and class method (id "file::qualname"), with lines
  and docstring. Nested functions belong to the function that contains them.
- edges: direct calls between those functions. Resolved forms: foo(), imported and aliased names,
  relative imports, module.foo(), self.foo() (base classes included), Class.foo(), Class() to
  __init__, tool.invoke(). Types come from x = Foo() (assigned once) or an annotation x: Foo.
- agent_edges: calls on a module variable built by a registration call, for example
  booking_agent = create_react_agent(llm, tools=[...]). Needs the scan.
- external: calls into libraries (json.loads, langgraph..., a class inheriting from a library class).
- unresolved: calls that cannot be followed, each with a reason. Never dropped silently.
- interactions: per workflow step, found by following calls (depth 6) from the node function and its
  router: the functions reached, agents reached, and each tool with its path, for example
  booking_node > run_booking_agent > booking_agent (agent) > search_flights.

## Outputs (in outputs/<agent>/)
callgraph.json (everything above, plus stats and limitations) and callgraph.md (stats table,
interaction table, Mermaid diagram, unresolved calls, limitations).

## How inference uses it
infer.py shows the LLM each tool or step plus the helpers it calls (up to 4) and a line
"Reaches tools: ...". A node function defined in another file than where it is registered is found
through the graph.

## Known limitations (stated openly)
- Direct calls only. Calls on untyped local variables or parameters, on call results, and through
  attributes of self are unresolved. This is deliberate: complete resolution is undecidable for
  Python (scope item 5), so the report states how much was resolved.
- Types come only from constructor assignments and annotations, not from inference.
- Imports are matched to files under the repo root. Everything else counts as external.
- Calls to a repo class without __init__ and to builtins are not recorded.
- Edges are per call site, not per execution: a call in a branch that never runs is still an edge.