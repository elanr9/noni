// Creator taps "Set up payouts" in the Noni app.
//
// Creates a Mercury recipient invite and emails the creator the onboarding
// link. The link is never returned to the client: it is a bearer capability
// that binds a bank account and a signed W-9 to a payout identity, so it goes
// to the address the creator actually controls, not to whoever holds a session.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { createInviteForCreator } from '../_shared/mercury-invite.ts';
import { MercuryProxyError } from '../_shared/mercury.ts';

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
    if (caller.kind !== 'user') return jsonResponse({ error: 'forbidden' }, 403);
    if (caller.role !== 'creator') {
      return jsonResponse({ error: 'Only creators set up payouts' }, 403);
    }
    if (!caller.companyId) {
      return jsonResponse({ error: 'Join a company before setting up payouts' }, 400);
    }

    const { data: wallet, error: walletError } = await admin
      .from('creator_wallets')
      .select('mercury_invite_status, payout_ready')
      .eq('company_id', caller.companyId)
      .eq('creator_id', caller.userId)
      .maybeSingle();
    if (walletError) throw walletError;

    // Already finished. Re-inviting would strand the completed recipient and
    // leave the creator unpayable until the next sweep.
    if (wallet?.payout_ready === true) {
      return jsonResponse({ success: true, already_set_up: true });
    }

    await createInviteForCreator(admin, caller.userId, caller.companyId);

    // Deliberately no onboardingUrl in the response.
    return jsonResponse({ success: true });
  } catch (e) {
    if (e instanceof MercuryProxyError) {
      console.error('mercury-create-invite proxy', e.status, e.message);
      return jsonResponse(
        {
          error: e.isClientError
            ? 'We could not start your payout setup. Please contact support.'
            : 'Payout setup is temporarily unavailable. Please try again shortly.',
        },
        e.isClientError ? 400 : 503,
      );
    }
    const message = e instanceof Error ? e.message : 'mercury-create-invite failed';
    console.error('mercury-create-invite', message);
    return jsonResponse({ error: message }, 500);
  }
});
