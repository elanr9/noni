// Client for the cue-clip edge function: transcribes one uploaded clip with
// Deepgram and suggests when its on-screen text and media should enter,
// based on what the creator actually said. Called from the recording flow
// as soon as a clip is uploaded so the editor opens with cue markers in place.
import { supabase } from './supabase';
import { parseSlotCue, parseTranscriptWords, type SlotCue, type TranscriptWord } from './video-edit';

export type ClipCueResult = { words: TranscriptWord[]; cue: SlotCue };

export async function requestClipCue(params: {
  assignmentId: string;
  slotIndex: number;
  storagePath: string;
}): Promise<ClipCueResult> {
  const { data, error } = await supabase.functions.invoke('cue-clip', {
    body: {
      assignment_id: params.assignmentId,
      slot_index: params.slotIndex,
      storage_path: params.storagePath,
    },
  });
  if (error) throw error;
  const raw = (data ?? {}) as { words?: unknown; cue?: unknown };
  const cue = parseSlotCue(raw.cue);
  if (!cue) throw new Error('cue-clip returned no cue');
  return { words: parseTranscriptWords(raw.words), cue };
}
