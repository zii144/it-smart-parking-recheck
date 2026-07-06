#!/usr/bin/env bash
# Local dev runner. With no DATABASE_URL set, the app uses a SQLite file
# (app/config.py default), so this works with zero external services. Alembic
# creates/updates the schema first, then uvicorn starts with autoreload.
#
# To develop against PostgreSQL instead, export DATABASE_URL first, e.g.:
#   export DATABASE_URL=postgresql+psycopg2://parking:parking@localhost:5432/parking
set -e
cd "$(dirname "$0")"
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
