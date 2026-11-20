"""FastAPI Bridge for GreatTest

Connects the React Developer Dashboard directly to the GreatTest pipeline.
Exposes endpoints to list agents, trigger analysis runs with custom remote git
urls, local folders, or uploaded archives, answer Phase 0 questions,
and inspect all generated outputs (spec, rubric, scan, callgraph, model).
"""

import json
import logging
import re
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from jsonschema import Draft202012Validator

from pipeline import run_pipeline
from testing import checks, generator, judge
from understand import phase0
from understand.outputs import agent_name, safe_name
from understand.phase0 import SpecError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("greattest-api")

app = FastAPI(
    title="GreatTest API",
    description="Evidence-based Testing Framework Bridge",
    version="0.2.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

BASE_DIR = Path(__file__).resolve().parent
OUTPUTS_DIR = BASE_DIR / "outputs"
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ACTIVE_RUNS: dict[str, dict[str, Any]] = {}


def _agent_dir(name: str) -> Path:
    """Outputs folder of one agent. The name is cleaned so it cannot leave outputs/."""
    folder = (OUTPUTS_DIR / safe_name(name)).resolve()
    if folder.parent != OUTPUTS_DIR.resolve():
        raise HTTPException(status_code=400, detail="Bad agent name.")
    return folder


class RunRequest(BaseModel):
    source: str
    name: str | None = None
    use_llm: bool = False
    reuse_saved_spec: bool = True
    spec: dict[str, Any] | None = (
        None  # validated by phase0.load_spec, the one source of truth
    )


class JudgeRequest(BaseModel):
    trace: dict[str, Any] | None = None
    trace_file: str | None = None
    use_llm: bool = True


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
            has_model = (item / "model_v0.json").exists() or (
                item / "model_v0_rule.json"
            ).exists()
            has_scan = (item / "scan.json").exists()
            has_callgraph = (item / "callgraph.json").exists()
            has_spec = (item / "spec.json").exists()
            has_rubric = (item / "rubric.json").exists()
            has_summary = (item / "run_summary.json").exists()

            agents.append(
                {
                    "name": item.name,
                    "has_model": has_model,
                    "has_scan": has_scan,
                    "has_callgraph": has_callgraph,
                    "has_spec": has_spec,
                    "has_rubric": has_rubric,
                    "has_summary": has_summary,
                    "folder": str(item),
                }
            )
    return agents


@app.get("/api/check-spec")
def check_spec_exists(name: str):
    """Check if Phase 0 answers already exist for this agent name to enable reuse."""
    agent_dir = _agent_dir(name)
    spec_file = agent_dir / "spec.json"
    if spec_file.exists():
        try:
            saved = json.loads(spec_file.read_text(encoding="utf-8"))
            return {
                "exists": True,
                "agent": name,
                "spec": saved,
                "rules_count": len(saved.get("rules", [])),
            }
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            pass
    return {"exists": False, "agent": name, "spec": None}


def _execute_run(
    source: str,
    name: str,
    use_llm: bool,
    spec_data: dict[str, Any] | None,
    reuse_saved: bool,
):
    ACTIVE_RUNS[name] = {
        "status": "running",
        "agent": name,
        "source": source,
        "detail": "Initializing pipeline run...",
        "error": None,
    }

    def log_progress(msg: str):
        if name in ACTIVE_RUNS:
            ACTIVE_RUNS[name]["detail"] = msg

    try:
        agent_out = _agent_dir(name)
        agent_out.mkdir(parents=True, exist_ok=True)
        saved_spec_file = agent_out / "spec.json"
        spec_temp_file = None
        if spec_data:
            saved_spec_file.write_text(
                json.dumps(spec_data, indent=2), encoding="utf-8"
            )
            spec_temp_file = saved_spec_file
        elif reuse_saved and saved_spec_file.exists():
            spec_temp_file = saved_spec_file

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
    name = safe_name(payload.name) if payload.name else agent_name(source)

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

    spec_dict = None
    if payload.spec is not None:
        try:
            spec_dict = phase0.normalize_spec(payload.spec)
        except SpecError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    background_tasks.add_task(
        _execute_run, source, name, payload.use_llm, spec_dict, payload.reuse_saved_spec
    )
    return {
        "status": "started",
        "agent": name,
        "source": source,
    }


@app.post("/api/upload")
async def upload_agent_file(file: UploadFile = File(...)):
    """Upload a .zip containing an agent."""
    filename = Path(file.filename or "").name  # drops any folder part
    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted.")
    target = UPLOADS_DIR / filename
    written = 0
    with target.open("wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                break
            buffer.write(chunk)
    if written > MAX_UPLOAD_BYTES:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail="File is too large.")
    return {"status": "uploaded", "filename": filename, "path": str(target)}


@app.get("/api/status/{name}")
def get_status(name: str):
    if name in ACTIVE_RUNS:
        return ACTIVE_RUNS[name]

    agent_dir = _agent_dir(name)
    summary_path = agent_dir / "run_summary.json"
    if summary_path.exists():
        try:
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            return {
                "status": "completed"
                if summary.get("ok")
                else "finished_with_warnings",
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
    agent_dir = _agent_dir(name)
    file_path = agent_dir / "run_summary.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Summary for agent '{name}' not found."
        )
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read run_summary.json: {exc}"
        ) from exc


