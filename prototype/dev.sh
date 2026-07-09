#!/usr/bin/env bash
#
# dev.sh — local development CLI for the Parking Ticket Inspection System.
#
# One command brings up the whole stack (FastAPI backend + Vite frontend) with
# interleaved, colour-tagged logs and a clean single-Ctrl-C shutdown, so you
# don't have to juggle two terminals and a venv by hand. If you don't want to
# use Docker, this is the easy path.
#
#   ./dev.sh setup     # one-time: create venv, install backend + frontend deps
#   ./dev.sh up        # run backend + frontend together (Ctrl-C stops both)
#   ./dev.sh status    # what's running on the dev ports
#   ./dev.sh --help    # full command list
#
# Override ports/host via env: BE_PORT=9000 FE_PORT=5200 HOST=127.0.0.1 ./dev.sh up
#
set -uo pipefail

# --- paths ----------------------------------------------------------------
PROTO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$PROTO/backend"
FRONTEND="$PROTO/frontend"
VENV="$BACKEND/.venv"
PY="${PYTHON:-python3}"

# --- config (env-overridable) --------------------------------------------
HOST="${HOST:-127.0.0.1}"
BE_PORT="${BE_PORT:-8000}"
FE_PORT="${FE_PORT:-5173}"

# --- colours (only when attached to a terminal) ---------------------------
if [ -t 1 ]; then
  C_BE=$'\033[36m'; C_FE=$'\033[35m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'
  C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_B=$'\033[1m'; C_RST=$'\033[0m'
else
  C_BE=; C_FE=; C_OK=; C_WARN=; C_ERR=; C_DIM=; C_B=; C_RST=
fi

info() { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$C_OK" "$C_RST" "$*"; }
warn() { printf '%s!%s %s\n' "$C_WARN" "$C_RST" "$*"; }
err()  { printf '%s✗%s %s\n' "$C_ERR" "$C_RST" "$*" >&2; }
die()  { err "$*"; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# Vite 8 needs a recent Node. Keep this in step with CI (.github/workflows/ci.yml
# uses Node 22) and the Vite engines requirement (>= 20.19 || >= 22.12).
NODE_MIN="20.19"
node_version() { node -p 'process.versions.node' 2>/dev/null; }
node_version_ok() {
  local v major minor rest
  v="$(node_version)" || return 1
  [ -n "$v" ] || return 1
  major="${v%%.*}"; rest="${v#*.}"; minor="${rest%%.*}"
  [ "$major" -gt 20 ] && return 0
  { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; } && return 0
  return 1
}
require_node() {
  have node || die "node not found. Install Node.js >= $NODE_MIN (nvm users: 'nvm install 22')."
  if ! node_version_ok; then
    err "Node $(node_version) is too old for the frontend (Vite needs >= $NODE_MIN; CI uses 22)."
    if have nvm || [ -d "$HOME/.nvm" ]; then
      err "You use nvm — switch with:  ${C_B}nvm use 22${C_RST}  (or 'nvm install 22'), then re-run."
    else
      err "Install a newer Node (>= $NODE_MIN) and re-run."
    fi
    exit 1
  fi
}

# Read stdin and re-emit each line with a coloured [tag] prefix.
prefix() {
  local tag="$1" col="$2" line
  while IFS= read -r line; do
    printf '%s%s%s %s\n' "$col" "$tag" "$C_RST" "$line"
  done
}

# --- port helpers ---------------------------------------------------------
port_pids() { lsof -ti "tcp:$1" 2>/dev/null || true; }

kill_port() {
  local port="$1" pids
  pids="$(port_pids "$port")"
  [ -z "$pids" ] && return 0
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 1
  pids="$(port_pids "$port")"
  # shellcheck disable=SC2086
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  return 0
}

free_ports_if_busy() {
  local port
  for port in "$@"; do
    if [ -n "$(port_pids "$port")" ]; then
      warn "Port $port is in use — freeing it first."
      kill_port "$port"
    fi
  done
}

# --- dependency management ------------------------------------------------
ensure_venv() {
  [ -x "$VENV/bin/python" ] && return 0
  have "$PY" || die "$PY not found. Install Python 3 first (see: ./dev.sh doctor)."
  info "Creating virtualenv at backend/.venv …"
  "$PY" -m venv "$VENV" || die "Failed to create venv."
}

backend_deps_ready()  { [ -x "$VENV/bin/uvicorn" ]; }
frontend_deps_ready() { [ -d "$FRONTEND/node_modules" ]; }
pytest_ready()        { [ -x "$VENV/bin/pytest" ]; }

install_backend() {
  ensure_venv
  info "Installing backend dependencies …"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$BACKEND/requirements.txt" || die "Backend install failed."
  ok "Backend dependencies ready."
}

install_backend_dev() {
  ensure_venv
  [ -f "$BACKEND/requirements-dev.txt" ] || return 0
  "$VENV/bin/pip" install -q -r "$BACKEND/requirements-dev.txt" || die "Backend dev install failed."
}

install_frontend() {
  require_node
  have npm || die "npm not found. Install Node.js first (see: ./dev.sh doctor)."
  info "Installing frontend dependencies …"
  ( cd "$FRONTEND" && npm install ) || die "Frontend install failed."
  ok "Frontend dependencies ready."
}

ensure_backend() { backend_deps_ready || { warn "Backend deps missing — installing."; install_backend; }; }
ensure_frontend() { require_node; frontend_deps_ready || { warn "Frontend deps missing — installing."; install_frontend; }; }

# --- process launchers (each replaces its subshell via exec) --------------
run_backend() {
  ( cd "$BACKEND" && exec "$VENV/bin/uvicorn" app.main:app --reload --host "$HOST" --port "$BE_PORT" )
}
run_frontend() {
  ( cd "$FRONTEND" && exec npm run dev -- --port "$FE_PORT" --strictPort )
}

ready_banner() {
  local url="http://$HOST:$BE_PORT/api/health" i
  have curl || { sleep 2; return 0; }
  for i in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      printf '\n%s%s ● stack ready%s\n' "$C_OK" "$C_B" "$C_RST"
      printf '   Inspector app : %shttp://localhost:%s/%s\n'      "$C_B" "$FE_PORT" "$C_RST"
      printf '   Admin console : %shttp://localhost:%s/admin%s\n' "$C_B" "$FE_PORT" "$C_RST"
      printf '   API + docs    : %shttp://localhost:%s/docs%s\n'  "$C_B" "$BE_PORT" "$C_RST"
      printf '   %sPress Ctrl-C to stop both.%s\n\n' "$C_DIM" "$C_RST"
      return 0
    fi
    sleep 0.5
  done
  warn "Backend health check timed out — it may still be starting; check the logs above."
}

# ==========================================================================
# Commands
# ==========================================================================
cmd_doctor() {
  local bad=0
  if have "$PY"; then ok "$("$PY" --version 2>&1)"; else err "python3 not found"; bad=1; fi
  if have node; then
    if node_version_ok; then
      ok "node $(node --version)"
    else
      err "node $(node --version) is too old (frontend needs >= $NODE_MIN; CI uses 22). nvm users: 'nvm use 22'."
      bad=1
    fi
  else err "node not found"; bad=1; fi
  if have npm;  then ok "npm $(npm --version)";   else err "npm not found";  bad=1; fi
  have curl && ok "curl present" || warn "curl missing — 'up' can't confirm readiness (not fatal)"
  have lsof && ok "lsof present" || warn "lsof missing — stop/status/port-freeing won't work"
  echo
  backend_deps_ready  && ok "backend deps installed"  || warn "backend deps not installed — run: ./dev.sh setup"
  frontend_deps_ready && ok "frontend deps installed" || warn "frontend deps not installed — run: ./dev.sh setup"
  [ "$bad" -eq 0 ] && ok "All required tools present." || err "Missing required tools (see above)."
  return "$bad"
}

cmd_setup() {
  install_backend
  install_backend_dev
  install_frontend
  echo
  ok "Setup complete. Start everything with: ${C_B}./dev.sh up${C_RST}"
}

cmd_up() {
  ensure_backend
  ensure_frontend
  free_ports_if_busy "$BE_PORT" "$FE_PORT"
  printf '%s%s Starting backend (:%s) + frontend (:%s) …%s\n\n' "$C_B" "▶" "$BE_PORT" "$FE_PORT" "$C_RST"

  trap 'shutdown' INT TERM HUP
  run_backend  2>&1 | prefix '[backend] ' "$C_BE" &
  run_frontend 2>&1 | prefix '[frontend]' "$C_FE" &
  ready_banner &
  wait
}

# Stop everything started by `up`, then exit cleanly.
shutdown() {
  trap - INT TERM HUP
  printf '\n%sStopping …%s\n' "$C_DIM" "$C_RST"
  kill_port "$BE_PORT"
  kill_port "$FE_PORT"
  # shellcheck disable=SC2046
  kill $(jobs -p) 2>/dev/null || true
  ok "Stopped."
  exit 0
}

cmd_backend() {
  ensure_backend
  free_ports_if_busy "$BE_PORT"
  info "Backend on http://$HOST:$BE_PORT  (Ctrl-C to stop)"
  trap 'kill_port "$BE_PORT"; exit 0' INT TERM
  run_backend 2>&1 | prefix '[backend] ' "$C_BE"
}

cmd_frontend() {
  ensure_frontend
  free_ports_if_busy "$FE_PORT"
  info "Frontend on http://localhost:$FE_PORT  (Ctrl-C to stop)"
  trap 'kill_port "$FE_PORT"; exit 0' INT TERM
  run_frontend 2>&1 | prefix '[frontend]' "$C_FE"
}

cmd_stop() {
  kill_port "$BE_PORT"
  kill_port "$FE_PORT"
  ok "Stopped any services on :$BE_PORT and :$FE_PORT."
}

cmd_status() {
  local pids
  pids="$(port_pids "$BE_PORT")"
  if [ -n "$pids" ]; then ok "backend  running on :$BE_PORT (pid $(echo "$pids" | tr '\n' ' '))"
  else info "backend  not running (:$BE_PORT free)"; fi
  pids="$(port_pids "$FE_PORT")"
  if [ -n "$pids" ]; then ok "frontend running on :$FE_PORT (pid $(echo "$pids" | tr '\n' ' '))"
  else info "frontend not running (:$FE_PORT free)"; fi
}

cmd_test() {
  local what="${1:-backend}"
  case "$what" in
    be|backend)
      ensure_backend; pytest_ready || install_backend_dev
      ( cd "$BACKEND" && "$VENV/bin/pytest" ) ;;
    fe|frontend)
      ensure_frontend
      ( cd "$FRONTEND" && npm run lint && npm run build ) ;;
    all)
      cmd_test backend && cmd_test frontend ;;
    *) die "Unknown test target '$what' (use: backend | frontend | all)" ;;
  esac
}

