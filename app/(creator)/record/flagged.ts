import type { ChangesNoteSection } from '../../../components/ReviewThread';

type PlanClip = {
  slotIndex: number;
  kind: string;
  label: string;
};

/**
 * Map structured revision labels (Hook, Clip 3, CTA) onto clip slot indices.
 * Returns null when the note has no per-clip labels (whole-post redo).
 */
export function flaggedSlotIndices(
  sections: ChangesNoteSection[],
  plan: PlanClip[],
): number[] | null {
  const labeled = sections.filter((s) => s.label !== null);
  if (labeled.length === 0) return null;

  const slots = new Set<number>();
  for (const section of labeled) {
    const label = section.label;
    if (label === null) continue;
    const clipMatch = /^Clip\s+(\d+)$/i.exec(label);
    if (clipMatch) {
      const n = Number(clipMatch[1]);
      const clip = plan[n - 1];
      if (clip) slots.add(clip.slotIndex);
      continue;
    }
    const pointMatch = /^Point\s+(\d+)$/i.exec(label);
    if (pointMatch) {
      const n = Number(pointMatch[1]);
      let pointNumber = 0;
      for (const clip of plan) {
        if (clip.kind !== 'point') continue;
        pointNumber += 1;
        if (pointNumber === n) {
          slots.add(clip.slotIndex);
          break;
        }
      }
      continue;
    }
    const normalized = label.trim().toLowerCase();
    if (normalized === 'hook') {
      const hook = plan.find((c) => c.kind === 'hook');
      if (hook) slots.add(hook.slotIndex);
      continue;
    }
    if (
      normalized === 'outro' ||
      normalized === 'cta' ||
      normalized === 'close'
    ) {
      const outro = plan.find((c) => c.kind === 'outro');
      if (outro) slots.add(outro.slotIndex);
    }
  }

  return slots.size > 0 ? [...slots].sort((a, b) => a - b) : null;
}

/** Human list for the pinned note under Record again. */
export function formatFlaggedClipNote(
  slots: number[] | null,
  plan: PlanClip[],
): string {
  if (slots === null || slots.length === 0) {
    return 'Your kept clips are saved. Reshoot only what the note calls out.';
  }
  const names = slots.map((slot) => {
    const index = plan.findIndex((c) => c.slotIndex === slot);
    const clip = plan[index];
    if (!clip) return `clip ${slot + 1}`;
    if (clip.kind === 'hook') return 'clip 1';
    return `clip ${index + 1}`;
  });
  if (names.length === 1) {
    return `Your kept clips are saved. Only ${names[0]} needs reshooting.`;
  }
  const last = names[names.length - 1];
  const head = names.slice(0, -1).join(', ');
  return `Your kept clips are saved. Only ${head} and ${last} need reshooting.`;
}

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
