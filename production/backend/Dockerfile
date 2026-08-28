# Backend container for the parking-ticket inspection API.
# Standard slim Python image. Schema is created/upgraded by Alembic on start
# (see docker-entrypoint.sh); uploaded photos live under /app/data, which
# docker-compose.yml mounts as a named volume so they survive
# `docker compose down` (without -v). The database itself is the separate
# `db` (PostgreSQL) service, selected via DATABASE_URL.

FROM python:3.11-slim

# The base image's OS packages lag behind Debian's own security repo (e.g.
# CVE-2026-14456, an OpenSSL DoS fixed upstream in libssl3t64 3.5.7 well
# before this base image was last rebuilt). trixie-security is already
# configured in the base image's sources.list, so this just pulls whatever
# Debian has already published - no extra repo config needed.
RUN apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*

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

# Run as a non-root user. This was previously only applied by hand directly
# on the deployed VM, never actually committed here - see IMPLEMENTATION_LOG.md
# §1 and the "sync the VM's backend Dockerfile" entry for the full story.
# docker-entrypoint.sh only runs alembic + uvicorn on port 8000, neither of
# which needs root.
RUN groupadd --system app \
    && useradd --system --gid app --no-create-home --shell /usr/sbin/nologin app \
    && chown -R app:app /app
USER app

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
