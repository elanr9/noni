// Role-aware company invites.
//
// company_admin invites: platform admin only, sent when a company is
// provisioned from /ops on noni-web. The email routes to web onboarding at
// usenoni.app; signing in with Google on the invited email makes the account
// that company's single admin.
//
// campaign_manager invites: sent by the company admin (or a manager holding
// invite_members, or the platform admin). The email routes to the App Store;
// signing in with Google on the invited email creates the manager with the
// preset permission toggles from the invite (all off unless the admin chose
// otherwise).
//
// creator invites: sent by the same callers as campaign_manager invites,
// either from the web dashboard or from the app's roster screen. The email
// routes to the App Store; signing in with Google on the invited email
// creates the creator on the inviting company.
//
// Existing accounts accept from https://www.usenoni.app/invite/[token] while
// signed in, which runs on the service role and overrides their profile.

import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import { adminClient, handleCors, hasPermission, jsonResponse } from '../_shared/wp8.ts';

const INVITE_BASE_URL = 'https://www.usenoni.app/invite/';
const APP_STORE_URL = 'https://apps.apple.com/app/id6799189794';
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PERMISSION_KEYS = [
  'invite_members',
  'edit_account_template',
  'manage_brand',
  'manage_features',
  'manage_billing',
  'manage_publish_time',
] as const;

type InviteRole = 'company_admin' | 'campaign_manager' | 'creator';

type InviteRow = {
  id: string;
  company_id: string;
  email: string;
  role: InviteRole;
  permissions: Record<string, boolean>;
  token: string;
  invited_by: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
};

type Body = {
  action?: 'invite' | 'resend' | 'accept';
  company_id?: string;
  email?: string;
  /** Invitee's name, used only to address the invite email. */
  name?: string;
  role?: InviteRole;
  permissions?: Record<string, boolean>;
  invite_id?: string;
  token?: string;
};

function sanitizePermissions(input: Record<string, boolean> | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input) return out;
  for (const key of PERMISSION_KEYS) {
    if (input[key] === true) out[key] = true;
  }
  return out;
}

async function sendInviteEmail(
  email: string,
  companyName: string,
  role: InviteRole,
  token: string,
  inviteeName?: string,
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const from = Deno.env.get('INVITE_FROM_EMAIL') ?? 'Noni <founders@usenoni.app>';
  const link = `${INVITE_BASE_URL}${token}/accept`;
  const greeting = inviteeName?.trim() ? `<p>Hi ${inviteeName.trim()},</p>\n` : '';

  const body =
    role === 'company_admin'
      ? [
          `<p>You have been invited to run <strong>${companyName}</strong> on Noni.</p>`,
          `<p><a href="${link}"><strong>Set up your company on usenoni.app</strong></a> by signing in with Google using this email address (${email}). You will be taken through onboarding, then into your company dashboard.</p>`,
          `<p>This invite expires in 14 days. If you were not expecting this email you can ignore it.</p>`,
        ].join('\n')
      : role === 'campaign_manager'
        ? [
            `<p>You have been invited to manage campaigns for <strong>${companyName}</strong> on Noni.</p>`,
            `<p><a href="${APP_STORE_URL}"><strong>Download Noni on the App Store</strong></a> and sign in with Google using this email address (${email}). Your account will be set up as a campaign manager for ${companyName} automatically.</p>`,
            `<p>Already using Noni with this email? <a href="${link}">Accept your invite here</a> instead.</p>`,
            `<p>This invite expires in 14 days. If you were not expecting this email you can ignore it.</p>`,
          ].join('\n')
        : [
            `<p>You have been invited to create content for <strong>${companyName}</strong> on Noni.</p>`,
            `<p><a href="${APP_STORE_URL}"><strong>Download Noni on the App Store</strong></a> and sign in with Google using this email address (${email}). Your account will be set up as a creator for ${companyName} automatically.</p>`,
            `<p>Already using Noni with this email? <a href="${link}">Accept your invite here</a> instead.</p>`,
            `<p>This invite expires in 14 days. If you were not expecting this email you can ignore it.</p>`,
          ].join('\n');
  const html = greeting + body;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject:
        role === 'company_admin'
          ? `You are invited to run ${companyName} on Noni`
          : role === 'campaign_manager'
            ? `You are invited to manage ${companyName} on Noni`
            : `You are invited to create for ${companyName} on Noni`,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

async function companyName(
  admin: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  return data?.name ?? null;
}

async function companyHasAdmin(
  admin: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', 'company_admin')
    .maybeSingle();
  if (existing) return true;
  const { data: pending } = await admin
    .from('company_invites')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', 'company_admin')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1);
  return (pending ?? []).length > 0;
}

async function handleInvite(
  admin: SupabaseClient,
  user: User,
  body: Body,
): Promise<Response> {
  const email = (body.email ?? '').trim().toLowerCase();
  const role: InviteRole =
    body.role === 'company_admin' || body.role === 'creator'
      ? body.role
      : 'campaign_manager';
  if (!body.company_id || !EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'expected { company_id, email }' }, 400);
  }
  const name = await companyName(admin, body.company_id);
  if (!name) return jsonResponse({ error: 'company not found' }, 404);

  if (role === 'company_admin' && (await companyHasAdmin(admin, body.company_id))) {
    return jsonResponse({ error: 'this company already has an admin or a pending admin invite' }, 400);
  }

  const { data: invite, error } = await admin
    .from('company_invites')
    .insert({
      company_id: body.company_id,
      email,
      role,
      permissions: role === 'campaign_manager' ? sanitizePermissions(body.permissions) : {},
      invited_by: user.id,
    })
    .select('*')
    .single();
  if (error) throw error;

  await sendInviteEmail(email, name, role, (invite as InviteRow).token, body.name);
  return jsonResponse({ invite });
}

