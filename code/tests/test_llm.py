import http.client
import io
import urllib.error

import pytest

from understand import llm


def _setup(monkeypatch, tmp_path, providers):
    monkeypatch.setattr(llm, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(llm, "PROVIDERS", providers)


def test_falls_back_to_second_provider_and_caches(monkeypatch, tmp_path):
    calls = []

    def down(prompt, system):
        calls.append("down")
        raise llm.LLMError("down")

    def up(prompt, system):
        calls.append("up")
        return '```json\n{"a": 1}\n```'

    _setup(monkeypatch, tmp_path, [("down", down), ("up", up)])
    assert llm.complete_json("q") == {"a": 1}
    assert llm.complete_json("q") == {"a": 1}  # second call is served from cache
    assert calls == ["down", "up"]


def test_all_providers_failing_raises(monkeypatch, tmp_path):
    def down(prompt, system):
        raise llm.LLMError("no key")

    _setup(monkeypatch, tmp_path, [("a", down), ("b", down)])
    with pytest.raises(llm.LLMError, match="all providers failed"):
        llm.complete("q")


def test_invalid_json_is_not_cached(monkeypatch, tmp_path):
    answers = iter(["not json", '{"ok": true}'])
    _setup(monkeypatch, tmp_path, [("p", lambda prompt, system: next(answers))])
    with pytest.raises(llm.LLMError):
        llm.complete_json("q")
    assert llm.complete_json("q") == {"ok": True}

def test_http_error_keeps_the_provider_message(monkeypatch):
    def refuse(req, timeout):
        body = io.BytesIO(b'{"error": "model not found"}')
        raise urllib.error.HTTPError(req.full_url, 404, "Not Found", {}, body)

    monkeypatch.setattr(llm.urllib.request, "urlopen", refuse)
    with pytest.raises(llm.LLMError, match=r"HTTP 404.*model not found"):
        llm._post("https://example.test", {}, {})

def test_dropped_connection_is_retried_once_then_reported_as_llm_error(monkeypatch):
    monkeypatch.setattr(llm, "RETRY_PAUSE", 0)
    calls = []

    def drop(req, timeout):
        calls.append(1)
        raise http.client.RemoteDisconnected("Remote end closed connection without response")

    monkeypatch.setattr(llm.urllib.request, "urlopen", drop)
    with pytest.raises(llm.LLMError, match="RemoteDisconnected"):
        llm._post("https://example.test", {}, {})
    assert len(calls) == 2


def test_a_dropped_connection_that_recovers_returns_the_reply(monkeypatch):
    monkeypatch.setattr(llm, "RETRY_PAUSE", 0)
    state = {"n": 0}

    class Reply:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"ok": true}'

    def flaky(req, timeout):
        state["n"] += 1
        if state["n"] == 1:
            raise ConnectionResetError("reset")
        return Reply()

    monkeypatch.setattr(llm.urllib.request, "urlopen", flaky)
    assert llm._post("https://example.test", {}, {}) == {"ok": True}
