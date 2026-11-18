// Deletes the signed-in user's own account. Used by both the campaign manager
// and creator apps (lib/account-api.ts deleteMyAccount).
//
// Refuses when the caller is the only company admin of a company that still
// has other members, so a team is never left without an owner. Otherwise it
// ends every membership, scrubs the profile, removes the avatar, then deletes
// the auth user. When company history still points at the profile with a
// NOT NULL key (prepare_account_deletion returns false) the auth user is soft
// deleted instead: the sign-in is gone for good and only a scrubbed
// "Deleted user" row remains.
//
// Body: {} or { dry_run: true } to only run the checks.
// Responses:
//   200 { deleted: true, mode: 'hard' | 'soft' }
//   200 { ok: true } for a dry run that would succeed
//   409 { error: 'sole_admin', companies: [name, ...] }

import { adminClient, handleCors, jsonResponse } from '../_shared/wp8.ts';

type Body = { dry_run?: boolean };

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const admin = adminClient();
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: auth } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  const user = auth?.user;
  if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;

  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('role, avatar_path')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role === 'admin') {
      return jsonResponse({ error: 'platform_admin', message: 'The platform admin account cannot be deleted from the app.' }, 403);
    }

    // Companies where the caller is an active company admin.
    const { data: adminRows, error: adminErr } = await admin
      .from('company_members')
      .select('company_id')
      .eq('profile_id', user.id)
      .eq('role', 'company_admin')
      .is('removed_at', null);
    if (adminErr) throw adminErr;

    const blocking: string[] = [];
    for (const row of adminRows ?? []) {
      const companyId = row.company_id as string;
      const { data: others, error } = await admin
        .from('company_members')
        .select('profile_id, role')
        .eq('company_id', companyId)
        .is('removed_at', null)
        .neq('profile_id', user.id);
      if (error) throw error;
      const list = others ?? [];
      if (list.length === 0) continue;
      if (list.some((m) => m.role === 'company_admin')) continue;
      const { data: company } = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
      blocking.push((company?.name as string | undefined) ?? 'your company');
    }
    if (blocking.length > 0) {
      return jsonResponse({ error: 'sole_admin', companies: blocking }, 409);
    }

    if (body.dry_run) return jsonResponse({ ok: true });

    const { data: hardOk, error: prepErr } = await admin.rpc('prepare_account_deletion', { p_user: user.id });
    if (prepErr) throw prepErr;

    const avatar = profile?.avatar_path as string | null | undefined;
    if (avatar) {
      await admin.storage.from('avatars').remove([avatar]).catch(() => undefined);
    }

    if (hardOk === true) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (!error) return jsonResponse({ deleted: true, mode: 'hard' });
      console.error('hard delete failed, soft deleting', error.message);
    }
    const { error: softErr } = await admin.auth.admin.deleteUser(user.id, true);
    if (softErr) throw softErr;
    return jsonResponse({ deleted: true, mode: 'soft' });
  } catch (e) {
    console.error('delete-account failed', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'delete failed' }, 500);
  }
});
