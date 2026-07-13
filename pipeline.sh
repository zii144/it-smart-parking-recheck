#!/usr/bin/env bash
#
# pipeline.sh — production pipeline for the Parking Ticket Inspection System.
#
# Separates a promotable PRODUCTION build from the working PROTOTYPE:
#
#   prototype/    ← single working source (dev CLI: prototype/dev.sh)
#   production/   ← promoted, deployable copy (created by update-production)
#   deploy/       ← production docker-compose + .env.production
#
# Typical flow:
#   ./pipeline.sh doctor                 # check prerequisites + config
#   cp deploy/.env.production.example deploy/.env.production && edit it
#   ./pipeline.sh update-production      # promote prototype/ -> production/ (gated by tests)
#   ./pipeline.sh build-production       # build tagged prod images
#   ./pipeline.sh deploy                 # run the prod stack + verify
#   ./pipeline.sh create-admin <user>    # bootstrap a real admin (no demo seed in prod)
#
# Or all in one:  ./pipeline.sh release
#
set -uo pipefail

# --- paths ----------------------------------------------------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOTYPE="$ROOT/prototype"
PRODUCTION="$ROOT/production"
DEPLOY="$ROOT/deploy"
COMPOSE="$DEPLOY/docker-compose.prod.yml"
ENVFILE="$DEPLOY/.env.production"
ENVEXAMPLE="$DEPLOY/.env.production.example"

# --- colours --------------------------------------------------------------
if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'
  C_DIM=$'\033[2m'; C_B=$'\033[1m'; C_INFO=$'\033[36m'; C_RST=$'\033[0m'
else
  C_OK=; C_WARN=; C_ERR=; C_DIM=; C_B=; C_INFO=; C_RST=
fi
info() { printf '%s\n' "$*"; }
step() { printf '\n%s▶ %s%s\n' "$C_B" "$*" "$C_RST"; }
ok()   { printf '%s✓%s %s\n' "$C_OK" "$C_RST" "$*"; }
warn() { printf '%s!%s %s\n' "$C_WARN" "$C_RST" "$*"; }
err()  { printf '%s✗%s %s\n' "$C_ERR" "$C_RST" "$*" >&2; }
die()  { err "$*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- docker compose wrapper ----------------------------------------------
DC=()
detect_compose() {
  [ "${#DC[@]}" -gt 0 ] && return 0
  if docker compose version >/dev/null 2>&1; then DC=(docker compose)
  elif have docker-compose; then DC=(docker-compose)
  else die "Docker Compose not found. Install Docker Desktop / the compose plugin."; fi
}
dc() { detect_compose; "${DC[@]}" --env-file "$ENVFILE" -f "$COMPOSE" "$@"; }

env_val() { grep -E "^$1=" "$ENVFILE" 2>/dev/null | tail -1 | cut -d= -f2-; }
git_sha() { git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "nogit"; }
now_utc() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

frontend_port() { local p; p="$(env_val FRONTEND_PORT)"; printf '%s' "${p:-8080}"; }

# --- guards ---------------------------------------------------------------
require_docker() {
  have docker || die "Docker not found. Install Docker before deploying."
  docker info >/dev/null 2>&1 || die "Docker daemon is not running. Start Docker and retry."
  detect_compose
}
require_envfile() {
  [ -f "$ENVFILE" ] && return 0
  err "Missing $ENVFILE"
  err "Create it from the template:  cp ${ENVEXAMPLE#$ROOT/} ${ENVFILE#$ROOT/}  then edit the REQUIRED values."
  exit 1
}
require_production() {
  [ -d "$PRODUCTION/backend" ] && [ -d "$PRODUCTION/frontend" ] && return 0
  die "No production/ build yet. Run:  ./pipeline.sh update-production"
}
# Light secret sanity-check (the app + compose enforce this too, but fail early).
check_secret() {
  local s; s="$(env_val JWT_SECRET)"
  if [ -z "$s" ] || [ "${#s}" -lt 16 ]; then
    die "JWT_SECRET in $ENVFILE is missing or too short (need >= 16 chars). Generate: openssl rand -hex 32"
  fi
  case "$s" in
    dev-insecure-change-me|please-change-me-before-deploying|change-me|changeme|secret)
      die "JWT_SECRET in $ENVFILE is a known placeholder. Set a real random value." ;;
  esac
}

