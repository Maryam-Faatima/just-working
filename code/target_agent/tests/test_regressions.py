"""Regression tests for bugs found by code review of the testbed."""
from datetime import date

from app.agent.request_parser import parse_request
from app.agent.runner import AgentRunner
from app.llm.stub_provider import StubLLMProvider
from app.schemas.run import RunRequest

from tests.conftest import DEMO_REQUEST


class PlanNamesInternalTool(StubLLMProvider):
    """Plans with a tool the plan node must never schedule."""

    def generate_json(self, *, task, system, prompt, context):
        if task == "plan_trip":
            return {"steps": [{"tool": "get_return_flights", "reason": "x"}], "rationale": "x"}
        return super().generate_json(task=task, system=system, prompt=prompt, context=context)


def test_plan_survives_internal_tool_name(settings):
    rec = AgentRunner(settings, llm=PlanNamesInternalTool()).run(RunRequest(request_text=DEMO_REQUEST))
    assert rec.status != "error"


def test_unknown_destination_drops_trailing_words():
    out = parse_request("I want to travel from Islamabad to Paris for 5 days", ["Islamabad"], date(2026, 10, 11))
    assert out["destination"] == "Paris"
