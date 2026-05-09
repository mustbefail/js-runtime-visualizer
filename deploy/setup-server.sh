#!/usr/bin/env bash
# One-time server bootstrap for the JS Runtime Visualizer.
#
# Supports both Debian/Ubuntu (apt-get) and Fedora/RHEL (dnf). On Fedora it
# also configures SELinux contexts and opens port 80 in firewalld when
# those subsystems are active.
#
# What it does:
#   - Installs nginx if missing.
#   - Creates DEPLOY_PATH, owned by DEPLOY_USER (the user that GitHub Actions
#     will rsync as).
#   - Drops a SPA-friendly nginx site config and removes the distro default
#     server block so nginx doesn't refuse to start on duplicate :80 listens.
#   - Sets SELinux context for /var/www/jsrv where applicable.
#   - Opens port 80 in firewalld where applicable.
#   - Enables and starts nginx.
#
# Run on the server via sudo from your normal SSH user. Idempotent.
#
# Usage:
#   sudo DEPLOY_PATH=/var/www/jsrv bash /tmp/setup-server.sh

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-root}}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/jsrv}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "setup-server.sh must run with root privileges. Re-run with: sudo bash $0" >&2
  exit 1
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "User '$DEPLOY_USER' does not exist on this server." >&2
  echo "Set DEPLOY_USER=<existing-user> and re-run, e.g.:" >&2
  echo "  sudo DEPLOY_USER=codelance bash $0" >&2
  exit 1
fi

if command -v dnf >/dev/null 2>&1; then
  PKG=dnf
elif command -v apt-get >/dev/null 2>&1; then
  PKG=apt-get
else
  echo "Unsupported OS: neither dnf nor apt-get is available." >&2
  exit 1
fi

echo "==> Deploy user: $DEPLOY_USER"
echo "==> Deploy path: $DEPLOY_PATH"
echo "==> Package manager: $PKG"

echo "==> Installing nginx if missing"
if ! command -v nginx >/dev/null 2>&1; then
  case "$PKG" in
    dnf) dnf install -y nginx ;;
    apt-get) apt-get update -y && apt-get install -y nginx ;;
  esac
fi

echo "==> Preparing $DEPLOY_PATH"
mkdir -p "$DEPLOY_PATH"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$DEPLOY_PATH"
chmod 755 "$DEPLOY_PATH"

echo "==> Writing nginx site config"
case "$PKG" in
  apt-get)
    SITE_CONF="/etc/nginx/sites-available/jsrv"
    sed "s|__DEPLOY_PATH__|${DEPLOY_PATH}|g" "$SCRIPT_DIR/nginx.conf" > "$SITE_CONF"
    mkdir -p /etc/nginx/sites-enabled
    ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/jsrv
    rm -f /etc/nginx/sites-enabled/default
    ;;
  dnf)
    # Fedora puts site fragments in conf.d/ and ships a default server block
    # inline in /etc/nginx/nginx.conf. Two `default_server` directives on the
    # same port make nginx refuse to start, so we replace the main config
    # with a minimal one that just delegates to conf.d/.
    SITE_CONF="/etc/nginx/conf.d/jsrv.conf"
    sed "s|__DEPLOY_PATH__|${DEPLOY_PATH}|g" "$SCRIPT_DIR/nginx.conf" > "$SITE_CONF"
    rm -f /etc/nginx/conf.d/default.conf
    if ! grep -q "# managed-by: jsrv-setup" /etc/nginx/nginx.conf 2>/dev/null; then
      cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.jsrv
      cat > /etc/nginx/nginx.conf <<'NGINX_MAIN'
# managed-by: jsrv-setup
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include             /etc/nginx/mime.types;
    default_type        application/octet-stream;
    sendfile            on;
    tcp_nopush          on;
    keepalive_timeout   65;
    types_hash_max_size 4096;

    include /etc/nginx/conf.d/*.conf;
}
NGINX_MAIN
    fi
    ;;
esac

echo "==> Verifying nginx config"
nginx -t

if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  echo "==> SELinux is enforcing — labelling $DEPLOY_PATH for httpd"
  if command -v semanage >/dev/null 2>&1; then
    semanage fcontext -a -t httpd_sys_content_t "${DEPLOY_PATH}(/.*)?" 2>/dev/null \
      || semanage fcontext -m -t httpd_sys_content_t "${DEPLOY_PATH}(/.*)?"
    restorecon -R "$DEPLOY_PATH"
  else
    chcon -R -t httpd_sys_content_t "$DEPLOY_PATH" || true
  fi
fi

if systemctl is-active --quiet firewalld 2>/dev/null; then
  echo "==> firewalld is active — opening http"
  firewall-cmd --permanent --add-service=http >/dev/null
  firewall-cmd --reload >/dev/null
fi

echo "==> Enabling and starting nginx"
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx 2>/dev/null || systemctl restart nginx

echo
PUBLIC_IP="$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
echo "Server ready. Deploy will write into: $DEPLOY_PATH"
echo "Site URL (after first deploy): http://${PUBLIC_IP}/"