cmd_reset_db() {
  rm -f "$BACKEND"/parking.db "$BACKEND"/parking.db-wal "$BACKEND"/parking.db-shm
  ok "Dev SQLite DB removed — it will be re-created and re-seeded on next start."
}

cmd_clean() {
  cmd_stop || true
  info "Removing venv, node_modules, and dev DB …"
  rm -rf "$VENV" "$FRONTEND/node_modules"
  cmd_reset_db
  ok "Clean. Run ./dev.sh setup to reinstall."
}

usage() {
  cat <<EOF
${C_B}Parking Ticket Inspection System — dev CLI${C_RST}

  ${C_B}Usage:${C_RST} ./dev.sh <command>

  ${C_B}Getting started${C_RST}
    setup            Install backend (venv) + frontend dependencies
    up               Run backend + frontend together (Ctrl-C stops both)   ${C_DIM}[dev, start]${C_RST}

  ${C_B}Run individually${C_RST}
    backend          Run only the FastAPI backend                          ${C_DIM}[be]${C_RST}
    frontend         Run only the Vite frontend                            ${C_DIM}[fe]${C_RST}

  ${C_B}Manage${C_RST}
    status           Show what's running on the dev ports                  ${C_DIM}[ps]${C_RST}
    stop             Stop services on the dev ports                        ${C_DIM}[down]${C_RST}
    reset-db         Delete the dev SQLite DB (re-seeds next start)        ${C_DIM}[reset]${C_RST}
    clean            Remove venv, node_modules, and dev DB
    doctor           Check prerequisites and dependency status
    test [target]    Run tests: backend (default) | frontend | all

  ${C_B}Config (env vars)${C_RST}
    HOST=$HOST  BE_PORT=$BE_PORT  FE_PORT=$FE_PORT
    e.g.  BE_PORT=9000 FE_PORT=5200 ./dev.sh up

  ${C_B}URLs when running${C_RST}
    Inspector  http://localhost:$FE_PORT/     Admin  http://localhost:$FE_PORT/admin
    API docs   http://localhost:$BE_PORT/docs
EOF
}

# ==========================================================================
main() {
  local cmd="${1:-help}"
  shift || true
  case "$cmd" in
    up|dev|start)    cmd_up "$@" ;;
    be|backend)      cmd_backend "$@" ;;
    fe|frontend)     cmd_frontend "$@" ;;
    setup|install)   cmd_setup "$@" ;;
    doctor)          cmd_doctor "$@" ;;
    stop|down)       cmd_stop "$@" ;;
    status|ps)       cmd_status "$@" ;;
    test)            cmd_test "$@" ;;
    reset-db|reset)  cmd_reset_db "$@" ;;
    clean)           cmd_clean "$@" ;;
    help|-h|--help)  usage ;;
    *) err "Unknown command: $cmd"; echo; usage; exit 1 ;;
  esac
}

main "$@"
