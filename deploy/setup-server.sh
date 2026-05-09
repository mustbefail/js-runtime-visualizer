#!/usr/bin/env bash
# One-time server bootstrap for the JS Runtime Visualizer.
#
# What it does:
#   - Installs nginx if missing.
#   - Creates DEPLOY_PATH and gives ownership to DEPLOY_USER.
#   - Drops the SPA-friendly nginx site config at /etc/nginx/sites-available/jsrv
#     and enables it as the default server on :80.
#   - Reloads nginx.
#
# Run on the Hetzner box, as root (or with sudo). Idempotent — re-running is fine.
#
# Usage:
#   DEPLOY_USER=root DEPLOY_PATH=/var/www/jsrv ./setup-server.sh

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/jsrv}"

if [ "$(id -u)" -ne 0 ]; then
  echo "setup-server.sh must run as root (use sudo)." >&2
  exit 1
fi

echo "==> Installing nginx if missing"
if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y nginx
fi

echo "==> Preparing $DEPLOY_PATH"
mkdir -p "$DEPLOY_PATH"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$DEPLOY_PATH"

echo "==> Writing nginx site config"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_CONF="/etc/nginx/sites-available/jsrv"
sed "s|__DEPLOY_PATH__|${DEPLOY_PATH}|g" "$SCRIPT_DIR/nginx.conf" > "$SITE_CONF"

echo "==> Enabling site (replacing default)"
ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/jsrv
rm -f /etc/nginx/sites-enabled/default

echo "==> Verifying nginx config"
nginx -t

echo "==> Reloading nginx"
systemctl reload nginx || systemctl restart nginx

echo
echo "Server ready. Deploy will write into: $DEPLOY_PATH"
echo "Site URL: http://$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')/"
