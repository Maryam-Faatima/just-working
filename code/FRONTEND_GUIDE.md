# GreatTest Live Explorer & Frontend Guide

GreatTest includes a modern React web interface that interfaces directly with the GreatTest Python backend pipeline.

---

## Architecture Overview

```
                      +-----------------------------+
                      |   React + Vite Frontend     |
                      |   http://localhost:5173     |
                      +--------------+--------------+
                                     |
                          REST API   |  JSON
                                     v
                      +-----------------------------+
                      |     FastAPI Backend         |
                      |     api.py (Port 8000)      |
                      +--------------+--------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| GreatTest Pipeline Engine                                               |
|  - Phase 0: Developer Questionnaire & Rubric Synthesizer                |
|  - Stage 1: AST Tool Scanner & LangGraph Route Extraction               |
|  - Stage 2: Call Graph Caller-Callee Edge Resolution                    |
|  - Stage 3: Behavioral Model V0 Inference                               |
+-------------------------------------------------------------------------+
```

---

## Prerequisites

1. **Python 3.10+** with GreatTest dependencies installed in the virtual environment.
2. **Node.js (v18+) & npm**.

---

## How to Run

### Step 1: Start the FastAPI Backend

From the repository root:

```bash
# Activate your virtual environment if not already activated
source .venv/bin/activate

# Install multipart support if needed
pip install python-multipart uvicorn fastapi

# Start FastAPI server on port 8000
uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```

The API bridge will be active at: `http://127.0.0.1:8000`
Health check: `http://127.0.0.1:8000/api/health`

---

### Step 2: Start the React Frontend

In a second terminal window:

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start Vite development server
npm run dev
```

Open your browser at: **`http://localhost:5173`**

---

## Features & UI Workflow

1. **Dynamic Agent Input**:
   - Click **"Configure & Run Pipeline →"** or **"+ Run New Agent"** in the header.
   - Enter a remote Git repository URL (e.g. `https://github.com/AnshikaaaSh/trip-planner-agent`), a local folder path, or drag & drop a `.zip` file.
2. **Phase 0 Questionnaire & Spec Reuse**:
   - Answer interactive questions about agent purpose, out-of-scope behaviors, and failure modes.
   - If the agent has been run before, the system automatically detects existing specs and provides a 1-click **"Reuse Existing Answers"** button.
3. **Sequential Phase Navigation**:
   - Use the **`←`** and **`→`** carousel buttons in the dynamic island header to review all 5 stages:
     - **Phase 1/5: Pipeline Summary**: Run time, commit hash, pass/fail diagnostics.
     - **Phase 2/5: Specs & Rubric**: Phase 0 invariants, ambiguity policy, compiled rubric.
     - **Phase 3/5: AST Scan & Tools**: Detected tools, signatures, docstrings, and LangGraph nodes.
     - **Phase 4/5: Call Graph**: Caller-callee function explorer with file filters and search.
     - **Phase 5/5: Behavioral Model V0**: Extracted capabilities, state transitions, and constraints.
4. **Real-Time Progress Indicator**:
   - Live stage-by-stage status floating popup displayed at the bottom while pipeline execution is in progress.
