#!/usr/bin/env bash
#
# Provision the Mercury egress proxy from scratch: security group, key pair,
# t4g.nano on Ubuntu 24.04 (arm64), Elastic IP, code, service.
#
# Idempotent. If anything tagged Project=noni-mercury-proxy already exists it
# reports status and exits rather than building a second one — a duplicate
# instance would mean a second outbound IP that Mercury has not whitelisted.
#
#   Usage:  ./deploy.sh <proxy-domain> [acme-email]
#   e.g.    ./deploy.sh mercury-proxy.usenoni.app ops@usenoni.app
#
#   Optional: ROUTE53_ZONE_ID=Z123... to create the DNS A record automatically.
#
set -euo pipefail

PROJECT_TAG="noni-mercury-proxy"
INSTANCE_TYPE="t4g.nano"
KEY_NAME="${PROJECT_TAG}-key"
SG_NAME="${PROJECT_TAG}-sg"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${HERE}/.." && pwd)"
KEY_PATH="${HOME}/.ssh/${KEY_NAME}.pem"

PROXY_DOMAIN="${1:-}"
ACME_EMAIL="${2:-admin@${PROXY_DOMAIN:-example.com}}"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "  $*"; }
step() { echo; echo "==> $*"; }

# --- Preflight --------------------------------------------------------------

[ -n "$PROXY_DOMAIN" ] || die "usage: ./deploy.sh <proxy-domain> [acme-email]

A real DNS hostname is required. Let's Encrypt will not issue a certificate for
a bare IP, and a self-signed cert cannot be trusted by Deno's fetch inside
Supabase Edge Functions. The Elastic IP is what Mercury whitelists; the domain
is how the edge functions reach it.

  e.g.  ./deploy.sh mercury-proxy.usenoni.app ops@usenoni.app"

command -v aws >/dev/null || die "aws cli not found"
command -v jq  >/dev/null || die "jq not found"
command -v ssh >/dev/null || die "ssh not found"

aws sts get-caller-identity >/dev/null 2>&1 || die "aws cli is not authenticated (aws configure)"

REGION="$(aws configure get region || true)"
[ -n "$REGION" ] || die "no default AWS region configured (aws configure set region us-east-1)"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
step "AWS account ${ACCOUNT_ID}, region ${REGION}"

# --- Idempotency guard ------------------------------------------------------

step "Checking for existing ${PROJECT_TAG} resources"
EXISTING="$(aws ec2 describe-instances \
  --filters "Name=tag:Project,Values=${PROJECT_TAG}" \
            "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress]' \
  --output text 2>/dev/null || true)"

if [ -n "$EXISTING" ]; then
  echo
  echo "Already provisioned — refusing to create a duplicate."
  echo "A second instance would have a different outbound IP that Mercury has not whitelisted."
  echo
  printf '  %-22s %-12s %s\n' "INSTANCE" "STATE" "PUBLIC IP"
  echo "$EXISTING" | while read -r id state ip; do
    printf '  %-22s %-12s %s\n' "$id" "$state" "${ip:-none}"
  done
  echo
  echo "To update the running service:   ./update.sh"
  echo "To tear it down:                 see 'Teardown' in ../README.md"
  exit 0
fi

# --- Key pair ---------------------------------------------------------------

step "Key pair"
if aws ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
  info "${KEY_NAME} already exists in EC2"
  [ -f "$KEY_PATH" ] || die "EC2 has key pair '${KEY_NAME}' but ${KEY_PATH} is missing locally.
Delete the EC2 key pair and re-run, or restore the .pem:
  aws ec2 delete-key-pair --key-name ${KEY_NAME}"
else
  mkdir -p "${HOME}/.ssh"
  aws ec2 create-key-pair --key-name "$KEY_NAME" \
    --tag-specifications "ResourceType=key-pair,Tags=[{Key=Project,Value=${PROJECT_TAG}}]" \
    --query 'KeyMaterial' --output text > "$KEY_PATH"
  chmod 600 "$KEY_PATH"
  info "created ${KEY_PATH}"
fi

# --- Security group ---------------------------------------------------------

step "Security group"
VPC_ID="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)"
[ "$VPC_ID" != "None" ] || die "no default VPC in ${REGION}"

