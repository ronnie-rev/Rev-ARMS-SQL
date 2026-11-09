#!/usr/bin/env bash
# Step 2 — apply ClaimsIQ's database migrations (supabase/migrations/*.sql) to the self-hosted database, in order, once each.
# Run from a checkout of this repository on the server:  sudo bash deploy/selfhost/20-apply-migrations.sh
set -euo pipefail
ENV_FILE="${CLAIMSIQ_ENV:-/opt/claimsiq/claimsiq.env}"; set -a; . "$ENV_FILE"; set +a
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "${INSTALL_DIR:?}"
psql() { docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
psql -qc "create table if not exists public.claimsiq_migrations (name text primary key, applied_at timestamptz not null default now());"
n=0
for f in "$REPO"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if [ "$(psql -tAc "select count(*) from public.claimsiq_migrations where name='$name'")" != "0" ]; then echo "skip   $name"; continue; fi
  echo "apply  $name"; psql -q < "$f"; psql -qc "insert into public.claimsiq_migrations(name) values ('$name')"; n=$((n+1))
done
echo "== $n migration(s) applied. Verifying with the same check you use on Supabase Cloud:"
psql -f - < "$REPO/docs/CHECK_MIGRATIONS.sql"
echo "== every row must say t. Then: bash 30-create-first-admin.sh"
