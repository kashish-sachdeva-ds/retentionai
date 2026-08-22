# RetentionAI dashboard image.
# Same build-verification caveat as api/Dockerfile (see ADR-015) -- written
# carefully, not build-tested in this environment.

FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml README.md requirements.txt ./
COPY src/ ./src/
COPY dashboard/ ./dashboard/
RUN pip install --no-cache-dir --default-timeout=100 -r requirements.txt

EXPOSE 8501

# RETENTIONAI_API_URL is set by docker-compose.yml to the api service's
# Compose network name -- the dashboard reaches the API the same way any
# external caller would, over HTTP, never in-process.
CMD ["streamlit", "run", "dashboard/app.py", "--server.address=0.0.0.0", "--server.port=8501"]
