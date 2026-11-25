"""Which program check fits a rule, decided from the rule itself (agent-agnostic).

Nothing here names a tool, an agent or a domain. It reads only the rule's own fields: kind,
applies_to (the tools or steps the rule is about) and its wording. Used by Phase 0 to write
`check_type` into the rubric, and by the check engine for rubrics that were written without it.
"""
import re

# A rule about getting the user's agreement first.
CONFIRM_WORDS = re.compile(
    r"\b(confirm\w*|approv\w*|consent\w*|permission|authori[sz]\w*|go-?ahead|sign-?off|ok(?:ay)? from)\b",
    re.IGNORECASE,
)
# ...and about it coming before an action.
BEFORE_WORDS = re.compile(r"\b(before|prior to|first|without|until|unless)\b", re.IGNORECASE)


def infer_check_type(item):
    """A check_type where the rule clearly asks for one, else None (the LLM reads the rule).

    - ordering rule over two or more tools: call_order
    - rule that names the tools it guards and asks for confirmation before them: confirm_before
    Anything else stays None. A wrong guess here would fail a good agent, so it stays cautious.
    """
    tools = item.get("applies_to") or []
    kind = item.get("kind")
    if kind == "ordering":
        return "call_order" if len(tools) >= 2 else None
    text = item.get("description") or item.get("text") or ""
    if tools and kind in ("must_always", "must_never") and CONFIRM_WORDS.search(text) and BEFORE_WORDS.search(text):
        return "confirm_before"
    return None