async function handleResend(admin: SupabaseClient, body: Body): Promise<Response> {
  if (!body.invite_id) {
    return jsonResponse({ error: 'expected { invite_id }' }, 400);
  }
  const { data: existing } = await admin
    .from('company_invites')
    .select('*')
    .eq('id', body.invite_id)
    .maybeSingle();
  if (!existing) return jsonResponse({ error: 'invite not found' }, 404);
  if ((existing as InviteRow).accepted_at) {
    return jsonResponse({ error: 'invite already accepted' }, 400);
  }

  const { data: invite, error } = await admin
    .from('company_invites')
    .update({ expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString() })
    .eq('id', body.invite_id)
    .select('*')
    .single();
  if (error) throw error;

  const row = invite as InviteRow;
  const name = await companyName(admin, row.company_id);
  await sendInviteEmail(row.email, name ?? 'a company', row.role, row.token);
  return jsonResponse({ invite });
}

async function handleAccept(
  admin: SupabaseClient,
  user: User,
  body: Body,
): Promise<Response> {
  if (!body.token) return jsonResponse({ error: 'expected { token }' }, 400);

  const { data: invite } = await admin
    .from('company_invites')
    .select('*')
    .eq('token', body.token)
    .maybeSingle();
  if (!invite) return jsonResponse({ error: 'invite not found' }, 404);

  const row = invite as InviteRow;
  if (row.accepted_at) {
    return jsonResponse({ error: 'invite already accepted' }, 400);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return jsonResponse({ error: 'invite expired' }, 400);
  }
  if ((user.email ?? '').toLowerCase() !== row.email.toLowerCase()) {
    return jsonResponse(
      { error: 'sign in with the email address the invite was sent to' },
      403,
    );
  }
  if (row.role === 'company_admin' && (await companyHasAdmin(admin, row.company_id))) {
    return jsonResponse({ error: 'this company already has an admin' }, 400);
  }

  // Override the signup trigger: the invitee may already have a creator
  // profile, or no profile at all.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, onboarded')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role === 'admin') {
    return jsonResponse({ error: 'platform admin cannot accept invites' }, 400);
  }
  if (profile) {
    const { error } = await admin
      .from('profiles')
      .update({ company_id: row.company_id, role: row.role })
      .eq('id', user.id);
    if (error) throw error;
  } else {
    const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
    const { error } = await admin.from('profiles').insert({
      id: user.id,
      company_id: row.company_id,
      role: row.role,
      full_name: fullName,
      onboarded: false,
    });
    if (error) throw error;
  }

  // Company admins have every permission implicitly; campaign managers get the
  // invite's preset toggles (all off unless the admin chose otherwise).
  // Creators carry no permission toggles, so they get no member row.
  if (row.role !== 'creator') {
    const { error: memberError } = await admin.from('company_members').upsert(
      {
        company_id: row.company_id,
        profile_id: user.id,
        permissions: row.role === 'company_admin' ? {} : row.permissions ?? {},
      },
      { onConflict: 'company_id,profile_id' },
    );
    if (memberError) throw memberError;
  }

  const { error: acceptError } = await admin
    .from('company_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', row.id);
  if (acceptError) throw acceptError;

  return jsonResponse({
    ok: true,
    company_id: row.company_id,
    role: row.role,
    onboarded: profile?.onboarded ?? false,
  });
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = adminClient();

    // Auth by JWT directly: accept must work for users whose profile does not
    // exist yet, which the shared authenticate() helper rejects.
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = data?.user;
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

    const body = (await req.json().catch(() => null)) as Body | null;
    const action = body?.action;
    if (action !== 'invite' && action !== 'resend' && action !== 'accept') {
      return jsonResponse({ error: 'expected { action }' }, 400);
    }

    if (action === 'accept') return await handleAccept(admin, user, body ?? {});

    // Platform admin invites anywhere (any role). Company admins invite
    // campaign managers into their own company. Campaign managers holding
    // invite_members can invite managers into their own company.
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, company_id')
      .eq('id', user.id)
      .maybeSingle();
    const platformAdmin = callerProfile?.role === 'admin';
    if (!platformAdmin) {
      if (body?.role === 'company_admin') {
        return jsonResponse({ error: 'only Noni ops can invite a company admin' }, 403);
      }
      const companyAdmin = callerProfile?.role === 'company_admin';
      const allowed =
        companyAdmin ||
        (callerProfile?.role === 'campaign_manager' &&
          (await hasPermission(
            admin,
            {
              userId: user.id,
              companyId: callerProfile.company_id ?? '',
              platformAdmin: false,
              companyAdmin: false,
            },
            'invite_members',
          )));
      if (!allowed) return jsonResponse({ error: 'forbidden' }, 403);
      if (action === 'invite' && body?.company_id !== callerProfile?.company_id) {
        return jsonResponse({ error: 'can only invite into your own company' }, 403);
      }
      if (action === 'resend') {
        const { data: target } = await admin
          .from('company_invites')
          .select('company_id')
          .eq('id', body?.invite_id ?? '')
          .maybeSingle();
        if (target?.company_id !== callerProfile?.company_id) {
          return jsonResponse({ error: 'forbidden' }, 403);
        }
      }
    }

    if (action === 'invite') return await handleInvite(admin, user, body ?? {});
    return await handleResend(admin, body ?? {});
  } catch (e) {
    console.error('invite-campaign-manager failed', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
