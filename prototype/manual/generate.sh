#!/usr/bin/env bash
#
# generate.sh — regenerate the visual user manual.
#
# Boots a throwaway backend + frontend, seeds demo data, drives every user
# flow with Playwright (screenshots + video), then builds manual/guide.html.
#
#   ./generate.sh
#
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"        # prototype/manual
PROTO="$(cd "$HERE/.." && pwd)"                              # prototype
GEN="$HERE/generator"
FRONT="http://127.0.0.1:5173"
BACK="http://127.0.0.1:8000"

# Prefer a Node new enough for Vite 8 / Playwright.
if [ -d "$HOME/.nvm/versions/node/v22.17.0/bin" ]; then
  export PATH="$HOME/.nvm/versions/node/v22.17.0/bin:$PATH"
fi

log(){ printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
BACK_PID=""; FRONT_PID=""
cleanup(){
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null
  [ -n "$BACK_PID" ] && kill "$BACK_PID" 2>/dev/null
  pkill -f "uvicorn app.main" 2>/dev/null
  pkill -f "vite --host" 2>/dev/null
}
trap cleanup EXIT INT TERM HUP

# --- 1. fresh backend -----------------------------------------------------
log "Starting backend (fresh demo DB)"
cd "$PROTO/backend"
pkill -9 -f "uvicorn app.main" 2>/dev/null; lsof -ti tcp:8000 | xargs kill -9 2>/dev/null
pkill -9 -f "vite" 2>/dev/null; lsof -ti tcp:5173 | xargs kill -9 2>/dev/null
sleep 1
export PARKING_DB_PATH="$PROTO/backend/manual_demo.db"
export CORS_ALLOW_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
export SEED_DEMO_DATA=true
rm -f manual_demo.db manual_demo.db-wal manual_demo.db-shm
./.venv/bin/alembic upgrade head >/dev/null 2>&1
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 >"$HERE/.be.log" 2>&1 &
BACK_PID=$!

# --- 2. frontend ----------------------------------------------------------
log "Starting frontend (vite dev)"
cd "$PROTO/frontend"
npm run dev -- --host 127.0.0.1 --port 5173 >"$HERE/.fe.log" 2>&1 &
FRONT_PID=$!

log "Waiting for servers"
for i in $(seq 1 40); do
  curl -sf -o /dev/null "$BACK/api/health" && curl -sf -o /dev/null "$FRONT/" && break
  sleep 1
done
curl -s -o /dev/null "$FRONT/src/main.jsx"; sleep 2

# --- 3. seed demo data ----------------------------------------------------
log "Seeding demo cases (GPS + varied judgements)"
TOK=$(curl -s "$BACK/api/login" -H 'Content-Type: application/json' \
  -d '{"username":"insp01","password":"pass123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
python3 - "$TOK" <<'PY'
import sys, json, urllib.request, random
tok = sys.argv[1]; random.seed(3)
def post(body):
    req = urllib.request.Request("http://127.0.0.1:8000/api/cases",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try: urllib.request.urlopen(req)
    except Exception as e: print("seed err", e)
districts = ["中正區", "大安區", "信義區", "松山區", "內湖區"]
for n in range(14):
    lat = 25.033 + random.random() * 0.02
    lng = 121.558 + random.random() * 0.02
    # A mix: some well-formed QR-style tickets, some malformed -> varied judgement.
    if n % 3 == 0:
        tk = f"Q702{random.randint(1000,9999)}A{random.randint(9,20):02d}{random.randint(10,59):02d}{random.randint(10,59):02d}"[:15]
    else:
        tk = f"Q70{random.randint(1000,9999)}B{random.randint(9,18):02d}{random.randint(10,59):02d}{random.randint(10,59):02d}"[:15]
    post({
        "ticket_no": tk, "district": random.choice(districts),
        "road": "示範路" + str(n + 1), "spot_no": str(n + 1),
        "plate_no": f"DEMO-{n+1:03d}", "amount": 900, "due_date": "2026-07-28",
        "parking_date": "2026-07-08", "parking_start": "2026-07-08T09:00:00",
        "parking_end": "2026-07-08T10:00:00",
        "data_source": random.choice(["AUTO_QR", "OCR", "MANUAL_FROM_TICKET"]),
        "gps_lat": round(lat, 5), "gps_lng": round(lng, 5),
        "inspector_username": "insp01",
    })
print("seeded 14 cases")
PY

# --- 4. demo evidence photo (for the inspector 拍照 step) ------------------
log "Generating demo evidence photo"
mkdir -p "$GEN/assets"
TICKET="$GEN/assets/demo-ticket.jpg"
FONT="/System/Library/Fonts/Supplemental/Arial.ttf"
if command -v ffmpeg >/dev/null 2>&1; then
  if [ -f "$FONT" ] && ffmpeg -y -f lavfi -i "color=c=0x2b2f36:s=720x960" \
      -vf "drawbox=x=40:y=40:w=640:h=880:color=0xe6a020@0.9:t=4,\
drawtext=fontfile=$FONT:text='PARKING TICKET':fontcolor=white:fontsize=54:x=(w-tw)/2:y=120,\
drawtext=fontfile=$FONT:text='EVIDENCE PHOTO (DEMO)':fontcolor=0xe6a020:fontsize=30:x=(w-tw)/2:y=210,\
drawtext=fontfile=$FONT:text='DEMO-042  25.0375N 121.5645E':fontcolor=0xb9b3a8:fontsize=26:x=(w-tw)/2:y=820" \
      -frames:v 1 "$TICKET" >/dev/null 2>&1; then
    echo "  ✓ ticket with labels"
  else
    ffmpeg -y -f lavfi -i "color=c=0x2b2f36:s=720x960" -frames:v 1 "$TICKET" >/dev/null 2>&1
    echo "  ✓ plain ticket (drawtext unavailable)"
  fi
else
  echo "  ! ffmpeg missing — capture will still run if $TICKET already exists"
fi

# --- 5. capture + build ---------------------------------------------------
log "Installing Playwright (if needed)"
cd "$GEN"
[ -d node_modules/playwright ] || npm install --no-audit --no-fund
npx playwright install chromium >/dev/null 2>&1 || true

log "Capturing flows with Playwright"
MANUAL_BASE_URL="$FRONT" node capture.mjs || { echo "capture failed"; exit 1; }

log "Building guide.html"
node build-guide.mjs || { echo "build failed"; exit 1; }

# --- 6. done --------------------------------------------------------------
cd "$PROTO/backend"; rm -f manual_demo.db manual_demo.db-wal manual_demo.db-shm
log "Done"
echo "  Manual : $HERE/guide.html"
echo "  Shots  : $HERE/shots/"
echo "  Clips  : $HERE/clips/"
