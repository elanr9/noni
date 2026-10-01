// Every reference post a manager pastes is a post that already won in the
// niche. It is scraped and broken down once into a pattern card (cheap
// model), cards are distilled into the company's reference_playbook doc
// every few new studies (writer model), and the writer reads that doc on
// every draft. The stored scrape doubles as a cache for ingest-brief.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { readSocialPost, type ReadPost } from './scrapeSocial.ts';
import { askClaude, parseClaudeJson, softenDashes } from './wp8.ts';

export type PatternCard = {
  topic: string;
  hook_spoken: string | null;
  hook_on_screen: string | null;
  hook_type: string;
  structure: string[];
  on_screen_text: string[];
  insider_details: string[];
  phrases: string[];
  product_mention: string | null;
  cta: string | null;
  why_it_works: string;
  quality: number;
};

export type ReferenceStudy = {
  id: string;
  url: string;
  status: 'pending' | 'done' | 'failed';
  platform: string | null;
  format: string | null;
  caption: string | null;
  transcript: string | null;
  slide_texts: string[] | null;
  pattern: PatternCard | null;
  error: string | null;
};

const STUDY_COLUMNS =
  'id, url, status, platform, format, caption, transcript, slide_texts, pattern, error';

export const MIN_PLAYBOOK_QUALITY = 3;

export const NO_SOURCE_ERROR =
  'Could not read the spoken words or slide text from this post, so there is nothing to learn from. Try a post with a voiceover or a slideshow with text.';

/** A caption alone is marketing copy, not the post; only speech or slide text teaches anything. */
export function hasReadableSource(read: {
  transcript: string | null;
  slideTexts: string[] | null;
}): boolean {
  return Boolean(read.transcript?.trim()) || Boolean(read.slideTexts?.some((s) => s.trim()));
}

/** Share links carry tracking params; the post is the path. */
export function normalizeReferenceUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url.trim();
  }
}

const PATTERN_SYSTEM = `You break down one short form social post that performed well, so a writer can learn from it. You get the caption and the transcript or slide text. Answer with one JSON object and nothing else:
{"topic": string, "hook_spoken": string | null, "hook_on_screen": string | null, "hook_type": "fear_of_loss" | "insider_guarantee" | "contrarian" | "curiosity_gap" | "counted_value" | "story" | "other", "structure": string[], "on_screen_text": string[], "insider_details": string[], "phrases": string[], "product_mention": string | null, "cta": string | null, "why_it_works": string, "quality": number}
- topic: what the post is about in under 12 words.
- hook_spoken and hook_on_screen: copied word for word from the source; null when absent.
- structure: the beats in order, one per entry, each 6 to 14 words, saying what that beat does and its specific content.
- on_screen_text: text cards and slide headers copied word for word, up to 8.
- insider_details: facts, numbers, names, dates, rules or scenarios that show real expertise, copied or closely paraphrased, up to 6. Generic advice anyone could guess never goes here.
- phrases: exact lines in the speaker's own voice worth learning from, up to 6.
- product_mention: how a product or service is brought in, word for word, or null.
- quality: 1 to 5, how good a model this is for writing a new post (5 means specific, expert and native).
Never invent content the source does not contain. Inside string values use single quotes for quoted speech.`;

