import { supabase } from './supabase';
import type { Json } from './types';

export type DraftSegmentKind = 'hook' | 'point' | 'outro' | 'slide';

/** One kept clip in recording_drafts.segments jsonb. */
export type DraftSegment = {
  slot_index: number;
  kind: DraftSegmentKind;
  storage_path: string;
  duration_ms: number;
};

const KINDS: DraftSegmentKind[] = ['hook', 'point', 'outro', 'slide'];

function parseDraftSegments(value: Json): DraftSegment[] {
  if (!Array.isArray(value)) return [];
  const segments: DraftSegment[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    if (
      typeof raw.slot_index !== 'number' ||
      typeof raw.storage_path !== 'string' ||
      typeof raw.duration_ms !== 'number' ||
      typeof raw.kind !== 'string' ||
      !KINDS.includes(raw.kind as DraftSegmentKind)
    ) {
      continue;
    }
    segments.push({
      slot_index: raw.slot_index,
      kind: raw.kind as DraftSegmentKind,
      storage_path: raw.storage_path,
      duration_ms: raw.duration_ms,
    });
  }
  return segments.sort((a, b) => a.slot_index - b.slot_index);
}

/** Kept clips for an assignment, empty when there is no draft. */
export async function loadDraftSegments(
  companyId: string,
  assignmentId: string,
): Promise<DraftSegment[]> {
  const { data, error } = await supabase
    .from('recording_drafts')
    .select('segments')
    .eq('company_id', companyId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (error) throw error;
  return data ? parseDraftSegments(data.segments) : [];
}

/**
 * Record one kept clip. Replaces any prior clip at the same slot_index so a
 * retake overwrites in place. Returns the full draft after the write.
 */
export async function saveDraftSegment(params: {
  companyId: string;
  assignmentId: string;
  creatorId: string;
  segment: DraftSegment;
}): Promise<DraftSegment[]> {
  const { companyId, assignmentId, creatorId, segment } = params;
  const existing = await loadDraftSegments(companyId, assignmentId);
  const next = [
    ...existing.filter((s) => s.slot_index !== segment.slot_index),
    segment,
  ].sort((a, b) => a.slot_index - b.slot_index);

  const { error } = await supabase.from('recording_drafts').upsert(
    {
      company_id: companyId,
      assignment_id: assignmentId,
      creator_id: creatorId,
      segments: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'assignment_id' },
  );
  if (error) throw error;
  return next;
}

/**
 * Drop the draft row after submit. The clip files stay in storage: the
 * submission's segment_paths reference them directly.
 */
export async function clearDraft(
  companyId: string,
  assignmentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('recording_drafts')
    .delete()
    .eq('company_id', companyId)
    .eq('assignment_id', assignmentId);
  if (error) throw error;
}
