// Creator side AI asks, all through brief-assist regenerate_field. The
// creator's current slides or clips go up as the draft so the answer fits
// what they already made. Nothing is saved by these calls.
import {
  assistRegenerateField,
  toBriefFormat,
  type RegenDraftPayload,
  type TalkingPoint,
  type WeekBrief,
} from '../../../lib/briefs-api';

export type AiLine = { text: string };

function draftFrom(brief: WeekBrief, lines: string[], hook: string | null): RegenDraftPayload {
  const points: TalkingPoint[] = lines.map((text, i) => ({
    id: `p${i}`,
    text,
    is_product: false,
    edited_by_admin: false,
  }));
  return {
    title: brief.title || lines[0] || 'Freestyle',
    search_phrase: brief.searchTerm || null,
    format: toBriefFormat(brief.format),
    point_count: Math.max(1, points.length),
    target_words: brief.format === 'reel' ? 120 : 60,
    hook,
    hook_options: hook ? [hook] : [],
    talking_points: points,
    cta: brief.cta.text || null,
    caption: brief.caption,
    hashtags: brief.hashtags,
    why_it_works: '',
    script: null,
  };
}

export async function suggestHooks(brief: WeekBrief, lines: string[]): Promise<string[]> {
  const result = await assistRegenerateField({
    field: 'hook',
    draft: draftFrom(brief, lines, null),
    postTypeKey: brief.postTypeKey ?? undefined,
  });
  if (result.kind === 'kill') throw new Error(result.kill_reason);
  return result.kind === 'hook' ? result.hook_options : [];
}

/** Fresh text for every own slide, in order. */
export async function suggestAllLines(brief: WeekBrief, lines: string[], hook: string | null): Promise<string[]> {
  const result = await assistRegenerateField({
    field: 'talking_points',
    draft: draftFrom(brief, lines, hook),
    postTypeKey: brief.postTypeKey ?? undefined,
  });
  if (result.kind === 'kill') throw new Error(result.kill_reason);
  if (result.kind !== 'talking_points') return [];
  return result.talking_points.map((p) => p.text ?? '').filter(Boolean);
}

/** One rewrite of the line at index. */
export async function suggestLine(brief: WeekBrief, lines: string[], hook: string | null, index: number): Promise<string[]> {
  const result = await assistRegenerateField({
    field: 'talking_point',
    draft: draftFrom(brief, lines, hook),
    postTypeKey: brief.postTypeKey ?? undefined,
    index,
  });
  if (result.kind === 'kill') throw new Error(result.kill_reason);
  if (result.kind !== 'talking_point') return [];
  return result.talking_point.text ? [result.talking_point.text] : [];
}

export async function fillCaption(brief: WeekBrief, lines: string[], hook: string | null): Promise<{ caption: string; hashtags: string[] }> {
  const result = await assistRegenerateField({
    field: 'caption',
    draft: draftFrom(brief, lines, hook),
    postTypeKey: brief.postTypeKey ?? undefined,
  });
  if (result.kind === 'kill') throw new Error(result.kill_reason);
  return result.kind === 'caption' ? { caption: result.caption, hashtags: result.hashtags } : { caption: '', hashtags: [] };
}

export async function fillSearchPhrase(brief: WeekBrief, lines: string[], hook: string | null): Promise<string> {
  const result = await assistRegenerateField({
    field: 'search_phrase',
    draft: draftFrom(brief, lines, hook),
    postTypeKey: brief.postTypeKey ?? undefined,
  });
  if (result.kind === 'kill') throw new Error(result.kill_reason);
  return result.kind === 'search_phrase' ? (result.search_phrase ?? '') : '';
}
