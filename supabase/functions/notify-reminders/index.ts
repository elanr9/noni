// Morning due-today / overdue pushes for creators. Hourly cron at :15; only
// acts in America/New_York hour 8–9. Account warm-up pushes fire in hour 14
// every 3 days starting 2026-09-28. Claims via creator_reminders insert so
// concurrent runs cannot double-send. One push per creator per kind per day.

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { adminRecipients, creatorRecipients, sendPush } from '../_shared/push.ts';
import { creatorLink, managerLink } from '../_shared/deep-link.ts';

const INCOMPLETE = ['assigned', 'recorded', 'changes_requested'] as const;
type ReminderKind = 'due_today' | 'overdue';

const SLOT_HOURS: Record<number, readonly number[]> = {
  1: [12],
  2: [12, 18],
  3: [10, 14, 19],
};
const WARMUP_START = '2026-09-28';
const WARMUP_TITLE = 'Warm up account time!';
const WARMUP_BODY =
  'Search college soccer recruiting, like, comment, save, and scroll for 10-15 minutes.';

function isWarmupDay(today: string): boolean {
  const [sy, sm, sd] = WARMUP_START.split('-').map(Number);
  const [y, m, d] = today.split('-').map(Number);
  const diff = Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86_400_000,
  );
  return diff >= 0 && diff % 3 === 0;
}

type WarmupResult = {
  warmup_skipped?: boolean;
  warmup_reason?: string;
  warmup_claimed: number;
  warmup_pushes: number;
  warmup_day: string;
};

async function sendAccountWarmup(
  admin: ReturnType<typeof adminClient>,
  forceCadence: boolean,
): Promise<WarmupResult> {
  const today = todayInTz('America/New_York');
  if (!forceCadence && !isWarmupDay(today)) {
    return {
      warmup_skipped: true,
      warmup_reason: 'not a warmup day',
      warmup_claimed: 0,
      warmup_pushes: 0,
      warmup_day: today,
    };
  }

  const creators: { id: string; company_id: string; expo_push_token: string | null }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('company_roster')
      .select('id, company_id, expo_push_token')
      .eq('member_role', 'creator')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    creators.push(...((data ?? []) as typeof creators));
    if (!data || data.length < pageSize) break;
  }

  const claimed = new Map<string, { profileId: string; token: string | null }[]>();
  let warmupClaimed = 0;
  for (const creator of creators) {
    const { error: claimError } = await admin.from('creator_reminders').insert({
      company_id: creator.company_id,
      creator_id: creator.id,
      kind: 'account_warmup',
      sent_on: today,
    });
    if (claimError) {
      if (claimError.code === '23505') continue;
      throw new Error(claimError.message);
    }
    warmupClaimed += 1;
    const list = claimed.get(creator.company_id) ?? [];
    list.push({ profileId: creator.id, token: creator.expo_push_token });
    claimed.set(creator.company_id, list);
  }

  let warmupPushes = 0;
  for (const [companyId, recipients] of claimed) {
    warmupPushes += await sendPush(admin, recipients, {
      title: WARMUP_TITLE,
      body: WARMUP_BODY,
      data: {
        event: 'account_warmup',
        company_id: companyId,
        deep_link: creatorLink(companyId, 'home'),
      },
    });
  }

  return {
    warmup_claimed: warmupClaimed,
    warmup_pushes: warmupPushes,
    warmup_day: today,
  };
}

function behindBody(count: number): string {
  if (count === 1) return '1 post overdue. Check in with them.';
  return `${count} posts overdue. Check in with them.`;
}

type AssignmentRow = {
  id: string;
  company_id: string;
  creator_id: string;
  scheduled_date: string;
  briefs: { title: string } | { title: string }[] | null;
};

function getNyHour(d = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
}

