// Pure half of the post history (ANALYTICS_AND_MESSAGES_HANDOFF 2.9): types,
// labels and the row-to-event mapping. No Supabase import so it unit tests.

export type PostEventKind =
  | 'assigned'
  | 'submitted'
  | 'sent_back'
  | 'approved'
  | 'live'
  | 'comment';

export type PostNote = { label: string; text: string };

export type PostEvent = {
  id: string;
  kind: PostEventKind;
  at: string;
  authorId: string | null;
  authorName: string;
  assignmentId: string;
  label: string;
  notes?: PostNote[];
  submissionId?: string;
  /** Latest submitted take whose assignment still sits in the review queue. */
  waiting: boolean;
};

/** What a post card needs to draw itself, shared by threads and the inbox. */
export type PostSummary = {
  assignmentId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  format: 'video' | 'photo_carousel';
  typeLabel: string;
  mediaPath: string | null;
  attempt: number;
  scheduledDate: string;
  publishAt: string | null;
  status: string;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayOf(dateIso: string): string {
  const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 'this week';
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? 'this week';
}

export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function assignedLabel(scheduledDate: string, creatorName?: string): string {
  const day = weekdayOf(scheduledDate);
  return creatorName ? `Assigned to ${creatorName} for ${day}` : `Assigned for ${day}`;
}

export function submittedLabel(params: {
  attempt: number;
  format: 'video' | 'photo_carousel';
  clips: number | null;
  durationSeconds: number | null;
}): string {
  const head = `Submitted take ${params.attempt}`;
  if (params.format === 'photo_carousel') {
    return params.clips !== null && params.clips > 0
      ? `${head} \u00b7 ${params.clips} ${params.clips === 1 ? 'slide' : 'slides'}`
      : head;
  }
  const parts = [head];
  if (params.clips !== null && params.clips > 0) {
    parts.push(`${params.clips} ${params.clips === 1 ? 'clip' : 'clips'}`);
  }
  if (params.durationSeconds !== null && params.durationSeconds > 0) {
    parts.push(clockLabel(params.durationSeconds));
  }
  return parts.join(' \u00b7 ');
}

export function sentBackLabel(noteCount: number): string {
  return `Sent back \u00b7 ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`;
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Wed 5:00 PM" for a publish timestamp. */
export function publishLabel(publishAt: string): string {
  const d = new Date(publishAt);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${SHORT_WEEKDAYS[d.getDay()]} ${hour12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Approve schedules the post via assignments.publish_at; once live the schedule is history. */
export function approvedLabel(publishAt: string | null, liveAlready: boolean): string {
  if (liveAlready || publishAt === null) return 'Approved';
  const when = publishLabel(publishAt);
  return when ? `Approved \u00b7 posts ${when}` : 'Approved';
}

/** Card state for a post shared into a chat, derived from the assignment status. */
export function summaryCardState(s: PostSummary): { kind: Exclude<PostEventKind, 'comment'>; label: string } {
  switch (s.status) {
    case 'submitted':
      return { kind: 'submitted', label: `Submitted take ${s.attempt}` };
    case 'changes_requested':
      return { kind: 'sent_back', label: 'Sent back' };
    case 'approved':
      return { kind: 'approved', label: approvedLabel(s.publishAt, false) };
    case 'posted':
      return { kind: 'live', label: 'Live' };
    default:
      return { kind: 'assigned', label: assignedLabel(s.scheduledDate) };
  }
}

export function liveLabel(views: number | null): string {
  if (views === null) return 'Live';
  return `Live \u00b7 ${compactViews(views)} views`;
}

export function compactViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Review writes "Label: text" blocks separated by blank lines. Rows older
 * than the notes column are parsed back into that shape.
 */
export function parseNotes(note: string | null): PostNote[] {
  if (!note || !note.trim()) return [];
  return note
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = part.match(/^([^:\n]{1,40}):\s*([\s\S]+)$/);
      if (match) return { label: match[1].trim(), text: match[2].trim() };
      return { label: 'Whole post', text: part };
    });
}

export function asNotes(raw: unknown): PostNote[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PostNote[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const { label, text } = item as { label?: unknown; text?: unknown };
      if (typeof label === 'string' && typeof text === 'string') {
        out.push({ label, text });
      }
    }
  }
  return out;
}

/** Stable order for a thread: by time, ties broken so events land before chat about them. */
export function sortByTime<T extends { at: string; kind?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    const ea = a.kind !== undefined && a.kind !== 'message' ? 0 : 1;
    const eb = b.kind !== undefined && b.kind !== 'message' ? 0 : 1;
    return ea - eb;
  });
}

export type AssignmentJoin = {
  id: string;
  company_id: string;
  creator_id: string;
  brief_id: string;
  created_at: string | null;
  scheduled_date: string;
  publish_at: string | null;
  status: string;
  submission_id: string | null;
  briefs: {
    title: string;
    format: string;
    post_types: { label: string } | { label: string }[] | null;
  } | null;
  profiles: { full_name: string | null } | null;
};

export type SubmissionLite = {
  id: string;
  assignment_id: string | null;
  version: number | null;
  created_at: string | null;
  duration_seconds: number | null;
  segment_paths: string[] | null;
  video_path: string;
};

export type ReviewEventLite = {
  id: string;
  submission_id: string;
  author_id: string;
  action: string | null;
  note: string | null;
  notes: unknown;
  created_at: string | null;
  profiles: { full_name: string | null } | null;
};

export type PostLite = {
  id: string;
  assignment_id: string | null;
  posted_at: string | null;
};

