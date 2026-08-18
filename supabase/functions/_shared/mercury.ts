// Shared Mercury helpers for the payout edge functions.
//
// Nothing here talks to Mercury directly. Mercury requires an IP whitelist on
// any Read-and-Write token and edge functions have no static egress IP, so every
// call goes through the EC2 proxy (see /mercury-proxy). The Mercury token lives
// only on that box; this module knows the proxy URL and the shared secret.

import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// The proxy's upstream timeout is 20s, so it answers by then even when Mercury
// hangs. Waiting a little longer here means we surface the proxy's 502 rather
// than aborting blind and losing the reason.
const PROXY_TIMEOUT_MS = 30_000;

/**
 * Namespace for the payout idempotency key.
 *
 * FROZEN once the first production run has happened. Changing this string
 * changes every key, which means the next Sunday run would look like a brand
 * new set of payments to Mercury and pay everyone a second time. The only
 * legitimate reason to bump it is a deliberate, supervised re-issue of a period
 * that Mercury rejected outright.
 */
const IDEMPOTENCY_SCHEME = 'noni:mercury:payout:v1';

// ---------------------------------------------------------------------------
// Errors

/**
 * Carries the HTTP status through so callers can act on it. This matters:
 * mercury-token-liveness treats 404 as success, and the payout path must tell a
 * 4xx (our request is wrong, do not retry) from a 5xx or 502 (upstream trouble,
 * retry next run) — retrying a 4xx forever would wedge a payout run.
 */
export class MercuryProxyError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Mercury proxy ${status}`);
    this.name = 'MercuryProxyError';
    this.status = status;
    this.body = body;
  }

  /** True when Mercury rejected the request itself — never worth retrying. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** True when the proxy or Mercury was unreachable or broken — retryable. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** Convenience for the liveness probe, which expects a 404 and treats it as OK. */
export function isNotFound(err: unknown): boolean {
  return err instanceof MercuryProxyError && err.status === 404;
}

// ---------------------------------------------------------------------------
// Proxy transport

function proxyConfig(): { url: string; secret: string } {
  const url = Deno.env.get('MERCURY_PROXY_URL');
  const secret = Deno.env.get('MERCURY_PROXY_SECRET');
  if (!url) throw new Error('MERCURY_PROXY_URL not set');
  if (!secret) throw new Error('MERCURY_PROXY_SECRET not set');
  // A bare IP cannot present a valid certificate, and Deno's fetch offers no
  // supported way to trust a custom CA inside edge functions. Fail loudly here
  // rather than at 8pm on a Sunday.
  //
  // Plain http is permitted only against loopback, so the module can be
  // exercised against a local mock. Deployed edge functions never resolve
  // localhost, so this cannot weaken production.
  const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);
  if (!url.startsWith('https://') && !isLoopback) {
    throw new Error('MERCURY_PROXY_URL must be an https:// hostname');
  }
  return { url: url.replace(/\/+$/, ''), secret };
}

/** The Mercury account payouts are sent from. */
export function mercuryAccountId(): string {
  const id = Deno.env.get('MERCURY_ACCOUNT_ID');
  if (!id) throw new Error('MERCURY_ACCOUNT_ID not set');
  return id;
}

/**
 * Call the Mercury proxy. Throws MercuryProxyError on any non-2xx, including
 * transport failures (status 0).
 *
 * `path` is proxy-relative and must start with a slash, e.g. '/invite'.
 */
export async function callProxy<T = unknown>(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<T> {
  const { url, secret } = proxyConfig();
  if (!path.startsWith('/')) throw new Error(`proxy path must start with "/": ${path}`);

  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: {
        'x-proxy-secret': secret,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch (cause) {
    // DNS failure, TLS failure, timeout, proxy down. Status 0 marks it
    // retryable — the request may or may not have reached Mercury, which is
    // exactly why the caller must have written its intent row first.
    const reason = cause instanceof Error ? cause.message : 'network error';
    throw new MercuryProxyError(0, null, `Mercury proxy unreachable (${method} ${path}): ${reason}`);
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!res.ok) {
    const detail =
      (parsed as { error?: string } | null)?.error ?? text.slice(0, 200) ?? 'no body';
    throw new MercuryProxyError(
      res.status,
      parsed,
      `Mercury proxy ${res.status} on ${method} ${path}: ${detail}`,
    );
  }

  return parsed as T;
}

// ---------------------------------------------------------------------------
// Creator email

/**
 * Mercury's invite requires contactEmail, and profiles has no email column —
 * it lives in auth.users, which PostgREST does not expose. This needs the
 * service-role client.
 *
 * Google sign-in sometimes lands the address in user_metadata rather than the
 * top-level column, so both are checked. That mirrors the SQL already used in
 * claim_pending_invite (061) and manager_invite_onboarded (062):
 *   coalesce(u.email, u.raw_user_meta_data ->> 'email')
 */
export async function getCreatorEmail(
  admin: SupabaseClient,
  creatorId: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.getUserById(creatorId);
  if (error) {
    throw new Error(`Could not load auth user ${creatorId}: ${error.message}`);
  }
  const user = data?.user;
  if (!user) throw new Error(`No auth user for creator ${creatorId}`);

  const metadata = (user.user_metadata ?? {}) as { email?: unknown };
  const raw =
    (typeof user.email === 'string' && user.email) ||
    (typeof metadata.email === 'string' && metadata.email) ||
    '';

  const email = raw.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error(`Creator ${creatorId} has no usable email address`);
  }
  return email;
}

// ---------------------------------------------------------------------------
// Money and idempotency

/**
 * Deterministic payout idempotency key.
 *
 * Deterministic is the whole point: if the Sunday run crashes after Mercury
 * accepted a transfer but before we recorded it, the retry regenerates the
 * identical key and collides on mercury_payouts.idempotency_key (23505) instead
 * of paying twice. A uuid4 here would double-pay on every retry.
 *
 * Mercury takes this in the JSON body, not a header.
 */
export async function computeIdempotencyKey(
  creatorId: string,
  companyId: string,
  periodEnd: string,
): Promise<string> {
  if (!creatorId || !companyId || !periodEnd) {
    throw new Error('computeIdempotencyKey requires creatorId, companyId and periodEnd');
  }
  // Colon-delimited so the parts can never run together ambiguously, and
  // namespaced so the scheme is versionable. See IDEMPOTENCY_SCHEME.
  const input = `${IDEMPOTENCY_SCHEME}:${creatorId}:${companyId}:${periodEnd}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Integer cents -> the JSON double Mercury expects.
 *
 * Call this only at the serialization boundary. Every balance, ledger entry and
 * comparison stays in integer cents; the moment money becomes a float it starts
 * accumulating rounding error. toFixed(2) pins the value to two decimals so the
 * serialized form is exactly the amount intended.
 */
