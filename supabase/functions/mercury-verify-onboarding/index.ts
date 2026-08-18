// Creator taps "I'm done setting up" in the Noni app.
//
// Mercury emits no webhook when a recipient completes onboarding — the Events
// API covers transactions and account balances only — so completion has to be
// pulled. This is the fast path; mercury-onboarding-sweep is the safety net for
// creators who never come back and tap the button.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import {
  callProxy,
  MercuryProxyError,
  type MercuryInvite,
  type MercuryRecipient,
} from '../_shared/mercury.ts';
import { createInviteForCreator } from '../_shared/mercury-invite.ts';

/**
 * Mercury exposes no verified/approved state for tax documents — only the
 * presence of an attachment and its classified formType. 'submitted' means a
 * W-9 is on file; 'unknown' means something was uploaded that Mercury could not
 * classify. Neither is a statement that the form is valid.
 */
function w9StatusFrom(recipient: MercuryRecipient | null): 'none' | 'submitted' | 'unknown' {
  const attachments = recipient?.attachments ?? [];
  if (attachments.length === 0) return 'none';
  if (attachments.some((a) => a.formType === 'w9')) return 'submitted';
  return 'unknown';
}

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

    const { data: wallet, error: walletError } = await admin
      .from('creator_wallets')
      .select('id, company_id, mercury_invite_id, payout_ready')
      .eq('company_id', caller.companyId)
      .eq('creator_id', caller.userId)
      .maybeSingle();
    if (walletError) throw walletError;

    if (wallet?.payout_ready === true) {
      return jsonResponse({ ready: true, message: 'You are all set up for payouts.' });
    }
    if (!wallet?.mercury_invite_id) {
      return jsonResponse(
        { ready: false, message: 'Start payout setup first.' },
        400,
      );
    }

    const invite = await callProxy<MercuryInvite>(
      `/invite-status/${wallet.mercury_invite_id}`,
      'GET',
    );

    if (invite.status === 'created') {
      return jsonResponse({
        ready: false,
        message: "We don't see your info yet, double check the link in your email",
      });
    }

    if (invite.status === 'expired') {
      // Issue a fresh invite and email it. The old row is overwritten by
      // createInviteForCreator, which also resets the reminder clock.
      await createInviteForCreator(admin, caller.userId, wallet.company_id);
      return jsonResponse({
        ready: false,
        message: 'Link expired, we sent a new one',
      });
    }

    // completed — pull the recipient so the W-9 state is recorded alongside.
    let recipient: MercuryRecipient | null = null;
    if (invite.recipientId) {
      try {
        recipient = await callProxy<MercuryRecipient>(
          `/recipient/${invite.recipientId}`,
          'GET',
        );
      } catch (e) {
        // A recipient read failure must not block payout readiness — the invite
        // itself is Mercury's statement that onboarding finished. w9_status
        // stays 'none' and the sweep will fill it in later.
        console.error('mercury-verify-onboarding recipient read', e);
      }
    }

    const { error: updateError } = await admin
      .from('creator_wallets')
      .update({
        mercury_invite_status: 'completed',
        mercury_recipient_id: invite.recipientId,
        mercury_w9_status: w9StatusFrom(recipient),
        mercury_onboarded_at: new Date().toISOString(),
        payout_ready: true,
        payout_rail: 'mercury',
        // The link is spent; do not keep a live capability at rest.
        mercury_onboarding_url: null,
      })
      .eq('id', wallet.id);
    if (updateError) throw updateError;

    return jsonResponse({
      ready: true,
      message: "You're all set. Payouts run Sunday evenings.",
    });
  } catch (e) {
    if (e instanceof MercuryProxyError) {
      console.error('mercury-verify-onboarding proxy', e.status, e.message);
      return jsonResponse(
        {
          ready: false,
          error: e.isClientError
            ? 'We could not check your payout setup. Please contact support.'
            : 'We could not reach our payments provider. Please try again shortly.',
        },
        e.isClientError ? 400 : 503,
      );
    }
    const message = e instanceof Error ? e.message : 'mercury-verify-onboarding failed';
    console.error('mercury-verify-onboarding', message);
    return jsonResponse({ error: message }, 500);
  }
});
