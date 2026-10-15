// The idea chat kept on the device per campaign, so leaving the screen and
// coming back keeps the conversation and every card's state ("Writing into
// slot 05", "In slot 05", dismissed). Storage failures never break the chat.
//
// "Make it" runs here, outside the screen: the post keeps writing when the
// manager leaves the chat, and its card state lands in the saved chat either
// way. While the screen is open it applies the change and saves; when it is
// closed the change is written straight to storage.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { postTypesFor, slotLabel } from './brief-copy';
import { addBriefToWeek, clearWeekSlot, getWeekBrief, resolvePostTypeId, type WeekSlot } from './briefs-api';
import { makeFromIdea, type ChatIdea } from './deck-ai';
import { inputFromIdeaMake, parseStoredChat, STORED_MESSAGES, withIdeaState, type ChatMessage, type IdeaState, type MakeKind } from './idea-chat';
import { supabase } from './supabase';

const key = (campaignId: string) => `noni.ideaChat.v1:${campaignId}`;

export async function loadIdeaChat(campaignId: string): Promise<ChatMessage[]> {
  try {
    return parseStoredChat(await AsyncStorage.getItem(key(campaignId)));
  } catch {
    return [];
  }
}

export async function saveIdeaChat(campaignId: string, messages: ChatMessage[]): Promise<void> {
  try {
    if (!messages.length) await AsyncStorage.removeItem(key(campaignId));
    else await AsyncStorage.setItem(key(campaignId), JSON.stringify(messages.slice(-STORED_MESSAGES)));
  } catch (e) {
    console.warn('idea chat save failed', e);
  }
}

// ---------------------------------------------------------------------------
// Card state changes from background makes

export type IdeaChatEvent = {
  patch: (messages: ChatMessage[]) => ChatMessage[];
  /** A message for the screen's toast. */
  notice?: string;
};

const listeners = new Map<string, Set<(e: IdeaChatEvent) => void>>();
const running = new Set<string>();
const jobKey = (campaignId: string, messageId: string, index: number) => `${campaignId}|${messageId}|${index}`;

/** The open screen takes every card change for its campaign (and saves it itself). */
export function subscribeIdeaChat(campaignId: string, fn: (e: IdeaChatEvent) => void): () => void {
  let set = listeners.get(campaignId);
  if (!set) {
    set = new Set();
    listeners.set(campaignId, set);
  }
  const mine = set;
  mine.add(fn);
  return () => {
    mine.delete(fn);
    if (!mine.size) listeners.delete(campaignId);
  };
}

// Writes to storage queue up so two finishing makes never overwrite each other.
let storageChain: Promise<void> = Promise.resolve();

function emit(campaignId: string, event: IdeaChatEvent): void {
  const set = listeners.get(campaignId);
  if (set?.size) {
    for (const fn of set) fn(event);
    return;
  }
  storageChain = storageChain
    .then(async () => {
      const list = await loadIdeaChat(campaignId);
      if (list.length) await saveIdeaChat(campaignId, event.patch(list));
    })
    .catch(() => undefined);
}

export function setIdeaState(campaignId: string, messageId: string, index: number, state: IdeaState | null, notice?: string): void {
  emit(campaignId, { patch: (m) => withIdeaState(m, messageId, index, state), notice });
}

export function isMakeRunning(campaignId: string, messageId: string, index: number): boolean {
  return running.has(jobKey(campaignId, messageId, index));
}

/**
 * Writes the card into the slot in the background: write-deck make with the
 * card pinned, then the post saved into the slot's brief, ready. The card
 * shows "Writing into slot 05" right away and "In slot 05" when saved; a
 * failure puts it back with a toast.
 */
export function runIdeaMake(p: {
  campaignId: string;
  companyId: string;
  messageId: string;
  index: number;
  idea: ChatIdea;
  kind: MakeKind;
  slot: WeekSlot;
}): void {
  const k = jobKey(p.campaignId, p.messageId, p.index);
  if (running.has(k)) return;
  running.add(k);
  const at = { slot: p.slot.index, briefId: p.slot.briefId, kind: p.kind };
  setIdeaState(p.campaignId, p.messageId, p.index, { status: 'writing', ...at });
  void (async () => {
    try {
      const filled = new Error(`Slot ${slotLabel(p.slot.index)} just got filled. Tap Make it again.`);
      // Fail fast when the slot filled since the week last loaded; the write keeps going meanwhile.
      const writing = makeFromIdea(p.idea, p.kind);
      writing.catch(() => undefined);
      if (await getWeekBrief(p.slot.briefId)) throw filled;
      const made = await writing;
      const spec = postTypesFor(made.format).find((t) => t.id === made.postTypeId);
      const postTypeId = spec ? await resolvePostTypeId(p.companyId, spec) : null;
      // Someone may have filled the slot while this was writing; never write over it.
      if (await getWeekBrief(p.slot.briefId)) throw filled;
      await addBriefToWeek(p.slot.briefId, inputFromIdeaMake(made, postTypeId));
      // The learning loop compares the manager's later edits against this.
      const snap = await supabase.rpc('snapshot_ai_brief', { p_brief_id: p.slot.briefId, p_source_kind: 'idea' });
      if (snap.error) console.warn('snapshot_ai_brief failed:', snap.error.message);
      setIdeaState(p.campaignId, p.messageId, p.index, { status: 'made', ...at });
    } catch (e) {
      setIdeaState(p.campaignId, p.messageId, p.index, null, e instanceof Error ? e.message : 'Could not write this post. Try again.');
    } finally {
      running.delete(k);
    }
  })();
}

/** Undo: the slot is emptied again and the card goes back to a fresh pitch. */
export async function undoIdeaMake(campaignId: string, messageId: string, index: number, briefId: string): Promise<void> {
  await clearWeekSlot(briefId);
  setIdeaState(campaignId, messageId, index, null);
}
