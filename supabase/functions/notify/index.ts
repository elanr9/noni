import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';
import {
  adminPushTokens,
  creatorPushTokens,
  sendExpoPush,
  type PushMessage,
} from '../_shared/push.ts';

type NotifyEvent =
  | 'submitted'
  | 'approved'
  | 'changes_requested'
  | 'comment'
  | 'published'
  | 'message'
  | 'account_submitted'
  | 'account_decided'
  | 'music_pending'
  | 'music_approved'
  | 'post_live';

type NotifyBody = {
  task_id?: string;
  assignment_id?: string;
  campaign_id?: string;
  creator_id?: string;
  /** account_decided only. */
  status?: 'approved' | 'needs_changes';
  event: NotifyEvent;
};

const EVENTS: NotifyEvent[] = [
  'submitted',
  'approved',
  'changes_requested',
  'comment',
  'published',
  'message',
  'account_submitted',
  'account_decided',
  'music_pending',
  'music_approved',
  'post_live',
];

type Caller = { userId: string; companyId: string; role: string };

/** Normalized subject: works for a content task or an assignment. */
type Subject = {
  title: string;
  company_id: string;
  creator_id: string | null;
  data: Record<string, string>;
};

async function resolveSubject(
  admin: SupabaseClient,
  body: NotifyBody,
): Promise<Subject | null> {
  if (body.assignment_id) {
    const { data: assignment } = await admin
      .from('assignments')
      .select('id, company_id, creator_id, briefs:brief_id ( title )')
      .eq('id', body.assignment_id)
      .maybeSingle();
    if (!assignment) return null;
    const brief = Array.isArray(assignment.briefs)
      ? assignment.briefs[0]
      : assignment.briefs;
    return {
      title: (brief?.title as string | undefined) ?? 'Your post',
      company_id: assignment.company_id as string,
      creator_id: assignment.creator_id as string,
      data: { assignment_id: assignment.id as string },
    };
  }
  const { data: task } = await admin
    .from('content_tasks')
    .select('id, title, company_id, assigned_to')
    .eq('id', body.task_id!)
    .maybeSingle();
  if (!task) return null;
  return {
    title: task.title as string,
    company_id: task.company_id as string,
    creator_id: task.assigned_to as string | null,
    data: { task_id: task.id as string },
  };
}

/**
 * post_live: the creator's post went through Upload-Post. Deep links to both
 * platforms ride in the data payload; the body names whichever are live.
 */
