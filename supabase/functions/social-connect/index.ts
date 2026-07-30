import { createClient } from 'npm:@supabase/supabase-js@2';

type Body = {
  action: 'status' | 'connect_url' | 'team_status';
  creator_id?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function uploadPostKey(): string {
  const key = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!key) throw new Error('UPLOAD_POST_API_KEY missing');
  return key;
}

function profileUsernameFor(userId: string): string {
  return `c_${userId.replaceAll('-', '').slice(0, 20)}`;
}

async function ensureUploadPostProfile(
  apiKey: string,
  admin: ReturnType<typeof createClient>,
  userId: string,
  existing: string | null,
): Promise<string> {
  if (existing) return existing;
  const username = profileUsernameFor(userId);
  const createRes = await fetch(
    'https://api.upload-post.com/api/uploadposts/users',
    {
      method: 'POST',
      headers: {
        Authorization: `Apikey ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    },
  );
  if (!createRes.ok && createRes.status !== 409) {
    const detail = await createRes.json().catch(() => null);
    throw new Error(
      `could not create upload-post profile: ${JSON.stringify(detail)}`,
    );
  }
  const { error } = await admin
    .from('profiles')
    .update({ upload_post_profile: username })
    .eq('id', userId);
  if (error) throw error;
  return username;
}

async function fetchSocialAccounts(
  apiKey: string,
  profileUser: string,
): Promise<Record<string, unknown>> {
  const listRes = await fetch(
    'https://api.upload-post.com/api/uploadposts/users',
    { headers: { Authorization: `Apikey ${apiKey}` } },
  );
  const listJson = (await listRes.json()) as {
    profiles?: Array<{
      username: string;
      social_accounts?: Record<string, unknown>;
    }>;
  };
  const profile = (listJson.profiles ?? []).find(
    (p) => p.username === profileUser,
  );
  return profile?.social_accounts ?? {};
}

Deno.serve(async (req) => {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    if (
      !body?.action ||
      !['status', 'connect_url', 'team_status'].includes(body.action)
    ) {
      return jsonResponse(
        { error: 'expected { action: status|connect_url|team_status }' },
        400,
      );
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: userData } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (!userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

    const { data: caller } = await admin
      .from('profiles')
      .select('id, company_id, role, upload_post_profile, full_name')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!caller) return jsonResponse({ error: 'forbidden' }, 403);

    const apiKey = uploadPostKey();

    if (body.action === 'team_status') {
      if (caller.role !== 'admin') {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      const { data: creators } = await admin
        .from('profiles')
        .select('id, full_name, role, upload_post_profile')
        .eq('company_id', caller.company_id)
        .eq('role', 'creator')
        .order('full_name');

      const members = [];
      for (const c of creators ?? []) {
        const social_accounts = c.upload_post_profile
          ? await fetchSocialAccounts(apiKey, c.upload_post_profile)
          : {};
        members.push({
          id: c.id,
          full_name: c.full_name,
          profile: c.upload_post_profile,
          social_accounts,
        });
      }
      return jsonResponse({ members });
    }

    // Creators manage their own accounts. Admins may inspect a creator via creator_id.
    let targetId = caller.id;
    if (caller.role === 'admin' && body.creator_id) {
      const { data: target } = await admin
        .from('profiles')
        .select('id, company_id, upload_post_profile')
        .eq('id', body.creator_id)
        .maybeSingle();
      if (!target || target.company_id !== caller.company_id) {
        return jsonResponse({ error: 'creator not found' }, 404);
      }
      targetId = target.id;
    } else if (caller.role === 'admin' && body.action === 'connect_url') {
      return jsonResponse(
        {
          error:
            'Creators connect their own socials. Open team status to see who is linked.',
        },
        400,
      );
    } else if (caller.role !== 'creator' && caller.role !== 'admin') {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const { data: target } = await admin
      .from('profiles')
      .select('id, upload_post_profile, full_name')
      .eq('id', targetId)
      .single();

    if (body.action === 'status') {
      if (!target.upload_post_profile) {
        return jsonResponse({
          profile: null,
          social_accounts: {},
          full_name: target.full_name,
        });
      }
      const social_accounts = await fetchSocialAccounts(
        apiKey,
        target.upload_post_profile,
      );
      return jsonResponse({
        profile: target.upload_post_profile,
        social_accounts,
        full_name: target.full_name,
      });
    }

    // connect_url — creator only (enforced above for admins without creator_id path)
    if (caller.role !== 'creator' || targetId !== caller.id) {
      return jsonResponse({ error: 'only the creator can connect their socials' }, 403);
    }

    const profileUser = await ensureUploadPostProfile(
      apiKey,
      admin,
      caller.id,
      target.upload_post_profile,
    );

    const jwtRes = await fetch(
      'https://api.upload-post.com/api/uploadposts/users/generate-jwt',
      {
        method: 'POST',
        headers: {
          Authorization: `Apikey ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: profileUser,
          platforms: ['tiktok', 'instagram'],
          show_calendar: false,
          connect_title: 'Connect your accounts',
          connect_description:
            'Link TikTok and Instagram so approved content can post to your accounts.',
        }),
      },
    );
    const jwtJson = (await jwtRes.json()) as {
      success?: boolean;
      access_url?: string;
      message?: string;
    };
    if (!jwtRes.ok || !jwtJson.access_url) {
      return jsonResponse(
        { error: 'could not generate connect url', detail: jwtJson },
        502,
      );
    }
    return jsonResponse({
      profile: profileUser,
      access_url: jwtJson.access_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
