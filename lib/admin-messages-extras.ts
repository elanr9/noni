/**
 * What the shared chat model (lib/chat-thread.ts) leaves out: replies and
 * reactions on manager chats, and where a post card in a thread should land.
 * Creator threads (the `messages` table) have no reply or reaction columns,
 * so they only get copy.
 */
import type { Href } from 'expo-router';

import type { ChatPost, ChatTarget } from './chat-thread';
import { sendManagerMessage, toggleReaction } from './manager-messages-api';
import type { PostSummary } from './post-event-labels';
import { listPostSummaries } from './post-events';
import { supabase } from './supabase';
import type { Tone } from '../theme/v2';

export type MessageReaction = { emoji: string; count: number; mine: boolean };

export type MessageExtras = {
  replyTo: { authorName: string; snippet: string } | null;
  reactions: MessageReaction[];
};

/** Quick reactions offered on long press. */
export const QUICK_REACTIONS = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F525}', '\u{1F440}', '\u{1F64F}'] as const;

/** Replies and reactions are a manager chat feature. */
export function supportsReplies(target: ChatTarget): boolean {
  return target.kind === 'manager';
}

type Name = { full_name: string | null } | { full_name: string | null }[] | null;
type ExtrasRow = {
  id: string;
  reply_to:
    | { body: string; media_kind: string | null; forward_label: string | null; author: Name }
    | { body: string; media_kind: string | null; forward_label: string | null; author: Name }[]
    | null;
  reactions: { emoji: string; profile_id: string }[] | { emoji: string; profile_id: string } | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function nameOf(raw: Name): string {
  return one(raw)?.full_name?.trim() || 'Someone';
}

function snippet(r: { body: string; media_kind: string | null; forward_label: string | null }): string {
  const body = r.body.trim();
  if (body) return body.length > 80 ? `${body.slice(0, 80)}...` : body;
  if (r.media_kind === 'image') return 'Photo';
  if (r.media_kind === 'video') return 'Video';
  if (r.media_kind === 'voice') return 'Voice note';
  return r.forward_label ?? 'Message';
}

/** Reply quotes and reactions for every message in a manager chat, keyed by the ChatMessage id (`m:{id}`). */
export async function loadMessageExtras(target: ChatTarget, meId: string): Promise<Map<string, MessageExtras>> {
  const out = new Map<string, MessageExtras>();
  if (target.kind !== 'manager') return out;
  const { data, error } = await supabase
    .from('manager_messages')
    .select('id, reply_to:reply_to_id ( body, media_kind, forward_label, author:author_id ( full_name ) ), reactions:manager_message_reactions ( emoji, profile_id )')
    .eq('chat_id', target.chatId);
  if (error) throw error;
  for (const row of (data ?? []) as unknown as ExtrasRow[]) {
    const reply = one(row.reply_to);
    const list = row.reactions == null ? [] : Array.isArray(row.reactions) ? row.reactions : [row.reactions];
    const byEmoji = new Map<string, { count: number; mine: boolean }>();
    for (const r of list) {
      const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
      byEmoji.set(r.emoji, { count: cur.count + 1, mine: cur.mine || r.profile_id === meId });
    }
    if (!reply && byEmoji.size === 0) continue;
    out.set(`m:${row.id}`, {
      replyTo: reply ? { authorName: nameOf(reply.author), snippet: snippet(reply) } : null,
      reactions: [...byEmoji.entries()].map(([emoji, v]) => ({ emoji, ...v })),
    });
  }
  return out;
}

function rawId(chatMessageId: string): string | null {
  return chatMessageId.startsWith('m:') ? chatMessageId.slice(2) : null;
}

/** Adds or removes my reaction on a manager message. */
export async function reactToMessage(chatMessageId: string, meId: string, emoji: string): Promise<void> {
  const id = rawId(chatMessageId);
  if (!id) throw new Error('This message cannot take reactions');
  await toggleReaction(id, meId, emoji);
}

/** Sends a reply in a manager chat. */
export async function sendReply(params: { companyId: string; chatId: string; meId: string; text: string; replyToChatMessageId: string }): Promise<void> {
  const replyToId = rawId(params.replyToChatMessageId);
  await sendManagerMessage({ companyId: params.companyId, chatId: params.chatId, authorId: params.meId, body: params.text, replyToId });
}

export type PostState = { label: string; tone: Tone; hint: string };

/** The state pill and hint a post card shows, from the assignment's real status. */
export function chatPostState(post: ChatPost): PostState {
  switch (post.status) {
    case 'submitted':
      return { label: post.attempt > 1 ? `Take ${post.attempt} waiting` : 'Waiting on you', tone: 'blue', hint: 'Tap to review' };
    case 'changes_requested':
      return { label: 'Changes requested', tone: 'amber', hint: 'Tap for history' };
    case 'approved':
      return { label: 'Approved', tone: 'green', hint: 'Tap to view' };
    case 'posted':
      return { label: 'Live', tone: 'green', hint: 'Tap to view' };
    case 'recorded':
      return { label: 'Recording', tone: 'blue', hint: 'Tap for history' };
    default:
      return { label: 'Assigned', tone: 'grey', hint: 'Tap for history' };
  }
}

/** Where tapping a post card lands: Review while waiting, the post once approved, its history otherwise. */
export function chatPostRoute(post: ChatPost): Href {
  if (post.status === 'submitted') return { pathname: '/(admin)/review/[id]', params: { id: post.assignmentId } };
  if (post.status === 'approved' || post.status === 'posted') return { pathname: '/(admin)/brief-post/[id]', params: { id: post.assignmentId } };
  return { pathname: '/(admin)/post-thread/[assignmentId]', params: { assignmentId: post.assignmentId } };
}

/** A creator's most recent posts for the "A post" attach picker, newest first. */
export async function listAttachablePosts(companyId: string, creatorId: string): Promise<PostSummary[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id);
  const summaries = await listPostSummaries(companyId, ids);
  return ids.flatMap((id) => {
    const s = summaries.get(id);
    return s ? [s] : [];
  });
}
