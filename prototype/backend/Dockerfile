# Backend container for the parking-ticket inspection prototype API.
# Standard slim Python image; SQLite DB + uploaded photos live under
# /app/data, which docker-compose.yml mounts as a named volume so data
# survives `docker compose down` (without -v).

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PARKING_DB_PATH=/app/data/parking.db \
    PARKING_UPLOADS_DIR=/app/data/uploads \
    PYTHONUNBUFFERED=1

RUN mkdir -p /app/data

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
