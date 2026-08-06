import { supabase } from './supabase';
import type { Database } from './types';

export type MessageRow = Database['public']['Tables']['messages']['Row'];

/** Inline post reference carried by a message via brief_id or assignment_id. */
export type MessagePostRef = {
  assignmentId: string | null;
  briefId: string;
  title: string;
  format: string;
};

export type ThreadMessage = {
  id: string;
  authorId: string;
  authorName: string;
  fromCreator: boolean;
  body: string;
  createdAt: string;
  postRef: MessagePostRef | null;
};

type BriefRef = { id: string; title: string; format: string } | null;

type MessageJoinRow = MessageRow & {
  author: { id: string; full_name: string | null } | null;
  brief: BriefRef;
  assignment: { id: string; briefs: BriefRef } | null;
};

const THREAD_SELECT =
  '*, author:author_id ( id, full_name ), brief:brief_id ( id, title, format ), assignment:assignment_id ( id, briefs:brief_id ( id, title, format ) )';

function toPostRef(row: MessageJoinRow): MessagePostRef | null {
  if (row.assignment?.briefs) {
    return {
      assignmentId: row.assignment.id,
      briefId: row.assignment.briefs.id,
      title: row.assignment.briefs.title,
      format: row.assignment.briefs.format,
    };
  }
  if (row.brief) {
    return {
      assignmentId: null,
      briefId: row.brief.id,
      title: row.brief.title,
      format: row.brief.format,
    };
  }
  return null;
}

/** The one thread for a creator, oldest first. */
export async function listThread(
  companyId: string,
  creatorId: string,
): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(THREAD_SELECT)
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MessageJoinRow[]).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    authorName: row.author?.full_name?.trim() || 'Someone',
    fromCreator: row.author_id === row.creator_id,
    body: row.body,
    createdAt: row.created_at,
    postRef: toPostRef(row),
  }));
}

export async function sendMessage(params: {
  companyId: string;
  creatorId: string;
  authorId: string;
  body: string;
  briefId?: string;
  assignmentId?: string;
}): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    company_id: params.companyId,
    creator_id: params.creatorId,
    author_id: params.authorId,
    body: params.body,
    brief_id: params.briefId ?? null,
    assignment_id: params.assignmentId ?? null,
  });
  if (error) throw error;

  // notify routes by caller role: creator author -> admins, admin -> creator.
  void supabase.functions.invoke('notify', {
    body: { creator_id: params.creatorId, event: 'message' },
  });
}
