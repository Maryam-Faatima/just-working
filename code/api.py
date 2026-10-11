"""FastAPI Bridge for GreatTest

Connects the React Developer Dashboard directly to the GreatTest pipeline.
Exposes endpoints to list agents, trigger analysis runs with custom remote git
urls, local folders, or uploaded archives, answer Phase 0 questions,
and inspect all generated outputs (spec, rubric, scan, callgraph, model).
"""
import json
import logging
import shutil
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pipeline import run_pipeline
from understand.outputs import agent_name

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("greattest-api")

app = FastAPI(
    title="GreatTest API",
    description="Evidence-based Testing Framework Bridge",
    version="0.2.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
OUTPUTS_DIR = BASE_DIR / "outputs"
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

ACTIVE_RUNS: dict[str, dict[str, Any]] = {}


class Phase0Answers(BaseModel):
    purpose: str
    out_of_scope: list[str] | None = []
    failure_definition: str | None = ""
    capabilities: list[str] | None = []
    rules: list[dict[str, Any]] | None = []
    ambiguity_policy: str | None = "ask"
    weak_spots: list[str] | None = []
    user_behaviors: list[str] | None = []
    quality: dict[str, Any] | None = None
    report: dict[str, Any] | None = None
    run_config: dict[str, Any] | None = None


class RunRequest(BaseModel):
    source: str
    name: str | None = None
    use_llm: bool = False
    reuse_saved_spec: bool = True
    spec: Phase0Answers | None = None


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "GreatTest API Bridge",
        "outputs_dir": str(OUTPUTS_DIR),
    }


@app.get("/api/agents")
def list_agents():
    """List all agents currently available in the outputs directory."""
    if not OUTPUTS_DIR.exists():
        return []

    agents = []
    for item in sorted(OUTPUTS_DIR.iterdir()):
        if item.is_dir():
            has_model = (item / "model_v0.json").exists() or (item / "model_v0_rule.json").exists()
            has_scan = (item / "scan.json").exists()
            has_callgraph = (item / "callgraph.json").exists()
            has_spec = (item / "spec.json").exists()
            has_rubric = (item / "rubric.json").exists()
            has_summary = (item / "run_summary.json").exists()

            agents.append({
                "name": item.name,
                "has_model": has_model,
                "has_scan": has_scan,
                "has_callgraph": has_callgraph,
                "has_spec": has_spec,
                "has_rubric": has_rubric,
                "has_summary": has_summary,
                "folder": str(item),
            })
    return agents


@app.get("/api/check-spec")
def check_spec_exists(name: str):
    """Check if Phase 0 answers already exist for this agent name to enable reuse."""
    spec_file = OUTPUTS_DIR / name / "spec.json"
    if spec_file.exists():
        try:
            saved = json.loads(spec_file.read_text(encoding="utf-8"))
            return {
                "exists": True,
                "agent": name,
                "spec": saved,
                "rules_count": len(saved.get("rules", []))
            }
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            pass
    return {"exists": False, "agent": name, "spec": None}


def _execute_run(source: str, name: str, use_llm: bool, spec_data: dict[str, Any] | None, reuse_saved: bool):
    ACTIVE_RUNS[name] = {
        "status": "running",
        "agent": name,
        "source": source,
        "detail": "Initializing pipeline run...",
        "error": None,
    }

    agent_out = OUTPUTS_DIR / name
    agent_out.mkdir(parents=True, exist_ok=True)
    saved_spec_file = agent_out / "spec.json"

    spec_temp_file = None
    if spec_data and spec_data.get("purpose"):
        saved_spec_file.write_text(json.dumps(spec_data, indent=2), encoding="utf-8")
        spec_temp_file = saved_spec_file
    elif reuse_saved and saved_spec_file.exists():
        spec_temp_file = saved_spec_file

    def log_progress(msg: str):
        if name in ACTIVE_RUNS:
            ACTIVE_RUNS[name]["detail"] = msg

    try:
        summary = run_pipeline(
            source=source,
            name=name,
            use_llm=use_llm,
            log=log_progress,
            spec_path=str(spec_temp_file) if spec_temp_file else None,
        )
        ACTIVE_RUNS[name] = {
            "status": "completed" if summary.get("ok") else "failed",
            "agent": name,
            "source": source,
            "detail": "Pipeline completed.",
            "summary": summary,
            "error": None,
        }
    except Exception as exc:
        logger.exception("Pipeline run failed")
        ACTIVE_RUNS[name] = {
            "status": "failed",
            "agent": name,
            "source": source,
            "detail": str(exc),
            "error": str(exc),
        }


