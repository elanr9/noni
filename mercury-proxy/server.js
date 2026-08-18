/**
 * Mercury egress proxy.
 *
 * Mercury requires an IP whitelist for any Read-and-Write token, and Supabase
 * Edge Functions run on Deno Deploy with no static egress IP. This process sits
 * on an EC2 instance behind an Elastic IP and is the only place the Mercury
 * write token exists. Edge functions authenticate to it with a shared secret
 * and it re-signs the call with the Mercury bearer token.
 *
 * Security posture, stated plainly: anyone who can reach this service with a
 * valid x-proxy-secret can move money. Port 443 has to be open to the world
 * because Supabase's egress IPs are not knowable, so the shared secret is the
 * only thing standing in front of the payment path. It is compared in constant
 * time, the send path is rate limited, and nothing that could reconstruct a
 * request body or token is ever logged.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { Agent, request } from 'undici';
import 'dotenv/config';

// Force IPv4 for the health check. Mercury whitelists the Elastic IP, which is
// IPv4; if the lookup came back with an IPv6 address the operator would be
// comparing it against the EIP and seeing a mismatch that means nothing.
const ipv4Agent = new Agent({ connect: { family: 4 } });

// Defaults to production. Override for the sandbox
// (https://api-sandbox.mercury.com/api/v1) or a local mock. Sandbox tokens only
// work against the sandbox host, and vice versa.
const MERCURY_BASE = process.env.MERCURY_BASE_URL ?? 'https://api.mercury.com/api/v1';
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '127.0.0.1';

// Mercury's own docs give no rate limits, and a runaway payout loop is the
// failure mode that actually costs money. Cap the send path locally.
const SEND_LIMIT_PER_MIN = Number(process.env.SEND_LIMIT_PER_MIN ?? 120);

// Upstream timeout. The Sunday payout run is sequential, so a hung Mercury
// call must not stall every creator behind it.
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 20_000);

const MERCURY_API_TOKEN = process.env.MERCURY_API_TOKEN;
const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET;
const DEFAULT_ACCOUNT_ID = process.env.MERCURY_ACCOUNT_ID ?? null;

if (!MERCURY_API_TOKEN) {
  console.error('FATAL: MERCURY_API_TOKEN is not set. Refusing to start.');
  process.exit(1);
}
if (!PROXY_SHARED_SECRET || PROXY_SHARED_SECRET.length < 32) {
  console.error(
    'FATAL: PROXY_SHARED_SECRET is unset or shorter than 32 chars. Refusing to start.',
  );
  process.exit(1);
}

const app = Fastify({
  // Payloads here are tiny (an invite or a single transfer). A low cap removes
  // a whole class of abuse.
  bodyLimit: 64 * 1024,
  trustProxy: true,
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    // Never let a header or body reach the log. Redaction is defence in depth:
    // the handlers below already log only explicit allow-listed fields.
    redact: {
      paths: [
        'req.headers',
        'res.headers',
        'req.body',
        'body',
        'headers',
        '*.token',
        '*.secret',
      ],
      remove: true,
    },
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  },
});

/** Constant-time shared-secret check. Length mismatch short-circuits safely. */
function secretMatches(presented) {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers. It
  // throws on length mismatch, which would otherwise turn a wrong-length
  // secret into a 500 instead of a 401.
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(PROXY_SHARED_SECRET).digest();
  return timingSafeEqual(a, b);
}

/**
 * Mercury ids land in URL paths. Anything that is not a plain id is rejected
 * outright rather than escaped, so a crafted id can never walk the path or
 * append a query string.
 *
 * Recipient ids are uuids (TransactionPartyId is `format: uuid`). Invite ids
 * are NOT: RecipientInviteId is a bare string, so this allows the wider slug
 * shape for those.
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[A-Za-z0-9_-]{1,128}$/;

function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    const err = new Error(`${field} must be a uuid`);
    err.statusCode = 400;
    throw err;
  }
  return value;
}

function requireSlug(value, field) {
  if (typeof value !== 'string' || !SLUG_RE.test(value)) {
    const err = new Error(`${field} must match [A-Za-z0-9_-]{1,128}`);
    err.statusCode = 400;
    throw err;
  }
  return value;
}

/** Fixed-window counter. In-memory is fine: one instance, one Elastic IP. */
const sendWindow = { startedAt: Date.now(), count: 0 };
function sendRateLimitExceeded() {
  const now = Date.now();
  if (now - sendWindow.startedAt >= 60_000) {
    sendWindow.startedAt = now;
    sendWindow.count = 0;
  }
  sendWindow.count += 1;
  return sendWindow.count > SEND_LIMIT_PER_MIN;
}

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/healthz') return;
  if (!secretMatches(req.headers['x-proxy-secret'])) {
    req.log.warn({ path: req.routeOptions?.url ?? req.url }, 'rejected: bad proxy secret');
    return reply.code(401).send({ error: 'unauthorized' });
  }
});