SG_ID="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${SG_NAME}" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")"

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID="$(aws ec2 create-security-group \
    --group-name "$SG_NAME" \
    --description "Mercury egress proxy" \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Project,Value=${PROJECT_TAG}}]" \
    --query 'GroupId' --output text)"
  info "created ${SG_ID}"
else
  info "reusing ${SG_ID}"
fi

MY_IP="$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')"
[ -n "$MY_IP" ] || die "could not determine your public IP for the SSH rule"
info "SSH will be restricted to ${MY_IP}/32"

authorize() {
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" "$@" >/dev/null 2>&1 \
    || true  # already-exists is fine; this keeps the script idempotent
}
authorize --protocol tcp --port 22  --cidr "${MY_IP}/32"
# 443 must be open to the world: Supabase Edge Functions run on Deno Deploy and
# have no static egress IP to whitelist. The x-proxy-secret is the control.
authorize --protocol tcp --port 443 --cidr 0.0.0.0/0
# 80 is required for the Let's Encrypt HTTP-01 challenge and the HTTPS redirect.
authorize --protocol tcp --port 80  --cidr 0.0.0.0/0
info "ingress: 22/${MY_IP}, 80/0.0.0.0/0 (ACME), 443/0.0.0.0/0"

# --- AMI --------------------------------------------------------------------

step "Ubuntu 24.04 arm64 AMI"
AMI_ID="$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*" \
            "Name=state,Values=available" \
            "Name=architecture,Values=arm64" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' --output text)"
[ "$AMI_ID" != "None" ] && [ -n "$AMI_ID" ] || die "no Ubuntu 24.04 arm64 AMI found in ${REGION}"
info "${AMI_ID}"

# --- Build user-data --------------------------------------------------------

step "Building cloud-init user-data"
USERDATA="$(mktemp)"; trap 'rm -f "$USERDATA"' EXIT
# Inline the unit file and Caddyfile at their placeholders, then substitute
# domain and email. sed -e '/PAT/r file' -e '/PAT/d' works on BSD and GNU sed.
sed -e "/__SYSTEMD_UNIT__/r ${HERE}/mercury-proxy.service" -e "/__SYSTEMD_UNIT__/d" \
    -e "/__CADDYFILE__/r ${HERE}/Caddyfile"               -e "/__CADDYFILE__/d" \
    "${HERE}/cloud-init.sh" \
  | sed -e "s|__PROXY_DOMAIN__|${PROXY_DOMAIN}|g" \
        -e "s|__ACME_EMAIL__|${ACME_EMAIL}|g" \
  > "$USERDATA"

UD_BYTES="$(wc -c < "$USERDATA" | tr -d ' ')"
[ "$UD_BYTES" -lt 16384 ] || die "user-data is ${UD_BYTES} bytes, over the 16KB EC2 limit"
info "${UD_BYTES} bytes"

# --- Launch -----------------------------------------------------------------

step "Launching ${INSTANCE_TYPE}"
INSTANCE_ID="$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --user-data "file://${USERDATA}" \
  --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=16,VolumeType=gp3,Encrypted=true}' \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Project,Value=${PROJECT_TAG}},{Key=Name,Value=${PROJECT_TAG}}]" \
    "ResourceType=volume,Tags=[{Key=Project,Value=${PROJECT_TAG}}]" \
  --query 'Instances[0].InstanceId' --output text)"
info "$INSTANCE_ID"

info "waiting for running state..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

# --- Elastic IP -------------------------------------------------------------

step "Elastic IP"
EIP_ALLOC="$(aws ec2 describe-addresses --filters "Name=tag:Project,Values=${PROJECT_TAG}" \
  --query 'Addresses[0].AllocationId' --output text 2>/dev/null || echo "None")"

if [ "$EIP_ALLOC" = "None" ] || [ -z "$EIP_ALLOC" ]; then
  EIP_ALLOC="$(aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Project,Value=${PROJECT_TAG}}]" \
    --query 'AllocationId' --output text)"
  info "allocated ${EIP_ALLOC}"
else
  info "reusing ${EIP_ALLOC}"
fi

aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$EIP_ALLOC" >/dev/null
EIP="$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" \
  --query 'Addresses[0].PublicIp' --output text)"
info "${EIP} -> ${INSTANCE_ID}"

# --- DNS --------------------------------------------------------------------

