// Emails the founders when someone fills in a form on the public site: a
// creator application, a request for a call, the waitlist, a business or
// Enterprise enquiry. Fired by a trigger on public.leads (noni-web migration
// leads_creator_call) through pg_net with the cron secret. Cron secret only.
//
// Env: RESEND_API_KEY, INVITE_FROM_EMAIL (the verified sender), optional
// LEADS_TO_EMAIL (defaults to founders@fieldvisionai.com).

import { adminClient, handleCors, jsonResponse } from '../_shared/wp8.ts';

const DEFAULT_TO = 'founders@fieldvisionai.com';

const SUBJECT: Record<string, (name: string, company: string | null) => string> = {
  creator: (name) => `New creator applied to Noni: ${name}`,
  call: (name, company) => `Call requested: ${company ?? name}`,
  business: (name, company) => `New company wants Noni: ${company ?? name}`,
  enterprise: (name, company) => `Enterprise enquiry: ${company ?? name}`,
  waitlist: (name) => `New waitlist sign-up: ${name}`,
  testflight: (name) => `TestFlight invite requested: ${name}`,
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  try {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    const body = (await req.json().catch(() => null)) as { lead_id?: string } | null;
    if (!body?.lead_id) return jsonResponse({ error: 'lead_id required' }, 400);

    const admin = adminClient();
    const { data: lead, error } = await admin
      .from('leads')
      .select('id, kind, name, email, phone, company, website, message, source, created_at')
      .eq('id', body.lead_id)
      .maybeSingle();
    if (error) throw error;
    if (!lead) return jsonResponse({ error: 'not found' }, 404);

    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('INVITE_FROM_EMAIL');
    if (!apiKey || !from) throw new Error('RESEND_API_KEY / INVITE_FROM_EMAIL missing');

    const kind = String(lead.kind);
    const rows: [string, unknown][] = [
      ['Name', lead.name],
      ['Email', lead.email],
      ['Phone', lead.phone],
      ['Company', lead.company],
      [kind === 'creator' ? 'TikTok / Instagram' : 'Website', lead.website],
      [kind === 'call' ? 'Times that work' : kind === 'creator' ? 'What they post about' : 'Message', lead.message],
      ['Form', lead.source ? `${kind} (${lead.source})` : kind],
    ];
    const html = `<table style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;border-collapse:collapse">${rows
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#6b7a8c;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;color:#0f1720;white-space:pre-wrap">${esc(v)}</td></tr>`,
      )
      .join('')}</table><p style="font-family:system-ui,sans-serif;font-size:13px;color:#6b7a8c">Reply to this email to answer ${esc(lead.name)} directly.</p>`;

    const subject = (SUBJECT[kind] ?? SUBJECT.waitlist)(String(lead.name), (lead.company as string | null) || null);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [Deno.env.get('LEADS_TO_EMAIL') ?? DEFAULT_TO],
        reply_to: String(lead.email),
        subject,
        html,
      }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('notify-lead failed:', message);
    return jsonResponse({ error: message }, 500);
  }
});