export const ASSIGNMENT_SELECT =
  'id, company_id, creator_id, brief_id, created_at, scheduled_date, publish_at, status, submission_id, briefs:brief_id ( title, format, post_types ( label ) ), profiles:creator_id ( full_name )';

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function toSummary(a: AssignmentJoin, latest: SubmissionLite | undefined): PostSummary {
  const format = a.briefs?.format === 'photo_carousel' ? 'photo_carousel' : 'video';
  return {
    assignmentId: a.id,
    creatorId: a.creator_id,
    creatorName: a.profiles?.full_name?.trim() || 'Creator',
    title: a.briefs?.title ?? 'Post',
    format,
    typeLabel: one(a.briefs?.post_types ?? null)?.label ?? (format === 'video' ? 'Reel' : 'Slideshow'),
    mediaPath: latest?.video_path ?? null,
    attempt: latest?.version ?? 1,
    scheduledDate: a.scheduled_date,
    publishAt: a.publish_at,
    status: a.status,
  };
}

/**
 * Build the events for a set of assignments from their rows. Exported so the
 * thread merge can be unit tested with fixtures.
 */
export function buildPostEvents(params: {
  assignments: AssignmentJoin[];
  submissions: SubmissionLite[];
  reviewEvents: ReviewEventLite[];
  posts: PostLite[];
  viewsByPost: Map<string, number>;
  managerNames: Map<string, string>;
  inPostThread: boolean;
}): { events: PostEvent[]; summaries: Map<string, PostSummary> } {
  const events: PostEvent[] = [];
  const summaries = new Map<string, PostSummary>();
  const subsByAssignment = new Map<string, SubmissionLite[]>();
  for (const s of params.submissions) {
    if (s.assignment_id === null) continue;
    const list = subsByAssignment.get(s.assignment_id) ?? [];
    list.push(s);
    subsByAssignment.set(s.assignment_id, list);
  }
  const eventsBySubmission = new Map<string, ReviewEventLite[]>();
  for (const e of params.reviewEvents) {
    const list = eventsBySubmission.get(e.submission_id) ?? [];
    list.push(e);
    eventsBySubmission.set(e.submission_id, list);
  }
  const liveByAssignment = new Map<string, { at: string; postId: string }>();
  for (const p of params.posts) {
    if (p.assignment_id === null || p.posted_at === null) continue;
    const current = liveByAssignment.get(p.assignment_id);
    if (!current || p.posted_at < current.at) {
      liveByAssignment.set(p.assignment_id, { at: p.posted_at, postId: p.id });
    }
  }

  for (const a of params.assignments) {
    const subs = [...(subsByAssignment.get(a.id) ?? [])].sort(
      (x, y) => (x.version ?? 1) - (y.version ?? 1),
    );
    const latest = subs[subs.length - 1];
    const summary = toSummary(a, latest);
    summaries.set(a.id, summary);
    const creatorName = summary.creatorName;
    const live = liveByAssignment.get(a.id);

    events.push({
      id: `assigned:${a.id}`,
      kind: 'assigned',
      at: a.created_at ?? `${a.scheduled_date}T00:00:00.000Z`,
      authorId: null,
      authorName: 'Noni',
      assignmentId: a.id,
      label: assignedLabel(a.scheduled_date, params.inPostThread ? creatorName : undefined),
      waiting: false,
    });

    subs.forEach((s, i) => {
      const attempt = s.version ?? i + 1;
      const isLatest = i === subs.length - 1;
      const waiting = isLatest && a.status === 'submitted';
      events.push({
        id: `submitted:${s.id}`,
        kind: 'submitted',
        at: s.created_at ?? a.created_at ?? new Date(0).toISOString(),
        authorId: a.creator_id,
        authorName: creatorName,
        assignmentId: a.id,
        submissionId: s.id,
        label: submittedLabel({
          attempt,
          format: summary.format,
          clips: s.segment_paths?.length ?? null,
          durationSeconds: s.duration_seconds,
        }),
        waiting,
      });
      for (const e of eventsBySubmission.get(s.id) ?? []) {
        const authorName =
          (params.managerNames.get(e.author_id) ?? e.profiles?.full_name?.trim()) || 'Manager';
        const at = e.created_at ?? s.created_at ?? new Date(0).toISOString();
        if (e.action === 'changes_requested') {
          const notes = asNotes(e.notes) ?? parseNotes(e.note);
          events.push({
            id: `sent_back:${e.id}`,
            kind: 'sent_back',
            at,
            authorId: e.author_id,
            authorName,
            assignmentId: a.id,
            submissionId: s.id,
            label: sentBackLabel(notes.length),
            notes,
            waiting: false,
          });
        } else if (e.action === 'approved') {
          events.push({
            id: `approved:${e.id}`,
            kind: 'approved',
            at,
            authorId: e.author_id,
            authorName,
            assignmentId: a.id,
            submissionId: s.id,
            label: approvedLabel(a.publish_at, live !== undefined),
            waiting: false,
          });
        } else if (e.action === 'comment' && e.note?.trim()) {
          events.push({
            id: `comment:${e.id}`,
            kind: 'comment',
            at,
            authorId: e.author_id,
            authorName,
            assignmentId: a.id,
            submissionId: s.id,
            label: e.note.trim(),
            waiting: false,
          });
        }
      }
    });

    if (live) {
      const views = params.viewsByPost.get(live.postId) ?? null;
      events.push({
        id: `live:${a.id}`,
        kind: 'live',
        at: live.at,
        authorId: null,
        authorName: 'Noni',
        assignmentId: a.id,
        label: liveLabel(views),
        waiting: false,
      });
    }
  }

  return { events: sortByTime(events), summaries };
}