@app.get("/api/spec/{name}")
def get_spec(name: str):
    agent_dir = _agent_dir(name)
    file_path = agent_dir / "spec.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Spec for agent '{name}' not found."
        )
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read spec.json: {exc}"
        ) from exc


@app.post("/api/spec/{name}")
def save_spec(name: str, payload: dict[str, Any]):
    agent_out = OUTPUTS_DIR / name
    agent_out.mkdir(parents=True, exist_ok=True)
    file_path = agent_out / "spec.json"
    file_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"status": "saved", "agent": name, "path": str(file_path)}


@app.get("/api/rubric/{name}")
def get_rubric(name: str):
    agent_dir = _agent_dir(name)
    file_path = agent_dir / "rubric.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Rubric for agent '{name}' not found."
        )
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read rubric.json: {exc}"
        ) from exc


@app.get("/api/scan/{name}")
def get_scan(name: str):
    agent_dir = _agent_dir(name)
    file_path = agent_dir / "scan.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Scan for agent '{name}' not found."
        )
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read scan.json: {exc}"
        ) from exc


@app.get("/api/callgraph/{name}")
def get_callgraph(name: str):
    agent_dir = _agent_dir(name)
    file_path = agent_dir / "callgraph.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Callgraph for agent '{name}' not found."
        )
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read callgraph.json: {exc}"
        ) from exc


@app.get("/api/model/{name}")
def get_model(name: str):
    agent_dir = _agent_dir(name)
    for candidate in ["model_v0.json", "model_v0_rule.json"]:
        file_path = agent_dir / candidate
        if file_path.exists():
            try:
                return json.loads(file_path.read_text(encoding="utf-8"))
            except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
                raise HTTPException(
                    status_code=500, detail=f"Failed to read {candidate}: {exc}"
                ) from exc
    raise HTTPException(status_code=404, detail=f"Model for agent '{name}' not found.")


@app.get("/api/evidence/{name}")
def get_evidence(name: str):
    """Return the evidence graph built by the report stage."""
    agent_dir = _agent_dir(name)
    file_path = agent_dir / "evidence_graph.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Evidence graph for agent '{name}' not found."
        )
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read evidence_graph.json: {exc}"
        ) from exc


@app.get("/api/report/{name}")
def get_report(name: str):
    """Return the markdown report built by the report stage."""
    agent_dir = _agent_dir(name)
    file_path = agent_dir / "report.md"
    if not file_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Report for agent '{name}' not found."
        )
    try:
        return {"agent": name, "report": file_path.read_text(encoding="utf-8")}
    except OSError as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read report.md: {exc}"
        ) from exc


# ---------------------------------------------------------------- Phase 2: test runs (EH-1 to EH-5)

TRACE_FILE = re.compile(r"^[A-Za-z0-9_.-]+_run\d+\.json$")
FIXTURE_TRACES = {
    "trace_good.json": BASE_DIR / "fixtures" / "recorded" / "trace_good.json",
    "trace.json": BASE_DIR / "fixtures" / "trace.json",
    "fixtures/recorded/trace_good.json": BASE_DIR / "fixtures" / "recorded" / "trace_good.json",
    "fixtures/trace.json": BASE_DIR / "fixtures" / "trace.json",
}
_TRACE_VALIDATOR = Draft202012Validator(
    json.loads((BASE_DIR / "schemas" / "trace.schema.json").read_text(encoding="utf-8"))
)


