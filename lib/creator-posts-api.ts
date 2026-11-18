/**
 * Posts a creator starts on their own (Create tab, Briefs, Record): the
 * assignment row they submit against comes from start_creator_post
 * (migration 123), reused while it is still open so a retry does not make
 * a second one.
 */
import { supabase } from './supabase';
import type { Assignment } from './tasks';

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

export type CreatorPostFormat = 'video' | 'photo_carousel';

/** An assignment this creator already started from the same library brief and has not sent (or was sent back). */
export async function findOpenCreatorPost(companyId: string, creatorId: string, libraryBriefId: string): Promise<Assignment | null> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .eq('library_brief_id', libraryBriefId)
    .in('status', ['assigned', 'recorded', 'changes_requested'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Assignment | null) ?? null;
}

export async function startCreatorPost(params: { companyId: string; title: string; format: CreatorPostFormat; libraryBriefId?: string | null }): Promise<Assignment> {
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const call = (libraryBriefId: string | null) =>
    rpc('start_creator_post', { p_company_id: params.companyId, p_title: params.title, p_format: params.format, p_library_brief_id: libraryBriefId });
  let { data, error } = await call(params.libraryBriefId ?? null);
  // A brief that only exists in the local library cache has no row to point at yet.
  if (error && params.libraryBriefId && /library_brief|foreign key/i.test(error.message)) ({ data, error } = await call(null));
  if (error) throw new Error(error.message);
  return data as Assignment;
}

/** The open assignment for a library brief, or a fresh one. */
export async function ensureCreatorPost(params: { companyId: string; creatorId: string; title: string; format: CreatorPostFormat; libraryBriefId?: string | null }): Promise<Assignment> {
  if (params.libraryBriefId) {
    const open = await findOpenCreatorPost(params.companyId, params.creatorId, params.libraryBriefId);
    if (open) return open;
  }
  return startCreatorPost(params);
}

/** The open post behind a draft, when it is still this creator's to work on. */
export async function getOpenCreatorPost(companyId: string, creatorId: string, assignmentId: string): Promise<Assignment | null> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .eq('id', assignmentId)
    .in('status', ['assigned', 'recorded', 'changes_requested'])
    .maybeSingle();
  if (error) throw error;
  return (data as Assignment | null) ?? null;
}

/** Name a post the creator started (the title lives on its brief row; migration 125). */
export async function renameCreatorPost(assignmentId: string, title: string): Promise<void> {
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const { error } = await rpc('rename_creator_post', { p_assignment_id: assignmentId, p_title: title });
  if (error) throw new Error(error.message);
}

/** Throw away an unsent post the creator started, with its drafts (migration 125). */
export async function discardCreatorPost(assignmentId: string): Promise<void> {
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const { error } = await rpc('discard_creator_post', { p_assignment_id: assignmentId });
  if (error) throw new Error(error.message);
}
