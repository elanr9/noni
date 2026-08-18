// Payout-setup emails, sent through Resend like invite-campaign-manager.
//
// Mercury is asked for the invite with sendEmail:false so it never mails the
// creator directly. The link arrives from Noni, in Noni's voice, so a creator
// is not surprised by a bank they have never heard of asking for their SSN.

const FROM_FALLBACK = 'Noni <founders@usenoni.app>';

function resendConfig(): { apiKey: string; from: string } {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  return { apiKey, from: Deno.env.get('INVITE_FROM_EMAIL') ?? FROM_FALLBACK };
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const { apiKey, from } = resendConfig();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

function greeting(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `<p>Hi ${trimmed},</p>\n` : '';
}

/**
 * Sent the moment a creator taps "Set up payouts".
 *
 * The onboarding link is deliberately only ever delivered by email — it is
 * never returned to the app — so possession of a Noni session is not enough to
 * claim someone else's payout identity.
 */
export function mercuryInviteEmail(
  creatorName: string | null,
  onboardingUrl: string,
): { subject: string; html: string } {
  return {
    subject: 'Set up your Noni payouts',
    html:
      greeting(creatorName) +
      [
        `<p>You are one step away from getting paid for your Noni content.</p>`,
        `<p><a href="${onboardingUrl}"><strong>Add your payout details</strong></a> — it takes about two minutes. You will enter your bank account and sign a W-9 so we can pay you and handle tax paperwork properly.</p>`,
        `<p>This form is hosted by Mercury, the bank Noni pays creators through. Your bank details go straight to them; Noni never sees them.</p>`,
        `<p>When you are done, head back to the Noni app and tap <strong>I'm done setting up</strong>.</p>`,
        `<p>Payouts run every Sunday evening once your details are in.</p>`,
      ].join('\n'),
  };
}

/** Nudge for a creator who has not finished after three days. */
export function mercuryReminderEmail(
  creatorName: string | null,
  onboardingUrl: string,
): { subject: string; html: string } {
  return {
    subject: 'Your Noni payout setup is still open',
    html:
      greeting(creatorName) +
      [
        `<p>You started setting up payouts a few days ago but we do not have your details yet — so we cannot pay you.</p>`,
        `<p><a href="${onboardingUrl}"><strong>Finish your payout setup</strong></a>. It takes about two minutes: your bank account and a W-9.</p>`,
        `<p>Anything you have already earned is safe and waiting. It will go out on the first Sunday after your details are in.</p>`,
        `<p>When you are done, tap <strong>I'm done setting up</strong> in the Noni app.</p>`,
      ].join('\n'),
  };
}

export async function sendMercuryInviteEmail(
  to: string,
  creatorName: string | null,
  onboardingUrl: string,
): Promise<void> {
  const { subject, html } = mercuryInviteEmail(creatorName, onboardingUrl);
  await send(to, subject, html);
}

export async function sendMercuryReminderEmail(
  to: string,
  creatorName: string | null,
  onboardingUrl: string,
): Promise<void> {
  const { subject, html } = mercuryReminderEmail(creatorName, onboardingUrl);
  await send(to, subject, html);
}
