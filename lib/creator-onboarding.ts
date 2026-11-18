// Creator onboarding data: the name and selfie step, and the finish screen's
// "what is waiting" read. Connect, permissions and push reuse their own libs.
import { uploadAvatar } from './onboarding';
import { supabase } from './supabase';
import { listMyAssignments } from './tasks-api';

/** Saves the creator's name, and the selfie when one was picked. Never clears an existing photo. */
export async function saveCreatorProfile(
  userId: string,
  companyId: string | null,
  fullName: string,
  photoUri: string | null,
): Promise<void> {
  let avatarPath: string | undefined;
  if (photoUri && companyId) avatarPath = await uploadAvatar(companyId, userId, photoUri);
  const { error } = await supabase
    .from('profiles')
    .update(avatarPath ? { full_name: fullName, avatar_path: avatarPath } : { full_name: fullName })
    .eq('id', userId);
  if (error) throw error;
}

export type WaitingWork = {
  /** Assigned or changes requested posts for this creator. */
  tasks: number;
  /** Title of the first one, soonest first. */
  firstTitle: string | null;
  /** Its words to say, for the "about N seconds of talking" line. */
  firstWords: number | null;
  /** Ready-made briefs the team shared in the library. */
  briefs: number;
};

const OPEN = new Set(['assigned', 'changes_requested']);

/** What the creator can start on today. Throws on a network failure so the screen can offer a retry. */
export async function loadWaitingWork(companyId: string, creatorId: string): Promise<WaitingWork> {
  const [assignments, library] = await Promise.all([
    listMyAssignments(companyId, creatorId),
    supabase.from('library_briefs').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
  ]);
  const open = assignments.filter((a) => OPEN.has(a.status));
  const first = open[0];
  const words = first?.briefs?.script ? first.briefs.script.split(/\s+/).filter(Boolean).length : first?.briefs?.target_words ?? null;
  return {
    tasks: open.length,
    firstTitle: first?.briefs?.title ?? null,
    firstWords: words || null,
    // The library is optional; a failed count reads as none rather than blocking the finish.
    briefs: library.error ? 0 : library.count ?? 0,
  };
}

/** Roughly 2.5 words a second, the pace the teleprompter runs at. */
export function talkSeconds(words: number): number {
  return Math.max(5, Math.round(words / 2.5 / 5) * 5);
}
