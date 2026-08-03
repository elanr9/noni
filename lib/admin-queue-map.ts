import type { AssignmentQueueItem, QueueItem, Submission } from './admin-api';
import type {
  ContentFormat,
  MockQueueItem,
  MockThreadEntry,
  ScriptLine,
} from './admin-review-types';
import type { ReviewEvent } from './review-events';

export function formatAge(iso: string | null | undefined): string {
  if (!iso) return 'just now';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatLengthLabel(
  format: ContentFormat,
  durationSeconds: number | null | undefined,
  estimatedSeconds: number | null | undefined,
): string {
  if (format === 'photo_carousel') {
    return 'Slideshow';
  }
  const sec = durationSeconds ?? estimatedSeconds ?? 0;
  if (sec <= 0) return 'Reel';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function asFormat(raw: string | null | undefined): ContentFormat {
  return raw === 'photo_carousel' ? 'photo_carousel' : 'video';
}

export function toQueueRow(
  task: QueueItem,
  submission: Submission | null,
): MockQueueItem {
  const name = task.profiles?.full_name?.trim() || 'Creator';
  const format = asFormat(task.format);
  const version = submission?.version ?? 1;
  return {
    id: task.id,
    creator: {
      id: task.profiles?.id ?? task.assigned_to ?? 'unknown',
      name,
      initial: name.charAt(0).toUpperCase() || '?',
    },
    title: task.title,
    format,
    lengthLabel: formatLengthLabel(
      format,
      submission?.duration_seconds,
      task.estimated_seconds,
    ),
    ageLabel: formatAge(submission?.created_at ?? task.created_at),
    status: task.status,
    resubmitted: version > 1,
  };
}

export function toAssignmentQueueRow(
  item: AssignmentQueueItem,
  submission: Submission | null,
): MockQueueItem {
  const name = item.profiles?.full_name?.trim() || 'Creator';
  const format = asFormat(item.briefs.format);
  const version = submission?.version ?? 1;
  return {
    id: item.id,
    creator: {
      id: item.creator_id,
      name,
      initial: name.charAt(0).toUpperCase() || '?',
    },
    title: item.briefs.title,
    format,
    lengthLabel: formatLengthLabel(format, submission?.duration_seconds, null),
    ageLabel: formatAge(submission?.created_at ?? item.created_at),
    status: item.status,
    resubmitted: version > 1,
    brief: { id: item.brief_id, title: item.briefs.title },
  };
}

/** Split script into untimed lines (paragraphs / ---). */
export function scriptToLines(script: string | null | undefined): ScriptLine[] {
  if (!script?.trim()) return [];
  return script
    .split(/\n\s*---\s*\n|\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text) => ({ at: 0, text }));
}

/** Slideshow slide copy from script (--- or newlines). */
export function slidesFromScript(script: string | null | undefined): string[] {
  if (!script?.trim()) return [''];
  const parts = script
    .split(/\n\s*---\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  const lines = script
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [''];
}

export function eventsToThread(events: ReviewEvent[]): MockThreadEntry[] {
  return events
    .filter((e) => e.note?.trim())
    .map((e) => {
      const name = e.profiles?.full_name?.trim() || 'Someone';
      const author: 'admin' | 'creator' =
        e.profiles?.role === 'creator' ? 'creator' : 'admin';
      const actionLabel =
        e.action === 'changes_requested'
          ? 'requested changes'
          : e.action === 'approved'
            ? 'approved'
            : 'commented';
      return {
        author,
        headerBold: author === 'admin' ? 'You' : name,
        headerMuted:
          author === 'admin'
            ? `${actionLabel} · ${formatAge(e.created_at)}`
            : formatAge(e.created_at),
        body: e.note!.trim(),
      };
    });
}
