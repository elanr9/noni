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

// Media messages (design handoff, chat attachments). The messages table has
// no media columns, so the payload rides in body as a one-line JSON header:
// "[[media]]{json}\ncaption". Encode and decode both live here.

const MEDIA_PREFIX = '[[media]]';

/** Media carried by a message: storage path in the videos bucket plus, for video, a duration label. */
export type MessageMedia = {
  media: 'image' | 'video';
  url: string;
  len?: string;
};

function lenLabel(durationMs: number): string {
  const total = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Split a message body into its media header (if any) and the caption text. */
export function parseMessageMedia(body: string): {
  media: MessageMedia | null;
  text: string;
} {
  if (!body.startsWith(MEDIA_PREFIX)) return { media: null, text: body };
  const newline = body.indexOf('\n');
  const head = newline === -1 ? body : body.slice(0, newline);
  const text = newline === -1 ? '' : body.slice(newline + 1);
  try {
    const raw: unknown = JSON.parse(head.slice(MEDIA_PREFIX.length));
    if (raw !== null && typeof raw === 'object') {
      const candidate = raw as { media?: unknown; url?: unknown; len?: unknown };
      if (
        (candidate.media === 'image' || candidate.media === 'video') &&
        typeof candidate.url === 'string'
      ) {
        return {
          media: {
            media: candidate.media,
            url: candidate.url,
            ...(typeof candidate.len === 'string' ? { len: candidate.len } : {}),
          },
          text,
        };
      }
    }
  } catch {
    // Not a media header after all; treat the whole body as text.
  }
  return { media: null, text: body };
}

const MEDIA_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Upload a picked photo or video to the videos bucket, then send it as a media message. */
export async function sendMediaMessage(params: {
  companyId: string;
  creatorId: string;
  authorId: string;
  media: 'image' | 'video';
  localUri: string;
  contentType: string;
  durationMs?: number | null;
  caption?: string;
}): Promise<void> {
  const response = await fetch(params.localUri);
  if (!response.ok) throw new Error('Could not read the file');
  const blob = await response.blob();

  const ext =
    MEDIA_EXT[params.contentType] ?? (params.media === 'video' ? 'mp4' : 'jpg');
  const path = `${params.companyId}/chat/${params.creatorId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(path, blob, { contentType: params.contentType, upsert: false });
  if (uploadError) throw uploadError;

  const media: MessageMedia = {
    media: params.media,
    url: path,
    ...(params.media === 'video' && params.durationMs
      ? { len: lenLabel(params.durationMs) }
      : {}),
  };
  const caption = params.caption?.trim() ?? '';
  const { error } = await supabase.from('messages').insert({
    company_id: params.companyId,
    creator_id: params.creatorId,
    author_id: params.authorId,
    body: `${MEDIA_PREFIX}${JSON.stringify(media)}${caption ? `\n${caption}` : ''}`,
  });
  if (error) throw error;

  void supabase.functions.invoke('notify', {
    body: { creator_id: params.creatorId, event: 'message' },
  });
}

/** Signed URL for a chat media path (videos bucket is private). */
export async function signedChatMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('videos')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
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