function sourceText(read: {
  caption: string | null;
  transcript: string | null;
  slideTexts: string[] | null;
  format: string | null;
}): string {
  return [
    `Format: ${read.format === 'photo_carousel' ? 'photo slideshow' : 'video'}`,
    read.caption ? `Caption: ${read.caption.slice(0, 600)}` : null,
    read.transcript ? `Transcript: ${read.transcript.slice(0, 5000)}` : null,
    read.slideTexts?.length
      ? `Slides:\n${read.slideTexts.map((s, i) => `[${i + 1}] ${s}`).join('\n').slice(0, 4000)}`
      : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

export async function extractPattern(input: {
  caption: string | null;
  transcript: string | null;
  slideTexts: string[] | null;
  format: string | null;
}): Promise<PatternCard | null> {
  if (!hasReadableSource(input)) return null;
  const raw = await askClaude(PATTERN_SYSTEM, sourceText(input), 1500, { tier: 'fast' });
  const card = parseClaudeJson<PatternCard>(raw);
  const list = (v: unknown, max: number) =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, max) : [];
  return {
    topic: String(card.topic ?? ''),
    hook_spoken: card.hook_spoken ? String(card.hook_spoken) : null,
    hook_on_screen: card.hook_on_screen ? String(card.hook_on_screen) : null,
    hook_type: String(card.hook_type ?? 'other'),
    structure: list(card.structure, 12),
    on_screen_text: list(card.on_screen_text, 8),
    insider_details: list(card.insider_details, 6),
    phrases: list(card.phrases, 6),
    product_mention: card.product_mention ? String(card.product_mention) : null,
    cta: card.cta ? String(card.cta) : null,
    why_it_works: String(card.why_it_works ?? ''),
    quality: Math.max(1, Math.min(5, Number(card.quality) || 3)),
  };
}

export async function loadStudy(
  admin: SupabaseClient,
  companyId: string,
  url: string,
): Promise<ReferenceStudy | null> {
  const { data } = await admin
    .from('reference_studies')
    .select(STUDY_COLUMNS)
    .eq('company_id', companyId)
    .eq('url', normalizeReferenceUrl(url))
    .maybeSingle();
  return (data as ReferenceStudy | null) ?? null;
}

/**
 * The stored study for this reference, scraping and studying it the first
 * time. `alreadyRead` lets a caller that scraped the post itself skip the
 * scrape. Never throws on a failed breakdown: the scrape is still saved.
 */
export async function studyReference(
  admin: SupabaseClient,
  companyId: string,
  url: string,
  options: { libraryItemId?: string | null; alreadyRead?: ReadPost | null } = {},
): Promise<ReferenceStudy | null> {
  const key = normalizeReferenceUrl(url);
  const existing = await loadStudy(admin, companyId, key);
  if (existing?.status === 'done' && existing.pattern) {
    if (options.libraryItemId) {
      await admin
        .from('reference_studies')
        .update({ library_item_id: options.libraryItemId })
        .eq('id', existing.id)
        .is('library_item_id', null);
    }
    return existing;
  }

  const read = options.alreadyRead ?? (await readSocialPost(url));
  if (!read) {
    await admin.from('reference_studies').upsert(
      {
        company_id: companyId,
        url: key,
        library_item_id: options.libraryItemId ?? null,
        status: 'failed',
        error: 'could not read the post',
      },
      { onConflict: 'company_id,url' },
    );
    return null;
  }

  let pattern: PatternCard | null = null;
  let error: string | null = null;
  if (!hasReadableSource(read)) {
    error = NO_SOURCE_ERROR;
  } else {
    try {
      pattern = await extractPattern({
        caption: read.post.caption,
        transcript: read.transcript,
        slideTexts: read.slideTexts,
        format: read.post.format,
      });
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 300) : 'pattern failed';
      console.warn('reference pattern failed:', error);
    }
  }

  const row: Record<string, unknown> = {
    company_id: companyId,
    url: key,
    status: pattern ? 'done' : 'failed',
    platform: read.post.platform,
    format: read.post.format,
    caption: read.post.caption.slice(0, 2000),
    transcript: read.transcript?.slice(0, 8000) ?? null,
    slide_texts: read.slideTexts,
    pattern,
    error,
    studied_at: new Date().toISOString(),
  };
  if (options.libraryItemId) row.library_item_id = options.libraryItemId;
  const { data, error: upsertError } = await admin
    .from('reference_studies')
    .upsert(row, { onConflict: 'company_id,url' })
    .select(STUDY_COLUMNS)
    .single();
  if (upsertError) throw new Error(`reference_studies write failed: ${upsertError.message}`);
  return data as ReferenceStudy;
}

