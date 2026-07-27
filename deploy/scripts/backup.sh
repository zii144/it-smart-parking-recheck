#!/usr/bin/env bash
# Nightly backup: Postgres dump + uploads volume tarball, written to a local
# directory that a separate, off-box host ("the pull side") reads from over
# SFTP using its own credentials.
#
# This script is intentionally PULL-friendly, not push-based: it only ever
# writes files under $BACKUP_DIR on this host. It has no knowledge of, and no
# credentials for, wherever those files eventually get copied to. Long-term
# retention (weekly/monthly tiers, real off-box durability) is the pulling
# side's job once it's actually pulling — see
# runbooks/phase-4-backup-dr/04-restore-test.md for the current status of
# that hand-off.
#
# Adapted from runbooks/phase-4-backup-dr/01-nightly-pg-dump-cron.md (Step 1)
# and 02-restic-offbox-backup.md §2.2 (Step 2's uploads-export mechanism only
# — the push-to-restic part of Step 2 was replaced by the pull design).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$ROOT/deploy"
BACKUP_DIR="${BACKUP_DIR:-/opt/parking-backups}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-parking-prod_prod_uploads}"
# Group that the restricted pull-only SFTP user (e.g. "backup-puller") is a
# member of. Output files are handed to this group in read-only mode so the
# pull side can read them over its chrooted SFTP session but never write or
# delete anything here. Set to "" to skip this step (e.g. when testing by
# hand into a scratch directory that doesn't have this group).
BACKUP_READ_GROUP="${BACKUP_READ_GROUP:-backup-puller}"

mkdir -p "$BACKUP_DIR"

set -a
source "$DEPLOY/.env.production"
set +a

cd "$DEPLOY"

DATE="$(date +%F)"

# --- Postgres dump -----------------------------------------------------
# pg_dump runs *inside* the db container via `compose exec`, never against a
# published host port: deploy/docker-compose.prod.yml deliberately does not
# expose Postgres to the host (only backend/frontend reach it, over the
# internal Compose network). Reaching it via exec is how the app itself
# reaches it, so backups use the same path rather than opening a port.
SQL_OUT="$BACKUP_DIR/parking-$DATE.sql"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-parking}" > "$SQL_OUT"

if [ -n "$BACKUP_READ_GROUP" ]; then
  chgrp "$BACKUP_READ_GROUP" "$SQL_OUT" 2>/dev/null || true
  chmod 640 "$SQL_OUT"
fi

echo "$(date -u +%FT%TZ) backup OK: $SQL_OUT ($(du -h "$SQL_OUT" | cut -f1))"

# --- Uploads volume ------------------------------------------------------
# Exported via a throwaway container rather than reading the named volume's
# on-disk path directly: the local `-v /var/lib/docker/volumes/.../_data`
# layout is an internal implementation detail of the `local` volume driver
# and isn't guaranteed stable across Docker versions/storage drivers. This
# is the portable way to get a named volume's contents onto disk regardless
# of what's actually running underneath.
UPLOADS_OUT="$BACKUP_DIR/uploads-$DATE.tar.gz"
docker run --rm \
  -v "$UPLOADS_VOLUME":/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/uploads-$DATE.tar.gz" -C /data .

if [ -n "$BACKUP_READ_GROUP" ]; then
  chgrp "$BACKUP_READ_GROUP" "$UPLOADS_OUT" 2>/dev/null || true
  chmod 640 "$UPLOADS_OUT"
fi

echo "$(date -u +%FT%TZ) backup OK: $UPLOADS_OUT ($(du -h "$UPLOADS_OUT" | cut -f1))"
