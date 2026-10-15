// The Revise with AI conversation for one post: what the manager asked and
// the AI's one line note of what changed. Pure helpers; the device store is
// revise-chat-store.ts.

export type ReviseTurn = { role: 'user' | 'ai'; text: string; at: number };

/** Turns kept per post. */
export const REVISE_TURNS = 30;

export function parseReviseChat(raw: string | null): ReviseTurn[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: ReviseTurn[] = [];
  for (const v of data) {
    if (!v || typeof v !== 'object') continue;
    const m = v as Record<string, unknown>;
    if ((m.role !== 'user' && m.role !== 'ai') || typeof m.text !== 'string' || !m.text.trim()) continue;
    out.push({ role: m.role, text: m.text, at: typeof m.at === 'number' ? m.at : 0 });
  }
  return out.slice(-REVISE_TURNS);
}

export function addTurn(list: ReviseTurn[], role: ReviseTurn['role'], text: string, at = Date.now()): ReviseTurn[] {
  const t = text.trim();
  if (!t) return list;
  return [...list, { role, text: t, at }].slice(-REVISE_TURNS);
}

/** What the AI says back after a revise: its own note, else a plain line. */
export function reviseReply(note: string | null | undefined, ok: boolean): string {
  if (!ok) return 'That did not go through. Try again.';
  return note?.trim() || 'Updated the post.';
}
