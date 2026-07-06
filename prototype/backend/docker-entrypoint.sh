#!/usr/bin/env sh
# Apply database migrations, then start the API. Alembic is idempotent, so this
# is safe to run on every container start (first boot creates the schema,
# subsequent boots are no-ops unless there are new migrations).
set -e

echo "[entrypoint] Applying database migrations (alembic upgrade head)..."
alembic upgrade head

echo "[entrypoint] Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