def _trace_path(name: str, trace_file: str) -> Path:
    """File of one saved trace. Only a plain file name inside this agent's traces/ folder, or one of
    the committed fixture names, is accepted. Anything else (../, absolute paths, other folders) is a 400."""
    if trace_file in FIXTURE_TRACES:
        agent_file = _agent_dir(name) / "traces" / trace_file
        return agent_file if agent_file.is_file() else FIXTURE_TRACES[trace_file]
    if "/" in trace_file or "\\" in trace_file or trace_file.startswith(".") or not trace_file.endswith(".json"):
        raise HTTPException(status_code=400, detail="Bad trace file name.")
    traces_dir = (_agent_dir(name) / "traces").resolve()
    path = (traces_dir / trace_file).resolve()
    if not path.is_relative_to(traces_dir):
        raise HTTPException(status_code=400, detail="Bad trace file name.")
    return path


def _check_trace(trace: Any) -> dict:
    """The trace must follow schemas/trace.schema.json, otherwise 422 instead of a crash later."""
    errors = sorted(_TRACE_VALIDATOR.iter_errors(trace), key=lambda e: list(e.path))
    if errors:
        where = ".".join(str(p) for p in errors[0].path) or "trace"
        raise HTTPException(status_code=422, detail=f"Invalid trace: {where}: {errors[0].message}")
    return trace


def _read_json(file_path: Path, label: str):
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to read {label}: {exc}"
        ) from exc


@app.get("/api/tests/{name}")
def get_tests(name: str):
    """Return the test specs (seed tests from the generator, or hand-written ones)."""
    file_path = _agent_dir(name) / "test_specs.json"
    if file_path.exists():
        return _read_json(file_path, "test_specs.json")

    # Attempt on-the-fly seed generation if rubric & model exist
    agent_dir = _agent_dir(name)
    rubric_file = agent_dir / "rubric.json"
    model_file = agent_dir / "model_v0.json"
    if rubric_file.exists() and model_file.exists():
        try:
            rubric = json.loads(rubric_file.read_text(encoding="utf-8"))
            model = json.loads(model_file.read_text(encoding="utf-8"))
            spec = None
            spec_file = agent_dir / "spec.json"
            if spec_file.exists():
                spec = json.loads(spec_file.read_text(encoding="utf-8"))
            specs, _ = generator.generate(rubric, model.get("entries", []), spec)
            if specs:
                file_path.write_text(json.dumps(specs, indent=2), encoding="utf-8")
                return specs
        except (OSError, TypeError, ValueError, json.JSONDecodeError, KeyError) as exc:
            logger.warning(f"Failed to generate seed specs on-the-fly: {exc}")

    # Fallback to travel seed specs fixture if available
    fixture_specs = BASE_DIR / "fixtures" / "travel_seed_specs.json"
    if fixture_specs.exists():
        return json.loads(fixture_specs.read_text(encoding="utf-8"))

    raise HTTPException(
        status_code=404, detail=f"Test specs for agent '{name}' not found."
    )


@app.get("/api/test-specs/{name}")
def get_test_specs(name: str):
    return get_tests(name)


@app.get("/api/test-run/{name}")
def get_test_run(name: str):
    """Return the runner's summary: runs per test, completed, crashed, timed out."""
    file_path = _agent_dir(name) / "test_run.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Test run for agent '{name}' not found."
        )
    return _read_json(file_path, "test_run.json")


@app.get("/api/traces/{name}")
def get_traces(name: str):
    """List all available traces for an agent, with fallbacks to committed recorded traces."""
    agent_dir = _agent_dir(name)
    traces_dir = agent_dir / "traces"
    traces_list = []

    if traces_dir.exists():
        for p in sorted(traces_dir.glob("*.json")):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                traces_list.append(
                    {
                        "filename": p.name,
                        "trace_id": data.get("trace_id", p.stem),
                        "test_id": data.get("test_id", "Unknown"),
                        "modality": data.get("modality", "text"),
                        "run_status": data.get("run_status", "completed"),
                        "turns_count": len(data.get("turns", [])),
                        "is_fixture": False,
                    }
                )
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                continue

    # Fallback to committed recorded good trace and sample trace if no output traces exist yet
    if not traces_list:
        rec_good = BASE_DIR / "fixtures" / "recorded" / "trace_good.json"
        if rec_good.exists():
            try:
                data = json.loads(rec_good.read_text(encoding="utf-8"))
                traces_list.append(
                    {
                        "filename": "fixtures/recorded/trace_good.json",
                        "trace_id": data.get("trace_id", "TR-REC-GOOD"),
                        "test_id": data.get("test_id", "REC-GOOD-1"),
                        "modality": data.get("modality", "text"),
                        "run_status": data.get("run_status", "completed"),
                        "turns_count": len(data.get("turns", [])),
                        "is_fixture": True,
                    }
                )
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                pass

        sample_trace = BASE_DIR / "fixtures" / "trace.json"
        if sample_trace.exists():
            try:
                data = json.loads(sample_trace.read_text(encoding="utf-8"))
                traces_list.append(
                    {
                        "filename": "fixtures/trace.json",
                        "trace_id": data.get("trace_id", "TR-0091"),
                        "test_id": data.get("test_id", "RT-020"),
                        "modality": data.get("modality", "text"),
                        "run_status": data.get("run_status", "completed"),
                        "turns_count": len(data.get("turns", [])),
                        "is_fixture": True,
                    }
                )
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                pass

    return traces_list


