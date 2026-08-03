import { createClient } from 'npm:@supabase/supabase-js@2';

type NotifyEvent =
  | 'submitted'
  | 'approved'
  | 'changes_requested'
  | 'comment'
  | 'published';

type NotifyBody = {
  task_id?: string;
  assignment_id?: string;
  campaign_id?: string;
  creator_id?: string;
  event: NotifyEvent;
};

const EVENTS: NotifyEvent[] = [
  'submitted',
  'approved',
  'changes_requested',
  'comment',
  'published',
];

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const body = (await req.json().catch(() => null)) as NotifyBody | null;
  if (!body || !EVENTS.includes(body.event)) {
    return jsonResponse(
      { error: 'expected { task_id | assignment_id | campaign_id, event }' },
      400,
    );
  }
  if (body.event === 'published') {
    if (!body.campaign_id || !body.creator_id) {
      return jsonResponse(
        { error: 'published event expects { campaign_id, creator_id }' },
        400,
      );
    }
  } else if (!body.task_id && !body.assignment_id) {
    return jsonResponse({ error: 'expected { task_id | assignment_id, event }' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Caller must be an authenticated member of the task's company.
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: userData } = await admin.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (!userData?.user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  if (body.event === 'published') {
    const { data: campaign } = await admin
      .from('campaigns')
      .select('id, company_id')
      .eq('id', body.campaign_id!)
      .maybeSingle();
    if (!campaign) {
      return jsonResponse({ error: 'campaign not found' }, 404);
    }

    const { data: publishCaller } = await admin
      .from('profiles')
      .select('company_id, role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (
      publishCaller?.company_id !== campaign.company_id ||
      publishCaller.role !== 'admin'
    ) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const { data: creator } = await admin
      .from('profiles')
      .select('expo_push_token')
      .eq('id', body.creator_id!)
      .eq('company_id', campaign.company_id)
      .maybeSingle();
    if (!creator?.expo_push_token) {
      return jsonResponse({ sent: 0 });
    }

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          to: creator.expo_push_token,
          title: 'New week is live',
          body: 'Your posts for this week are ready',
          data: { campaign_id: campaign.id, event: body.event },
        },
      ]),
    });
    if (!pushRes.ok) {
      const detail = await pushRes.text();
      return jsonResponse({ error: 'expo push failed', detail }, 502);
    }
    return jsonResponse({ sent: 1 });
  }

  // Normalized subject: works for a content task or an assignment.
  let subject: {
    title: string;
    company_id: string;
    creator_id: string | null;
    data: Record<string, string>;
  };

  if (body.assignment_id) {
    const { data: assignment } = await admin
      .from('assignments')
      .select('id, company_id, creator_id, briefs:brief_id ( title )')
      .eq('id', body.assignment_id)
      .maybeSingle();
    if (!assignment) {
      return jsonResponse({ error: 'assignment not found' }, 404);
    }
    const brief = Array.isArray(assignment.briefs)
      ? assignment.briefs[0]
      : assignment.briefs;
    subject = {
      title: brief?.title ?? 'Your post',
      company_id: assignment.company_id,
      creator_id: assignment.creator_id,
      data: { assignment_id: assignment.id },
    };
  } else {
    const { data: task } = await admin
      .from('content_tasks')
      .select('id, title, company_id, assigned_to')
      .eq('id', body.task_id!)
      .maybeSingle();
    if (!task) {
      return jsonResponse({ error: 'task not found' }, 404);
    }
    subject = {
      title: task.title,
      company_id: task.company_id,
      creator_id: task.assigned_to,
      data: { task_id: task.id },
    };
  }

  const { data: caller } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (caller?.company_id !== subject.company_id) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  let tokens: string[] = [];
  let title = '';
  let message = '';

  if (body.event === 'submitted' || (body.event === 'comment' && caller.role !== 'admin')) {
    const { data: admins } = await admin
      .from('profiles')
      .select('expo_push_token')
      .eq('company_id', subject.company_id)
      .eq('role', 'admin')
      .not('expo_push_token', 'is', null);
    tokens = (admins ?? [])
      .map((p) => p.expo_push_token)
      .filter((t): t is string => Boolean(t));
    if (body.event === 'submitted') {
      title = 'New submission';
      message = `"${subject.title}" is ready for review`;
    } else {
      title = 'New comment';
      message = `"${subject.title}" has a new comment`;
    }
  } else if (subject.creator_id) {
    const { data: creator } = await admin
      .from('profiles')
      .select('expo_push_token')
      .eq('id', subject.creator_id)
      .maybeSingle();
    if (creator?.expo_push_token) tokens = [creator.expo_push_token];
    if (body.event === 'approved') {
      title = 'Approved';
      message = `"${subject.title}" was approved`;
    } else if (body.event === 'changes_requested') {
      title = 'Changes requested';
      message = `"${subject.title}" needs another take`;
    } else {
      title = 'New comment';
      message = `"${subject.title}" has a new comment`;
    }
  }

  if (tokens.length === 0) {
    return jsonResponse({ sent: 0 });
  }

  const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title,
        body: message,
        data: { ...subject.data, event: body.event },
      })),
    ),
  });
  if (!pushResponse.ok) {
    const detail = await pushResponse.text();
    return jsonResponse({ error: 'expo push failed', detail }, 502);
  }

  return jsonResponse({ sent: tokens.length });
});
