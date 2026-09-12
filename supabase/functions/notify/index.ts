import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/wp8.ts';
import {
  adminPushTokens,
  creatorPushTokens,
  mutedProfileIds,
  sendExpoPush,
  tokensForProfiles,
  MANAGER_ROLES,
  type PushMessage,
} from '../_shared/push.ts';

type NotifyEvent =
  | 'submitted'
  | 'approved'
  | 'changes_requested'
  | 'comment'
  | 'published'
  | 'message'
  | 'manager_message'
  | 'account_submitted'
  | 'account_decided'
  | 'music_pending'
  | 'music_approved'
  | 'music_changes'
  | 'post_live'
  | 'streak_bonus'
  | 'streak_progress'
  | 'company_topup'
  | 'credits_low'
  | 'bounty_earned';

type NotifyBody = {
  task_id?: string;
  assignment_id?: string;
  campaign_id?: string;
  creator_id?: string;
  company_id?: string;
  /** account_submitted only, so the tap opens the review screen. */
  account_id?: string;
  /** account_decided only. */
  status?: 'approved' | 'needs_changes';
  /** streak_bonus / streak_progress / bounty_earned / company_topup. */
  streak?: number;
  days?: number;
  amount_cents?: number;
  /** manager_message only. */
  chat_id?: string;
  /** message / manager_message: first line of the message. */
  preview?: string;
  event: NotifyEvent;
};

const EVENTS: NotifyEvent[] = [
  'submitted',
  'approved',
  'changes_requested',
  'comment',
  'published',
  'message',
  'manager_message',
  'account_submitted',
  'account_decided',
  'music_pending',
  'music_approved',
  'music_changes',
  'post_live',
  'streak_bonus',
  'streak_progress',
  'company_topup',
  'credits_low',
  'bounty_earned',
];

const SERVICE_EVENTS: NotifyEvent[] = [
  'company_topup',
  'credits_low',
  'bounty_earned',
  'post_live',
];

const ET = 'America/New_York';

function formatCentsLabel(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function previewText(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

/** "{title} posts today at 12:00 PM." or "{title} posts Tue at 9:00 AM." in ET. */
function approvedBody(title: string, publishAt: string | null): string {
  if (!publishAt) return `${title} is approved.`;
  const at = new Date(publishAt);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  if (dayKey.format(at) === dayKey.format(new Date())) {
    return `${title} posts today at ${time}.`;
  }
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'short',
  }).format(at);
  return `${title} posts ${weekday} at ${time}.`;
}

type Caller = {
  userId: string;
  companyId: string;
  role: string;
  name: string | null;
};

/** Normalized subject: works for a content task or an assignment. */
type Subject = {
  title: string;
  company_id: string;
  creator_id: string | null;
  publish_at: string | null;
  format: string | null;
  data: Record<string, string>;
};

async function resolveSubject(
  admin: SupabaseClient,
  body: NotifyBody,
): Promise<Subject | null> {
  if (body.assignment_id) {
    const { data: assignment } = await admin
      .from('assignments')
      .select('id, company_id, creator_id, publish_at, briefs:brief_id ( title, format )')
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
      publish_at: (assignment.publish_at as string | null) ?? null,
      format: (brief?.format as string | undefined) ?? null,
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
    publish_at: null,
    format: null,
    data: { task_id: task.id as string },
  };
}

async function profileName(
  admin: SupabaseClient,
  profileId: string | null,
  fallback: string,
): Promise<string> {
  if (!profileId) return fallback;
  const { data } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .maybeSingle();
  return (data?.full_name as string | null) ?? fallback;
}

/** post_live: platform deep links ride in the data payload. */
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
  const needsMusic = subject.format === 'photo_carousel';
  return {
    title: 'Your post is live',
    body: needsMusic
      ? `Time to add the music to ${subject.title}.`
      : `${subject.title} just posted.`,
    data: {
      ...subject.data,
      ...urls,
      event: 'post_live',
      ...(needsMusic ? { music: '1' } : {}),
    },
  };
}

