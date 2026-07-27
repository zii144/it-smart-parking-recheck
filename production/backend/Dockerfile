# Backend container for the parking-ticket inspection API.
# Standard slim Python image. Schema is created/upgraded by Alembic on start
# (see docker-entrypoint.sh); uploaded photos live under /app/data, which
# docker-compose.yml mounts as a named volume so they survive
# `docker compose down` (without -v). The database itself is the separate
# `db` (PostgreSQL) service, selected via DATABASE_URL.

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
# Upgrade packaging tooling first, not just app deps: python:3.11-slim ships
# a stale setuptools/wheel with known CVEs in code that only matters when
# installing packages (path traversal / arbitrary code execution via a
# malicious tar/wheel file) — irrelevant at runtime, but real vulnerable
# code sitting in the image, and Trivy correctly flags it.
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/data

# DATABASE_URL / JWT_SECRET / CORS_ALLOW_ORIGINS are provided by
# docker-compose.yml. Without DATABASE_URL the app falls back to a local
# SQLite file (dev convenience) - see app/config.py.
ENV PARKING_UPLOADS_DIR=/app/data/uploads \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# Longer start-period so first-boot migrations have time to run before the
# healthcheck starts counting failures.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["./docker-entrypoint.sh"]
