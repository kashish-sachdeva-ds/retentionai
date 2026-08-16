# RetentionAI API image.
#
# NOTE (see ADR-015): this Dockerfile has NOT been build-tested in the
# environment that authored it -- no Docker daemon was available there.
# Written with care from known dependency requirements (lifelines needs a
# C compiler for some of its dependency chain on slim base images; XGBoost
# needs libgomp at runtime), but treat it as reviewed, not proven, until
# built and run locally.

FROM python:3.12-slim

# build-essential: some scientific packages (lifelines' dependency chain)
# need to compile from source on slim images if no prebuilt wheel matches.
# libgomp1: XGBoost's runtime OpenMP dependency -- omitting this is a common
# "works on my machine, crashes in the container" failure for XGBoost images.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# data/ is intentionally NOT copied in -- it's gitignored (ADR-003: raw
# data should never be baked into an image or committed to git) and is
# mounted as a volume at runtime instead. See docker-compose.yml.

EXPOSE 8000

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
