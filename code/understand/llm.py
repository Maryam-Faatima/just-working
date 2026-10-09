"""One wrapper for every LLM call: provider fallback, JSON parsing, disk cache.

Keys come from the environment (GEMINI_API_KEY, GROQ_API_KEY), never from code.
For local work they are read from a .env file in the project root (see .env.example).
"""
import hashlib
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def load_env(path=ENV_FILE):
    """Read KEY=value lines from a .env file. Variables already set are not overridden."""
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.removeprefix("export ").strip()
        value = value.strip().strip("\"'")
        if key and value:
            os.environ.setdefault(key, value)


load_env()

CACHE_DIR = Path(os.environ.get("GREATTEST_CACHE", ".llm_cache"))
TIMEOUT_SECONDS = 60


class LLMError(RuntimeError):
    """A provider failed or returned something unusable."""


def _post(url, body, headers):
    base = {"Content-Type": "application/json", "User-Agent": "greattest/0.1"}
    req = urllib.request.Request(
        url, json.dumps(body).encode("utf-8"), {**base, **headers}
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise LLMError(str(exc)) from exc


def _gemini(prompt, system):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY not set")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    data = _post(url, body, {"x-goog-api-key": key})
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise LLMError(f"unexpected Gemini reply: {str(data)[:200]}") from exc


def _groq(prompt, system):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise LLMError("GROQ_API_KEY not set")
    model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": prompt}
    ]
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    data = _post(
        "https://api.groq.com/openai/v1/chat/completions",
        body,
        {"Authorization": f"Bearer {key}"},
    )
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise LLMError(f"unexpected Groq reply: {str(data)[:200]}") from exc


# Tried in order. The first that answers wins.
PROVIDERS = [("gemini", _gemini), ("groq", _groq)]


def _cache_path(prompt, system):
    digest = hashlib.sha256(json.dumps([system, prompt]).encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{digest[:24]}.json"


def complete(prompt, system="", use_cache=True):
    """Raw text reply. Identical prompts are served from the disk cache."""
    path = _cache_path(prompt, system)
    if use_cache and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))["text"]
    errors = []
    for name, call in PROVIDERS:
        try:
            text = call(prompt, system)
        except LLMError as exc:
            errors.append(f"{name}: {exc}")
            continue
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"provider": name, "text": text}), encoding="utf-8")
        return text
    raise LLMError("all providers failed: " + "; ".join(errors))


def complete_json(prompt, system="", use_cache=True):
    """Parsed JSON reply. A reply that is not valid JSON is not kept in the cache."""
    text = complete(prompt, system, use_cache)
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        _cache_path(prompt, system).unlink(missing_ok=True)
        raise LLMError(f"reply is not valid JSON: {exc}") from exc