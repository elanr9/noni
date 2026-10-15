// Ask AI for a reel, from the plan: every clip goes up in timeline order,
// the manager's points locked and the creator's own lines (the hook and free
// clips) as theirs, so answers fit the whole post. Hooks come back as the
// on screen cover text, never the spoken line.
import { postTypeByKey } from '../../../../lib/brief-copy';
import type { WeekBrief } from '../../../../lib/briefs-api';
import { creatorDeck, type CreatorDeckSlide } from '../../../../lib/deck-ai';
import type { ReelPlanItem } from './plan';

/** The creator writes this clip's on screen text. */
export function isOwnLine(item: ReelPlanItem): boolean {
  return item.free || item.role === 'cover';
}

export function reelDeck(items: ReelPlanItem[]): CreatorDeckSlide[] {
  return items.map((p) => ({ role: p.role, text: p.text, shot: p.say, inset_feature_id: p.insetFeatureId, own: isOwnLine(p) }));
}

function base(brief: WeekBrief) {
  return { briefId: brief.id, format: brief.format, kind: brief.kind, postType: postTypeByKey(brief.postTypeKey) };
}

/** Cover text options that fit the post so far. */
export async function reelHooks(brief: WeekBrief, items: ReelPlanItem[]): Promise<string[]> {
  const { ideas } = await creatorDeck({ ...base(brief), mode: 'ideas', slides: reelDeck(items) });
  return ideas.map((d) => d.cover).filter((t) => t.trim() !== '');
}

/** One rewrite of the on screen text of an own clip. */
export async function reelLine(brief: WeekBrief, items: ReelPlanItem[], itemId: string): Promise<string[]> {
  const at = items.findIndex((p) => p.id === itemId);
  if (at < 0 || !isOwnLine(items[at])) return [];
  const slides = reelDeck(items).map((s, i) => (i === at ? { ...s, text: '' } : s));
  const { result } = await creatorDeck({ ...base(brief), mode: 'all', slides, only: [at] });
  const text = result?.slides[at]?.text ?? '';
  return text ? [text] : [];
}
