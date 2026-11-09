#!/usr/bin/env bash
# Nightly encrypted database backup. Install as a root cron job:   15 2 * * *  /opt/claimsiq/repo/deploy/selfhost/40-backup.sh >> /var/log/claimsiq-backup.log 2>&1
# Output: $BACKUP_DIR/daily/claimsiq-YYYY-MM-DD.dump.age  (encrypted with your PUBLIC age key — the private key lives offline, never on this server).
# On the 1st of the month a copy is also kept in monthly/. Optional off-server copy with rclone.
set -euo pipefail
ENV_FILE="${CLAIMSIQ_ENV:-/opt/claimsiq/claimsiq.env}"; set -a; . "$ENV_FILE"; set +a
: "${BACKUP_DIR:?}" "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (age public key) — see runbook §7}" "${INSTALL_DIR:?}"
umask 077; mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/monthly"; cd "$INSTALL_DIR"
day=$(date +%F); out="$BACKUP_DIR/daily/claimsiq-$day.dump.age"; tmp="$out.partial"
# custom-format dump of the whole application database (all schemas: app tables, auth users, storage metadata)
docker compose exec -T db pg_dump -U postgres -d postgres -Fc --no-owner | age -r "$BACKUP_AGE_RECIPIENT" > "$tmp"
[ -s "$tmp" ] || { echo "backup is empty — aborting"; rm -f "$tmp"; exit 1; }
mv "$tmp" "$out"; sha256sum "$out" > "$out.sha256"
[ "$(date +%d)" = "01" ] && cp -p "$out" "$out.sha256" "$BACKUP_DIR/monthly/"
# keep also the (secret) configuration, encrypted — without .env the data cannot be used
tar -C "$INSTALL_DIR" -cz .env 2>/dev/null | age -r "$BACKUP_AGE_RECIPIENT" > "$BACKUP_DIR/daily/claimsiq-env-$day.tar.gz.age"
# retention
find "$BACKUP_DIR/daily" -type f -mtime +"${BACKUP_KEEP_DAILY:-14}" -delete
find "$BACKUP_DIR/monthly" -type f -mtime +"$(( ${BACKUP_KEEP_MONTHLY:-12} * 31 ))" -delete
# optional off-server copy (the files are already encrypted; the destination still needs a BAA if you treat backups as PHI)
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then rclone copy "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" --transfers 2 --checksum; fi
echo "$(date -Is) backup ok: $out ($(du -h "$out" | cut -f1))"
