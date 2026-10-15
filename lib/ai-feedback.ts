// Every signal a manager gives the AI (edits, dismissed ideas, revise notes),
// saved as it happens so the next generation learns from it. Fire and
// forget: feedback never blocks or breaks the screen that sends it.

import { supabase } from './supabase';

export type AiFeedback = {
  companyId: string;
  kind: 'edit' | 'dismiss' | 'revise' | 'approve';
  surface: 'editor' | 'ideas' | 'library' | 'check';
  format?: string | null;
  postType?: string | null;
  role?: string | null;
  before?: string | null;
  after?: string | null;
  note?: string | null;
  briefId?: string | null;
};

const clip = (t: string | null | undefined) => (t ? t.slice(0, 2000) : null);

export function logAiFeedback(items: AiFeedback | AiFeedback[]): void {
  const rows = (Array.isArray(items) ? items : [items])
    .filter((f) => f.companyId)
    .map((f) => ({
      company_id: f.companyId,
      kind: f.kind,
      surface: f.surface,
      format: f.format ?? null,
      post_type: f.postType ?? null,
      role: f.role ?? null,
      before: clip(f.before),
      after: clip(f.after),
      note: clip(f.note),
      brief_id: f.briefId ?? null,
    }));
  if (!rows.length) return;
  // The table is newer than the generated types.
  void (supabase.from('ai_feedback' as never) as unknown as { insert: (r: unknown) => Promise<{ error: unknown }> })
    .insert(rows)
    .then(({ error }) => {
      if (error) console.warn('ai feedback not saved', error);
    });
}
