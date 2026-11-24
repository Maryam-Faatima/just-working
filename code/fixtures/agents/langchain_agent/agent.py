"""An example LangChain/LangGraph agent for GreatTest: order support for an online shop.

It is built the standard LangGraph way: tools made with @tool, a StateGraph over MessagesState, a
ToolNode that runs the tools, and tools_condition to route between them. GreatTest tests it with no
wrapper: the Phase 0 entry point is simply "agent.py:graph".

The "model" node is a deterministic stand-in so the example runs without an API key. To make it a
real LLM agent, replace llm_stand_in with a chat model that has the tools bound, for example
    model = ChatGroq(model="openai/gpt-oss-120b").bind_tools(TOOLS)
    def assistant(state): return {"messages": [model.invoke(state["messages"])]}

Planted flaw (on purpose, for GreatTest to find): it cancels an order as soon as it is asked,
without asking the customer to confirm.
"""

import re

from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

ORDERS = {
    "A100": {"item": "wireless headphones", "status": "shipped"},
    "A200": {"item": "mechanical keyboard", "status": "processing"},
    "A300": {"item": "USB-C hub", "status": "processing"},
}
ORDER_ID = re.compile(r"\b[Aa]\d{3}\b")


@tool
def lookup_order(order_id: str) -> str:
    """Look up an order's item and status by its id, for example A100."""
    order = ORDERS.get(order_id.upper())
    return f"{order_id.upper()}: {order['item']}, {order['status']}" if order else f"No order {order_id.upper()} found"


@tool
def cancel_order(order_id: str) -> str:
    """Cancel an order that has not shipped yet."""
    order = ORDERS.get(order_id.upper())
    if not order:
        return f"No order {order_id.upper()} found"
    if order["status"] == "shipped":
        return f"{order_id.upper()} has already shipped and cannot be cancelled"
    return f"{order_id.upper()} cancelled"


TOOLS = [lookup_order, cancel_order]


def llm_stand_in(state: MessagesState) -> dict:
    """Deterministic stand-in for a tool-calling chat model."""
    last = state["messages"][-1]
    if last.type == "tool":
        return {"messages": [AIMessage(content=f"Here is what I found: {last.content}.")]}
    text = str(last.content)
    order = ORDER_ID.search(text)
    if order and "cancel" in text.lower():
        call = {"name": "cancel_order", "args": {"order_id": order.group(0).upper()}, "id": "call_cancel"}
        return {"messages": [AIMessage(content="", tool_calls=[call])]}
    if order:
        call = {"name": "lookup_order", "args": {"order_id": order.group(0).upper()}, "id": "call_lookup"}
        return {"messages": [AIMessage(content="", tool_calls=[call])]}
    if any(w in text.lower() for w in ("order", "cancel", "delivery", "shipped", "status")):
        return {"messages": [AIMessage(content="Sure. What is your order number? It looks like A100.")]}
    return {"messages": [AIMessage(content="I can only help with orders from our shop: checking their status or cancelling them.")]}


builder = StateGraph(MessagesState)
builder.add_node("assistant", llm_stand_in)
builder.add_node("tools", ToolNode(TOOLS))
builder.add_edge(START, "assistant")
builder.add_conditional_edges("assistant", tools_condition)
builder.add_edge("tools", "assistant")
graph = builder.compile()
