// The invite email for each role, shared by invite-campaign-manager and
// ops-create-company so a company admin gets the same email either way.

import { type EmailContent, greet } from './email.ts';

const INVITE_BASE_URL = 'https://www.usenoni.app/invite/';
// Noni is on TestFlight until the App Store listing is live, and the listing
// link opens "App Not Available" until then. So the button goes to the invite
// page on the web, which walks the person through getting the beta. When the
// app is on the App Store, set this to the listing and the email links
// straight to it again.
const APP_STORE_URL: string | null = null;

export type InviteEmailRole = 'company_admin' | 'campaign_manager' | 'creator';

/** The invite email for each role: who invited you, the one thing to do
    next, and the steps after it. */
export function inviteEmail(input: {
  email: string;
  companyName: string;
  role: InviteEmailRole;
  token: string;
  inviteeName?: string;
  inviterName?: string | null;
}): { subject: string; content: EmailContent } {
  const { email, companyName, role } = input;
  const link = `${INVITE_BASE_URL}${input.token}/accept`;
  const name = input.inviteeName;
  const from = input.inviterName?.trim();
  const getApp = APP_STORE_URL
    ? { label: 'Get Noni on the App Store', url: APP_STORE_URL }
    : { label: 'Get the Noni app', url: `${INVITE_BASE_URL}${input.token}` };
  const footnote = `This invite is for ${email} and expires in 14 days. Not expecting it? You can ignore this email.`;

  if (role === 'company_admin') {
    return {
      subject: `Your ${companyName} workspace on Noni is ready`,
      content: {
        preview: `Sign in with Google to set up ${companyName}. It takes about five minutes.`,
        heading: `${companyName} is ready on Noni`,
        paragraphs: [
          greet(name, `your workspace is set up and waiting for you. Noni is where your creator program runs: briefs, creators, approvals and results in one place.`),
        ],
        cta: { label: 'Set up your workspace', url: link },
        steps: [
          `Sign in with Google as ${email}.`,
          'Answer a few quick questions while Noni reads your website.',
          'Pick a plan and your creators can start posting.',
        ],
        footnote,
      },
    };
  }

  const what =
    role === 'campaign_manager'
      ? `manage campaigns for ${companyName}`
      : `make content for ${companyName}`;
  const invited = from
    ? `${from} invited you to ${what} on Noni.`
    : `you're invited to ${what} on Noni.`;
  return {
    subject:
      role === 'campaign_manager'
        ? `${from ?? companyName} invited you to manage ${companyName} on Noni`
        : `${companyName} wants you as a creator on Noni`,
    content: {
      preview:
        role === 'campaign_manager'
          ? `Get the app and sign in as ${email} to start.`
          : `Get the app, sign in as ${email} and see your first brief.`,
      heading:
        role === 'campaign_manager'
          ? `You're invited to manage ${companyName}`
          : `${companyName} wants you as a creator`,
      paragraphs: [
        greet(name, invited),
        role === 'campaign_manager'
          ? 'You will send briefs, review what creators post and see how every post performs.'
          : 'You get briefs that tell you exactly what to film, you post on your own account, and you get paid for every post that goes live.',
      ],
      cta: getApp,
      steps: [
        APP_STORE_URL
          ? 'Download Noni on your iPhone.'
          : 'Open this on your iPhone and install Noni through TestFlight, Apple\'s app for beta apps.',
        `Sign in with Google as ${email}.`,
        role === 'campaign_manager'
          ? `You land in ${companyName}, ready to go.`
          : `You land in ${companyName} with your first brief.`,
      ],
      secondary: {
        lead: 'Already use Noni with this email?',
        label: 'Accept the invite here',
        url: link,
      },
      footnote,
    },
  };
}
