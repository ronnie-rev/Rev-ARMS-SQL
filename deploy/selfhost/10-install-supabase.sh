#!/usr/bin/env bash
# Step 1 — install the open-source Supabase stack from upstream at a PINNED version, generate fresh secrets, lock its ports to localhost and start it.
# Run as root:  sudo bash 10-install-supabase.sh      (needs /opt/claimsiq/claimsiq.env)
set -euo pipefail
ENV_FILE="${CLAIMSIQ_ENV:-/opt/claimsiq/claimsiq.env}"; [ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy claimsiq.env.example)"; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${DOMAIN:?}" "${SUPABASE_REF:?set SUPABASE_REF to a tested upstream tag/commit}" "${INSTALL_DIR:?}"
[ "$SUPABASE_REF" != "master" ] && [ "$SUPABASE_REF" != "main" ] || { echo "Pin SUPABASE_REF to a tag or commit, not a moving branch."; exit 1; }

SRC=/opt/claimsiq/upstream
if [ ! -d "$SRC/.git" ]; then git clone --filter=blob:none --no-checkout https://github.com/supabase/supabase "$SRC"; fi
git -C "$SRC" fetch --depth 1 origin "$SUPABASE_REF" && git -C "$SRC" checkout -q FETCH_HEAD -- docker
echo "upstream docker/ at $(git -C "$SRC" rev-parse --short FETCH_HEAD)"

mkdir -p "$INSTALL_DIR"
if [ ! -f "$INSTALL_DIR/.env" ]; then
  cp -r "$SRC/docker/." "$INSTALL_DIR/"; cp "$SRC/docker/.env.example" "$INSTALL_DIR/.env"; chmod 600 "$INSTALL_DIR/.env"
  cd "$INSTALL_DIR"
  # Fresh secrets. The upstream .env.example ships PUBLIC demo keys — anyone could mint a service_role token with them, so every secret is replaced before first start.
  setenv() { local v; v=$(printf '%s' "$2" | sed 's/[&#\\]/\\&/g'); if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$v#" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }
  b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
  mkjwt() { # $1 role — HS256 token signed with JWT_SECRET, valid 10 years (rotate by regenerating JWT_SECRET + both keys)
    local h p now; now=$(date +%s); h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url); p=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$now" "$((now+315360000))" | b64url)
    printf '%s.%s.%s' "$h" "$p" "$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)"; }
  JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)
  setenv JWT_SECRET "$JWT_SECRET"; setenv ANON_KEY "$(mkjwt anon)"; setenv SERVICE_ROLE_KEY "$(mkjwt service_role)"
  setenv POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  DASH_PASS=$(openssl rand -base64 24 | tr -d '\n=+/'); setenv DASHBOARD_USERNAME "claimsiq_admin"; setenv DASHBOARD_PASSWORD "$DASH_PASS"
  for v in SECRET_KEY_BASE PG_META_CRYPTO_KEY LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN LOGFLARE_API_KEY; do grep -q "^$v=" .env && setenv "$v" "$(openssl rand -hex 32)"; done
  grep -q "^VAULT_ENC_KEY=" .env && setenv VAULT_ENC_KEY "$(openssl rand -hex 16)"   # must be exactly 32 characters
  grep -q "^REALTIME_DB_ENC_KEY=" .env && setenv REALTIME_DB_ENC_KEY "$(openssl rand -hex 8)"   # 16 characters
  echo "Studio dashboard login (keep private, it is NOT exposed publicly): claimsiq_admin / $DASH_PASS"
  echo "Public API key to put in the app build (VITE_SUPABASE_ANON_KEY): $(grep '^ANON_KEY=' .env | cut -d= -f2-)"
  setenv SITE_URL "https://$DOMAIN"
  setenv API_EXTERNAL_URL "https://api.$DOMAIN"
  setenv SUPABASE_PUBLIC_URL "https://api.$DOMAIN"
  setenv ADDITIONAL_REDIRECT_URLS "https://$DOMAIN/**"
  setenv ENABLE_EMAIL_SIGNUP true            # sign-up stays on because invited users create their own password; migration 0023 blocks anyone who was not invited
  setenv ENABLE_EMAIL_AUTOCONFIRM false
  setenv ENABLE_ANONYMOUS_USERS false
  setenv ENABLE_PHONE_SIGNUP false
  [ -n "${SMTP_HOST:-}" ] && { setenv SMTP_HOST "$SMTP_HOST"; setenv SMTP_PORT "${SMTP_PORT:-587}"; setenv SMTP_USER "${SMTP_USER:-}"; setenv SMTP_PASS "${SMTP_PASS:-}"; setenv SMTP_ADMIN_EMAIL "${SMTP_SENDER_EMAIL:-no-reply@$DOMAIN}"; setenv SMTP_SENDER_NAME "${SMTP_SENDER_NAME:-ClaimsIQ}"; } || echo "!! SMTP not set: invites and password-reset emails will not be delivered."
  # bind every published port to localhost (Docker would otherwise expose them past the firewall)
  sed -E -i 's#^(\s*-\s*)(\$\{[A-Z0-9_]+\}:[0-9]+(/(tcp|udp))?)\s*$#\1127.0.0.1:\2#' docker-compose.yml
  echo "Secrets generated into $INSTALL_DIR/.env (mode 600). BACK THIS FILE UP SECURELY (password manager / offline). Losing JWT_SECRET invalidates every session and API key."
else
  echo ".env already exists — keeping your secrets. (delete $INSTALL_DIR to reinstall from scratch)"
fi
cd "$INSTALL_DIR"
docker compose pull && docker compose up -d
echo "== waiting for the database"; for i in $(seq 1 60); do docker compose exec -T db pg_isready -U postgres -d postgres >/dev/null 2>&1 && break; sleep 3; done
docker compose ps
echo "== next: bash 20-apply-migrations.sh"
