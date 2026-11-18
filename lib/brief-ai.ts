/**
 * "Fill in with AI" for the Briefs forms. Every fill is written by the
 * brief-fill edge function from the active company's brand context (product,
 * audience, voice, features, approved claims). Nothing here is canned copy:
 * when the call fails the caller shows an error and the form stays as typed.
 */
import { newClip, stText, type BriefClip, type BriefType, type GuidedState } from './brief-library';
import { supabase } from './supabase';

export type GuidedPlan = { title: string; phrase: string; clips: BriefClip[]; caption: string; tags: string[] };

type FillClip = { say: string; onScreen: string; cta: boolean };
type FillResponse = { title?: string; phrase?: string; clips?: FillClip[]; caption?: string; tags?: string[]; notes?: string; titles?: string[]; error?: string };

async function callFill(body: Record<string, unknown>): Promise<FillResponse> {
  const { data, error } = await supabase.functions.invoke<FillResponse>('brief-fill', { body });
  if (error) {
    // FunctionsHttpError carries the response; surface the server's message when there is one.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) message = j.error;
      }
    } catch {
      // keep the transport message
    }
    throw new Error(message);
  }
  if (!data || data.error) throw new Error(data?.error ?? 'No answer from the writer');
  return data;
}

/** Green screen, per clip mode: hook and CTA face to camera, the points get the creator's own background. */
function greenify(clips: BriefClip[], g: GuidedState, type: BriefType): BriefClip[] {
  if (type !== 'Greenscreen' || g.fullGreen) return clips;
  return clips.map((c, i) => ({ ...c, green: i > 0 && !c.cta, gs: null }));
}

/** A guided plan (title, search phrase, clips, caption, tags) for this company. Throws on failure. */
export async function planGuided(g: GuidedState, type: BriefType): Promise<GuidedPlan> {
  const res = await callFill({ mode: 'guided', type, title: g.title, link: g.link, linkNotes: g.linkNotes });
  const raw = res.clips ?? [];
  const clips = raw.map((c) =>
    type === 'Slideshow' && c.cta
      ? newClip('', { onScreen: c.onScreen, cta: true, doc: { texts: [stText(c.onScreen, { y: 22, size: 20 })], overlays: [] } })
      : newClip(type === 'Slideshow' || type === 'Long Text' ? '' : c.say, { onScreen: c.onScreen, cta: c.cta }),
  );
  return {
    title: (res.title || g.title || '').trim(),
    phrase: (res.phrase || '').trim(),
    clips: greenify(clips, g, type),
    caption: (res.caption || '').trim(),
    tags: res.tags ?? [],
  };
}

/** Outline fill: a title (kept when the manager typed one) and notes, from a link or a title. */
export async function planOutline(input: { title: string; link: string }): Promise<{ title: string; notes: string }> {
  const res = await callFill({ mode: 'outline', title: input.title, link: input.link });
  return { title: (res.title || '').trim(), notes: (res.notes || '').trim() };
}

/** The on-screen story for a Long Text post. */
export async function longTextPlan(title: string): Promise<string> {
  const res = await callFill({ mode: 'long_text', type: 'Long Text', title });
  return (res.clips?.[0]?.onScreen || '').trim();
}

export const LONG_TEXT_NOTES = 'One take, eyes on the lens, natural light. Hold the frame for the full 7 seconds.';

/** Title ideas for what is typed so far, written for this company. */
export async function fetchTitleIdeas(typed: string, type: BriefType | null): Promise<string[]> {
  const res = await callFill({ mode: 'titles', type: type ?? 'Talking Head', typed });
  return (res.titles ?? []).filter(Boolean);
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A creator's copy of a stored long text: `{a|b}` spins resolve again so no two accounts post the same string. */
export function varyLongText(src: string): string {
  if (!src.includes('{')) return src;
  const spin = (s: string) =>
    s
      .replace(/\{([^{}]+)\}/g, (_, g: string) => pick(g.split('|')))
      .replace(/\s+([.,!?])/g, '$1')
      .replace(/ {2,}/g, ' ')
      .trim();
  return src
    .split('\n\n')
    .map((p) => cap(spin(p)))
    .join('\n\n');
}

/** Words of `t` that start with a typed word, for bolding in the suggestion list. */
export function matchedWords(t: string, typed: string): { text: string; hit: boolean }[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  return t.split(/(\s+)/).map((w) => ({ text: w, hit: !!w.trim() && words.some((q) => w.toLowerCase().startsWith(q)) }));
}

/** The first http(s) or bare tiktok/instagram/youtube link in pasted text, or null. */
export function linkFrom(text: string): string | null {
  const m = text.match(/https?:\/\/\S+|(?:www\.)?(?:tiktok\.com|instagram\.com|youtube\.com|youtu\.be)\/\S+/i);
  return m ? m[0].replace(/[),.]+$/, '') : null;
}
