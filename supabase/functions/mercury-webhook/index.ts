// Mercury webhook receiver. Public endpoint — verify_jwt = false.
//
// Mercury allows 5 seconds for a response and retries up to 10 times over ~a
// day on anything non-2xx, so this acknowledges as soon as the signature checks
// out and does the database work in the background. Delivery is at-least-once,
// so every event is deduplicated on its id before it can touch a balance.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Supabase's edge runtime exposes waitUntil for post-response work.
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const MAX_SIGNATURE_AGE_SECONDS = 300;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** Strict hex decode. Returns null on odd length or a non-hex character. */
function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

type SignatureParts = { timestamp: number; signature: Uint8Array };

/** Parse `t=<unix>,v1=<hex>`. */
function parseSignatureHeader(header: string | null): SignatureParts | null {
  if (!header) return null;
  let t: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1 = value;
  }
  if (!t || !v1) return null;

  const timestamp = Number(t);
  if (!Number.isFinite(timestamp)) return null;

  // Length is validated here, before any comparison. Mercury's own JS sample
  // feeds unequal buffers to timingSafeEqual, which throws — turning a
  // malformed signature into a 500 and an endless retry loop instead of a
  // clean rejection.
  const signature = hexToBytes(v1);
  if (!signature) return null;

  return { timestamp, signature };
}

/**
 * Verify the HMAC over `<timestamp>.<raw body>`.
 *
 * crypto.subtle.verify is constant-time and returns false on a length mismatch
 * rather than throwing, which is exactly the property the sample code lacks.
 * The raw body must be the bytes as received — parsing and re-serializing the
 * JSON changes whitespace and key order and breaks the signature.
 */
async function verifySignature(
  rawBody: string,
  parts: SignatureParts,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return await crypto.subtle.verify(
    'HMAC',
    key,
    parts.signature,
    new TextEncoder().encode(`${parts.timestamp}.${rawBody}`),
  );
}

type MercuryEvent = {
  id: string;
  resourceType: string;
  resourceId: string;
  operationType: 'create' | 'update' | 'delete';
  occurredAt?: string;
  changedPaths?: string[];
  mergePatch?: Record<string, unknown>;
  previousValues?: Record<string, unknown> | null;
};

type PayoutRow = {
  id: string;
  company_id: string;
  creator_id: string;
  amount_cents: number;
  status: string;
};

/** Mercury TransactionStatus -> our mercury_payouts.status. */
function mapStatus(mercuryStatus: string): 'sending' | 'sent' | 'failed' | 'reversed' | null {
  switch (mercuryStatus) {
    case 'pending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'failed':
      return 'failed';
    case 'reversed':
      return 'reversed';
    case 'cancelled':
    case 'blocked':
      // No local equivalent; both mean the money is not going to arrive.
      return 'failed';
    default:
      return null;
  }
}

/**
 * Settlement. The hold written at send time was the only debit against
 * available_cents, so success just clears pending — writing another negative
 * ledger row here would debit the creator twice for one payment.
 */
