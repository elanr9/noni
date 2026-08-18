# mercury-proxy

Static-IP egress proxy for the Mercury API.

Mercury requires an **IP whitelist** on any Read-and-Write token. Supabase Edge
Functions run on Deno Deploy and have **no static outbound IP**, so they cannot
hold that token. This service runs on a t4g.nano behind an Elastic IP, holds the
Mercury token, and is the only thing Mercury ever sees.

```
Supabase Edge Function ──x-proxy-secret──▶ EC2 proxy (Elastic IP) ──Bearer token──▶ Mercury API
```

The edge functions keep all the business logic. This is a dumb forwarder with an
auth check — deliberately, so the thing holding the money-moving credential is
small enough to read in one sitting.

## Why a domain is required

`deploy.sh` will not run without one. Let's Encrypt does not issue certificates
for bare IP addresses, and a self-signed certificate would be rejected by Deno's
`fetch` inside Supabase Edge Functions, which offers no supported way to add a
custom CA. So:

- **The Elastic IP** is what you whitelist in Mercury.
- **The domain** is how the edge functions reach the proxy.

Use a subdomain of a zone you control, e.g. `mercury-proxy.usenoni.app`. A
`.internal` or other non-public name will not work — ACME must be able to
validate it from the public internet.

## Endpoints

Every route except `/healthz` requires `x-proxy-secret` matching
`PROXY_SHARED_SECRET`, compared in constant time.

| Method | Path | Forwards to |
|---|---|---|
| `GET` | `/healthz` | — (returns `{ ok, ip, uptimeSeconds }`) |
| `POST` | `/invite` | `POST /recipients/invites` |
| `POST` | `/send-money` | `POST /account/{accountId}/transactions` |
| `GET` | `/invite-status/:id` | `GET /recipients/invites/{inviteId}` |
| `GET` | `/invites?status=` | `GET /recipients/invites` |
| `GET` | `/recipient/:id` | `GET /recipient/{recipientId}` |

Mercury's HTTP status is passed through verbatim. Callers depend on this:
`mercury-token-liveness` expects a `404`, and the payout path must tell a `4xx`
(do not retry) from a `5xx` (retry next run).

## Prerequisites

- `aws` CLI v2, authenticated with a default region (`aws configure`)
- `jq`
- A DNS zone you control

## Deploy

### Step 1 — provision

```bash
cd mercury-proxy/deploy
./deploy.sh mercury-proxy.usenoni.app ops@usenoni.app
```

Optionally set `ROUTE53_ZONE_ID=Z123...` to have the A record created for you;
otherwise the script pauses and asks you to create it.

This creates: a key pair (`~/.ssh/noni-mercury-proxy-key.pem`), a security group
(SSH from your current IP only; 80 and 443 open — 80 is required for the ACME
HTTP-01 challenge), a `t4g.nano` on the latest Ubuntu 24.04 arm64 AMI with an
encrypted 16 GB gp3 root volume and IMDSv2 enforced, an Elastic IP, and the
application under systemd behind Caddy.

Everything is tagged `Project=noni-mercury-proxy`. **The script is idempotent**
— if a tagged instance already exists it prints status and exits, because a
second instance would mean a second outbound IP that Mercury has not whitelisted.

### Step 2 — install the secrets

The service is intentionally crash-looping until this is done; with no token
there is no service.

```bash
ssh -i ~/.ssh/noni-mercury-proxy-key.pem ubuntu@<EIP>
sudo nano /etc/mercury-proxy.env
```

```ini
MERCURY_API_TOKEN=secret-token:mercury_production_...
PROXY_SHARED_SECRET=<openssl rand -hex 32>
MERCURY_ACCOUNT_ID=<uuid of the Mercury account you pay from>
```

```bash
sudo systemctl restart mercury-proxy
systemctl status mercury-proxy
```

The file is root-owned `0600`. `server.js` refuses to start if
`PROXY_SHARED_SECRET` is under 32 characters.

### Step 3 — verify the outbound IP

```bash
curl -s https://mercury-proxy.usenoni.app/healthz | jq
# { "ok": true, "ip": "52.x.x.x", "uptimeSeconds": 12 }
```

**`ip` must equal the Elastic IP.** That is the whole point of the box — if it
does not match, Mercury will reject the write calls and you need to fix routing
before going further.

If DNS has not propagated yet:

```bash
curl -s --resolve mercury-proxy.usenoni.app:443:<EIP> https://mercury-proxy.usenoni.app/healthz | jq
```

Do **not** `curl https://<EIP>/healthz` — the certificate is issued for the
hostname, so that fails TLS verification by design.

