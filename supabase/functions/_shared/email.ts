// One branded layout for every email Noni sends to a person (invites,
// application decisions). Table markup and inline styles only, so it holds
// up in Gmail, Apple Mail and Outlook. Every email has one job and one
// button; the plain-text part carries the same words and the link.

const WEB_URL = 'https://www.usenoni.app';
const LOGO_URL = `${WEB_URL}/brand/app-icon.png`;

const INK = '#0f1720';
const BODY = '#3d4a5c';
const MUTED = '#6b7a8c';
const LINE = '#e6eef5';
const PAGE = '#f7fafd';
const BLUE = '#1ba6ee';
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Opens a paragraph with "Hi Sam, " when the first name is known, else
    starts the sentence with a capital. `sentence` is written lowercase-first
    unless it opens with a name. */
export function greet(firstName: string | null | undefined, sentence: string): string {
  const first = firstName?.trim().split(/\s+/)[0];
  if (first) return `Hi ${first}, ${sentence}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export interface EmailContent {
  /** Inbox preview line, shown after the subject. */
  preview: string;
  /** The one-line headline. Plain text. */
  heading: string;
  /** Short paragraphs under the headline. Plain text. */
  paragraphs: string[];
  /** The single action. */
  cta?: { label: string; url: string };
  /** Numbered steps shown under the button. Plain text. */
  steps?: string[];
  /** A quieter second link under the steps. */
  secondary?: { lead: string; label: string; url: string };
  /** Small print at the bottom of the card. Plain text. */
  footnote?: string;
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const p = (text: string) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${BODY};">${escapeHtml(text)}</p>`;

  const button = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px;"><tr><td align="center" bgcolor="${BLUE}" style="border-radius:999px;"><a href="${c.cta.url}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(c.cta.label)}</a></td></tr></table>`
    : '';

  const steps = c.steps?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 0;border-top:1px solid ${LINE};">${c.steps
        .map(
          (s, i) =>
            `<tr><td valign="top" width="34" style="padding:14px 0 0;"><span style="display:inline-block;width:24px;height:24px;border-radius:999px;background:#e3f4fd;color:#0b76ad;font-family:${FONT};font-size:13px;font-weight:700;line-height:24px;text-align:center;">${i + 1}</span></td><td valign="top" style="padding:15px 0 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${BODY};">${escapeHtml(s)}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const secondary = c.secondary
    ? `<p style="margin:22px 0 0;font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(c.secondary.lead)} <a href="${c.secondary.url}" target="_blank" style="color:#0b76ad;font-weight:700;text-decoration:none;">${escapeHtml(c.secondary.label)}</a></p>`
    : '';

  const footnote = c.footnote
    ? `<p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${LINE};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(c.footnote)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(c.preview)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE}" style="background:${PAGE};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;">
<tr><td style="padding:0 4px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${LOGO_URL}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;"></td>
<td valign="middle" style="padding-left:10px;font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.4px;color:${INK};">noni</td>
</tr></table>
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:20px;padding:32px 28px;font-family:${FONT};">
<h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.5px;color:${INK};">${escapeHtml(c.heading)}</h1>
${c.paragraphs.map(p).join('\n')}
${button}
${steps}
${secondary}
${footnote}
</td></tr>
<tr><td align="center" style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">
Noni · <a href="${WEB_URL}" target="_blank" style="color:${MUTED};text-decoration:underline;">usenoni.app</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    c.heading,
    '',
    ...c.paragraphs,
    ...(c.cta ? ['', `${c.cta.label}: ${c.cta.url}`] : []),
    ...(c.steps?.length ? ['', ...c.steps.map((s, i) => `${i + 1}. ${s}`)] : []),
    ...(c.secondary ? ['', `${c.secondary.lead} ${c.secondary.label}: ${c.secondary.url}`] : []),
    ...(c.footnote ? ['', c.footnote] : []),
    '',
    'Noni · usenoni.app',
  ].join('\n');

  return { html, text };
}

/** Sends one email through Resend. Throws with Resend's answer on failure. */
export async function sendEmail(input: {
  to: string;
  subject: string;
  content: EmailContent;
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const from = Deno.env.get('INVITE_FROM_EMAIL') ?? 'Noni <founders@usenoni.app>';
  const { html, text } = renderEmail(input.content);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
