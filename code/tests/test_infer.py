from understand.confidence import tool_to_capability
from understand.infer import apply_inference
from understand.model_store import ModelStore

TOOL = {
    "name": "cancel_booking", "docstring": "Cancel a booking.", "file": "agent.py",
    "start_line": 10, "end_line": 30, "detected_by": "decorator",
}
SCAN = {"tools": [TOOL]}


def make_store():
    store = ModelStore("demo")
    store.add(tool_to_capability(TOOL, 1))
    return store


def constraint(**changes):
    base = {
        "applies_to": "cancel_booking", "description": "Must confirm before cancelling",
        "file": "agent.py", "lines": "12-18",
    }
    return {**base, **changes}


def test_valid_constraint_is_added_with_llm_confidence():
    store = make_store()
    report = apply_inference(store, SCAN, {"capabilities": [], "constraints": [constraint()]})
    added = store.find(type="constraint")[0]
    assert report["constraints_added"] == 1
    assert (added["detected_by"], added["status"], added["confidence"]) == ("llm", "unverified", 0.55)
    assert added["evidence"][0]["lines"] == "12-18"
    assert "Must confirm before cancelling" in store.find(type="capability")[0]["constraints"]


def test_agreement_upgrades_capability():
    store = make_store()
    report = apply_inference(store, SCAN, {"capabilities": ["cancel_booking"], "constraints": []})
    cap = store.find(type="capability")[0]
    assert report["capabilities_agreed"] == 1
    assert (cap["detected_by"], cap["confidence"]) == ("rule+llm", 0.95)


def test_hallucinated_claims_are_rejected_and_counted():
    store = make_store()
    reply = {"constraints": [
        constraint(applies_to="refund_booking"),
        constraint(lines="90-99"),
        constraint(file="other.py"),
        constraint(lines="abc"),
        {"description": "no fields"},
    ]}
    report = apply_inference(store, SCAN, reply)
    assert report["constraints_added"] == 0
    assert len(report["constraints_rejected"]) == 5
    assert store.find(type="constraint") == []