async function markSent(
  admin: SupabaseClient,
  payout: PayoutRow,
  mercuryStatus: string,
): Promise<Record<string, unknown>> {
  const { data: wallet } = await admin
    .from('creator_wallets')
    .select('id, pending_cents')
    .eq('company_id', payout.company_id)
    .eq('creator_id', payout.creator_id)
    .maybeSingle();
  if (!wallet) throw new Error(`wallet missing for payout ${payout.id}`);

  const { error: balError } = await admin
    .from('creator_wallets')
    .update({ pending_cents: Math.max(0, wallet.pending_cents - payout.amount_cents) })
    .eq('id', wallet.id);
  if (balError) throw balError;

  const { error } = await admin
    .from('mercury_payouts')
    .update({
      status: 'sent',
      settled_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq('id', payout.id);
  if (error) throw error;

  return { payout_id: payout.id, applied: 'sent', mercury_status: mercuryStatus };
}

/** Reverse the hold and hand the money back to available_cents. */
async function markFailed(
  admin: SupabaseClient,
  payout: PayoutRow,
  localStatus: 'failed' | 'reversed',
  mercuryStatus: string,
  reasonFromMercury: string | null,
): Promise<Record<string, unknown>> {
  const { data: wallet } = await admin
    .from('creator_wallets')
    .select('id, available_cents, pending_cents')
    .eq('company_id', payout.company_id)
    .eq('creator_id', payout.creator_id)
    .maybeSingle();
  if (!wallet) throw new Error(`wallet missing for payout ${payout.id}`);

  const { error: ledgerError } = await admin.from('wallet_ledger').insert({
    company_id: payout.company_id,
    creator_id: payout.creator_id,
    kind: 'payout_failed',
    amount_cents: payout.amount_cents,
    mercury_payout_id: payout.id,
    note: localStatus === 'reversed' ? 'reversed' : (reasonFromMercury ?? mercuryStatus),
  });
  if (ledgerError) throw ledgerError;

  const { error: balError } = await admin
    .from('creator_wallets')
    .update({
      available_cents: wallet.available_cents + payout.amount_cents,
      pending_cents: Math.max(0, wallet.pending_cents - payout.amount_cents),
    })
    .eq('id', wallet.id);
  if (balError) throw balError;

  const { error } = await admin
    .from('mercury_payouts')
    .update({
      status: localStatus,
      settled_at: new Date().toISOString(),
      failure_reason: `${mercuryStatus}${reasonFromMercury ? `: ${reasonFromMercury}` : ''}`.slice(0, 500),
    })
    .eq('id', payout.id);
  if (error) throw error;

  return { payout_id: payout.id, applied: localStatus, mercury_status: mercuryStatus };
}

async function processEvent(
  admin: SupabaseClient,
  event: MercuryEvent,
): Promise<Record<string, unknown>> {
  if (event.resourceType !== 'transaction') {
    return { skipped: `resourceType ${event.resourceType}` };
  }

  // The payload is an RFC 7396 merge patch: a field that did not change is
  // absent, which is not the same as null. If status is absent, some other
  // field moved (a note, a category) and there is nothing to settle.
  const patch = event.mergePatch ?? {};
  const mercuryStatus = typeof patch.status === 'string' ? patch.status : null;
  if (!mercuryStatus) return { skipped: 'no status change in mergePatch' };

  const { data: payout } = await admin
    .from('mercury_payouts')
    .select('id, company_id, creator_id, amount_cents, status')
    .eq('mercury_transaction_id', event.resourceId)
    .maybeSingle();
  // Every transaction on the account produces events, including incoming money
  // and payments made from the dashboard. Anything we did not send is not ours.
  if (!payout) return { skipped: `no mercury_payout for transaction ${event.resourceId}` };

  const target = mapStatus(mercuryStatus);
  if (!target) return { skipped: `unmapped Mercury status ${mercuryStatus}` };

  // Terminal states are final. A replayed or out-of-order event must never
  // re-credit a wallet that has already been settled.
  if (payout.status === 'sent' || payout.status === 'failed' || payout.status === 'reversed') {
    if (payout.status === target) return { already: payout.status, payout_id: payout.id };
    // 'sent' then 'reversed' is a legitimate later transition; everything else
    // going backwards is not.
    if (!(payout.status === 'sent' && target === 'reversed')) {
      return { skipped: `refusing ${payout.status} -> ${target}`, payout_id: payout.id };
    }
  }

  const reason = typeof patch.reasonForFailure === 'string' ? patch.reasonForFailure : null;

  if (target === 'sending') {
    // ACH in flight. Nothing to move; the hold already covers it.
    if (payout.status === 'scheduled') {
      await admin.from('mercury_payouts').update({ status: 'sending' }).eq('id', payout.id);
      return { payout_id: payout.id, applied: 'sending' };
    }
    return { payout_id: payout.id, already: 'sending' };
  }

  if (target === 'sent') return await markSent(admin, payout as PayoutRow, mercuryStatus);

  return await markFailed(admin, payout as PayoutRow, target, mercuryStatus, reason);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const secret = Deno.env.get('MERCURY_WEBHOOK_SECRET');
  if (!secret) {
    console.error('mercury-webhook: MERCURY_WEBHOOK_SECRET missing');
    return jsonResponse({ error: 'not configured' }, 500);
  }

  // Raw bytes exactly as received — never JSON.parse then re-stringify.
  const rawBody = await req.text();

  const parts = parseSignatureHeader(req.headers.get('Mercury-Signature'));
  if (!parts) return jsonResponse({ error: 'bad signature header' }, 400);

  const ageSeconds = Math.abs(Date.now() / 1000 - parts.timestamp);
  if (ageSeconds > MAX_SIGNATURE_AGE_SECONDS) {
    return jsonResponse({ error: 'signature timestamp out of tolerance' }, 400);
  }

  if (!(await verifySignature(rawBody, parts, secret))) {
    return jsonResponse({ error: 'bad signature' }, 400);
  }

  let event: MercuryEvent;
  try {
    event = JSON.parse(rawBody) as MercuryEvent;
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }
  if (!event?.id) return jsonResponse({ error: 'event missing id' }, 400);

  const admin = adminClient();

  // Dedup before any work. At-least-once delivery means the same event can
  // arrive repeatedly, and a replayed settlement would move a balance twice.
  const { error: dedupError } = await admin.from('mercury_webhook_events').insert({
    id: event.id,
    resource_type: event.resourceType,
    resource_id: event.resourceId,
    operation_type: event.operationType,
  });
  if (dedupError) {
    if (dedupError.code === '23505') {
      return jsonResponse({ received: true, duplicate: true });
    }
    console.error('mercury-webhook dedup insert', dedupError.message);
    // Fail loudly so Mercury retries rather than dropping the event.
    return jsonResponse({ error: 'could not record event' }, 500);
  }

  // Acknowledge now; settle after. Mercury's 5s budget is not enough to assume
  // several round trips to Postgres will fit.
  const work = (async () => {
    try {
      const result = await processEvent(admin, event);
      await admin
        .from('mercury_webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);
      console.log('mercury-webhook processed', event.id, JSON.stringify(result));
    } catch (e) {
      // processed_at stays null, so the row is visible in
      // mercury_webhook_events_unprocessed_idx for replay.
      console.error(
        'mercury-webhook processing failed',
        event.id,
        e instanceof Error ? e.message : String(e),
      );
    }
  })();

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
  } else {
    await work;
  }

  return jsonResponse({ received: true });
});
