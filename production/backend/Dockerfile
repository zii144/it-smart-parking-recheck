# Backend container for the parking-ticket inspection API.
# Standard slim Python image. Schema is created/upgraded by Alembic on start
# (see docker-entrypoint.sh); uploaded photos live under /app/data, which
# docker-compose.yml mounts as a named volume so they survive
# `docker compose down` (without -v). The database itself is the separate
# `db` (PostgreSQL) service, selected via DATABASE_URL.

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
# Install deps, then remove all Python packaging tooling - pip, setuptools,
# wheel, and ensurepip's bundled fallback wheels. The app never calls pip
# at runtime (docker-entrypoint.sh only runs alembic + uvicorn). Upgrading
# packaging tooling in place (the previous fix, d27892b) still leaves real
# vulnerable code behind wherever `pip install --upgrade` doesn't reach:
# ensurepip's bundled setuptools wheel, pip's own vendored msgpack,
# setuptools' vendored jaraco.context, wheel's own code, etc. - each a
# fresh Trivy finding as soon as the CVE feed catches up to whatever
# version happened to ship. Removing the tooling outright, once, closes
# the whole category instead of chasing it version by version.
RUN pip install --no-cache-dir -r requirements.txt && \
    pip uninstall -y pip setuptools wheel && \
    rm -rf /usr/local/lib/python3.11/ensurepip

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
