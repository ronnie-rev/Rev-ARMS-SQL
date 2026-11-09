#!/usr/bin/env bash
# Prove the backup can be restored (HIPAA contingency plan: a backup you have never restored is not a backup). Run quarterly, and after any change to backups.
# Usage:  AGE_IDENTITY=/path/to/age-private-key.txt bash 41-restore-test.sh [backup-file]
# The private key is only needed for the test: bring it from offline storage, run, then delete it from the server.
set -euo pipefail
ENV_FILE="${CLAIMSIQ_ENV:-/opt/claimsiq/claimsiq.env}"; set -a; . "$ENV_FILE"; set +a
: "${AGE_IDENTITY:?path to the age PRIVATE key file}" "${BACKUP_DIR:?}" "${INSTALL_DIR:?}"
f="${1:-$(ls -1t "$BACKUP_DIR"/daily/claimsiq-2*.dump.age | head -1)}"; echo "restoring $f"
sha256sum -c "$f.sha256"
image=$(docker inspect supabase-db --format '{{.Config.Image}}'); name=claimsiq-restore-test
docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" -e POSTGRES_PASSWORD=restoretest "$image" >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 60); do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
age -d -i "$AGE_IDENTITY" "$f" | docker exec -i "$name" pg_restore -U postgres -d postgres --clean --if-exists --no-owner >/tmp/restore.log 2>&1 || echo "(pg_restore reported warnings — normal for pre-existing Supabase roles/extensions; review /tmp/restore.log)"
q() { docker exec "$name" psql -U postgres -d postgres -tAc "$1"; }
claims=$(q "select count(*) from public.claims"); profiles=$(q "select count(*) from public.profiles"); users=$(q "select count(*) from auth.users"); pol=$(q "select count(*) from pg_policies where schemaname='public'")
echo "restored: claims=$claims profiles=$profiles auth_users=$users policies=$pol"
[ "$profiles" -ge 1 ] && [ "$pol" -ge 50 ] && echo "RESTORE TEST PASSED — record the date, the file and who ran it in your contingency-plan log." || { echo "RESTORE TEST FAILED"; exit 1; }
