# GreatTest API Bridge Documentation

The GreatTest API (`api.py`) is a local FastAPI bridge connecting the React frontend to the GreatTest analysis pipeline.

## Architectural Rules

1. **Thin bridge over `run_pipeline` (Decision 48):**
   `api.py` only delegates analysis runs to `pipeline.run_pipeline` in the background and reads artifacts directly from `outputs/<agent>/`. It maintains no duplicate analysis logic.

2. **Local-only & secure by design (Decision 49):**
   - **CORS:** Restricted strictly to the local Vite development servers (`http://localhost:5173` and `http://127.0.0.1:5173`).
   - **Uploads:** Accepts only `.zip` archives up to 50 MB (`MAX_UPLOAD_BYTES = 50 * 1024 * 1024`). File paths are sanitized to prevent directory traversal.
   - **Agent Names:** All agent names are sanitized using `safe_name(name)` and verified via `_agent_dir(name)` so requests cannot escape `outputs/`.

3. **Single source of truth for specs (Decision 50):**
   The API takes user-provided specifications as plain JSON dictionaries. It does not maintain a duplicate Pydantic model for Phase 0 answers. Validation and normalization are handled exclusively by `understand.phase0.load_spec`.

## Endpoints

### System & Health
- `GET /api/health`
  Health check reporting service status and the local `outputs/` directory.

### Agents & Outputs
- `GET /api/agents`
  Lists all analyzed agents present in `outputs/` along with availability flags for `spec.json`, `rubric.json`, `scan.json`, `callgraph.json`, and `model_v0.json`.
- `GET /api/status/{name}`
  Retrieves active run progress or the persisted completion status from `run_summary.json`. While a run is active (and when it ends) the response carries `stages`: one entry per pipeline stage, `{stage, status, detail, seconds}`, where status is `pending`, `running`, or the stage result (`ok`, `warning`, `skipped`, `failed`).
- `GET /api/stage-output/{name}/{stage}`
  Returns `{agent, stage, output}` for one pipeline stage (`spec`, `scan`, `callgraph`, `model`, `infer`, `test`, `check`, `judge`, `report`), read through the same files as the endpoints above. Always 200 for a known stage; `output` is null until the stage has written something, so the dashboard can call it as soon as a stage ends. `spec` returns `{spec, rubric}` and `report` returns `{evidence, report}`. An unknown stage is 404.
- `GET /api/summary/{name}`
  Returns `run_summary.json` for an agent.
- `GET /api/spec/{name}`
  Returns `spec.json` for an agent.
- `GET /api/rubric/{name}`
  Returns `rubric.json` for an agent.
- `GET /api/scan/{name}`
  Returns `scan.json` for an agent.
- `GET /api/callgraph/{name}`
  Returns `callgraph.json` for an agent.
- `GET /api/model/{name}`
  Returns `model_v0.json` (or `model_v0_rule.json`) for an agent.
- `GET /api/check-spec?name={name}`
  Checks whether saved Phase 0 answers exist for an agent to enable questionnaire reuse.

### Execution & Uploads
- `POST /api/upload`
  Uploads a `.zip` archive containing an agent repository into `uploads/`. Enforces the 50 MB limit and safe filename extraction.
- `POST /api/run`
  Starts a pipeline analysis run in the background.
  **Payload Schema (`RunRequest`):**
  - `source` (string, required): Local directory path, uploaded `.zip` path, or remote git URL.
  - `name` (string, optional): Agent name (sanitized via `safe_name`).
  - `use_llm` (boolean, default: `false`): Enables LLM inference during behavioral model synthesis.
  - `reuse_saved_spec` (boolean, default: `true`): Reuses existing `spec.json` if present.
  - `spec` (object, optional): Phase 0 requirements dictionary.

## GET /api/model-changes/{name}
Read-only. The model entries that tests moved, as the check stage reconciles them: {"state": "none" | "running" | "done", "done_specs", "total_specs", "changes": [...]}. Always 200: "none" before any check stage has run, and "running" with no changes if the file is caught half written. The frontend polls it every 1.5 seconds while a run is active.

GET /api/model/{name} returns model_v1.json (after a check stage) when it exists, otherwise model_v0.json, otherwise the rule-only model.

## CORS
The API accepts requests from http://localhost:5173 and http://127.0.0.1:5173. For a hosted frontend, set CORS_ORIGINS on the backend to its URL (comma separated for several, no path). The frontend build needs VITE_API_BASE set to the backend URL ending in /api.
