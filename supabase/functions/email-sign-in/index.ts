// email-sign-in: emails a one-time sign-in link to a company admin or
// campaign manager. Companies never use Google; this and the invite link
// are how they get in. Public (no JWT): it always answers ok, so it never
// tells anyone whether an address has an account. At most 5 links an hour
// per address. The link opens www.usenoni.app/auth/confirm, which signs
// the browser in on our own domain.
//
// Body: { email: string, next?: string }   next is a path on the site.

import { adminClient, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { sendEmail } from '../_shared/email.ts';

const WEB_URL = 'https://www.usenoni.app';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PER_HOUR = 5;

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const body = (await req.json().catch(() => null)) as { email?: unknown; next?: unknown } | null;
  const email = String(body?.email ?? '').trim().toLowerCase();
  const rawNext = String(body?.next ?? '/dash');
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dash';
  if (!EMAIL_RE.test(email) || email.length > 200) return jsonResponse({ error: 'Enter a valid email.' }, 400);

  try {
    const admin = adminClient();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from('sign_in_link_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', since);
    if ((count ?? 0) >= PER_HOUR) return jsonResponse({ ok: true });
    await admin.from('sign_in_link_requests').insert({ email });

    const { data: allowed } = await admin.rpc('can_email_sign_in', { p_email: email });
    if (allowed !== true) return jsonResponse({ ok: true });

    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const hash = data?.properties?.hashed_token;
    if (error || !hash) throw error ?? new Error('no link');

    const url = `${WEB_URL}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=magiclink&next=${encodeURIComponent(next)}`;
    await sendEmail({
      to: email,
      subject: 'Sign in to Noni',
      content: {
        preview: 'Your sign-in link',
        heading: 'Sign in to Noni',
        paragraphs: ['This link works once and for the next hour.'],
        cta: { label: 'Sign in', url },
        footnote: 'Did not ask for this? Ignore this email.',
      },
    });
    return jsonResponse({ ok: true });
  } catch (e) {
    console.error('email-sign-in', e instanceof Error ? e.message : e);
    return jsonResponse({ ok: true });
  }
});
