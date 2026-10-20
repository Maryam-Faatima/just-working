# GreatTest framework image (Phases 0-3 pipeline + local API).
# The target agent and the React frontend are NOT part of this image.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# git is needed because GreatTest clones git URLs (see understand/acquire.py)
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pipeline.py api.py phase0_questions.md ./
COPY understand/ understand/
COPY testing/ testing/
COPY evidence/ evidence/
COPY schemas/ schemas/
COPY fixtures/ fixtures/

# Run as a normal user; outputs/ repos/ uploads/ are created under /app
RUN useradd --create-home greattest && chown -R greattest:greattest /app
USER greattest

# API keys are never baked in: pass GEMINI_API_KEY / GROQ_API_KEY at run time
# Default: the one-command pipeline.   docker run IMAGE <git URL|zip|folder> --no-ask
# API instead:  docker run -p 8000:8000 --entrypoint uvicorn IMAGE api:app --host 0.0.0.0 --port 8000
ENTRYPOINT ["python", "pipeline.py"]
CMD ["--help"]