function todayInTz(tz: string, d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function briefTitle(row: AssignmentRow): string {
  const b = row.briefs;
  if (Array.isArray(b)) return b[0]?.title?.trim() || 'Untitled';
  return b?.title?.trim() || 'Untitled';
}

function dueTitle(streak: number): string {
  if (streak > 0) return `Keep your ${streak} day streak going`;
  return 'Today\'s post is ready';
}

function dueBody(count: number, firstTitle: string, streak: number): string {
  if (count === 1) {
    return streak > 0
      ? `Post ${firstTitle} today to keep your streak.`
      : `${firstTitle} is waiting for you.`;
  }
  return streak > 0
    ? `${count} posts today. Post them to keep your streak.`
    : `${count} posts are waiting for you today.`;
}

function overdueTitle(streak: number): string {
  if (streak > 0) return `Keep your ${streak} day streak going`;
  return 'You have a post to catch up on';
}

type DayAssignment = {
  id: string;
  company_id: string;
  creator_id: string;
  slot_index: number;
  status: string;
  briefs: { format: string } | { format: string }[] | null;
};

function briefFormat(row: DayAssignment): string {
  const b = row.briefs;
  if (Array.isArray(b)) return b[0]?.format ?? 'video';
  return b?.format ?? 'video';
}

function postLabel(format: string, videoRank: number): string {
  if (format === 'photo_carousel') return 'slideshow';
  if (videoRank <= 1) return 'first post';
  if (videoRank === 2) return 'second post';
  return 'third post';
}

function firstName(full: string | null): string {
  const name = full?.trim().split(/\s+/)[0];
  return name || 'Hey';
}

async function claimReminder(
  admin: ReturnType<typeof adminClient>,
  companyId: string,
  creatorId: string,
  kind: string,
  sentOn: string,
): Promise<boolean> {
  const { error } = await admin.from('creator_reminders').insert({
    company_id: companyId,
    creator_id: creatorId,
    kind,
    sent_on: sentOn,
  });
  if (error) {
    if (error.code === '23505') return false;
    throw new Error(error.message);
  }
  return true;
}

async function loadTodayAssignments(
  admin: ReturnType<typeof adminClient>,
): Promise<{ today: string; rows: DayAssignment[] }> {
  const today = todayInTz('America/New_York');
  const { data, error } = await admin
    .from('assignments')
    .select('id, company_id, creator_id, slot_index, status, briefs(format)')
    .eq('scheduled_date', today);
  if (error) throw new Error(error.message);
  return { today, rows: (data ?? []) as DayAssignment[] };
}

function groupByCreator(rows: DayAssignment[]): Map<string, DayAssignment[]> {
  const grouped = new Map<string, DayAssignment[]>();
  for (const row of rows) {
    const key = `${row.company_id}:${row.creator_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

async function sendSlotReminders(
  admin: ReturnType<typeof adminClient>,
  hour: number,
): Promise<{ slot_claimed: number; slot_pushes: number }> {
  const { today, rows } = await loadTodayAssignments(admin);
  let slotClaimed = 0;
  let slotPushes = 0;
  for (const [, list] of groupByCreator(rows)) {
    const sorted = [...list].sort((a, b) => a.slot_index - b.slot_index);
    const total = Math.min(Math.max(sorted.length, 1), 3);
    const hours = SLOT_HOURS[total] ?? SLOT_HOURS[3];
    let videoRank = 0;
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i];
      const format = briefFormat(row);
      if (format !== 'photo_carousel') videoRank += 1;
      const slotHour = hours[Math.min(i, hours.length - 1)];
      if (slotHour !== hour) continue;
      if (!INCOMPLETE.includes(row.status as (typeof INCOMPLETE)[number])) continue;
      if (row.slot_index > 2) continue;
      const claimed = await claimReminder(
        admin,
        row.company_id,
        row.creator_id,
        `slot_${row.slot_index}`,
        today,
      );
      if (!claimed) continue;
      slotClaimed += 1;
      const label = postLabel(format, videoRank);
      const recipients = await creatorRecipients(admin, row.creator_id, row.company_id);
      slotPushes += await sendPush(admin, recipients, {
        title: `It's time for your ${label}`,
        body: `It's time for your ${label}`,
        data: {
          event: 'slot_due',
          company_id: row.company_id,
          assignment_id: row.id,
          deep_link: creatorLink(row.company_id, 'assignment', row.id),
        },
      });
    }
  }
  return { slot_claimed: slotClaimed, slot_pushes: slotPushes };
}

