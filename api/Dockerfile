# RetentionAI Production API Image
FROM python:3.12-slim

# System dependencies for XGBoost (libgomp1) and C compilation needs
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged application user
RUN useradd -m -u 1000 -s /bin/bash appuser

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

# Copy application files
COPY pyproject.toml README.md requirements.txt ./
COPY src/ ./src/
COPY models/ ./models/
COPY data/ ./data/

# Install Python requirements and package
RUN pip install --no-cache-dir --default-timeout=100 -e .

# Set ownership to non-root user
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -sf http://localhost:8000/health || exit 1

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
