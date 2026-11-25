
from fastapi.testclient import TestClient

import api

client = TestClient(api.app)


def test_health_check():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "outputs_dir" in data


def test_cors_restrictions():
    # Allowed origin
    res = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"

    # Disallowed origin
    res_disallowed = client.options(
        "/api/health",
        headers={
            "Origin": "http://evil-site.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in res_disallowed.headers


def test_agent_dir_sanitizes_path():
    # safe_name strips separators and leading dots, keeping it safely inside outputs/
    folder = api._agent_dir("../../etc/passwd")
    assert folder.parent == api.OUTPUTS_DIR.resolve()
    assert folder.name == "etc-passwd"
    assert ".." not in str(folder)


def test_upload_non_zip_rejected():
    res = client.post(
        "/api/upload",
        files={"file": ("malicious.exe", b"not-a-zip", "application/octet-stream")},
    )
    assert res.status_code == 400
    assert "Only .zip files are accepted" in res.json()["detail"]


def test_upload_safe_filename(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "UPLOADS_DIR", tmp_path)
    res = client.post(
        "/api/upload",
        files={"file": ("../../nested/agent.zip", b"fake-zip-data", "application/zip")},
    )
    assert res.status_code == 200
    assert res.json()["filename"] == "agent.zip"
    assert (tmp_path / "agent.zip").exists()


def test_upload_too_large(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "UPLOADS_DIR", tmp_path)
    monkeypatch.setattr(api, "MAX_UPLOAD_BYTES", 100)
    big_data = b"x" * 200
    res = client.post(
        "/api/upload",
        files={"file": ("large_agent.zip", big_data, "application/zip")},
    )
    assert res.status_code == 413
    assert "File is too large" in res.json()["detail"]
    assert not (tmp_path / "large_agent.zip").exists()


def test_invalid_spec_is_rejected_before_any_run(monkeypatch):
    started = []
    monkeypatch.setattr(api, "_execute_run", lambda *args: started.append(args))
    res = client.post("/api/run", json={"source": "x", "name": "bad-spec-agent", "spec": {}})
    assert res.status_code == 422
    assert not started


def test_get_traces_returns_fixture_fallbacks_when_no_traces():
    res = client.get("/api/traces/trip-planner-agent")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any("trace_id" in item for item in data)


def test_get_trace_content():
    res = client.get("/api/trace/trip-planner-agent/trace_good.json")
    assert res.status_code == 200
    trace = res.json()
    assert trace.get("trace_id") == "TR-38c71b4a"
    assert "turns" in trace


def test_judge_endpoint_no_llm():
    res = client.post(
        "/api/judge/trip-planner-agent",
        json={"trace_file": "trace_good.json", "use_llm": False},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "judge" in data
    assert "checks" in data
    assert data["judge"]["overall_quality"]["score"] == 3


# ---- trace file safety and validation (AY review fixes)

def test_trace_route_rejects_path_traversal():
    for bad in ("../../../package.json", "..%2F..%2Fpackage.json", "fixtures/../package-lock.json",
                "/etc/passwd.json", "notes.txt", ".hidden.json"):
        res = client.get(f"/api/trace/trip-planner-agent/{bad}")
        assert res.status_code in (400, 404), bad


def test_judge_rejects_traversal_in_trace_file():
    res = client.post("/api/judge/trip-planner-agent",
                      json={"trace_file": "../../../package.json", "use_llm": False})
    assert res.status_code in (400, 404)


def test_judge_rejects_a_trace_that_breaks_the_schema():
    res = client.post("/api/judge/trip-planner-agent",
                      json={"trace": {"trace_id": "x"}, "use_llm": False})
    assert res.status_code == 422


def test_judge_without_any_trace_is_a_400_not_a_silent_fixture():
    res = client.post("/api/judge/trip-planner-agent", json={"use_llm": False})
    assert res.status_code == 400


def test_model_changes_is_empty_before_any_check_stage(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "OUTPUTS_DIR", tmp_path)
    res = client.get("/api/model-changes/demo")
    assert res.status_code == 200
    assert res.json() == {"state": "none", "done_specs": 0, "total_specs": 0, "changes": []}


def test_model_changes_returns_the_file_the_campaign_wrote(tmp_path, monkeypatch):
    import json

    monkeypatch.setattr(api, "OUTPUTS_DIR", tmp_path)
    (tmp_path / "demo").mkdir()
    data = {"state": "running", "done_specs": 1, "total_specs": 3,
            "changes": [{"entry_id": "con_003", "status_from": "unverified", "status_to": "contradicted"}]}
    (tmp_path / "demo" / "model_changes.json").write_text(json.dumps(data), encoding="utf-8")
    assert client.get("/api/model-changes/demo").json() == data


def test_model_changes_survives_a_half_written_file(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "OUTPUTS_DIR", tmp_path)
    (tmp_path / "demo").mkdir()
    (tmp_path / "demo" / "model_changes.json").write_text("{not json", encoding="utf-8")
    res = client.get("/api/model-changes/demo")
    assert res.status_code == 200 and res.json()["state"] == "running"


def test_model_endpoint_prefers_the_updated_v1(tmp_path, monkeypatch):
    import json

    monkeypatch.setattr(api, "OUTPUTS_DIR", tmp_path)
    (tmp_path / "demo").mkdir()
    (tmp_path / "demo" / "model_v0.json").write_text(json.dumps({"version": "v0"}), encoding="utf-8")
    assert client.get("/api/model/demo").json()["version"] == "v0"
    (tmp_path / "demo" / "model_v1.json").write_text(json.dumps({"version": "v1"}), encoding="utf-8")
    assert client.get("/api/model/demo").json()["version"] == "v1"


def test_allowed_origins_adds_the_hosted_frontend_from_the_setting():
    assert api.allowed_origins("") == api.LOCAL_ORIGINS
    origins = api.allowed_origins("https://great.vercel.app/, https://other.example.com")
    assert origins[-2:] == ["https://great.vercel.app", "https://other.example.com"]
    assert api.allowed_origins("http://localhost:5173") == api.LOCAL_ORIGINS


def test_non_travel_agent_gets_no_fixture_fallbacks():
    name = "open_deep_research"
    assert client.get(f"/api/judge/{name}").status_code == 404
    assert client.get(f"/api/traces/{name}").json() == []


def test_status_lists_every_stage_and_updates_it_as_the_run_moves(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "OUTPUTS_DIR", tmp_path)
    seen = {}

    def fake_run(source, name, use_llm, log, spec_path, progress):
        progress({"stage": "spec", "status": "running", "number": 1, "total": 9})
        seen["during"] = [dict(e) for e in api.ACTIVE_RUNS[name]["stages"]]
        progress({"stage": "spec", "status": "ok", "detail": "2 rules", "seconds": 0.1, "number": 1, "total": 9})
        return {"ok": True, "stages": []}

    monkeypatch.setattr(api, "run_pipeline", fake_run)
    api._execute_run("somewhere", "demo-run", False, None, False)
    try:
        assert [e["stage"] for e in seen["during"]] == [stage for stage, _run in api.STAGES]
        assert seen["during"][0]["status"] == "running"
        assert all(e["status"] == "pending" for e in seen["during"][1:])
        final = client.get("/api/status/demo-run").json()
        assert final["status"] == "completed"
        assert final["stages"][0] == {"stage": "spec", "status": "ok", "detail": "2 rules", "seconds": 0.1}
    finally:
        api.ACTIVE_RUNS.pop("demo-run", None)


def test_stage_output_rejects_an_unknown_stage():
    assert client.get("/api/stage-output/demo/nonsense").status_code == 404


def test_stage_output_is_null_until_the_stage_wrote_something(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "OUTPUTS_DIR", tmp_path)
    res = client.get("/api/stage-output/demo/scan")
    assert res.status_code == 200
    assert res.json() == {"agent": "demo", "stage": "scan", "output": None}


def test_stage_output_returns_what_the_stage_wrote(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "OUTPUTS_DIR", tmp_path)
    folder = tmp_path / "demo"
    folder.mkdir()
    (folder / "scan.json").write_text('{"tools": []}', encoding="utf-8")
    (folder / "spec.json").write_text('{"purpose": "x"}', encoding="utf-8")
    assert client.get("/api/stage-output/demo/scan").json()["output"] == {"tools": []}
    spec_stage = client.get("/api/stage-output/demo/spec").json()["output"]
    assert spec_stage == {"spec": {"purpose": "x"}, "rubric": None}
