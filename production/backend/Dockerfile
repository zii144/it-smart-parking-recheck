# Backend container for the parking-ticket inspection API.
# Standard slim Python image. Schema is created/upgraded by Alembic on start
# (see docker-entrypoint.sh); uploaded photos live under /app/data, which
# docker-compose.yml mounts as a named volume so they survive
# `docker compose down` (without -v). The database itself is the separate
# `db` (PostgreSQL) service, selected via DATABASE_URL.

FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt


FROM python:3.11-slim

WORKDIR /app

# Only the installed *packages* come from the builder stage - not pip,
# setuptools, wheel, or ensurepip's bundled fallback wheels. The app never
# calls pip at runtime (docker-entrypoint.sh only runs alembic + uvicorn),
# and upgrading pip/setuptools in place (previous approach) still leaves
# real vulnerable code behind: ensurepip's bundled setuptools wheel and
# pip's own vendored msgpack copy are untouched by `pip install --upgrade`
# and Trivy correctly flags them too. Not shipping pip at all removes the
# whole category, instead of chasing it version by version.
COPY --from=builder /install /usr/local
RUN rm -rf /usr/local/lib/python3.11/ensurepip

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