/**
 * Single upstream call. Returns Mercury's status verbatim so callers can act on
 * it — mercury-token-liveness relies on seeing a 404, and the payout path must
 * distinguish a 4xx (do not retry) from a 5xx (retry next run).
 */
async function callMercury(req, { method, path, body, query }) {
  const url = new URL(`${MERCURY_BASE}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const started = Date.now();
  let res;
  try {
    res = await request(url, {
      method,
      headers: {
        authorization: `Bearer ${MERCURY_API_TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      headersTimeout: UPSTREAM_TIMEOUT_MS,
      bodyTimeout: UPSTREAM_TIMEOUT_MS,
    });
  } catch (cause) {
    req.log.error(
      { method, path, ms: Date.now() - started, reason: cause?.code ?? 'network_error' },
      'mercury upstream unreachable',
    );
    const err = new Error('mercury upstream unreachable');
    err.statusCode = 502;
    throw err;
  }

  const text = await res.body.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  // Allow-listed identifiers only. Never the body, never the token.
  //
  // `mercuryId` is deliberately neutral: this helper serves invites, recipients
  // and transactions alike, and labelling every `id` as both inviteId and
  // transactionId made a transaction look like an invite in the logs. The
  // route handlers below add the correctly-named field where they know it.
  req.log.info(
    {
      method,
      path,
      status: res.statusCode,
      ms: Date.now() - started,
      mercuryId: parsed?.id ?? undefined,
      recipientId: parsed?.recipientId ?? parsed?.counterpartyId ?? undefined,
      mercuryStatus: parsed?.status ?? undefined,
    },
    'mercury call',
  );

  return { status: res.statusCode, payload: parsed ?? (text ? { raw: text } : {}) };
}

// ---------------------------------------------------------------------------
// Health

let ipCache = { value: null, at: 0 };

app.get('/healthz', async () => {
  // Cached so an unauthenticated endpoint cannot be used to hammer a third
  // party, and so a slow lookup cannot fail the health check.
  const fresh = Date.now() - ipCache.at < 60_000;
  if (!fresh) {
    try {
      const res = await request('https://ifconfig.me/ip', {
        method: 'GET',
        dispatcher: ipv4Agent,
        headersTimeout: 3000,
        bodyTimeout: 3000,
      });
      ipCache = { value: (await res.body.text()).trim(), at: Date.now() };
    } catch {
      ipCache = { value: null, at: Date.now() };
    }
  }
  return { ok: true, ip: ipCache.value, uptimeSeconds: Math.round(process.uptime()) };
});

// ---------------------------------------------------------------------------
// Mercury routes

/** POST /invite -> Mercury POST /recipients/invites */
app.post('/invite', async (req, reply) => {
  const b = req.body ?? {};
  if (!b.contactEmail || !Array.isArray(b.paymentMethods) || b.paymentMethods.length === 0) {
    return reply.code(400).send({ error: 'contactEmail and paymentMethods are required' });
  }

  const { status, payload } = await callMercury(req, {
    method: 'POST',
    path: '/recipients/invites',
    body: {
      contactEmail: b.contactEmail,
      paymentMethods: b.paymentMethods,
      requireTaxDocument: b.requireTaxDocument === true,
      // Mercury requires this field. We always send our own branded email, so
      // it defaults to false rather than inheriting a caller mistake.
      sendEmail: b.sendEmail === true,
      ...(b.name ? { name: b.name } : {}),
      ...(b.recipientId ? { recipientId: requireUuid(b.recipientId, 'recipientId') } : {}),
      ...(b.notes ? { notes: b.notes } : {}),
      ...(b.organizationNameOnRequest
        ? { organizationNameOnRequest: b.organizationNameOnRequest }
        : {}),
    },
  });

  return reply.code(status).send(payload);
});

