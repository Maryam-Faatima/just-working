"""Starting confidence for a model entry, decided by how it was found."""

RULE_BASE = {"decorator": 0.90, "class": 0.90, "schema": 0.85, "constructor": 0.80}
RULE_DEFAULT = 0.75
LLM_ONLY = 0.55
RUNTIME_DISCOVERED = 0.70
AGREEMENT_BONUS = 0.05
MAX_BASELINE = 0.97


def baseline_confidence(detected_by, pattern=None):
    """Starting confidence. Values are placeholders to tune (open decision 3)."""
    if detected_by == "llm":
        return LLM_ONLY
    if detected_by == "runtime":
        return RUNTIME_DISCOVERED
    if detected_by not in ("rule", "rule+llm"):
        raise ValueError(f"unknown detected_by: {detected_by!r}")
    base = RULE_BASE.get((pattern or "").split(":")[0], RULE_DEFAULT)
    if detected_by == "rule+llm":
        base = min(base + AGREEMENT_BONUS, MAX_BASELINE)
    return round(base, 2)


def tool_to_capability(tool, index, llm_agrees=False):
    """Turn one scanner tool record into a model entry (rule-based V0)."""
    detected_by = "rule+llm" if llm_agrees else "rule"
    return {
        "id": f"cap_{index:03d}",
        "type": "capability",
        "name": tool["name"],
        "description": tool["docstring"] or f"Agent can use the {tool['name']} tool",
        "evidence": [{
            "source": "static",
            "file": tool["file"],
            "lines": f"{tool['start_line']}-{tool['end_line']}",
            "pattern": tool["detected_by"],
        }],
        "confidence": baseline_confidence(detected_by, tool["detected_by"]),
        "status": "unverified",
        "detected_by": detected_by,
        "related_tools": [tool["name"]],
    }