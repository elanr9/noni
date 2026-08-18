#!/bin/bash
# EC2 user-data. OS bootstrap only — it installs Node, Caddy and the systemd
# unit, but deliberately does NOT fetch application code.
#
# The repo is private, and putting a deploy key or PAT on the instance would
# put a credential next to the Mercury token for no benefit. deploy.sh copies
# server.js over SSH once the box is up, and update.sh does the same on every
# change. Nothing here needs git.
#
# __PROXY_DOMAIN__ and __ACME_EMAIL__ are substituted by deploy.sh before this
# is handed to run-instances.

set -euxo pipefail
exec > >(tee /var/log/mercury-proxy-bootstrap.log) 2>&1

PROXY_DOMAIN="__PROXY_DOMAIN__"
ACME_EMAIL="__ACME_EMAIL__"

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https

# --- Node 20 (NodeSource, arm64) --------------------------------------------
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update -y
apt-get install -y nodejs
node --version

# --- Caddy ------------------------------------------------------------------
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

# --- Service account and app directory --------------------------------------
if ! id mercury >/dev/null 2>&1; then
  useradd --system --home /opt/mercury-proxy --shell /usr/sbin/nologin mercury
fi
mkdir -p /opt/mercury-proxy
chown -R mercury:mercury /opt/mercury-proxy

# Staging directory the deploy user can scp into without being root.
mkdir -p /home/ubuntu/mercury-proxy-staging
chown -R ubuntu:ubuntu /home/ubuntu/mercury-proxy-staging

# --- Secrets file -----------------------------------------------------------
# Placeholders. Filled in by hand after first boot (README step 2); the service
# refuses to start until they are real, which is the intended failure mode.
if [ ! -f /etc/mercury-proxy.env ]; then
  cat > /etc/mercury-proxy.env <<'ENVEOF'
MERCURY_API_TOKEN=
PROXY_SHARED_SECRET=
MERCURY_ACCOUNT_ID=
PORT=8080
HOST=127.0.0.1
SEND_LIMIT_PER_MIN=120
UPSTREAM_TIMEOUT_MS=20000
LOG_LEVEL=info
ENVEOF
fi
chown root:root /etc/mercury-proxy.env
chmod 600 /etc/mercury-proxy.env

# --- systemd unit -----------------------------------------------------------
cat > /etc/systemd/system/mercury-proxy.service <<'UNITEOF'
__SYSTEMD_UNIT__
UNITEOF

# --- Caddy config -----------------------------------------------------------
cat > /etc/caddy/Caddyfile <<'CADDYEOF'
__CADDYFILE__
CADDYEOF

# Caddy reads {$PROXY_DOMAIN} / {$ACME_EMAIL} from its process environment.
mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/override.conf <<OVERRIDEEOF
[Service]
Environment=PROXY_DOMAIN=${PROXY_DOMAIN}
Environment=ACME_EMAIL=${ACME_EMAIL}
OVERRIDEEOF

mkdir -p /var/log/caddy
chown -R caddy:caddy /var/log/caddy

# --- Allow the deploy user to install code and restart the service ----------
cat > /etc/sudoers.d/mercury-deploy <<'SUDOEOF'
ubuntu ALL=(root) NOPASSWD: /bin/systemctl restart mercury-proxy, /bin/systemctl status mercury-proxy, /bin/systemctl start mercury-proxy, /bin/systemctl stop mercury-proxy, /usr/bin/rsync --server * /opt/mercury-proxy/, /bin/chown -R mercury\:mercury /opt/mercury-proxy
SUDOEOF
chmod 440 /etc/sudoers.d/mercury-deploy

systemctl daemon-reload
systemctl enable caddy
systemctl restart caddy

# mercury-proxy is enabled but will crash-loop until code and secrets land.
# That is expected on a fresh box; deploy.sh finishes the job.
systemctl enable mercury-proxy

touch /var/lib/cloud/mercury-proxy-bootstrap-complete
echo "cloud-init complete"