# ==========================================================================
# Commands
# ==========================================================================
cmd_doctor() {
  local bad=0
  if have docker; then
    ok "docker $(docker --version | awk '{print $3}' | tr -d ,)"
    if docker info >/dev/null 2>&1; then ok "docker daemon running"; else warn "docker daemon NOT running (needed to build/deploy)"; fi
    if docker compose version >/dev/null 2>&1; then ok "docker compose plugin present"
    elif have docker-compose; then ok "docker-compose (v1) present"
    else err "docker compose not found"; bad=1; fi
  else err "docker not found"; bad=1; fi
  have rsync && ok "rsync present" || { err "rsync not found (needed by update-production)"; bad=1; }
  echo
  if [ -d "$PRODUCTION/backend" ]; then
    ok "production/ present$( [ -f "$PRODUCTION/PROMOTION.txt" ] && printf ' (%s)' "$(grep -E '^promoted_at' "$PRODUCTION/PROMOTION.txt" | cut -d' ' -f2-)" )"
  else warn "production/ not built yet — run: ./pipeline.sh update-production"; fi
  if [ -f "$ENVFILE" ]; then
    ok "deploy/.env.production present"
    local s; s="$(env_val JWT_SECRET)"
    if [ -z "$s" ] || [ "${#s}" -lt 16 ]; then warn "JWT_SECRET missing/too short (need >= 16 chars)"; fi
    [ -z "$(env_val CORS_ALLOW_ORIGINS)" ] && warn "CORS_ALLOW_ORIGINS is empty — set your public origin"
    [ -z "$(env_val POSTGRES_PASSWORD)" ] && warn "POSTGRES_PASSWORD is empty"
  else warn "deploy/.env.production missing — copy from .env.production.example"; fi
  [ "$bad" -eq 0 ] && ok "Core tooling present." || err "Missing required tooling (see above)."
  return "$bad"
}

cmd_update_production() {
  have rsync || die "rsync is required for update-production."
  local skip_tests=0
  for a in "$@"; do case "$a" in --skip-tests) skip_tests=1 ;; esac; done

  if [ "$skip_tests" -eq 0 ]; then
    step "Gating promotion on prototype backend tests"
    if [ -x "$PROTOTYPE/dev.sh" ]; then
      "$PROTOTYPE/dev.sh" test backend || die "Tests failed — not promoting. (Override with --skip-tests.)"
    else
      warn "prototype/dev.sh not found — skipping test gate."
    fi
  else
    warn "Skipping test gate (--skip-tests)."
  fi

  step "Promoting prototype/ -> production/"
  mkdir -p "$PRODUCTION"
  rsync -a --delete \
    --exclude '.venv/' --exclude 'node_modules/' --exclude '__pycache__/' \
    --exclude '.pytest_cache/' --exclude '*.pyc' \
    --exclude 'parking*.db*' --exclude 'uploads/' --exclude 'dist/' \
    --exclude '.env' --exclude '.env.*' \
    --exclude 'dev.sh' --exclude 'Makefile' --exclude 'manual/' --exclude 'manual.zip' \
    --exclude 'docker-compose.yml' --exclude '.DS_Store' \
    --exclude '*.swp' --exclude '*.swo' --exclude '*~' \
    --exclude 'PROMOTION.txt' \
    "$PROTOTYPE/" "$PRODUCTION/"

  {
    echo "source       prototype/"
    echo "promoted_at  $(now_utc)"
    echo "git_commit   $(git_sha)"
    echo "note         Generated by ./pipeline.sh update-production — do not edit by hand."
  } > "$PRODUCTION/PROMOTION.txt"

  ok "production/ updated from prototype/ (commit $(git_sha))."
  info "${C_DIM}Review the diff, commit production/, then: ./pipeline.sh build-production${C_RST}"
}

cmd_build_production() {
  require_production; require_envfile; require_docker; check_secret
  local tag="${1:-$(git_sha)}"
  step "Building production images (tag: $tag)"
  TAG="$tag" dc build
  ok "Built parking-backend:$tag and parking-frontend:$tag"
}

