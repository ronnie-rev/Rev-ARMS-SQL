#!/usr/bin/env bash
# Security self-check for the self-hosted stack. Run on the server after install and after every change:  sudo bash 50-verify.sh
# Prints PASS/FAIL per control; exit code 1 if any FAIL. These are the controls your risk analysis relies on.
ENV_FILE="${CLAIMSIQ_ENV:-/opt/claimsiq/claimsiq.env}"; set -a; . "$ENV_FILE"; set +a
cd "${INSTALL_DIR:?}"; bad=0
pass() { echo "PASS  $1"; }; fail() { echo "FAIL  $1"; bad=1; }
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-); PORT=$(grep -E '^KONG_HTTP_PORT=' .env | cut -d= -f2- || true); PORT=${PORT:-8000}
API="https://api.$DOMAIN"

# 1 — nothing is published on a public interface (Docker bypasses ufw)
pub=$(ss -Hlnt | awk '{print $4}' | grep -vE '^(127\.0\.0\.1|\[::1\]|\*:(22|80|443)$|0\.0\.0\.0:(22|80|443)$|\[::\]:(22|80|443)$)' | grep -vE '^\[?::1\]?:' || true)
[ -z "$pub" ] && pass "only 22/80/443 listen publicly (everything else is localhost)" || { fail "unexpected public listeners:"; echo "$pub"; }
# 2 — HTTPS + security headers on the app and API
for u in "https://$DOMAIN" "$API/auth/v1/health"; do
  h=$(curl -sSI --max-time 15 "$u" 2>/dev/null | tr -d '\r'); echo "$h" | grep -qi '^strict-transport-security' && pass "HSTS on $u" || fail "no HSTS on $u"
done
curl -sSI --max-time 15 "https://$DOMAIN" | tr -d '\r' | grep -qi '^content-security-policy' && pass "CSP on the app" || fail "no Content-Security-Policy on the app"
curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "http://$DOMAIN" | grep -qE '^30[1278]$' && pass "HTTP redirects to HTTPS" || fail "plain HTTP not redirected"
# 3 — RLS: the public key must not read claims
code=$(curl -sS --max-time 15 -o /tmp/v.json -w '%{http_code}' "$API/rest/v1/claims?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
{ [ "$code" = "401" ] || [ "$code" = "403" ] || [ "$(cat /tmp/v.json)" = "[]" ]; } && pass "anonymous key cannot read claims (HTTP $code)" || fail "anonymous request returned data or $code: $(head -c 120 /tmp/v.json)"
# 4 — uninvited sign-up is blocked (migration 0023)
r=$(curl -sS --max-time 20 -X POST "$API/auth/v1/signup" -H "apikey: $ANON" -H 'Content-Type: application/json' -d "{\"email\":\"verify-$(date +%s)@example.invalid\",\"password\":\"Verify-$(openssl rand -hex 6)!\"}")
echo "$r" | grep -qiE 'not been invited|error|database error' && pass "sign-up by an uninvited email is rejected" || fail "uninvited sign-up was ACCEPTED: $(echo "$r" | head -c 160)"
# 5 — every public table has RLS enabled
n=$(docker compose exec -T db psql -U postgres -d postgres -tAc "select count(*) from pg_tables where schemaname='public' and not rowsecurity and tablename not in ('claimsiq_migrations')")
[ "${n:-1}" = "0" ] && pass "row-level security enabled on every public table" || { fail "$n public table(s) without RLS:"; docker compose exec -T db psql -U postgres -d postgres -tAc "select tablename from pg_tables where schemaname='public' and not rowsecurity"; }
# 6 — Studio / internal paths are not reachable from the internet
sc=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$API/pg/tables" || true); [ "$sc" = "404" ] && pass "internal API paths return 404 externally" || fail "internal path answered $sc"
# 7 — disk encryption, patching, backups
lsblk -o TYPE,FSTYPE | grep -qiE 'crypt|LUKS' && pass "encrypted volume present" || echo "WARN  no LUKS volume detected — keep your provider's written encryption statement on file"
systemctl is-active --quiet unattended-upgrades && pass "automatic security updates active" || fail "unattended-upgrades not active"
latest=$(ls -1t "${BACKUP_DIR:-/nonexistent}"/daily/claimsiq-2*.dump.age 2>/dev/null | head -1); [ -n "$latest" ] && [ "$(find "$latest" -mtime -2 | wc -l)" = "1" ] && pass "a backup newer than 48h exists ($latest)" || fail "no recent backup"
rm -f /tmp/v.json; exit $bad