@app.get("/api/traces/{name}/{trace_file}")
def get_trace(name: str, trace_file: str):
    """Return one saved conversation. Names like RT-101_run1.json or fixture files are accepted."""
    file_path = _trace_path(name, trace_file)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Trace '{trace_file}' not found.")
    return _read_json(file_path, trace_file)


@app.get("/api/trace/{name}/{filename:path}")
def get_trace_content(name: str, filename: str):
    """Retrieve full content of a specific trace."""
    return get_trace(name, filename)


@app.post("/api/judge/{name}")
def run_judge_endpoint(name: str, payload: JudgeRequest):
    """Run the LLM judge and deterministic checks on a trace for this agent."""
    agent_dir = _agent_dir(name)
    rubric_file = agent_dir / "rubric.json"
    if not rubric_file.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Rubric for agent '{name}' not found. Run analysis first.",
        )

    rubric = _read_json(rubric_file, "rubric.json")

    trace_data = payload.trace
    if not trace_data and payload.trace_file:
        target = _trace_path(name, payload.trace_file)
        if not target.is_file():
            raise HTTPException(status_code=404, detail=f"Trace '{payload.trace_file}' not found.")
        trace_data = _read_json(target, payload.trace_file)

    if not trace_data:
        raise HTTPException(status_code=400, detail="No trace data provided to evaluate.")
    _check_trace(trace_data)

    # 1. Rule checks first (testing/checks.py), 2. then the judge's quality scores (Decision 62)
    checks_res = checks.run_checks(trace_data, rubric, use_llm=payload.use_llm)
    judge_res = judge.run_judge(trace_data, rubric, use_llm=payload.use_llm)

    # Persist results in agent output directory
    (agent_dir / "judge_results.json").write_text(
        json.dumps(judge_res, indent=2), encoding="utf-8"
    )
    (agent_dir / "check_results.json").write_text(
        json.dumps(checks_res, indent=2), encoding="utf-8"
    )

    return {
        "status": "ok",
        "agent": name,
        "judge": judge_res,
        "checks": checks_res,
        "trace_id": trace_data.get("trace_id"),
    }


@app.get("/api/judge/{name}")
def get_judge_results(name: str):
    """Retrieve saved judge results for this agent, or runs on recorded trace if not yet evaluated."""
    agent_dir = _agent_dir(name)
    judge_file = agent_dir / "judge_results.json"
    checks_file = agent_dir / "check_results.json"

    if judge_file.exists():
        try:
            judge_data = json.loads(judge_file.read_text(encoding="utf-8"))
            checks_data = (
                json.loads(checks_file.read_text(encoding="utf-8"))
                if checks_file.exists()
                else []
            )
            return {
                "status": "ok",
                "agent": name,
                "judge": judge_data,
                "checks": checks_data,
            }
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            pass

    rubric_file = agent_dir / "rubric.json"
    rec_good = BASE_DIR / "fixtures" / "recorded" / "trace_good.json"
    if rubric_file.exists() and rec_good.exists():
        try:
            rubric = json.loads(rubric_file.read_text(encoding="utf-8"))
            trace = json.loads(rec_good.read_text(encoding="utf-8"))
            checks_res = checks.run_checks(trace, rubric, use_llm=True)
            judge_res = judge.run_judge(trace, rubric, use_llm=True)
            judge_file.write_text(json.dumps(judge_res, indent=2), encoding="utf-8")
            checks_file.write_text(json.dumps(checks_res, indent=2), encoding="utf-8")
            return {
                "status": "ok",
                "agent": name,
                "judge": judge_res,
                "checks": checks_res,
            }
        except (OSError, TypeError, ValueError, json.JSONDecodeError, KeyError) as exc:
            logger.warning(f"Auto-judge evaluation fallback failed: {exc}")

    raise HTTPException(
        status_code=404, detail=f"Judge results for agent '{name}' not found."
    )