/** POST /send-money -> Mercury POST /account/{accountId}/transactions */
app.post('/send-money', async (req, reply) => {
  if (sendRateLimitExceeded()) {
    req.log.error({ limit: SEND_LIMIT_PER_MIN }, 'send-money rate limit tripped');
    return reply.code(429).send({ error: 'send rate limit exceeded' });
  }

  const b = req.body ?? {};
  const accountId = requireUuid(b.accountId ?? DEFAULT_ACCOUNT_ID, 'accountId');

  if (typeof b.amount !== 'number' || !Number.isFinite(b.amount) || b.amount < 0.01) {
    return reply.code(400).send({ error: 'amount must be a number >= 0.01' });
  }
  if (typeof b.idempotencyKey !== 'string' || b.idempotencyKey.length < 8) {
    // Mercury's replay behaviour is undocumented, so a missing or trivial key
    // is treated as a hard error rather than something to paper over.
    return reply.code(400).send({ error: 'idempotencyKey is required' });
  }
  const recipientId = requireUuid(b.recipientId, 'recipientId');
  const paymentMethod = b.paymentMethod ?? 'ach';
  if (!['ach', 'check', 'domesticWire'].includes(paymentMethod)) {
    return reply.code(400).send({ error: 'paymentMethod must be ach, check or domesticWire' });
  }

  req.log.info(
    { recipientId, idempotencyKey: b.idempotencyKey, paymentMethod },
    'send-money requested',
  );

  const { status, payload } = await callMercury(req, {
    method: 'POST',
    path: `/account/${accountId}/transactions`,
    body: {
      recipientId,
      amount: b.amount,
      paymentMethod,
      idempotencyKey: b.idempotencyKey,
      ...(b.externalMemo ? { externalMemo: b.externalMemo } : {}),
      ...(b.note ? { note: b.note } : {}),
      ...(b.purpose ? { purpose: b.purpose } : {}),
    },
  });

  req.log.info(
    {
      recipientId,
      idempotencyKey: b.idempotencyKey,
      status,
      transactionId: payload?.id,
      mercuryStatus: payload?.status,
    },
    'send-money result',
  );

  return reply.code(status).send(payload);
});

/** GET /invite-status/:id -> Mercury GET /recipients/invites/{inviteId} */
app.get('/invite-status/:id', async (req, reply) => {
  const inviteId = requireSlug(req.params.id, 'inviteId');
  const { status, payload } = await callMercury(req, {
    method: 'GET',
    path: `/recipients/invites/${encodeURIComponent(inviteId)}`,
  });
  return reply.code(status).send(payload);
});

/** GET /invites?status=&limit=&start_after=&order= -> Mercury GET /recipients/invites */
app.get('/invites', async (req, reply) => {
  const q = req.query ?? {};
  if (q.status && !['created', 'completed', 'expired'].includes(q.status)) {
    return reply.code(400).send({ error: 'status must be created, completed or expired' });
  }
  if (q.start_after) requireSlug(q.start_after, 'start_after');
  if (q.end_before) requireSlug(q.end_before, 'end_before');

  const { status, payload } = await callMercury(req, {
    method: 'GET',
    path: '/recipients/invites',
    query: {
      status: q.status,
      limit: q.limit,
      start_after: q.start_after,
      end_before: q.end_before,
      order: q.order,
    },
  });
  return reply.code(status).send(payload);
});

/** GET /recipient/:id -> Mercury GET /recipient/{recipientId} */
app.get('/recipient/:id', async (req, reply) => {
  const recipientId = requireUuid(req.params.id, 'recipientId');
  const { status, payload } = await callMercury(req, {
    method: 'GET',
    path: `/recipient/${encodeURIComponent(recipientId)}`,
  });
  return reply.code(status).send(payload);
});

// ---------------------------------------------------------------------------

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode ?? 500;
  if (status >= 500) req.log.error({ err: err.message, status }, 'proxy error');
  else req.log.warn({ err: err.message, status }, 'proxy rejected request');
  reply.code(status).send({ error: status >= 500 ? 'proxy error' : err.message });
});

const shutdown = async (signal) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

app
  .listen({ port: PORT, host: HOST })
  .then(() => app.log.info({ port: PORT, host: HOST }, 'mercury-proxy listening'))
  .catch((err) => {
    app.log.error({ err: err.message }, 'failed to start');
    process.exit(1);
  });
