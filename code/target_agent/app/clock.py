"""Single source of 'today' so date logic is timezone-aware and patchable in tests."""
from __future__ import annotations

from datetime import date, datetime, UTC


def today() -> date:
    """Today's date in the machine's local timezone."""
    return datetime.now(tz=UTC).astimezone().date()