cmd_deploy() {
  require_production; require_envfile; require_docker; check_secret
  local tag="${1:-$(git_sha)}"
  step "Deploying production stack (tag: $tag)"
  TAG="$tag" dc up -d --build
  step "Waiting for the stack to become healthy"
  cmd_verify || warn "Health check did not confirm readiness; check ./pipeline.sh logs."
  local port; port="$(frontend_port)"
  echo
  ok "Deployed."
  info "   App    : ${C_B}http://localhost:$port/${C_RST}   Admin: ${C_B}http://localhost:$port/admin${C_RST}"
  info "   ${C_DIM}Put a TLS-terminating reverse proxy in front of port $port for real traffic.${C_RST}"
  info "   ${C_DIM}No demo accounts exist in production — bootstrap one: ./pipeline.sh create-admin <user>${C_RST}"
}

cmd_release() {
  step "Release: update-production -> build-production -> deploy"
  cmd_update_production "$@"
  cmd_build_production
  cmd_deploy
}

cmd_migrate() {
  require_envfile; require_docker
  step "Applying database migrations (alembic upgrade head)"
  dc exec -T backend alembic upgrade head
  ok "Migrations applied."
}

cmd_create_admin() {
  require_envfile; require_docker
  local user="${1:-}" name="${2:-}" role="${3:-sysadmin}"
  [ -n "$user" ] || die "Usage: ./pipeline.sh create-admin <username> [display_name] [manager|sysadmin]"
  [ -n "$name" ] || name="$user"
  case "$role" in manager|sysadmin) ;; *) die "role must be 'manager' or 'sysadmin'";; esac

  local pass pass2
  printf 'Password for %s (%s): ' "$user" "$role"; read -rs pass; echo
  printf 'Confirm password: '; read -rs pass2; echo
  [ "$pass" = "$pass2" ] || die "Passwords do not match."
  [ "${#pass}" -ge 8 ] || die "Choose a password of at least 8 characters."

  step "Creating admin '$user' ($role) in the running backend"
  NEW_ADMIN_USER="$user" NEW_ADMIN_PASS="$pass" NEW_ADMIN_NAME="$name" NEW_ADMIN_ROLE="$role" \
  dc exec -T \
    -e NEW_ADMIN_USER -e NEW_ADMIN_PASS -e NEW_ADMIN_NAME -e NEW_ADMIN_ROLE \
    backend python - <<'PY'
import os, sys
from sqlalchemy import select
from app.db import SessionLocal
from app.models import AdminUser
from app.security import hash_password

u = os.environ["NEW_ADMIN_USER"]; p = os.environ["NEW_ADMIN_PASS"]
d = os.environ.get("NEW_ADMIN_NAME") or u
r = os.environ.get("NEW_ADMIN_ROLE") or "sysadmin"
db = SessionLocal()
try:
    row = db.scalar(select(AdminUser).where(AdminUser.username == u))
    if row:
        row.password = hash_password(p); row.display_name = d; row.role = r
        row.is_active = 1  # a manual reset always re-enables the account
        action = "updated"
    else:
        db.add(AdminUser(
            username=u, password=hash_password(p), display_name=d, role=r,
            is_active=1, created_by="cli",
        ))
        action = "created"
    db.commit()
    print(f"admin {action}: {u} ({r})")
finally:
    db.close()
PY
  ok "Done. Log in at http://localhost:$(frontend_port)/admin"
}

cmd_status()   { require_envfile; require_docker; dc ps; }
cmd_logs()     { require_envfile; require_docker; dc logs -f "${1:-}"; }
cmd_down()     { require_envfile; require_docker; dc down; ok "Stopped (data volumes kept). Use 'dc down -v' to wipe data."; }
cmd_config()   { require_envfile; detect_compose; dc config; }

cmd_verify() {
  require_envfile
  local port url i; port="$(frontend_port)"; url="http://localhost:$port/"
  have curl || { warn "curl not available; skipping health verify."; return 0; }
  for i in $(seq 1 30); do
    if curl -fsS "http://localhost:$port/api/health" >/dev/null 2>&1; then ok "Backend healthy via frontend proxy ($url)"; return 0; fi
    sleep 2
  done
  return 1
}

