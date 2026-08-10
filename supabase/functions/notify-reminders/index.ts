// Morning due-today / overdue pushes for creators. Hourly cron at :15; only
// acts in America/New_York hour 8–9. Claims via creator_reminders insert so
// concurrent runs cannot double-send. One push per creator per kind per day.

import { adminClient, authenticate, handleCors, jsonResponse } from '../_shared/wp8.ts';
import { creatorPushTokens, sendExpoPush } from '../_shared/push.ts';

const INCOMPLETE = ['assigned', 'recorded', 'changes_requested'] as const;
type ReminderKind = 'due_today' | 'overdue';

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
  if (streak > 0) return `Keep your ${streak}-day streak alive`;
  return "Come make today's video";
}

function dueBody(count: number, firstTitle: string, streak: number): string {
  if (streak > 0) {
    if (count === 1) {
      return `Post today to protect your streak and keep earning: ${firstTitle}`;
    }
    return `${count} posts waiting — post today to protect your streak and keep earning`;
  }
  if (count === 1) return `Come make today's video and keep earning: ${firstTitle}`;
  return `${count} posts waiting — come make them and keep earning`;
}

function overdueTitle(streak: number): string {
  if (streak > 0) return `Keep your ${streak}-day streak alive`;
  return 'Catch up and keep earning';
}

function overdueBody(count: number, streak: number): string {
  if (streak > 0) {
    if (count === 1) {
      return 'Catch up on your overdue post to protect your streak and keep earning';
    }
    return `Catch up on ${count} overdue posts to protect your streak and keep earning`;
  }
  if (count === 1) return 'Catch up on your overdue post and keep earning';
  return `Catch up on ${count} overdue posts and keep earning`;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'admin') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  let force = false;
  try {
    const body = (await req.json()) as { force?: boolean };
    force = body.force === true;
  } catch {
    // empty body from cron is fine
  }

  const nyHour = getNyHour();
  const inWindow = nyHour === 8 || nyHour === 9;
  if (!inWindow && !force) {
    return jsonResponse({
      skipped: true,
      reason: 'outside 8–9 America/New_York',
      ny_hour: nyHour,
    });
  }

  try {
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
      const tokens = await creatorPushTokens(admin, creatorId, companyId);
      const title =
        kind === 'due_today' ? dueTitle(streak) : overdueTitle(streak);
      const body =
        kind === 'due_today'
          ? dueBody(list.length, briefTitle(first), streak)
          : overdueBody(list.length, streak);
      pushes += await sendExpoPush(tokens, {
        title,
        body,
        data: {
          event: kind,
          assignment_id: first.id,
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
