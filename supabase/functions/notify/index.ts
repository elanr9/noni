import { createClient } from 'npm:@supabase/supabase-js@2';

type NotifyEvent = 'submitted' | 'approved' | 'changes_requested' | 'comment';

type NotifyBody = {
  task_id: string;
  event: NotifyEvent;
};

const EVENTS: NotifyEvent[] = [
  'submitted',
  'approved',
  'changes_requested',
  'comment',
];

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const body = (await req.json().catch(() => null)) as NotifyBody | null;
  if (!body?.task_id || !EVENTS.includes(body.event)) {
    return jsonResponse({ error: 'expected { task_id, event }' }, 400);
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

  const { data: task } = await admin
    .from('content_tasks')
    .select('id, title, company_id, assigned_to')
    .eq('id', body.task_id)
    .maybeSingle();
  if (!task) {
    return jsonResponse({ error: 'task not found' }, 404);
  }

  const { data: caller } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (caller?.company_id !== task.company_id) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  let tokens: string[] = [];
  let title = '';
  let message = '';

  if (body.event === 'submitted' || (body.event === 'comment' && caller.role !== 'admin')) {
    const { data: admins } = await admin
      .from('profiles')
      .select('expo_push_token')
      .eq('company_id', task.company_id)
      .eq('role', 'admin')
      .not('expo_push_token', 'is', null);
    tokens = (admins ?? [])
      .map((p) => p.expo_push_token)
      .filter((t): t is string => Boolean(t));
    if (body.event === 'submitted') {
      title = 'New submission';
      message = `"${task.title}" is ready for review`;
    } else {
      title = 'New comment';
      message = `"${task.title}" has a new comment`;
    }
  } else if (task.assigned_to) {
    const { data: creator } = await admin
      .from('profiles')
      .select('expo_push_token')
      .eq('id', task.assigned_to)
      .maybeSingle();
    if (creator?.expo_push_token) tokens = [creator.expo_push_token];
    if (body.event === 'approved') {
      title = 'Approved';
      message = `"${task.title}" was approved`;
    } else if (body.event === 'changes_requested') {
      title = 'Changes requested';
      message = `"${task.title}" needs another take`;
    } else {
      title = 'New comment';
      message = `"${task.title}" has a new comment`;
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
        data: { task_id: task.id, event: body.event },
      })),
    ),
  });
  if (!pushResponse.ok) {
    const detail = await pushResponse.text();
    return jsonResponse({ error: 'expo push failed', detail }, 502);
  }

  return jsonResponse({ sent: tokens.length });
});