async function sendAfternoonNudge(
  admin: ReturnType<typeof adminClient>,
): Promise<{ afternoon_claimed: number; afternoon_pushes: number }> {
  const { today, rows } = await loadTodayAssignments(admin);
  const open = rows.filter((row) =>
    INCOMPLETE.includes(row.status as (typeof INCOMPLETE)[number]),
  );
  const grouped = groupByCreator(open);
  const creatorIds = [...new Set(open.map((row) => row.creator_id))];
  const names = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', creatorIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      names.set(row.id as string, firstName(row.full_name as string | null));
    }
  }
  let afternoonClaimed = 0;
  let afternoonPushes = 0;
  for (const [, list] of grouped) {
    const first = list[0];
    const claimed = await claimReminder(
      admin,
      first.company_id,
      first.creator_id,
      'afternoon_nudge',
      today,
    );
    if (!claimed) continue;
    afternoonClaimed += 1;
    const name = names.get(first.creator_id) ?? 'Hey';
    const line = `${name}, don't forget about today's posts!`;
    const recipients = await creatorRecipients(admin, first.creator_id, first.company_id);
    afternoonPushes += await sendPush(admin, recipients, {
      title: line,
      body: line,
      data: {
        event: 'afternoon_nudge',
        company_id: first.company_id,
        assignment_id: first.id,
        deep_link: creatorLink(first.company_id, 'assignment', first.id),
      },
    });
  }
  return { afternoon_claimed: afternoonClaimed, afternoon_pushes: afternoonPushes };
}

async function sendPostsReady(
  admin: ReturnType<typeof adminClient>,
): Promise<{ ready_claimed: number; ready_pushes: number }> {
  const { today, rows } = await loadTodayAssignments(admin);
  const open = rows.filter((row) =>
    INCOMPLETE.includes(row.status as (typeof INCOMPLETE)[number]),
  );
  let readyClaimed = 0;
  let readyPushes = 0;
  for (const [, list] of groupByCreator(open)) {
    const first = [...list].sort((a, b) => a.slot_index - b.slot_index)[0];
    const claimed = await claimReminder(
      admin,
      first.company_id,
      first.creator_id,
      'posts_ready',
      today,
    );
    if (!claimed) continue;
    readyClaimed += 1;
    const recipients = await creatorRecipients(admin, first.creator_id, first.company_id);
    readyPushes += await sendPush(admin, recipients, {
      title: "Today's posts are ready",
      body: "Today's posts are ready",
      data: {
        event: 'posts_ready',
        company_id: first.company_id,
        assignment_id: first.id,
        deep_link: creatorLink(first.company_id, 'assignment', first.id),
      },
    });
  }
  return { ready_claimed: readyClaimed, ready_pushes: readyPushes };
}

