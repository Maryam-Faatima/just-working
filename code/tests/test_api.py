
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


def test_run_request_payload_dict_spec():
    req = api.RunRequest(
        source="target_agent",
        name="test-agent",
        spec={"purpose": "Custom purpose", "rules": []},
    )
    assert req.spec == {"purpose": "Custom purpose", "rules": []}
    assert req.name == "test-agent"
