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

    // Test company (migration 146): no bank exists yet, so the creator is
    // marked ready with a placeholder recipient. The payout run pays test
    // companies on paper only, so this id is never sent to Mercury.
    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('payout_test_mode')
      .eq('id', caller.companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (company?.payout_test_mode === true) {
      const now = new Date().toISOString();
      const { error: upsertError } = await admin.from('creator_wallets').upsert(
        {
          company_id: caller.companyId,
          creator_id: caller.userId,
          payout_ready: true,
          payout_rail: 'mercury',
          mercury_recipient_id: `test-${caller.userId}`,
          mercury_invite_status: 'completed',
          mercury_invite_sent_at: now,
          mercury_onboarded_at: now,
        },
        { onConflict: 'company_id,creator_id' },
      );
      if (upsertError) throw upsertError;
      return jsonResponse({ success: true, already_set_up: true, test_mode: true });
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
