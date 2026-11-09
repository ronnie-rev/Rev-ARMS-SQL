#!/usr/bin/env bash
# Step 3 — create the FIRST account (becomes Sr. Management because it is the first profile). Everyone else must be invited in the app (Admin → Staff & roles / Client access).
# Run on the server:  sudo bash 30-create-first-admin.sh
set -euo pipefail
ENV_FILE="${CLAIMSIQ_ENV:-/opt/claimsiq/claimsiq.env}"; set -a; . "$ENV_FILE"; set +a
cd "${INSTALL_DIR:?}"; KEY=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-); PORT=$(grep -E '^KONG_HTTP_PORT=' .env | cut -d= -f2- || true); PORT=${PORT:-8000}
EMAIL="${ADMIN_EMAIL:?set ADMIN_EMAIL in claimsiq.env}"
read -rsp "Choose a strong password for $EMAIL (min 14 chars): " PW; echo
[ "${#PW}" -ge 14 ] || { echo "too short"; exit 1; }
BODY=$(jq -n --arg e "$EMAIL" --arg p "$PW" '{email:$e,password:$p,email_confirm:true}')
HTTP=$(curl -sS -o /tmp/claimsiq-admin.json -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/auth/v1/admin/users" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d "$BODY")
if [ "$HTTP" != "200" ] && [ "$HTTP" != "201" ]; then echo "failed ($HTTP):"; cat /tmp/claimsiq-admin.json; rm -f /tmp/claimsiq-admin.json; exit 1; fi
rm -f /tmp/claimsiq-admin.json; unset PW BODY
docker compose exec -T db psql -U postgres -d postgres -tAc "select email, role from public.profiles order by created_at limit 3"
echo "== done. Sign in at https://$DOMAIN with that email, then turn on MFA in Account settings."
