"""A tiny example agent for the universal adapter (EH-4). Not a real travel agent.

It shows the Python-module interface: GreatTest calls respond(messages) with the user's messages
so far and reads back the reply, and optionally the tools the agent used.
Run it under GreatTest with:
    python -m testing.runner fixtures/travel_seed_specs.json --agent-dir fixtures/agents/simple_agent \
        --entry-point agent.py:respond --no-llm
"""

import re

DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def respond(messages):
    conversation = " ".join(messages)
    if not DATE.search(conversation):
        return "Before I search, I need your departure date."
    date = DATE.search(conversation).group(0)
    return {
        "reply": f"I found 3 flights on {date}. The cheapest is 214 USD. Shall I book it?",
        "tool_calls": [{"name": "search_flights", "arguments": {"date": date}, "result": {"options": 3}}],
    }
