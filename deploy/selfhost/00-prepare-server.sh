#!/usr/bin/env bash
# Step 0 — harden a fresh Ubuntu 22.04/24.04 server and install Docker. Run as root ONCE:  sudo bash 00-prepare-server.sh
# Idempotent. It will NOT lock you out: it only disables SSH password login if your user already has an authorized key.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }
. /etc/os-release; case "$ID" in ubuntu|debian) ;; *) echo "Tested for Ubuntu/Debian only (found $ID)"; exit 1;; esac

echo "== 1. updates + automatic security patches"
apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades ufw fail2ban ca-certificates curl gnupg age jq openssl cron chrony
dpkg-reconfigure -f noninteractive unattended-upgrades || true
systemctl enable --now chrony fail2ban cron

echo "== 2. SSH: keys only (only if a key is present)"
if compgen -G "/root/.ssh/authorized_keys" >/dev/null || compgen -G "/home/*/.ssh/authorized_keys" >/dev/null; then
  install -d /etc/ssh/sshd_config.d
  printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\nMaxAuthTries 3\nClientAliveInterval 300\nClientAliveCountMax 2\n' > /etc/ssh/sshd_config.d/99-claimsiq.conf
  sshd -t && systemctl reload ssh || systemctl reload sshd || true
else
  echo "!! No SSH key found — password login left ON. Add your public key, then re-run this script."
fi

echo "== 3. firewall: only SSH + HTTP/HTTPS"
ufw default deny incoming; ufw default allow outgoing
ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp
ufw --force enable

echo "== 4. Docker (official repo)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc; chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
# Docker publishes ports straight into iptables and BYPASSES ufw. 10-install-supabase.sh therefore binds every published port to 127.0.0.1; 50-verify.sh proves it.

echo "== 5. disk encryption check (HIPAA: encryption at rest)"
if lsblk -o NAME,TYPE,FSTYPE | grep -qiE 'crypt|LUKS'; then echo "OK: an encrypted (LUKS/crypt) volume is present."; else
  echo "!! No LUKS/crypt volume detected. Either (a) your provider encrypts the volume at the hypervisor — get that in writing and file it, or"
  echo "   (b) move Docker + backups to an encrypted volume (see docs/SELFHOST_RUNBOOK.md §3). Do NOT load real PHI until one is true."
fi
echo "== done. Next: copy claimsiq.env.example to /opt/claimsiq/claimsiq.env, edit it, then run 10-install-supabase.sh"