function overdueBody(count: number, streak: number): string {
  if (count === 1) {
    return streak > 0
      ? 'One post is overdue. Post it to keep your streak.'
      : 'One post is overdue. Open it to catch up.';
  }
  return streak > 0
    ? `${count} posts are overdue. Post them to keep your streak.`
    : `${count} posts are overdue. Open them to catch up.`;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'campaign_manager') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  let force = false;
  let warmupForce = false;
  let ready = false;
  try {
    const body = (await req.json()) as { force?: boolean; warmup?: boolean; ready?: boolean };
    force = body.force === true;
    warmupForce = body.warmup === true;
    ready = body.ready === true;
  } catch {
    // empty body from cron is fine
  }

  const nyHour = getNyHour();
  const inWindow = nyHour === 8 || nyHour === 9;

  try {
    if (ready) {
      const readyResult = await sendPostsReady(admin);
      return jsonResponse({ ...readyResult, ny_hour: nyHour });
    }

    const slotResult = await sendSlotReminders(admin, nyHour);
    const afternoonResult = nyHour === 16 ? await sendAfternoonNudge(admin) : null;

    const warmupResult =
      nyHour === 14 || warmupForce ? await sendAccountWarmup(admin, warmupForce) : null;

    if (!inWindow && !force) {
      return jsonResponse({
        skipped: true,
        reason: warmupResult ? 'warmup window' : 'outside 8–9 America/New_York',
        ny_hour: nyHour,
        ...slotResult,
        ...(afternoonResult ?? {}),
        ...(warmupResult ?? {}),
      });
    }
    const { data: companies, error: companiesError } = await admin
      .from('companies')
      .select('id, settings');
    if (companiesError) throw new Error(companiesError.message);

    const tzByCompany = new Map<string, string>();
    for (const c of companies ?? []) {
      const settings = (c.settings ?? {}) as { timezone?: string };
      tzByCompany.set(
        c.id as string,
        settings.timezone?.trim() || 'America/Chicago',
      );
    }

    const { data: rows, error } = await admin
      .from('assignments')
      .select('id, company_id, creator_id, scheduled_date, briefs(title)')
      .in('status', [...INCOMPLETE]);
    if (error) throw new Error(error.message);

    const grouped = new Map<string, AssignmentRow[]>();
    for (const raw of (rows ?? []) as AssignmentRow[]) {
      const tz = tzByCompany.get(raw.company_id) ?? 'America/Chicago';
      const today = todayInTz(tz);
      let kind: ReminderKind | null = null;
      if (raw.scheduled_date === today) kind = 'due_today';
      else if (raw.scheduled_date < today) kind = 'overdue';
      if (!kind) continue;
      const key = `${raw.company_id}:${raw.creator_id}:${kind}:${today}`;
      const list = grouped.get(key) ?? [];
      list.push(raw);
      grouped.set(key, list);
    }

    const companyIds = new Set<string>();
    const creatorIds = new Set<string>();
    for (const key of grouped.keys()) {
      const parts = key.split(':');
      companyIds.add(parts[0]);
      creatorIds.add(parts[1]);
    }

    const streakByPair = new Map<string, number>();
    if (companyIds.size > 0 && creatorIds.size > 0) {
      const { data: streakRows, error: streakError } = await admin
        .from('creator_streaks')
        .select('company_id, creator_id, current_streak')
        .in('company_id', [...companyIds])
        .in('creator_id', [...creatorIds]);
      if (streakError) throw new Error(streakError.message);
      for (const row of streakRows ?? []) {
        const streak = row.current_streak as number;
        if (streak > 0) {
          streakByPair.set(`${row.company_id}:${row.creator_id}`, streak);
        }
      }
    }

    let claimed = 0;
    let pushes = 0;
    for (const [key, list] of grouped) {
      list.sort((a, b) =>
        a.scheduled_date === b.scheduled_date
          ? a.id.localeCompare(b.id)
          : a.scheduled_date.localeCompare(b.scheduled_date),
      );
      const first = list[0];
      const parts = key.split(':');
      const companyId = parts[0];
      const creatorId = parts[1];
      const kind = parts[2] as ReminderKind;
      const sentOn = parts[3];

      const { data: inserted, error: claimError } = await admin
        .from('creator_reminders')
        .insert({
          company_id: companyId,
          creator_id: creatorId,
          kind,
          sent_on: sentOn,
        })
        .select('id')
        .maybeSingle();
      if (claimError) {
        if (claimError.code === '23505') continue;
        throw new Error(claimError.message);
      }
      if (!inserted) continue;
      claimed += 1;

      const streak = streakByPair.get(`${companyId}:${creatorId}`) ?? 0;
      const recipients = await creatorRecipients(admin, creatorId, companyId);
      const title =
        kind === 'due_today' ? dueTitle(streak) : overdueTitle(streak);
      const body =
        kind === 'due_today'
          ? dueBody(list.length, briefTitle(first), streak)
          : overdueBody(list.length, streak);
      pushes += await sendPush(admin, recipients, {
        title,
        body,
        data: {
          event: kind,
          company_id: companyId,
          assignment_id: first.id,
          deep_link: creatorLink(companyId, 'assignment', first.id),
        },
      });

      if (kind !== 'overdue') continue;
      const { data: behindClaim, error: behindError } = await admin
        .from('creator_reminders')
        .insert({
          company_id: companyId,
          creator_id: creatorId,
          kind: 'creator_behind',
          sent_on: sentOn,
        })
        .select('id')
        .maybeSingle();
      if (behindError) {
        if (behindError.code === '23505') continue;
        throw new Error(behindError.message);
      }
      if (!behindClaim) continue;
      const { data: creator } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', creatorId)
        .maybeSingle();
      const name = (creator?.full_name as string | null)?.trim() || 'A creator';
      pushes += await sendPush(admin, await adminRecipients(admin, companyId), {
        title: `${name} is behind`,
        body: behindBody(list.length),
        data: {
          event: 'creator_behind',
          company_id: companyId,
          creator_id: creatorId,
          deep_link: managerLink(companyId, 'chat', creatorId),
        },
      });
    }

    return jsonResponse({
      creators: grouped.size,
      claimed,
      pushes,
      ny_hour: nyHour,
    });
  } catch (e) {
    console.error('notify-reminders error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'notify-reminders failed' },
      500,
    );
  }
});