@app.post("/api/run")
def trigger_run(payload: RunRequest, background_tasks: BackgroundTasks):
    source = payload.source.strip()
    name = payload.name or agent_name(source)

    source_path = Path(source)
    if not source_path.is_absolute() and not source.startswith("http"):
        resolved = (BASE_DIR / source).resolve()
        if resolved.exists():
            source = str(resolved)

    if name in ACTIVE_RUNS and ACTIVE_RUNS[name].get("status") == "running":
        return {
            "status": "already_running",
            "agent": name,
            "message": f"Run for {name} is already in progress.",
        }

    spec_dict = payload.spec.model_dump(exclude_unset=True) if payload.spec else None

    background_tasks.add_task(
        _execute_run,
        source,
        name,
        payload.use_llm,
        spec_dict,
        payload.reuse_saved_spec
    )
    return {
        "status": "started",
        "agent": name,
        "source": source,
    }


@app.post("/api/upload")
async def upload_agent_file(file: UploadFile = File(...)):
    """Upload a .zip or archive containing an agent."""
    temp_path = UPLOADS_DIR / file.filename
    with temp_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {
        "status": "uploaded",
        "filename": file.filename,
        "path": str(temp_path),
    }


@app.get("/api/status/{name}")
def get_status(name: str):
    if name in ACTIVE_RUNS:
        return ACTIVE_RUNS[name]

    agent_dir = OUTPUTS_DIR / name
    summary_path = agent_dir / "run_summary.json"
    if summary_path.exists():
        try:
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            return {
                "status": "completed" if summary.get("ok") else "finished_with_warnings",
                "agent": name,
                "summary": summary,
            }
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            pass

    return {
        "status": "idle",
        "agent": name,
    }


@app.get("/api/summary/{name}")
def get_summary(name: str):
    file_path = OUTPUTS_DIR / name / "run_summary.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Summary for agent '{name}' not found.")
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read run_summary.json: {exc}") from exc


@app.get("/api/spec/{name}")
def get_spec(name: str):
    file_path = OUTPUTS_DIR / name / "spec.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Spec for agent '{name}' not found.")
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read spec.json: {exc}") from exc


@app.get("/api/rubric/{name}")
def get_rubric(name: str):
    file_path = OUTPUTS_DIR / name / "rubric.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Rubric for agent '{name}' not found.")
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read rubric.json: {exc}") from exc


@app.get("/api/scan/{name}")
def get_scan(name: str):
    file_path = OUTPUTS_DIR / name / "scan.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Scan for agent '{name}' not found.")
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read scan.json: {exc}") from exc


@app.get("/api/callgraph/{name}")
def get_callgraph(name: str):
    file_path = OUTPUTS_DIR / name / "callgraph.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Callgraph for agent '{name}' not found.")
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read callgraph.json: {exc}") from exc


@app.get("/api/model/{name}")
def get_model(name: str):
    agent_dir = OUTPUTS_DIR / name
    for candidate in ["model_v0.json", "model_v0_rule.json"]:
        file_path = agent_dir / candidate
        if file_path.exists():
            try:
                return json.loads(file_path.read_text(encoding="utf-8"))
            except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
                raise HTTPException(status_code=500, detail=f"Failed to read {candidate}: {exc}") from exc
    raise HTTPException(status_code=404, detail=f"Model for agent '{name}' not found.")