type ManagerChat = {
  id: string;
  company_id: string;
  kind: 'brief' | 'dm' | 'channel';
  campaign_id: string | null;
  user_a: string | null;
  user_b: string | null;
  name: string | null;
  all_creators: boolean;
  created_by: string | null;
};

async function managerChatRecipients(
  admin: SupabaseClient,
  chat: ManagerChat,
): Promise<{ ids: Set<string>; title: string }> {
  const ids = new Set<string>();

  if (chat.kind === 'dm') {
    if (chat.user_a) ids.add(chat.user_a);
    if (chat.user_b) ids.add(chat.user_b);
    return { ids, title: '' };
  }

  if (chat.kind === 'brief') {
    const { data: managers } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', chat.company_id)
      .in('role', MANAGER_ROLES);
    for (const m of managers ?? []) ids.add(m.id as string);

    let title = 'Brief chat';
    if (chat.campaign_id) {
      const { data: assigned } = await admin
        .from('assignments')
        .select('creator_id')
        .eq('company_id', chat.company_id)
        .eq('campaign_id', chat.campaign_id);
      for (const a of assigned ?? []) ids.add(a.creator_id as string);

      const { data: campaign } = await admin
        .from('campaigns')
        .select('week_number')
        .eq('id', chat.campaign_id)
        .maybeSingle();
      if (typeof campaign?.week_number === 'number') {
        title = `Week ${campaign.week_number} brief`;
      }
    }
    return { ids, title };
  }

  // channel
  const { data: members } = await admin
    .from('manager_chat_members')
    .select('profile_id')
    .eq('chat_id', chat.id);
  for (const m of members ?? []) ids.add(m.profile_id as string);
  if (chat.created_by) ids.add(chat.created_by);

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, role, can_create')
    .eq('company_id', chat.company_id);
  for (const p of profiles ?? []) {
    const role = p.role as string;
    const canCreate = Boolean(p.can_create);
    if (role === 'company_admin') ids.add(p.id as string);
    if (chat.all_creators && (role === 'creator' || canCreate)) {
      ids.add(p.id as string);
    }
  }
  return { ids, title: `#${chat.name ?? 'channel'}` };
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

  const cronSecret = Deno.env.get('CRON_SECRET');
  const cronHeader = req.headers.get('x-cron-secret');
  const isService =
    Boolean(cronSecret && cronHeader && cronHeader === cronSecret);

  let caller: Caller | null = null;
  if (!isService) {
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
      .select('company_id, role, full_name')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!profile) return jsonResponse({ error: 'forbidden' }, 403);
    // Company admins and the platform admin act as campaign managers inside
    // their own company, same as the is_campaign_manager() SQL helper.
    const role = profile.role as string;
    caller = {
      userId: userData.user.id,
      companyId: profile.company_id as string,
      role: MANAGER_ROLES.includes(role) ? 'campaign_manager' : role,
      name: (profile.full_name as string | null) ?? null,
    };
  } else if (!SERVICE_EVENTS.includes(body.event)) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  try {
    // Service / admin credit events (prepaid balance).
    if (
      body.event === 'company_topup' ||
      body.event === 'credits_low' ||
      body.event === 'bounty_earned'
    ) {
      const companyId = body.company_id ?? caller?.companyId;
      if (!companyId) {
        return jsonResponse({ error: `${body.event} expects { company_id }` }, 400);
      }
      if (caller && caller.companyId !== companyId) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }

      if (body.event === 'credits_low') {
        const tokens = await adminPushTokens(admin, companyId);
        const sent = await sendExpoPush(tokens, {
          title: 'Credits low',
          body: 'Add credits to keep paying bounties.',
          data: { event: body.event, company_id: companyId },
        });
        return jsonResponse({ sent });
      }

      if (body.event === 'company_topup') {
        const amountCents =
          typeof body.amount_cents === 'number' ? body.amount_cents : 0;
        const tokens = await adminPushTokens(admin, companyId);
        const sent = await sendExpoPush(tokens, {
          title: 'Credits added',
          body:
            amountCents > 0
              ? `${formatCentsLabel(amountCents)} added to your credits.`
              : 'Credits were added to your account.',
          data: {
            event: body.event,
            company_id: companyId,
            amount_cents: String(amountCents),
          },
        });
        return jsonResponse({ sent });
      }

      // bounty_earned
      const creatorId = body.creator_id;
      if (!creatorId) {
        return jsonResponse({ error: 'bounty_earned expects { creator_id }' }, 400);
      }
      const amountCents =
        typeof body.amount_cents === 'number' ? body.amount_cents : 0;
      const tokens = await creatorPushTokens(admin, creatorId, companyId);
      const sent = await sendExpoPush(tokens, {
        title: 'Bounty paid',
        body: `${formatCentsLabel(amountCents)} just hit your wallet.`,
        data: {
          event: body.event,
          creator_id: creatorId,
          assignment_id: body.assignment_id ?? null,
          amount_cents: String(amountCents),
        },
      });
      return jsonResponse({ sent });
    }

    // From here only post_live may run without a user caller (cron).
    if (!caller && body.event !== 'post_live') {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    // Campaign-level: new week published, admin -> one creator.
    if (body.event === 'published') {
      if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
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
      if (caller.companyId !== campaign.company_id || caller.role !== 'campaign_manager') {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      const tokens = await creatorPushTokens(
        admin,
        body.creator_id,
        campaign.company_id as string,
      );
      const sent = await sendExpoPush(tokens, {
        title: 'New week is live',
        body: 'Your posts for this week are ready.',
        data: { campaign_id: campaign.id, event: body.event },
      });
      return jsonResponse({ sent });
    }

    // Manager chats: brief threads, manager DMs, channels.
    if (body.event === 'manager_message') {
      if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
      if (!body.chat_id) {
        return jsonResponse({ error: 'manager_message expects { chat_id }' }, 400);
      }
      const { data: chatRow } = await admin
        .from('manager_chats')
        .select('id, company_id, kind, campaign_id, user_a, user_b, name, all_creators, created_by')
        .eq('id', body.chat_id)
        .maybeSingle();
      if (!chatRow) return jsonResponse({ error: 'chat not found' }, 404);
      const chat = chatRow as ManagerChat;
      if (chat.company_id !== caller.companyId) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }

      const sender = caller.name ?? 'Someone';
      const preview = previewText(body.preview);
      const { ids, title } = await managerChatRecipients(admin, chat);
      const muted = await mutedProfileIds(admin, { chatId: chat.id });
      ids.delete(caller.userId);
      for (const id of muted) ids.delete(id);

      const message: PushMessage =
        chat.kind === 'dm'
          ? {
              title: sender,
              body: preview ?? 'Sent you a message.',
              data: { event: body.event, chat_id: chat.id },
            }
          : {
              title,
              body: preview ? `${sender}: ${preview}` : `${sender} sent a message.`,
              data: { event: body.event, chat_id: chat.id },
            };
      const tokens = await tokensForProfiles(admin, [...ids]);
      const sent = await sendExpoPush(tokens, message);
      return jsonResponse({ sent });
    }

    // Creator-level: messaging, account approval, streak rewards.
    if (
      body.event === 'message' ||
      body.event === 'account_submitted' ||
      body.event === 'account_decided' ||
      body.event === 'streak_bonus' ||
      body.event === 'streak_progress'
    ) {
      if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
      const creatorId =
        body.creator_id ?? (caller.role === 'campaign_manager' ? null : caller.userId);
      if (!creatorId) {
        return jsonResponse({ error: `${body.event} expects { creator_id }` }, 400);
      }
      // Creators may only fire events about their own thread and account.
      if (caller.role !== 'campaign_manager' && creatorId !== caller.userId) {
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
          title: 'Accounts ready to review',
          body: `${name} submitted their TikTok and Instagram.`,
          data: {
            creator_id: creatorId,
            event: body.event,
            ...(body.account_id ? { account_id: body.account_id } : {}),
          },
        });
        return jsonResponse({ sent });
      }

      // account_decided: admin's verdict back to the creator.
      if (body.event === 'account_decided') {
        if (caller.role !== 'campaign_manager') {
          return jsonResponse({ error: 'forbidden' }, 403);
        }
        const approved = body.status === 'approved';
        const tokens = await creatorPushTokens(admin, creatorId, caller.companyId);
        const sent = await sendExpoPush(tokens, {
          title: approved ? 'Accounts approved' : 'Accounts need changes',
          body: approved
            ? 'You are all set. Posts will start showing up.'
            : 'Open account setup to see what to fix.',
          data: { creator_id: creatorId, event: body.event },
        });
        return jsonResponse({ sent });
      }

      if (body.event === 'streak_bonus' || body.event === 'streak_progress') {
        const amountCents =
          typeof body.amount_cents === 'number' ? body.amount_cents : 0;
        const amountLabel = formatCentsLabel(amountCents);
        const tokens = await creatorPushTokens(admin, creatorId, caller.companyId);
        if (body.event === 'streak_bonus') {
          const streak = typeof body.streak === 'number' ? body.streak : 0;
          const sent = await sendExpoPush(tokens, {
            title: `${amountLabel} streak bonus`,
            body: `${streak} day streak locked in. It is in your wallet.`,
            data: {
              creator_id: creatorId,
              event: body.event,
              streak: String(streak),
              amount_cents: String(amountCents),
            },
          });
          return jsonResponse({ sent });
        }
        const days = typeof body.days === 'number' ? body.days : 0;
        const sent = await sendExpoPush(tokens, {
          title: `${amountLabel} almost yours`,
          body: `Post tomorrow to lock in your ${days} day streak bonus.`,
          data: {
            creator_id: creatorId,
            event: body.event,
            days: String(days),
            amount_cents: String(amountCents),
          },
        });
        return jsonResponse({ sent });
      }

      // message: creator -> managers (minus mutes); manager -> that creator.
      const preview = previewText(body.preview);
      const fromManager = caller.role === 'campaign_manager';
      const tokens = fromManager
        ? await creatorPushTokens(admin, creatorId, caller.companyId)
        : await adminPushTokens(
            admin,
            caller.companyId,
            await mutedProfileIds(admin, { creatorId }),
          );
      const sent = await sendExpoPush(tokens, {
        title: fromManager ? (caller.name ?? 'Your manager') : name,
        body: preview ?? 'Sent you a message.',
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
    if (caller && caller.companyId !== subject.company_id) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    // Manager-bound events.
    if (
      body.event === 'submitted' ||
      body.event === 'music_pending' ||
      (body.event === 'comment' && caller?.role !== 'campaign_manager')
    ) {
      const tokens = await adminPushTokens(admin, subject.company_id);
      let message: PushMessage;
      if (body.event === 'submitted') {
        const creatorName = await profileName(admin, subject.creator_id, 'A creator');
        message = {
          title: 'New post to review',
          body: `${creatorName} submitted ${subject.title}.`,
          data: { ...subject.data, event: body.event },
        };
      } else if (body.event === 'music_pending') {
        const creatorName = await profileName(admin, subject.creator_id, 'A creator');
        message = {
          title: 'Music ready to review',
          body: `${creatorName} added music to ${subject.title}.`,
          data: { ...subject.data, event: body.event },
        };
      } else {
        message = {
          title: 'New comment',
          body: `${subject.title} has a new comment.`,
          data: { ...subject.data, event: body.event },
        };
      }
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
        body: 'Your music got approved, time to start earning!',
        data: { ...subject.data, event: body.event },
      };
    } else if (body.event === 'music_changes') {
      message = {
        title: 'Music needs changes',
        body: `Open ${subject.title} to see what to fix.`,
        data: { ...subject.data, event: body.event },
      };
    } else if (body.event === 'approved') {
      message = {
        title: 'Post approved',
        body: approvedBody(subject.title, subject.publish_at),
        data: { ...subject.data, event: body.event },
      };
    } else if (body.event === 'changes_requested') {
      message = {
        title: 'Changes requested',
        body: `${subject.title} needs another take. Open it to see the notes.`,
        data: { ...subject.data, event: body.event },
      };
    } else {
      message = {
        title: 'New comment',
        body: `${subject.title} has a new comment.`,
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
