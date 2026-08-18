// Creating a Mercury recipient invite and recording it on the creator's wallet.
//
// Shared because two functions need it: mercury-create-invite (creator taps
// "Set up payouts") and mercury-verify-onboarding (the previous link expired,
// so issue a fresh one). Edge functions cannot import each other's entrypoints
// without running their Deno.serve, so the logic lives here.

import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { callProxy, getCreatorEmail, type MercuryInvite } from './mercury.ts';
import { sendMercuryInviteEmail } from './mercury-emails.ts';

export type InviteResult = {
  inviteId: string;
  status: string;
  /** Server-side only. Never return this to the app. */
  onboardingUrl: string;
  email: string;
};

/**
 * Create a Mercury invite for a creator and store it on creator_wallets.
 *
 * Order matters. Mercury is called first, then the row is written, then the
 * email goes out: if the email fails we still hold the invite id and the sweep
 * or a retry can recover, whereas emailing a link we never recorded would leave
 * a creator onboarding into a payout identity we cannot match back to them.
 */
export async function createInviteForCreator(
  admin: SupabaseClient,
  creatorId: string,
  companyId: string,
): Promise<InviteResult> {
  if (!companyId) {
    throw new Error('Creator has no company; cannot set up payouts');
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', creatorId)
    .maybeSingle();
  if (profileError) throw profileError;

  const email = await getCreatorEmail(admin, creatorId);
  // Mercury requires a name when no recipientId is supplied. Fall back to the
  // email local part so a creator who never set a display name is not blocked.
  const name = profile?.full_name?.trim() || email.split('@')[0];

  const invite = await callProxy<MercuryInvite>('/invite', 'POST', {
    contactEmail: email,
    name,
    paymentMethods: ['ach'],
    requireTaxDocument: true,
    // Never true. Noni sends its own branded email; see mercury-emails.ts.
    sendEmail: false,
  });

  if (!invite?.id || !invite?.onboardingUrl) {
    throw new Error('Mercury returned an invite with no id or onboardingUrl');
  }

  const { error: walletError } = await admin.from('creator_wallets').upsert(
    {
      company_id: companyId,
      creator_id: creatorId,
      mercury_invite_id: invite.id,
      mercury_onboarding_url: invite.onboardingUrl,
      mercury_invite_status: 'created',
      mercury_invite_sent_at: new Date().toISOString(),
      // A re-issued invite starts the reminder clock over.
      mercury_invite_reminder_sent_at: null,
    },
    { onConflict: 'company_id,creator_id' },
  );
  if (walletError) throw walletError;

  await sendMercuryInviteEmail(email, profile?.full_name ?? null, invite.onboardingUrl);

  return {
    inviteId: invite.id,
    status: invite.status,
    onboardingUrl: invite.onboardingUrl,
    email,
  };
}