### Step 4 — whitelist in Mercury

Mercury dashboard → Settings → API Tokens → your Read-and-Write token → add the
Elastic IP.

The EIP is allocated to your AWS account and survives instance termination, so
this is a one-time step. Replacing the instance and re-associating the same EIP
needs no change in Mercury.

### Step 5 — point Supabase at it

Set these as Supabase edge function secrets (Dashboard → Edge Functions →
Secrets), **not** in any `EXPO_PUBLIC_*` variable — those are inlined into the
app bundle at build time:

```
MERCURY_PROXY_URL=https://mercury-proxy.usenoni.app
MERCURY_PROXY_SECRET=<the same PROXY_SHARED_SECRET>
```

## Update flow

```bash
cd mercury-proxy/deploy
./update.sh
```

Finds the instance by tag, runs `node --check` locally first, copies
`server.js` + `package.json`, reinstalls production deps, restarts, and dumps
`journalctl` if the service fails to come back.

## Logs

```bash
sudo journalctl -u mercury-proxy -f          # application
sudo tail -f /var/log/caddy/mercury-proxy.log # TLS / access
sudo cat /var/log/mercury-proxy-bootstrap.log # cloud-init, first boot only
```

Logs record method, path, HTTP status, duration, and the identifiers needed to
trace a payment — `inviteId`, `recipientId`, `transactionId`, `idempotencyKey`,
`mercuryStatus`. Request bodies, headers and the Mercury token are never
written, and Fastify redaction is configured as a second line of defence.

## Security notes

- **The Mercury write token exists only in `/etc/mercury-proxy.env`.** Not in
  the repo, not in Supabase, not in the app bundle.
- **443 is open to the world** because Supabase's egress IPs are unknowable.
  `x-proxy-secret` is the only control on the payment path — treat it as
  equivalent to the Mercury token and rotate both together.
- `/send-money` is rate limited (`SEND_LIMIT_PER_MIN`, default 120) as a
  backstop against a runaway payout loop.
- Path parameters are validated against strict patterns (uuid for recipient ids,
  `[A-Za-z0-9_-]` for invite ids) and rejected rather than escaped, so a crafted
  id cannot walk the URL path.
- Node binds to `127.0.0.1` only; Caddy is the sole public listener.
- systemd runs the service as an unprivileged `mercury` user with
  `ProtectSystem=strict` and `RestrictAddressFamilies=AF_INET AF_INET6`.

## Local testing

```bash
cp .env.example .env    # fill in a SANDBOX token
npm install
npm start
curl -s localhost:8080/healthz | jq
curl -s -X POST localhost:8080/invite -H 'x-proxy-secret: ...' \
     -H 'content-type: application/json' -d '{...}' | jq
```

To point at Mercury's sandbox, set `MERCURY_BASE_URL` — no code change:

```bash
MERCURY_BASE_URL=https://api-sandbox.mercury.com/api/v1 npm start
```

Sandbox tokens only work against the sandbox host and vice versa, and **sandbox
does not support webhooks** — see `TESTING_MERCURY.md` (Phase 8).

## Teardown

```bash
PROJECT_TAG=noni-mercury-proxy

INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Project,Values=$PROJECT_TAG" "Name=instance-state-name,Values=running,stopped" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
ALLOC_ID=$(aws ec2 describe-addresses --filters "Name=tag:Project,Values=$PROJECT_TAG" \
  --query 'Addresses[0].AllocationId' --output text)
ASSOC_ID=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" \
  --query 'Addresses[0].AssociationId' --output text)

# Order matters: disassociate and release before terminating, or the EIP leaks.
[ "$ASSOC_ID" != "None" ] && aws ec2 disassociate-address --association-id "$ASSOC_ID"
aws ec2 release-address --allocation-id "$ALLOC_ID"
aws ec2 terminate-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
aws ec2 delete-security-group --group-name "${PROJECT_TAG}-sg"
aws ec2 delete-key-pair --key-name "${PROJECT_TAG}-key"
rm -f ~/.ssh/${PROJECT_TAG}-key.pem
```

⚠️ **Releasing the Elastic IP is irreversible** — you will not get that address
back, and you will have to re-whitelist the new one in Mercury. If you only
intend to replace the instance, skip `release-address` and re-associate the same
allocation to the new box.

## Cost

t4g.nano (~$3/mo) + 16 GB gp3 (~$1.30/mo) + Elastic IP attached to a running
instance (~$3.60/mo) ≈ **$8/mo**. An unattached Elastic IP is billed at the same
hourly rate, so releasing it during a long teardown is the only way to stop that
charge.