/** A pattern card as prompt lines, for the playbook distill and for a draft built on that reference. */
export function patternLines(card: PatternCard): string {
  const lines = [
    `Topic: ${card.topic}`,
    card.hook_spoken ? `Hook said: ${card.hook_spoken}` : null,
    card.hook_on_screen ? `Hook on screen: ${card.hook_on_screen}` : null,
    `Hook type: ${card.hook_type}`,
    card.structure.length ? `Beats: ${card.structure.join(' / ')}` : null,
    card.on_screen_text.length ? `On screen text: ${card.on_screen_text.join(' | ')}` : null,
    card.insider_details.length ? `Insider details: ${card.insider_details.join(' | ')}` : null,
    card.phrases.length ? `Lines in their voice: ${card.phrases.join(' | ')}` : null,
    card.product_mention ? `Product mention: ${card.product_mention}` : null,
    `Why it works: ${card.why_it_works}`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
  return stripDashes(lines);
}

function stripDashes(text: string): string {
  return softenDashes(text).replace(/[—–]/g, ', ');
}

const DISTILL_SYSTEM = `You maintain the reference playbook of a short form content team: what the winning posts in their niche have in common, written so a scriptwriter copies the craft and never the words. You get breakdowns of reference posts the team picked because they performed. Every reference you get is a strong model; treat each as proof of what works. Write markdown with exactly these sections, concrete and short, quoting the references word for word as evidence:
## Hooks that won
The hook shapes used, each with verbatim hooks from the references.
## How the body is built
Beat order, pacing, how many points, how each point is made concrete.
## On-screen text
How text cards and slide headers are written, with verbatim examples. Say plainly how long they run and whether they are full thoughts or labels.
## The level of detail
The insider details the references use (numbers, names, dates, rules, scenarios), quoted, so the writer knows how specific a point must be.
## How they talk
Real phrases from the references and the register they set.
## How the product comes in
How any product or service is mentioned, verbatim, and where in the post.
## Never do
Patterns the references avoid, and generic moves they never make.
Stay under 900 words. Never state a fact the breakdowns do not contain.
Write every line as a confident instruction or a quoted example. Never comment on the references themselves: no remarks on how many there are, how thin the evidence is, how strong or weak a reference is, no gap flags, caveats, warnings or notes to the reader, and no sections beyond the seven above. Use only plain punctuation: no em dashes or en dashes anywhere, use a comma or the word 'to' instead.`;

const DISTILL_EVERY = 3;
const DISTILL_MAX_CARDS = 40;

/**
 * Rebuilds reference_playbook when it is missing or DISTILL_EVERY studies
 * have landed since it was written. A manager edited playbook is left alone.
 * Only cards scoring MIN_PLAYBOOK_QUALITY or better are distilled; when none
 * qualify, an auto generated playbook is removed so nothing weak is taught.
 */
export async function maybeDistillPlaybook(
  admin: SupabaseClient,
  companyId: string,
  force = false,
): Promise<boolean> {
  const { data: doc } = await admin
    .from('brand_docs')
    .select('updated_at, human_edited')
    .eq('company_id', companyId)
    .eq('kind', 'reference_playbook')
    .maybeSingle();
  if (doc?.human_edited && !force) return false;

  const { data: rows } = await admin
    .from('reference_studies')
    .select('url, format, pattern')
    .eq('company_id', companyId)
    .eq('status', 'done')
    .not('pattern', 'is', null)
    .order('studied_at', { ascending: false })
    .limit(DISTILL_MAX_CARDS);
  const cards = ((rows ?? []) as Array<{ url: string; format: string | null; pattern: PatternCard }>)
    .filter((c) => (c.pattern.quality ?? 0) >= MIN_PLAYBOOK_QUALITY)
    .sort((a, b) => b.pattern.quality - a.pattern.quality);
  if (cards.length === 0) {
    if (doc && !doc.human_edited) {
      await admin
        .from('brand_docs')
        .delete()
        .eq('company_id', companyId)
        .eq('kind', 'reference_playbook')
        .eq('human_edited', false);
    }
    return false;
  }

  let newer = admin
    .from('reference_studies')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'done');
  if (doc?.updated_at) newer = newer.gt('studied_at', doc.updated_at);
  const { count } = await newer;
  if (!force && doc && (count ?? 0) < DISTILL_EVERY) return false;

  const user = cards
    .map(
      (c, i) =>
        `Reference ${i + 1} (${c.format === 'photo_carousel' ? 'slideshow' : 'video'}):\n${patternLines(c.pattern)}`,
    )
    .join('\n\n');
  const content = stripDashes((await askClaude(DISTILL_SYSTEM, user, 3000)).trim());
  if (!content) return false;
  const { error } = await admin.from('brand_docs').upsert(
    {
      company_id: companyId,
      kind: 'reference_playbook',
      content,
      human_edited: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,kind' },
  );
  if (error) throw new Error(`reference_playbook write failed: ${error.message}`);
  return true;
}