export function centsToDollars(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new Error(`centsToDollars expects an integer, got ${cents}`);
  }
  // Mercury's PositiveDollar has a documented minimum of 0.01.
  if (cents < 1) {
    throw new Error(`centsToDollars expects at least 1 cent, got ${cents}`);
  }
  return Number((cents / 100).toFixed(2));
}

// ---------------------------------------------------------------------------
// Mercury response shapes
//
// Modelled on the published OpenAPI schemas. Note the id types: recipient ids
// are `format: uuid`, invite ids are plain strings (RecipientInviteId / Slug),
// which is why creator_wallets.mercury_invite_id is text.

export type MercuryPaymentMethod =
  | 'ach'
  | 'check'
  | 'domesticWire'
  | 'internationalWire'
  | 'realTimePayment';

export type MercuryInviteStatus = 'created' | 'completed' | 'expired';

export type MercuryInvite = {
  id: string;
  onboardingUrl: string;
  status: MercuryInviteStatus;
  name: string;
  contactEmail: string;
  paymentMethods: MercuryPaymentMethod[];
  requireTaxDocument: boolean;
  createdAt: string;
  expiresAt: string | null;
  recipientId: string | null;
  notes: string | null;
};

export type MercuryInviteList = {
  invites: MercuryInvite[];
  page: { nextPage?: string; previousPage?: string };
};

export type MercuryTaxFormType = 'w9' | 'w8BEN' | 'w8BENE' | 'unknown';

export type MercuryRecipientAttachment = {
  fileName: string;
  /** Null when Mercury has not classified the upload. */
  formType: MercuryTaxFormType | null;
  uploadedAt: string;
  /** Presigned, valid 12 hours — never persist this. */
  url: string;
};

export type MercuryRecipient = {
  id: string;
  name: string;
  status: 'active' | 'deleted';
  emails: string[];
  defaultPaymentMethod: MercuryPaymentMethod;
  attachments: MercuryRecipientAttachment[];
  inviteId: string | null;
};

/**
 * Mercury's TransactionStatus. Distinct from our mercury_payouts.status —
 * mercury-webhook maps between them:
 *   pending             -> sending   (in flight, no local change)
 *   sent                -> sent
 *   failed              -> failed
 *   reversed            -> reversed
 *   cancelled | blocked -> failed    (Mercury status recorded in failure_reason)
 */
export type MercuryTransactionStatus =
  | 'pending'
  | 'sent'
  | 'cancelled'
  | 'failed'
  | 'reversed'
  | 'blocked';

export type MercuryTransaction = {
  id: string;
  status: MercuryTransactionStatus;
  /** Negative for outgoing payments. */
  amount: number;
  counterpartyId: string;
  kind: string;
  createdAt: string;
  estimatedDeliveryDate: string | null;
  postedAt: string | null;
  failedAt: string | null;
  reasonForFailure: string | null;
  dashboardLink: string;
};