async function postLiveMessage(
  admin: SupabaseClient,
  subject: Subject,
): Promise<PushMessage> {
  let query = admin.from('posts').select('platform, post_url');
  if (subject.data.assignment_id) {
    query = query.eq('assignment_id', subject.data.assignment_id);
  } else {
    query = query.eq('task_id', subject.data.task_id).is('assignment_id', null);
  }
  const { data: posts } = await query;

  const urls: Record<string, string> = {};
  for (const post of posts ?? []) {
    if (post.platform && post.post_url) {
      urls[`${post.platform}_url`] = post.post_url as string;
    }
  }
  const platforms = (posts ?? [])
    .filter((p) => p.post_url)
    .map((p) => p.platform as string);
  const where =
    platforms.length > 0
      ? `Live on ${platforms.join(' and ')}. Tap to open.`
      : 'It is posting now. Links will follow.';
  return {
    title: 'Your post went live',
    body: `"${subject.title}" is out. ${where}`,
    data: { ...subject.data, ...urls, event: 'post_live' },
  };
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const body = (await req.json().catch(() => null)) as NotifyBody | null;
  if (!body || !EVENTS.includes(body.event)) {
    return jsonResponse(
      { error: 'expected { task_id | assignment_id | campaign_id, event }' },
      400,
    );
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Caller must be an authenticated member of the subject's company.
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: userData } = await admin.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (!userData?.user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile) return jsonResponse({ error: 'forbidden' }, 403);
  const caller: Caller = {
    userId: userData.user.id,
    companyId: profile.company_id as string,
    role: profile.role as string,
  };

  try {
    // Campaign-level: new week published, admin -> one creator.
    if (body.event === 'published') {
      if (!body.campaign_id || !body.creator_id) {
        return jsonResponse(
          { error: 'published event expects { campaign_id, creator_id }' },
          400,
        );
      }
      const { data: campaign } = await admin
        .from('campaigns')
        .select('id, company_id')
        .eq('id', body.campaign_id)
        .maybeSingle();
      if (!campaign) return jsonResponse({ error: 'campaign not found' }, 404);
      if (caller.companyId !== campaign.company_id || caller.role !== 'admin') {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      const tokens = await creatorPushTokens(
        admin,
        body.creator_id,
        campaign.company_id as string,
      );
      const sent = await sendExpoPush(tokens, {
        title: 'New week is live',
        body: 'Your posts for this week are ready',
        data: { campaign_id: campaign.id, event: body.event },
      });
      return jsonResponse({ sent });
    }

    // Creator-level: messaging thread and account approval, no task subject.
    if (
      body.event === 'message' ||
      body.event === 'account_submitted' ||
      body.event === 'account_decided'
    ) {
      const creatorId =
        body.creator_id ?? (caller.role === 'admin' ? null : caller.userId);
      if (!creatorId) {
        return jsonResponse({ error: `${body.event} expects { creator_id }` }, 400);
      }
      // Creators may only fire events about their own thread and account.
      if (caller.role !== 'admin' && creatorId !== caller.userId) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      const { data: creator } = await admin
        .from('profiles')
        .select('id, full_name, company_id')
        .eq('id', creatorId)
        .maybeSingle();
      if (!creator || creator.company_id !== caller.companyId) {
        return jsonResponse({ error: 'creator not found' }, 404);
      }
      const name = (creator.full_name as string | null) ?? 'A creator';

      if (body.event === 'account_submitted') {
        const tokens = await adminPushTokens(admin, caller.companyId);
        const sent = await sendExpoPush(tokens, {
          title: 'Account submitted',
          body: `${name} submitted their accounts for approval`,
          data: { creator_id: creatorId, event: body.event },
        });
        return jsonResponse({ sent });
      }

      // account_decided: admin's verdict back to the creator.
      if (body.event === 'account_decided') {
        if (caller.role !== 'admin') {
          return jsonResponse({ error: 'forbidden' }, 403);
        }
        const approved = body.status === 'approved';
        const tokens = await creatorPushTokens(admin, creatorId, caller.companyId);
        const sent = await sendExpoPush(tokens, {
          title: approved ? 'Accounts approved' : 'Accounts need changes',
          body: approved
            ? 'Your accounts passed review. You can be assigned posts now.'
            : 'Open account setup to see what to fix and resubmit.',
          data: { creator_id: creatorId, event: body.event },
        });
        return jsonResponse({ sent });
      }

      // message: creator -> admins; admin -> that creator's thread.
      const tokens =
        caller.role === 'admin'
          ? await creatorPushTokens(admin, creatorId, caller.companyId)
          : await adminPushTokens(admin, caller.companyId);
      const sent = await sendExpoPush(tokens, {
        title: caller.role === 'admin' ? 'New message' : `Message from ${name}`,
        body:
          caller.role === 'admin'
            ? 'You have a new message'
            : `${name} sent you a message`,
        data: { creator_id: creatorId, event: body.event },
      });
      return jsonResponse({ sent });
    }

    // Everything else is keyed by an assignment or a legacy content task.
    if (!body.task_id && !body.assignment_id) {
      return jsonResponse(
        { error: 'expected { task_id | assignment_id, event }' },
        400,
      );
    }
    const subject = await resolveSubject(admin, body);
    if (!subject) return jsonResponse({ error: 'subject not found' }, 404);
    if (caller.companyId !== subject.company_id) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    // Admin-bound events.
    if (
      body.event === 'submitted' ||
      body.event === 'music_pending' ||
      (body.event === 'comment' && caller.role !== 'admin')
    ) {
      const tokens = await adminPushTokens(admin, subject.company_id);
      const message: PushMessage =
        body.event === 'submitted'
          ? {
              title: 'New submission',
              body: `"${subject.title}" is ready for review`,
              data: { ...subject.data, event: body.event },
            }
          : body.event === 'music_pending'
            ? {
                title: 'Music approval pending',
                body: `"${subject.title}" has its song on. Confirm it.`,
                data: { ...subject.data, event: body.event },
              }
            : {
                title: 'New comment',
                body: `"${subject.title}" has a new comment`,
                data: { ...subject.data, event: body.event },
              };
      const sent = await sendExpoPush(tokens, message);
      return jsonResponse({ sent });
    }

    // Creator-bound events.
    if (!subject.creator_id) return jsonResponse({ sent: 0 });
    const tokens = await creatorPushTokens(
      admin,
      subject.creator_id,
      subject.company_id,
    );

    let message: PushMessage;
    if (body.event === 'post_live') {
      message = await postLiveMessage(admin, subject);
    } else if (body.event === 'music_approved') {
      message = {
        title: 'Music approved',
        body: `"${subject.title}" is done. Earnings unlocked.`,
        data: { ...subject.data, event: body.event },
      };
    } else if (body.event === 'approved') {
      message = {
        title: 'Approved',
        body: `"${subject.title}" was approved`,
        data: { ...subject.data, event: body.event },
      };
    } else if (body.event === 'changes_requested') {
      message = {
        title: 'Changes requested',
        body: `"${subject.title}" needs another take`,
        data: { ...subject.data, event: body.event },
      };
    } else {
      message = {
        title: 'New comment',
        body: `"${subject.title}" has a new comment`,
        data: { ...subject.data, event: body.event },
      };
    }

    const sent = await sendExpoPush(tokens, message);
    return jsonResponse({ sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 502);
  }
});
