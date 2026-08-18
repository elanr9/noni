#!/usr/bin/env bash
#
# Push the current server.js / package.json to the running proxy and restart.
# Finds the instance by tag, so there is nothing to keep in sync by hand.
#
#   Usage:  ./update.sh
#
set -euo pipefail

PROJECT_TAG="noni-mercury-proxy"
KEY_NAME="${PROJECT_TAG}-key"
KEY_PATH="${HOME}/.ssh/${KEY_NAME}.pem"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${HERE}/.." && pwd)"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v aws >/dev/null || die "aws cli not found"
[ -f "$KEY_PATH" ] || die "missing ${KEY_PATH}"

EIP="$(aws ec2 describe-instances \
  --filters "Name=tag:Project,Values=${PROJECT_TAG}" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text 2>/dev/null || echo "None")"
[ "$EIP" != "None" ] && [ -n "$EIP" ] || die "no running instance tagged Project=${PROJECT_TAG}"

echo "==> Updating ${EIP}"

SSH_OPTS=(-i "$KEY_PATH" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

# Sanity-check locally before shipping. A syntax error here would otherwise
# take the payment path down until someone noticed.
if command -v node >/dev/null; then
  node --check "${APP_DIR}/server.js" || die "server.js failed local syntax check — not deploying"
  echo "  local syntax check passed"
fi

scp "${SSH_OPTS[@]}" "${APP_DIR}/server.js" "${APP_DIR}/package.json" \
  "ubuntu@${EIP}:/home/ubuntu/mercury-proxy-staging/" >/dev/null
echo "  files copied"

ssh "${SSH_OPTS[@]}" "ubuntu@${EIP}" 'bash -s' <<'REMOTE'
set -euo pipefail
sudo cp /home/ubuntu/mercury-proxy-staging/server.js /home/ubuntu/mercury-proxy-staging/package.json /opt/mercury-proxy/
cd /opt/mercury-proxy
sudo npm install --omit=dev --no-audit --no-fund
sudo chown -R mercury:mercury /opt/mercury-proxy
sudo systemctl restart mercury-proxy
sleep 2
systemctl is-active --quiet mercury-proxy && echo "  service active" || {
  echo "  SERVICE FAILED TO START:" >&2
  sudo journalctl -u mercury-proxy -n 30 --no-pager >&2
  exit 1
}
REMOTE

echo "==> Verifying"
sleep 1
curl -fsS --max-time 10 "http://127.0.0.1" >/dev/null 2>&1 || true
echo "  run: curl -s https://<your-proxy-domain>/healthz | jq"
echo "Done."