cmd_rollback() {
  require_production; require_envfile; require_docker; check_secret
  local tag="${1:-}"
  [ -n "$tag" ] || die "Usage: ./pipeline.sh rollback <image-tag>   (a previously built tag; see 'docker images parking-backend')"
  step "Rolling back to tag: $tag"
  TAG="$tag" dc up -d
  cmd_verify || warn "Rollback health check inconclusive; check logs."
  ok "Rolled back to $tag."
}

cmd_diff() {
  require_production; have rsync || die "rsync required."
  step "Pending promotion changes (prototype/ vs production/)"
  # Dry-run the same sync to list what update-production would change.
  rsync -a --delete --itemize-changes --dry-run \
    --exclude '.venv/' --exclude 'node_modules/' --exclude '__pycache__/' \
    --exclude '.pytest_cache/' --exclude '*.pyc' \
    --exclude 'parking*.db*' --exclude 'uploads/' --exclude 'dist/' \
    --exclude '.env' --exclude '.env.*' \
    --exclude 'dev.sh' --exclude 'Makefile' --exclude 'manual/' --exclude 'manual.zip' \
    --exclude 'docker-compose.yml' --exclude '.DS_Store' \
    --exclude '*.swp' --exclude '*.swo' --exclude '*~' --exclude 'PROMOTION.txt' \
    "$PROTOTYPE/" "$PRODUCTION/" | grep -vE '^\.d\.\.t' || true
  info "${C_DIM}(empty = production/ is in sync with prototype/)${C_RST}"
}

usage() {
  cat <<EOF
${C_B}Parking Ticket Inspection System — production pipeline${C_RST}

  ${C_B}Usage:${C_RST} ./pipeline.sh <command> [args]

  ${C_B}Promote & build${C_RST}
    update-production [--skip-tests]   Promote prototype/ -> production/ (test-gated)
    diff                               Show what update-production would change
    build-production [tag]             Build tagged production images
    release [--skip-tests]             update-production -> build-production -> deploy

  ${C_B}Run${C_RST}
    deploy [tag]        Build (if needed) + start the prod stack + verify
    migrate             Run alembic upgrade head in the backend container
    create-admin <u> [name] [role]   Create/reset a real admin (role: manager|sysadmin)
    rollback <tag>      Redeploy a previously built image tag

  ${C_B}Manage${C_RST}
    status              docker compose ps for the prod stack
    logs [service]      Follow logs (optionally one service)
    verify              Health-check the running stack
    config              Validate the compose + env (docker compose config)
    down                Stop the stack (keeps data volumes)
    doctor              Check prerequisites, production/, and .env.production

  ${C_B}Layout${C_RST}
    prototype/  working source     production/  promoted deployable copy
    deploy/docker-compose.prod.yml + deploy/.env.production  (git-ignored)

  First time:  cp ${ENVEXAMPLE#$ROOT/} ${ENVFILE#$ROOT/}  → edit REQUIRED values → ./pipeline.sh doctor
EOF
}

main() {
  local cmd="${1:-help}"; shift || true
  case "$cmd" in
    update-production|promote) cmd_update_production "$@" ;;
    build-production|build)    cmd_build_production "$@" ;;
    deploy|up)                 cmd_deploy "$@" ;;
    release)                   cmd_release "$@" ;;
    migrate)                   cmd_migrate "$@" ;;
    create-admin)              cmd_create_admin "$@" ;;
    rollback)                  cmd_rollback "$@" ;;
    status|ps)                 cmd_status "$@" ;;
    logs)                      cmd_logs "$@" ;;
    verify|smoke)              { cmd_verify && ok "OK" || die "Not healthy."; } ;;
    config)                    cmd_config "$@" ;;
    down|stop)                 cmd_down "$@" ;;
    diff)                      cmd_diff "$@" ;;
    doctor)                    cmd_doctor "$@" ;;
    help|-h|--help)            usage ;;
    *) err "Unknown command: $cmd"; echo; usage; exit 1 ;;
  esac
}

main "$@"
