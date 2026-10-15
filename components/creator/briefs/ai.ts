// Creator side AI asks, all through write-deck. The manager's slides go up
// locked, the creator's own lines go up as theirs, and only the creator's
// lines come back, so every answer fits the post they are making and the
// brief they were given. Nothing is saved by these calls.
import { postTypeByKey } from '../../../lib/brief-copy';
import type { WeekBrief } from '../../../lib/briefs-api';
import { creatorDeck, type CreatorDeckSlide } from '../../../lib/deck-ai';

export type AiLine = { text: string };

/**
 * The post as the creator sees it. Reels: lines[0] is the hook clip. Slides:
 * lines[0] is the cover only on Freestyle, where every slide is the creator's.
 * The manager's cover, points and CTA go up locked so the model writes around
 * them; the creator's lines go up as theirs.
 */
function deckFor(brief: WeekBrief, lines: string[]): { slides: CreatorDeckSlide[]; own: number[] } {
  const reel = brief.format === 'reel';
  const mgr: CreatorDeckSlide[] = brief.slides.map((s) => ({ ...s, own: false }));
  const ownSlide = (text: string, role: CreatorDeckSlide['role']): CreatorDeckSlide => ({ role, text, shot: '', inset_feature_id: null, own: true });
  const coverOwn = reel || mgr.length === 0;
  const body = coverOwn ? lines.slice(1) : lines;
  const cover = coverOwn ? ownSlide(lines[0] ?? '', 'cover') : (mgr.find((s) => s.role === 'cover') ?? ownSlide('', 'cover'));
  const points = mgr.filter((s) => s.role === 'point');
  const cta = mgr.find((s) => s.role === 'cta') ?? null;
  const slides: CreatorDeckSlide[] = [cover, ...points, ...body.map((t) => ownSlide(t, 'point')), ...(cta ? [cta] : [])];
  const own = slides.map((s, i) => (s.own ? i : -1)).filter((i) => i >= 0);
  return { slides, own };
}

function base(brief: WeekBrief) {
  return { briefId: brief.id, format: brief.format, kind: brief.kind, postType: postTypeByKey(brief.postTypeKey) };
}

/** Cover or hook options that fit the post so far. */
export async function suggestHooks(brief: WeekBrief, lines: string[]): Promise<string[]> {
  const { slides } = deckFor(brief, lines);
  const { ideas } = await creatorDeck({ ...base(brief), mode: 'ideas', slides });
  // The hook lands on the on screen text (the cover overlay), so it is the
  // cover line for reels too, never the spoken say line.
  return ideas.map((d) => d.cover || d.say).filter((t): t is string => Boolean(t && t.trim()));
}

/** Fresh text for every own line, in order. */
export async function suggestAllLines(brief: WeekBrief, lines: string[], _hook: string | null): Promise<string[]> {
  const { slides, own } = deckFor(brief, lines.map(() => ''));
  const { result } = await creatorDeck({ ...base(brief), mode: 'all', slides, only: own });
  return result ? own.map((i) => result.slides[i]?.text ?? '') : [];
}

/** One rewrite of the own line at index. */
export async function suggestLine(brief: WeekBrief, lines: string[], _hook: string | null, index: number): Promise<string[]> {
  const { slides, own } = deckFor(brief, lines);
  const at = own[index];
  if (at === undefined) return [];
  const blanked = slides.map((s, i) => (i === at ? { ...s, text: '' } : s));
  const { result } = await creatorDeck({ ...base(brief), mode: 'all', slides: blanked, only: [at] });
  const text = result?.slides[at]?.text ?? '';
  return text ? [text] : [];
}

// Caption and search phrase come from one call; the details step asks for
// both at once.
const pending = new Map<string, ReturnType<typeof creatorDeck>>();
function details(brief: WeekBrief, lines: string[]) {
  const key = `${brief.id}:${lines.join('|')}`;
  const hit = pending.get(key);
  if (hit) return hit;
  const { slides } = deckFor(brief, lines);
  const p = creatorDeck({ ...base(brief), mode: 'details', slides, caption: brief.caption, hashtags: brief.hashtags, searchPhrase: brief.searchTerm });
  pending.set(key, p);
  void p.finally(() => setTimeout(() => pending.delete(key), 5000));
  return p;
}

export async function fillCaption(brief: WeekBrief, lines: string[], _hook: string | null): Promise<{ caption: string; hashtags: string[] }> {
  const { result } = await details(brief, lines);
  return { caption: result?.caption ?? '', hashtags: result?.hashtags ?? [] };
}

export async function fillSearchPhrase(brief: WeekBrief, lines: string[], _hook: string | null): Promise<string> {
  const { result } = await details(brief, lines);
  return result?.searchPhrase ?? '';
}
