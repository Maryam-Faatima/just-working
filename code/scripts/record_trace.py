"""Record a known-good conversation with the target agent as a demo fallback (EH-7).

Runs offline (mock data, stub LLM), so it needs no API keys. Usage, from code/:
    python scripts/record_trace.py            # writes fixtures/recorded/trace_good.json
"""
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from testing.adapter import Adapter, TravelAgentBackend, run_conversation, validate_trace

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "recorded" / "trace_good.json"


def record(out: Path = OUT) -> dict:
    departure = (datetime.now(tz=UTC).date() + timedelta(days=40)).isoformat()
    messages = [
        "I want to travel from Islamabad to Dubai for 5 days. My budget is $1500. I prefer a comfortable hotel.",
        f"Departure date: {departure}",
    ]
    trace = run_conversation(Adapter(TravelAgentBackend(), test_id="REC-GOOD-1"), messages)
    validate_trace(trace)
    if trace["run_status"] != "completed":
        raise SystemExit(f"recording failed: run_status={trace['run_status']} error={trace.get('error')}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(trace, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return trace


if __name__ == "__main__":
    t = record()
    print(f"saved {OUT} ({len(t['turns'])} turns, run_status={t['run_status']})")
