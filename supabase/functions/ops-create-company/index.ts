// Company provisioning for the /ops dashboard. Platform admin (role admin)
// only. Creates the company, generates a unique slug, and when admin_email is
// provided also emails the company admin invite: whoever signs in on the noni
// website with that email becomes the company's admin (invite-aware signup
// trigger, migration 058) and is walked through web onboarding. Without
// admin_email, /ops sends the invite via invite-campaign-manager instead.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { sendEmail } from '../_shared/email.ts';
import { inviteEmail } from '../_shared/inviteEmail.ts';

const WEB_URL = 'https://www.usenoni.app';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  action?: 'create';
  name?: string;
  website?: string;
  admin_email?: string;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(admin: SupabaseClient, base: string): Promise<string> {
  const root = base || 'company';
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const { data } = await admin
      .from('companies')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error('could not find a free slug');
}

async function sendAdminInviteEmail(
  email: string,
  companyName: string,
  token: string,
): Promise<void> {
  const { subject, content } = inviteEmail({
    email,
    companyName,
    role: 'company_admin',
    token,
  });
  await sendEmail({ to: email, subject, content });
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();
    const caller = await authenticate(req, admin);
    if (!caller || caller.kind !== 'user') {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }
    // Platform admin only: the single Noni ops account.
    if (!caller.platformAdmin) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (body?.action !== 'create') {
      return jsonResponse({ error: 'expected { action: "create" }' }, 400);
    }
    const name = (body.name ?? '').trim();
    if (name.length < 2) {
      return jsonResponse({ error: 'expected { name }' }, 400);
    }
    const adminEmail = (body.admin_email ?? '').trim().toLowerCase();
    if (adminEmail && !EMAIL_RE.test(adminEmail)) {
      return jsonResponse({ error: 'admin_email is not a valid email' }, 400);
    }
    const website = (body.website ?? '').trim() || null;

    const slug = await uniqueSlug(admin, slugify(name));
    const { data: company, error } = await admin
      .from('companies')
      .insert({ name, slug, website })
      .select('id, name, slug, website, created_at')
      .single();
    if (error) throw error;

    if (!adminEmail) {
      return jsonResponse({ company });
    }

    const { data: invite, error: inviteError } = await admin
      .from('company_invites')
      .insert({
        company_id: company.id,
        email: adminEmail,
        role: 'company_admin',
        invited_by: caller.userId,
      })
      .select('id, email, role, token, expires_at')
      .single();
    if (inviteError) throw inviteError;

    await sendAdminInviteEmail(adminEmail, name, invite.token as string);

    return jsonResponse({ company, invite: { ...invite, token: undefined } });
  } catch (e) {
    console.error('ops-create-company failed', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
