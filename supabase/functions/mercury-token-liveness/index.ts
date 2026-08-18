// Weekly keep-alive for the Mercury API token.
//
// Mercury downgrades a token whose permissions exceed what it used in any
// 45-day window, and deletes a token unused for 45 days. Noni pays creators
// weekly, so a quiet stretch — a paused campaign, a slow month, a company with
// payouts disabled — can silently leave the write token unexercised. It would
// then be downgraded to read-only, and a downgraded token cannot be restored:
// you have to create a new one and re-whitelist. This touches the API on a
// schedule so that never happens by accident.
//
// A read is enough to keep the token alive. The 404 is the expected answer: the
// all-zero uuid is not a real recipient, and reading is cheaper and safer than
// exercising anything that moves money.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { callProxy, isNotFound, MercuryProxyError } from '../_shared/mercury.ts';

const PROBE_RECIPIENT_ID = '00000000-0000-0000-0000-000000000000';

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
    if (caller.kind !== 'cron') return jsonResponse({ error: 'forbidden' }, 403);

    const checkedAt = new Date().toISOString();

    try {
      await callProxy(`/recipient/${PROBE_RECIPIENT_ID}`, 'GET');
      // A 200 would mean that uuid exists, which is surprising but still proves
      // the token works.
      console.log('mercury-token-liveness ok (200)', checkedAt);
      return jsonResponse({ ok: true, checked_at: checkedAt, probe: 'found' });
    } catch (e) {
      if (isNotFound(e)) {
        console.log('mercury-token-liveness ok (404 as expected)', checkedAt);
        return jsonResponse({ ok: true, checked_at: checkedAt, probe: '404' });
      }

      // 401/403 is the signal that matters: the token has been downgraded,
      // deleted, or the Elastic IP has fallen off the whitelist. Payouts will
      // fail on Sunday unless someone acts.
      if (e instanceof MercuryProxyError && (e.status === 401 || e.status === 403)) {
        console.error(
          `mercury-token-liveness TOKEN REJECTED (${e.status}) — check the Mercury token and IP whitelist`,
          checkedAt,
        );
        return jsonResponse(
          {
            ok: false,
            checked_at: checkedAt,
            status: e.status,
            error: 'Mercury rejected the token. Check token validity and the IP whitelist.',
          },
          200, // 200 so pg_cron/pg_net does not retry; the log carries the alarm.
        );
      }

      throw e;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'mercury-token-liveness failed';
    console.error('mercury-token-liveness', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