step "DNS"
if [ -n "${ROUTE53_ZONE_ID:-}" ]; then
  aws route53 change-resource-record-sets --hosted-zone-id "$ROUTE53_ZONE_ID" \
    --change-batch "$(jq -n --arg n "$PROXY_DOMAIN" --arg ip "$EIP" '{
      Changes: [{
        Action: "UPSERT",
        ResourceRecordSet: { Name: $n, Type: "A", TTL: 300, ResourceRecords: [{Value: $ip}] }
      }]
    }')" >/dev/null
  info "UPSERT ${PROXY_DOMAIN} A ${EIP} in ${ROUTE53_ZONE_ID}"
else
  echo
  echo "  ACTION REQUIRED — create this DNS record now, before the next step:"
  echo
  echo "      ${PROXY_DOMAIN}   A   ${EIP}"
  echo
  echo "  Caddy cannot obtain a TLS certificate until it resolves."
  read -r -p "  Press Enter once the record exists (or Ctrl-C to finish later)... " _
fi

# --- Wait for SSH and cloud-init -------------------------------------------

step "Waiting for SSH"
SSH_OPTS=(-i "$KEY_PATH" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o UserKnownHostsFile="${HOME}/.ssh/known_hosts")
for i in $(seq 1 40); do
  if ssh "${SSH_OPTS[@]}" "ubuntu@${EIP}" true 2>/dev/null; then break; fi
  [ "$i" -eq 40 ] && die "SSH never came up at ${EIP}"
  sleep 10
done
info "connected"

step "Waiting for cloud-init to finish (installs Node + Caddy, ~2-4 min)"
ssh "${SSH_OPTS[@]}" "ubuntu@${EIP}" \
  'for i in $(seq 1 60); do
     [ -f /var/lib/cloud/mercury-proxy-bootstrap-complete ] && { echo "bootstrap complete"; exit 0; }
     sleep 10
   done
   echo "TIMED OUT — check /var/log/mercury-proxy-bootstrap.log" >&2; exit 1'

# --- Ship the application ---------------------------------------------------

step "Deploying application"
scp "${SSH_OPTS[@]}" "${APP_DIR}/server.js" "${APP_DIR}/package.json" \
  "ubuntu@${EIP}:/home/ubuntu/mercury-proxy-staging/" >/dev/null

ssh "${SSH_OPTS[@]}" "ubuntu@${EIP}" 'bash -s' <<'REMOTE'
set -euo pipefail
sudo cp /home/ubuntu/mercury-proxy-staging/server.js /home/ubuntu/mercury-proxy-staging/package.json /opt/mercury-proxy/
cd /opt/mercury-proxy
sudo npm install --omit=dev --no-audit --no-fund
sudo chown -R mercury:mercury /opt/mercury-proxy
sudo systemctl restart mercury-proxy || true
REMOTE
info "code installed"

# --- Summary ----------------------------------------------------------------

cat <<SUMMARY

═══════════════════════════════════════════════════════════════════
  Provisioned.
═══════════════════════════════════════════════════════════════════

  Elastic IP    ${EIP}      <-- whitelist THIS in Mercury
  Instance      ${INSTANCE_ID} (${INSTANCE_TYPE}, ${REGION})
  Proxy URL     https://${PROXY_DOMAIN}
  SSH           ssh -i ${KEY_PATH} ubuntu@${EIP}

  The service is running but has NO Mercury token yet, so it is
  intentionally crash-looping. Finish setup:

  1. Put the secrets in place
       ssh -i ${KEY_PATH} ubuntu@${EIP}
       sudo nano /etc/mercury-proxy.env
         MERCURY_API_TOKEN=secret-token:...
         PROXY_SHARED_SECRET=\$(openssl rand -hex 32)
         MERCURY_ACCOUNT_ID=<uuid of the Mercury account to pay from>
       sudo systemctl restart mercury-proxy
       systemctl status mercury-proxy

  2. Verify the outbound IP matches the Elastic IP
       curl -s https://${PROXY_DOMAIN}/healthz | jq
       # {"ok":true,"ip":"${EIP}",...}   <-- ip MUST equal ${EIP}

  3. Whitelist ${EIP} in the Mercury dashboard
       Settings -> API Tokens -> your Read-and-Write token -> IP whitelist

  4. Set the Supabase edge function secrets
       MERCURY_PROXY_URL=https://${PROXY_DOMAIN}
       MERCURY_PROXY_SECRET=<the same PROXY_SHARED_SECRET>

SUMMARY
