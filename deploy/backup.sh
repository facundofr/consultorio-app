#!/bin/sh
# Daily PostgreSQL backup (runs in the `backup` service of docker-compose.prod.yml).
#
# - One dump per day at BACKUP_HOUR (server time, default 3), custom format (-Fc),
#   in /backups (BACKUP_DIR on the host, ./backups by default).
# - Keeps BACKUP_KEEP_DAYS days (default 14).
# - Phones and emails inside are encrypted with PII_ENCRYPTION_KEY: keep that
#   key somewhere else (password manager), never next to these files.
#
# Restore: see deploy/README.md ("Restaurar un backup").
set -eu

KEEP="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
mkdir -p /backups

dump() {
  stamp="$(date +%Y-%m-%d_%H%M)"
  tmp="/backups/.turnos_${stamp}.dump.tmp"
  if pg_dump -Fc -f "$tmp"; then
    mv "$tmp" "/backups/turnos_${stamp}.dump"
    echo "[backup] ok turnos_${stamp}.dump ($(du -h "/backups/turnos_${stamp}.dump" | cut -f1))"
    find /backups -name 'turnos_*.dump' -type f -mtime +"$KEEP" -print -delete | sed 's/^/[backup] deleted /'
  else
    rm -f "$tmp"
    echo "[backup] FAILED" >&2
  fi
}

# First backup right away, so a fresh install is covered from day one.
dump
if [ "$(date +%H | sed 's/^0//')" = "$HOUR" ]; then last="$(date +%Y-%m-%d)"; fi
while true; do
  now_h="$(date +%H | sed 's/^0//')"
  if [ "${now_h:-0}" -eq "$HOUR" ] && [ "$(date +%Y-%m-%d)" != "${last:-}" ]; then
    dump
    last="$(date +%Y-%m-%d)"
  fi
  sleep 600
done
