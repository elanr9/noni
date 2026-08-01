// Workstream C: scraping and extraction.
//
// Two corpora, never mixed: format_donor accounts teach structure (format
// classification -> format_examples), niche accounts teach claims and
// vocabulary (claim mining, saturation). Handle first; search is fallback
// only. Every kept post is classified against the twelve bible formats.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  askClaude,
  askClaudeVision,
  audienceDoc,
  authenticate,
  jsonResponse,
  loadBrandContext,
  loadGoldenExamples,
  parseClaudeJson,
  type BrandContext,
  type SourcingTerm,
} from '../_shared/wp8.ts';
import {
  buildGatePrompt,
  RELEVANCE_THRESHOLD,
  type GateItem,
  type GateVerdict,
} from '../_shared/relevance.ts';
import {
  buildClassifyPrompt,
  CLASSIFY_CONFIDENCE_THRESHOLD,
  EXAMPLE_CONFIDENCE_THRESHOLD,
  type ClassifyFormat,
  type ClassifyItem,
  type ClassifyVerdict,
} from '../_shared/classify.ts';
import {
  buildClaimMiningPrompt,
  type MiningItem,
  type MiningResult,
} from '../_shared/mine-claims.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SEARCH_MIN_VIEWS = 10000;
const HANDLE_MIN_VIEWS = 2000;
// Plan cap: OCR the first four slides only.
const MAX_OCR_SLIDES = 4;
const MAX_PROBATION_PROFILES = 4;
const MAX_QUERIES = 3;
const MAX_HASHTAGS = 3;
// Search kicks in only when the handle universe is thin.
const MIN_ACCOUNTS_BEFORE_SEARCH = 3;
const MIN_HANDLE_ITEMS_BEFORE_SEARCH = 8;
const COMMENTS_PER_POST = 25;
// Account health: sustained junk gets muted, first keeper ends probation.
const MUTE_MIN_SCRAPES = 10;
const MUTE_KEEPER_RATE = 0.1;
const FINGERPRINT_MIN_CHARS = 40;
// Donor keeper signal: outperforming the account's own norm this run,
// independent of format classification (the library must be falsifiable).
const DONOR_NORM_MULTIPLE = 1.5;
const DONOR_NORM_MIN_SAMPLE = 3;
// Saturation: topic share over a rolling window of recent niche items.
const SATURATION_WINDOW_ITEMS = 200;
const SATURATION_WINDOW_DAYS = 90;
const SATURATION_MIN_SAMPLE = 30;
const BACKFILL_MIN_TARGET = 16;
const BACKFILL_MAX_TARGET = 1000;

type CorpusSlots = { niche: number; donor: number };

// Weekly runs are maintenance-sized; backfill is the one-off corpus build
// ({"mode": "backfill", "target": 500} in the request body).
type RunConfig = {
  mode: 'weekly' | 'backfill';
  targetItems: number;
  chunkSize: number;
  // Comment scraping budgets are per corpus, never a shared pool: niche
  // comments feed claim mining, donor comments only yield CTA keyword
  // counts, so donors must not starve the niche side.
  commentBudgetNiche: number;
  commentBudgetDonor: number;
  fingerprintWindow: number;
  gateBatch: number;
  classifyBatch: number;
  // Profile slots are split per corpus (least-recently-scraped first within
  // each) so neither corpus can consume a run; unfilled slots spill over.
  tiktokSlots: CorpusSlots;
  instagramSlots: CorpusSlots;
  // Null means compute from targetItems and account count at scrape time.
  profileResultsPerPage: number | null;
  searchResultsPerPage: number;
};

const WEEKLY_CONFIG: RunConfig = {
  mode: 'weekly',
  targetItems: 16,
  chunkSize: 16,
  commentBudgetNiche: 5,
  commentBudgetDonor: 1,
  fingerprintWindow: 500,
  gateBatch: 10,
  classifyBatch: 8,
  tiktokSlots: { niche: 4, donor: 2 },
  instagramSlots: { niche: 3, donor: 1 },
  profileResultsPerPage: 4,
  searchResultsPerPage: 6,
};

function backfillConfig(target: number): RunConfig {
  const t = Math.min(
    Math.max(Math.round(target) || BACKFILL_MIN_TARGET, BACKFILL_MIN_TARGET),
    BACKFILL_MAX_TARGET,
  );
  return {
    mode: 'backfill',
    targetItems: t,
    chunkSize: 20,
    // Comments are the primary claim source; the backfill is the one chance
    // to build that corpus, so the budget is an order of magnitude higher
    // and weighted hard toward niche (donor comments cannot feed claims).
    commentBudgetNiche: 150,
    commentBudgetDonor: 50,
    fingerprintWindow: Math.max(3000, t * 4),
    gateBatch: 20,
    classifyBatch: 16,
    tiktokSlots: { niche: 7, donor: 5 },
    instagramSlots: { niche: 5, donor: 3 },
    profileResultsPerPage: null,
    searchResultsPerPage: 30,
  };
}

type Corpus = 'format_donor' | 'niche';

type ScrapedItem = {
  platform: 'tiktok' | 'instagram';
  source_url: string;
  author_handle: string | null;
  views: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  caption: string;
  media_url: string | null;
  cover_url: string | null;
  transcript_url: string | null;
  format: 'video' | 'carousel';
  image_urls: string[] | null;
  source_kind: 'handle' | 'search';
  source_term: string | null;
  corpus: Corpus;
};

async function apifyRun(actor: string, input: Record<string, unknown>): Promise<unknown[]> {
  const token = Deno.env.get('APIFY_API_TOKEN');
  if (!token) throw new Error('APIFY_API_TOKEN not set');
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(240000),
    },
  );
  if (!res.ok) throw new Error(`Apify ${actor} ${res.status}: ${await res.text()}`);
  return (await res.json()) as unknown[];
}

type TikTokItem = {
  text?: string;
  playCount?: number;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  webVideoUrl?: string;
  mediaUrls?: string[];
  authorMeta?: { name?: string };
  videoMeta?: {
    coverUrl?: string;
    originalCoverUrl?: string;
    transcriptionLink?: string;
  };
  imagePost?: {
    images?: Array<{ imageURL?: { urlList?: string[] } }>;
  };
  slideshowImageLinks?: Array<{ downloadLink?: string }>;
};

// TikTok photo-mode posts surface their slides under imagePost or
// slideshowImageLinks depending on actor version; either marks a carousel.
function tiktokSlideUrls(i: TikTokItem): string[] {
  const fromImagePost = (i.imagePost?.images ?? [])
    .map((img) => img.imageURL?.urlList?.[0])
    .filter((u): u is string => Boolean(u));
  if (fromImagePost.length > 0) return fromImagePost;
  return (i.slideshowImageLinks ?? [])
    .map((l) => l.downloadLink)
    .filter((u): u is string => Boolean(u));
}

function mapTikTok(
  i: TikTokItem,
  sourceKind: 'handle' | 'search',
  sourceTerm: string | null,
  corpus: Corpus,
): ScrapedItem | null {
  if (!i.webVideoUrl) return null;
  const slides = tiktokSlideUrls(i);
  const isCarousel = slides.length > 0;
  return {
    platform: 'tiktok',
    source_url: i.webVideoUrl,
    author_handle: i.authorMeta?.name ?? null,
    views: i.playCount ?? 0,
    likes: i.diggCount ?? null,
    comments: i.commentCount ?? null,
    shares: i.shareCount ?? null,
    caption: i.text ?? '',
    media_url: isCarousel ? null : i.mediaUrls?.[0] ?? null,
    cover_url:
      i.videoMeta?.coverUrl ?? i.videoMeta?.originalCoverUrl ?? slides[0] ?? null,
    transcript_url: isCarousel ? null : i.videoMeta?.transcriptionLink ?? null,
    format: isCarousel ? 'carousel' : 'video',
    image_urls: isCarousel ? slides : null,
    source_kind: sourceKind,
    source_term: sourceTerm,
    corpus,
  };
}

const TIKTOK_COMMON = {
  shouldDownloadCovers: true,
  // Actor generates a transcript per video (TikTok CC when present, else its
  // own speech-to-text) and returns a fetchable transcriptionLink. This is
  // our primary transcript source; Deepgram is the fallback.
  downloadSubtitlesOptions: 'DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES',
};

async function scrapeTikTokQuery(term: string, resultsPerPage: number): Promise<ScrapedItem[]> {
  const items = (await apifyRun('clockworks~tiktok-scraper', {
    searchQueries: [term],
    resultsPerPage,
    ...TIKTOK_COMMON,
  })) as TikTokItem[];
  return items
    .map((i) => mapTikTok(i, 'search', term, 'niche'))
    .filter((i): i is ScrapedItem => i !== null);
}

// Profiles go to Apify in groups of a few handles per sync call: one call
// for a deep backfill across many profiles would hit the sync run timeout.
const PROFILES_PER_APIFY_CALL = 4;

async function scrapeTikTokProfiles(
  handles: string[],
  corpusByHandle: Map<string, Corpus>,
  resultsPerPage: number,
): Promise<ScrapedItem[]> {
  const out: ScrapedItem[] = [];
  for (let start = 0; start < handles.length; start += PROFILES_PER_APIFY_CALL) {
    const group = handles.slice(start, start + PROFILES_PER_APIFY_CALL);
    try {
      const items = (await apifyRun('clockworks~tiktok-scraper', {
        profiles: group.map((h) => h.replace(/^@/, '')),
        resultsPerPage,
        ...TIKTOK_COMMON,
      })) as TikTokItem[];
      for (const i of items) {
        const handle = (i.authorMeta?.name ?? '').replace(/^@/, '');
        const mapped = mapTikTok(i, 'handle', null, corpusByHandle.get(`tiktok:${handle}`) ?? 'niche');
        if (mapped) out.push(mapped);
      }
    } catch (e) {
      console.error(`tiktok profile group [${group.join(', ')}] failed:`, e);
    }
  }
  return out;
}

type InstagramItem = {
  type?: string;
  url?: string;
  caption?: string;
  videoUrl?: string;
  displayUrl?: string;
  images?: string[];
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  ownerUsername?: string;
};

function mapInstagram(
  i: InstagramItem,
  sourceKind: 'handle' | 'search',
  sourceTerm: string | null,
  corpus: Corpus,
  fallbackHandle?: string,
): ScrapedItem | null {
  if (!i.url) return null;
  const isCarousel = i.type === 'Sidecar' && (i.images?.length ?? 0) > 0;
  return {
    platform: 'instagram',
    source_url: i.url,
    author_handle: i.ownerUsername ?? fallbackHandle ?? null,
    views: i.videoPlayCount ?? i.videoViewCount ?? 0,
    likes: i.likesCount ?? null,
    comments: i.commentsCount ?? null,
    shares: null,
    caption: i.caption ?? '',
    media_url: isCarousel ? null : i.videoUrl ?? null,
    cover_url: i.displayUrl ?? i.images?.[0] ?? null,
    transcript_url: null,
    format: isCarousel ? 'carousel' : 'video',
    image_urls: isCarousel ? (i.images ?? []) : null,
    source_kind: sourceKind,
    source_term: sourceTerm,
    corpus,
  };
}

async function scrapeInstagramHashtag(tag: string, resultsLimit: number): Promise<ScrapedItem[]> {
  const items = (await apifyRun('apify~instagram-hashtag-scraper', {
    hashtags: [tag],
    resultsLimit,
  })) as InstagramItem[];
  return items
    .map((i) => mapInstagram(i, 'search', tag, 'niche'))
    .filter((i): i is ScrapedItem => i !== null);
}

type InstagramProfile = { username?: string; latestPosts?: InstagramItem[] };

async function scrapeInstagramProfiles(
  handles: string[],
  corpusByHandle: Map<string, Corpus>,
  resultsLimit: number,
): Promise<ScrapedItem[]> {
  const out: ScrapedItem[] = [];
  for (let start = 0; start < handles.length; start += PROFILES_PER_APIFY_CALL) {
    const group = handles.slice(start, start + PROFILES_PER_APIFY_CALL);
    try {
      // resultsLimit is best effort: the profile actor's latestPosts depth is
      // actor-controlled and may ignore it.
      const profiles = (await apifyRun('apify~instagram-profile-scraper', {
        usernames: group.map((h) => h.replace(/^@/, '')),
        resultsLimit,
      })) as InstagramProfile[];
      for (const profile of profiles) {
        const corpus =
          corpusByHandle.get(`instagram:${(profile.username ?? '').replace(/^@/, '')}`) ?? 'niche';
        for (const post of profile.latestPosts ?? []) {
          const mapped = mapInstagram(post, 'handle', null, corpus, profile.username);
          if (mapped) out.push(mapped);
        }
      }
    } catch (e) {
      console.error(`instagram profile group [${group.join(', ')}] failed:`, e);
    }
  }
  return out;
}

// Fetches the actor's transcript text file (KV store record, token-gated).
async function fetchApifyTranscript(url: string): Promise<string | null> {
  const token = Deno.env.get('APIFY_API_TOKEN');
  if (!token) return null;
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}token=${token}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function transcribe(mediaUrl: string): Promise<string | null> {
  const key = Deno.env.get('DEEPGRAM_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: mediaUrl }),
        signal: AbortSignal.timeout(90000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: {
        channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
      };
    };
    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || null;
  } catch {
    return null;
  }
}

// Transcript resolver: actor transcription first, Deepgram fallback, else
// null (callers fall back to the caption).
async function resolveTranscript(item: ScrapedItem): Promise<string | null> {
  if (item.transcript_url) {
    const t = await fetchApifyTranscript(item.transcript_url);
    if (t) return t;
  }
  if (item.media_url) return transcribe(item.media_url);
  return null;
}

// --------------------------------------------------------------------------
// OCR with a content-hash cache: the same slideshow reposted under a new URL
// costs one OCR total, ever.

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function imageHash(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (res.ok) return sha256Hex(await res.arrayBuffer());
  } catch {
    // fall through to URL-based hash
  }
  const encoder = new TextEncoder();
  return sha256Hex(encoder.encode(url.split('?')[0]).buffer as ArrayBuffer);
}

async function ocrBatch(imageUrls: string[]): Promise<string[] | null> {
  try {
    const system = `You transcribe the text on social media slideshow images. Answer with a single JSON object: {"slides": string[]}, one string per image in order. Each string is all readable overlay/design text on that slide, cleaned up. Use "" for a slide with no text.`;
    const raw = await askClaudeVision(system, imageUrls, `Transcribe all ${imageUrls.length} slides.`);
    const { slides } = parseClaudeJson<{ slides: string[] }>(raw);
    return Array.isArray(slides) ? slides.map((s) => String(s)) : null;
  } catch (e) {
    console.error('slide OCR failed:', e);
    return null;
  }
}

async function ocrSlidesCached(
  admin: SupabaseClient,
  companyId: string,
  imageUrls: string[],
): Promise<string[] | null> {
  const urls = imageUrls.slice(0, MAX_OCR_SLIDES);
  const hashes = await Promise.all(urls.map(imageHash));

  const { data: cached } = await admin
    .from('ocr_cache')
    .select('image_hash, slide_text')
    .eq('company_id', companyId)
    .in('image_hash', hashes);
  const cache = new Map((cached ?? []).map((r) => [r.image_hash, r.slide_text]));

  const missIndexes = hashes
    .map((h, i) => (cache.has(h) ? -1 : i))
    .filter((i) => i >= 0);
  if (missIndexes.length > 0) {
    const texts = await ocrBatch(missIndexes.map((i) => urls[i]));
    if (texts === null && cache.size === 0) return null;
    if (texts) {
      const rows = missIndexes.map((slideIdx, batchIdx) => ({
        company_id: companyId,
        image_hash: hashes[slideIdx],
        slide_text: texts[batchIdx] ?? '',
      }));
      for (const row of rows) cache.set(row.image_hash, row.slide_text);
      const { error } = await admin
        .from('ocr_cache')
        .upsert(rows, { onConflict: 'company_id,image_hash', ignoreDuplicates: true });
      if (error) console.error('ocr cache write:', error.message);
    }
  }
  return hashes.map((h) => cache.get(h) ?? '');
}

// --------------------------------------------------------------------------

type EnrichedItem = ScrapedItem & {
  transcript: string | null;
  slide_texts: string[] | null;
  // Caption is the only text we have (video without transcript, carousel
  // without OCR). Too thin to classify a format from or to harvest examples;
  // downstream consumers (golden set, coverage stats) filter on this.
  low_signal: boolean;
};

function isLowSignal(item: ScrapedItem, transcript: string | null, slideTexts: string[] | null): boolean {
  if (item.format === 'video') return transcript === null;
  return !slideTexts || !slideTexts.some((s) => s.trim().length > 0);
}

// Near-duplicate fingerprint: normalized prefix of the post's text content.
function contentFingerprint(item: EnrichedItem): string | null {
  const text = (
    item.slide_texts?.join(' ') ??
    item.transcript ??
    item.caption
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return text.length >= FINGERPRINT_MIN_CHARS ? text.slice(0, 240) : null;
}

type Annotation = { index: number; hook: string; why_it_works: string };

async function annotate(items: EnrichedItem[]): Promise<Annotation[]> {
  const system = `You analyze trending short form posts for a UGC team. Answer with a single JSON array, one object per input item: {"index": number, "hook": string, "why_it_works": string}. hook: the post's attention grab in one line (quote the opening if available, otherwise infer from the caption; for slideshows the first slide is the hook). why_it_works: one punchy sentence a content strategist would say about why this post performed.`;
  const user = items
    .map((it, i) => {
      const body =
        it.format === 'carousel' && it.slide_texts?.length
          ? `Slides: ${it.slide_texts.map((s, n) => `[${n + 1}] ${s}`).join(' ').slice(0, 1200)}`
          : `Transcript: ${it.transcript ? it.transcript.slice(0, 1200) : 'unavailable'}`;
      return `Item ${i} (${it.platform} ${it.format}, ${it.views} views)\nCaption: ${it.caption.slice(0, 300)}\n${body}`;
    })
    .join('\n\n');
  return parseClaudeJson<Annotation[]>(await askClaude(system, user, 4096));
}

// Relevance gate: niche corpus only. Format donors are cross-vertical by
// design and would fail an audience-relevance check on purpose.
async function runGate(
  brand: BrandContext,
  admin: SupabaseClient,
  companyId: string,
  items: EnrichedItem[],
  batchSize: number,
): Promise<Map<number, GateVerdict>> {
  const nicheIndexes = items
    .map((it, i) => (it.corpus === 'niche' ? i : -1))
    .filter((i) => i >= 0);
  if (nicheIndexes.length === 0) return new Map();

  const golden = await loadGoldenExamples(admin, companyId);
  const doc = audienceDoc(brand);
  const verdicts = new Map<number, GateVerdict>();
  for (let start = 0; start < nicheIndexes.length; start += batchSize) {
    const batch = nicheIndexes.slice(start, start + batchSize);
    const gateItems: GateItem[] = batch.map((idx) => ({
      index: idx,
      platform: items[idx].platform,
      format: items[idx].format,
      authorHandle: items[idx].author_handle,
      views: items[idx].views,
      caption: items[idx].caption,
      transcript: items[idx].transcript,
      slideTexts: items[idx].slide_texts,
    }));
    const { system, user } = buildGatePrompt(doc, golden, gateItems);
    try {
      const parsed = parseClaudeJson<GateVerdict[]>(await askClaude(system, user, 4096));
      for (const v of parsed) verdicts.set(v.index, v);
    } catch (e) {
      console.error('relevance gate failed for batch:', e);
    }
  }
  return verdicts;
}

// Format classification against the twelve bible formats, all corpora.
// Every verdict is kept: unconfident ones carry format_id null plus the raw
// confidence and a reason, so library coverage is measurable. Low-signal
// items are never sent (a caption-only classification is corrupting).
async function classifyItems(
  formats: ClassifyFormat[],
  items: EnrichedItem[],
  batchSize: number,
): Promise<Map<number, ClassifyVerdict>> {
  const verdicts = new Map<number, ClassifyVerdict>();
  const eligible = items
    .map((it, i) => (it.low_signal ? -1 : i))
    .filter((i) => i >= 0);
  for (let start = 0; start < eligible.length; start += batchSize) {
    const batch: ClassifyItem[] = eligible
      .slice(start, start + batchSize)
      .map((idx) => ({
        index: idx,
        platform: items[idx].platform,
        format: items[idx].format,
        caption: items[idx].caption,
        transcript: items[idx].transcript,
        slideTexts: items[idx].slide_texts,
      }));
    const { system, user } = buildClassifyPrompt(formats, batch);
    try {
      const parsed = parseClaudeJson<ClassifyVerdict[]>(await askClaude(system, user, 8192));
      for (const v of parsed) {
        const confidence = typeof v.confidence === 'number' ? v.confidence : 0;
        const confident = confidence >= CLASSIFY_CONFIDENCE_THRESHOLD && Boolean(v.format_id);
        verdicts.set(v.index, {
          index: v.index,
          format_id: confident ? v.format_id : null,
          confidence,
          slot_fills: confident ? v.slot_fills ?? {} : {},
          reason: confident
            ? null
            : v.reason ??
              (v.format_id
                ? `matched ${v.format_id} below confidence threshold`
                : 'no format fit, no reason given'),
        });
      }
    } catch (e) {
      console.error('classification failed for batch:', e);
    }
  }
  return verdicts;
}

async function loadFormats(admin: SupabaseClient): Promise<ClassifyFormat[]> {
  const { data, error } = await admin
    .from('formats')
    .select('id, name, family, when_to_use, slot_schema');
  if (error) throw error;
  return (data ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    family: f.family as string,
    when_to_use: f.when_to_use as string,
    slots: (f.slot_schema as Array<{ key: string; label: string; required: boolean }>).map(
      (s) => ({ key: s.key, label: s.label, required: s.required }),
    ),
  }));
}

// --------------------------------------------------------------------------
// Comment scraping: CTA keyword counts plus questions for claim mining.

type TikTokComment = { text?: string; videoWebUrl?: string; postUrl?: string };

function ctaKeywordFromPost(item: EnrichedItem): string | null {
  const text = `${item.caption} ${item.transcript ?? ''}`;
  const match = text.match(/comment\s+["'\u201c]?([a-z0-9]{2,15})["'\u201d]?/i);
  return match ? match[1].toLowerCase() : null;
}

// Targets are selected per corpus against separate budgets (claim mining
// only consumes niche questions; donors only get CTA keyword counts), then
// scraped in one actor call.
async function scrapeComments(
  items: EnrichedItem[],
  keeperIndexes: number[],
  nicheBudget: number,
  donorBudget: number,
): Promise<{
  ctaCounts: Map<number, number>;
  questions: string[];
  nicheScraped: number;
  donorScraped: number;
}> {
  const eligible = keeperIndexes.filter(
    (i) => items[i].platform === 'tiktok' && (items[i].comments ?? 0) > 0,
  );
  const nicheTargets = eligible
    .filter((i) => items[i].corpus === 'niche')
    .slice(0, Math.max(nicheBudget, 0));
  const donorTargets = eligible
    .filter((i) => items[i].corpus === 'format_donor')
    .slice(0, Math.max(donorBudget, 0));
  const targets = [...nicheTargets, ...donorTargets];
  const ctaCounts = new Map<number, number>();
  const questions: string[] = [];
  if (targets.length === 0) {
    return { ctaCounts, questions, nicheScraped: 0, donorScraped: 0 };
  }

  let comments: TikTokComment[];
  try {
    comments = (await apifyRun('clockworks~tiktok-comments-scraper', {
      postURLs: targets.map((i) => items[i].source_url),
      commentsPerPost: COMMENTS_PER_POST,
    })) as TikTokComment[];
  } catch (e) {
    console.error('comment scrape failed:', e);
    // Count the attempt against each corpus budget: a flaky actor must not
    // turn into unbounded retries of paid runs.
    return {
      ctaCounts,
      questions,
      nicheScraped: nicheTargets.length,
      donorScraped: donorTargets.length,
    };
  }

  const byUrl = new Map<string, string[]>();
  for (const c of comments) {
    const url = c.videoWebUrl ?? c.postUrl;
    const text = (c.text ?? '').trim();
    if (!url || !text) continue;
    const list = byUrl.get(url) ?? [];
    list.push(text);
    byUrl.set(url, list);
  }

  for (const i of targets) {
    const postComments = byUrl.get(items[i].source_url) ?? [];
    const keyword = ctaKeywordFromPost(items[i]);
    if (keyword) {
      const count = postComments.filter(
        (c) => c.toLowerCase().replace(/[^a-z0-9]/g, '') === keyword,
      ).length;
      ctaCounts.set(i, count);
    }
    // Question comments feed claim mining, which is niche-only; donor
    // questions would mix the corpora.
    if (items[i].corpus !== 'niche') continue;
    for (const c of postComments) {
      if (c.endsWith('?') && c.length >= 10 && c.length <= 200) questions.push(c);
    }
  }
  return {
    ctaCounts,
    questions,
    nicheScraped: nicheTargets.length,
    donorScraped: donorTargets.length,
  };
}

// --------------------------------------------------------------------------
// Claim mining and saturation, niche corpus only.

function normalizeClaim(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function mineClaims(
  admin: SupabaseClient,
  companyId: string,
  brand: BrandContext,
  items: EnrichedItem[],
  nicheKeeperIndexes: number[],
  commentQuestions: string[],
): Promise<void> {
  if (nicheKeeperIndexes.length === 0 && commentQuestions.length === 0) return;

  const { data: existingRows } = await admin
    .from('claims')
    .select('claim')
    .eq('company_id', companyId)
    .limit(200);
  const existing = (existingRows ?? []).map((r) => r.claim as string);
  const existingNormalized = new Set(existing.map(normalizeClaim));

  const miningItems: MiningItem[] = nicheKeeperIndexes.map((idx, i) => ({
    index: i,
    caption: items[idx].caption,
    transcript: items[idx].transcript,
    slideTexts: items[idx].slide_texts,
  }));
  const { system, user } = buildClaimMiningPrompt(
    audienceDoc(brand),
    existing.slice(0, 60),
    miningItems,
    commentQuestions.slice(0, 40),
  );

  let result: MiningResult;
  try {
    result = parseClaudeJson<MiningResult>(await askClaude(system, user, 8192));
  } catch (e) {
    console.error('claim mining failed:', e);
    return;
  }

  // Persist each item's topic on its trend_items row (inserted just before
  // this call), then score saturation against the rolling window.
  for (const t of result.topic_by_item ?? []) {
    const topic = t.topic?.toLowerCase().trim();
    const keptIdx = nicheKeeperIndexes[t.index];
    if (!topic || keptIdx === undefined) continue;
    const { error } = await admin
      .from('trend_items')
      .update({ topic })
      .eq('company_id', companyId)
      .eq('source_url', items[keptIdx].source_url);
    if (error) console.error('topic update:', error.message);
  }

  // Saturation: the topic's share of the last N niche items. A topic at
  // SATURATION_FULL_SHARE of the window scores 10. Below the minimum sample
  // the honest answer is null (unknown), never a fake number. The full-share
  // divisor is env-tunable so it can be calibrated from the post-backfill
  // topic distribution without a redeploy.
  const since = new Date(Date.now() - SATURATION_WINDOW_DAYS * 86400000).toISOString();
  const { data: windowRows } = await admin
    .from('trend_items')
    .select('topic')
    .eq('company_id', companyId)
    .not('topic', 'is', null)
    .gte('scraped_at', since)
    .order('scraped_at', { ascending: false })
    .limit(SATURATION_WINDOW_ITEMS);
  const windowTopics = (windowRows ?? []).map((r) => (r.topic as string).toLowerCase().trim());
  const fullShare = Number(Deno.env.get('SATURATION_FULL_SHARE') ?? '0.3');
  const saturationFor = (topic: string): number | null => {
    const t = topic.toLowerCase().trim();
    if (!t || windowTopics.length < SATURATION_MIN_SAMPLE) return null;
    const share = windowTopics.filter((x) => x === t).length / windowTopics.length;
    return Math.min(10, Math.round((share / fullShare) * 10));
  };

  const rows = (result.claims ?? [])
    .filter((c) => c.claim && !existingNormalized.has(normalizeClaim(c.claim)))
    .map((c) => ({
      company_id: companyId,
      claim: c.claim,
      proof: c.proof ?? null,
      audience_segment: c.audience_segment ?? null,
      saturation_score: saturationFor(c.topic ?? ''),
      source: 'harvested',
      status: 'candidate',
      confidence: typeof c.confidence === 'number' ? c.confidence : null,
    }));
  if (rows.length > 0) {
    const { error } = await admin.from('claims').insert(rows);
    if (error) console.error('claims insert:', error.message);
  }

  const phrases = [...new Set((result.vocabulary ?? []).map((p) => p.toLowerCase().trim()))]
    .filter((p) => p.length >= 4 && p.length <= 60)
    .map((p) => ({ company_id: companyId, phrase: p, source: 'harvested' }));
  if (phrases.length > 0) {
    const { error } = await admin
      .from('vocabulary')
      .upsert(phrases, { onConflict: 'company_id,phrase', ignoreDuplicates: true });
    if (error) console.error('vocabulary upsert:', error.message);
  }
}

// Donor keepers (outperformers by the engagement norm, not by matching the
// library) with confident classifications become tenant format examples.
async function harvestFormatExamples(
  admin: SupabaseClient,
  companyId: string,
  items: EnrichedItem[],
  classifications: Map<number, ClassifyVerdict>,
  keeperIndexes: Set<number>,
): Promise<void> {
  const rows: Array<{
    company_id: string;
    format_id: string;
    slot_key: string;
    example: string;
    source: string;
  }> = [];
  for (const [idx, verdict] of classifications) {
    if (items[idx].corpus !== 'format_donor' || !keeperIndexes.has(idx)) continue;
    if (verdict.confidence < EXAMPLE_CONFIDENCE_THRESHOLD || !verdict.format_id) continue;
    for (const [slotKey, value] of Object.entries(verdict.slot_fills ?? {})) {
      const example = String(value).trim();
      if (example.length === 0 || example.length > 600) continue;
      rows.push({
        company_id: companyId,
        format_id: verdict.format_id,
        slot_key: slotKey,
        example,
        source: 'harvested',
      });
    }
  }
  if (rows.length > 0) {
    const { error } = await admin.from('format_examples').insert(rows);
    if (error) console.error('format examples insert:', error.message);
  }
}

// --------------------------------------------------------------------------

// Search term selection: saved terms with the best keeper rates first, then
// Claude proposes new ones (at most 2 per kind per run) to fill the slots.
async function pickTerms(
  brand: BrandContext,
): Promise<{ queries: string[]; hashtags: string[] }> {
  const byRate = (a: SourcingTerm, b: SourcingTerm) =>
    b.keepers / Math.max(b.scrapes, 1) - a.keepers / Math.max(a.scrapes, 1);
  const saved = (kind: 'query' | 'hashtag', max: number) =>
    brand.sourcingTerms
      .filter((t) => t.kind === kind)
      .sort(byRate)
      .slice(0, max)
      .map((t) => t.term);

  const queries = saved('query', MAX_QUERIES);
  const hashtags = saved('hashtag', MAX_HASHTAGS);
  const needQueries = Math.min(MAX_QUERIES - queries.length, 2);
  const needHashtags = Math.min(MAX_HASHTAGS - hashtags.length, 2);
  if (needQueries <= 0 && needHashtags <= 0) return { queries, hashtags };

  const system = `You turn a brand's audience document into social search inputs that surface real UGC creators the brand's audience already follows. Answer with a single JSON object: {"queries": string[], "hashtags": string[]}. queries: exactly ${Math.max(needQueries, 0)} TikTok search phrases (2 to 4 words, what real users type) tightly focused on the audience's real journey, not generic tips. hashtags: exactly ${Math.max(needHashtags, 0)} single-word Instagram hashtags (no # symbol, lowercase). Prefer terms about the audience's goals and status over broad skill content. Do not repeat these already-used terms: ${[...queries, ...hashtags].join(', ') || 'none'}.`;
  try {
    const proposed = parseClaudeJson<{ queries?: string[]; hashtags?: string[] }>(
      await askClaude(system, audienceDoc(brand), 512),
    );
    for (const q of proposed.queries ?? []) {
      if (queries.length < MAX_QUERIES && !queries.includes(q)) queries.push(q);
    }
    for (const h of (proposed.hashtags ?? []).map((x) => x.replace(/^#/, '').toLowerCase())) {
      if (hashtags.length < MAX_HASHTAGS && !hashtags.includes(h)) hashtags.push(h);
    }
  } catch (e) {
    console.error('term proposal failed:', e);
  }
  return { queries, hashtags };
}

type SourceAccount = {
  id: string;
  platform: string;
  handle: string;
  status: string;
  corpus: Corpus;
};

// Reference handles from company settings become permanent source accounts.
// They are UGC creator handles, which for this product live on TikTok.
async function seedSourceAccounts(
  admin: SupabaseClient,
  companyId: string,
  brand: BrandContext,
): Promise<void> {
  if (brand.referenceHandles.length === 0) return;
  const rows = brand.referenceHandles.map((h) => ({
    company_id: companyId,
    platform: 'tiktok',
    handle: h.replace(/^@/, ''),
    corpus: 'niche',
  }));
  const { error } = await admin
    .from('source_accounts')
    .upsert(rows, { onConflict: 'company_id,platform,handle', ignoreDuplicates: true });
  if (error) console.error('seed source accounts:', error.message);
}

// A platform's slots are filled per corpus first (input order, i.e.
// least-recently-scraped first, is preserved), then any unfilled slots
// spill over to the other corpus so a one-sided universe (e.g. Instagram
// with no donors yet) never wastes paid scrape capacity.
function pickPlatformAccounts(
  pool: SourceAccount[],
  platform: string,
  slots: CorpusSlots,
): SourceAccount[] {
  const candidates = pool.filter((r) => r.platform === platform);
  const picked = [
    ...candidates.filter((r) => r.corpus === 'niche').slice(0, slots.niche),
    ...candidates.filter((r) => r.corpus === 'format_donor').slice(0, slots.donor),
  ];
  const chosen = new Set(picked.map((r) => r.id));
  const spill = candidates.filter((r) => !chosen.has(r.id));
  return [...picked, ...spill.slice(0, Math.max(slots.niche + slots.donor - picked.length, 0))];
}

// Active accounts plus a bounded slice of probation accounts, so discovered
// accounts actually get scraped instead of being muted into a deadlock.
async function loadAccountsToScrape(
  admin: SupabaseClient,
  companyId: string,
  cfg: RunConfig,
): Promise<SourceAccount[]> {
  const { data } = await admin
    .from('source_accounts')
    .select('id, platform, handle, status, corpus')
    .eq('company_id', companyId)
    .in('status', ['active', 'probation'])
    .order('last_scraped_at', { ascending: true, nullsFirst: true });
  const rows = (data ?? []) as SourceAccount[];
  const active = rows.filter((r) => r.status === 'active');
  const probation = rows.filter((r) => r.status === 'probation').slice(0, MAX_PROBATION_PROFILES);
  const picked = [...active, ...probation];
  return [
    ...pickPlatformAccounts(picked, 'tiktok', cfg.tiktokSlots),
    ...pickPlatformAccounts(picked, 'instagram', cfg.instagramSlots),
  ];
}

// Donor engagement norms: median views per donor account over everything we
// sampled from it this run. A donor post is kept for outperforming its own
// account's norm, never for matching the format library (which would make
// the library unfalsifiable).
function donorViewNorms(
  scraped: ScrapedItem[],
): Map<string, { median: number; sample: number }> {
  const byAccount = new Map<string, number[]>();
  for (const item of scraped) {
    if (item.corpus !== 'format_donor' || !item.author_handle) continue;
    const key = `${item.platform}:${item.author_handle.replace(/^@/, '')}`;
    const views = byAccount.get(key) ?? [];
    views.push(item.views);
    byAccount.set(key, views);
  }
  const norms = new Map<string, { median: number; sample: number }>();
  for (const [key, views] of byAccount) {
    const sorted = [...views].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    norms.set(key, { median, sample: sorted.length });
  }
  return norms;
}

function mergeTermStats(
  existing: SourcingTerm[],
  usage: Map<string, { kind: 'query' | 'hashtag'; term: string; scrapes: number; keepers: number }>,
): SourcingTerm[] {
  const merged = new Map(existing.map((t) => [`${t.kind}:${t.term}`, { ...t }]));
  for (const [key, u] of usage) {
    const cur = merged.get(key) ?? { term: u.term, kind: u.kind, keepers: 0, scrapes: 0 };
    cur.scrapes += u.scrapes;
    cur.keepers += u.keepers;
    merged.set(key, cur);
  }
  return [...merged.values()];
}

async function scrapeCompany(
  admin: SupabaseClient,
  companyId: string,
  cfg: RunConfig,
): Promise<number> {
  const brand = await loadBrandContext(admin, companyId);
  await seedSourceAccounts(admin, companyId, brand);

  const [accounts, formats] = await Promise.all([
    loadAccountsToScrape(admin, companyId, cfg),
    loadFormats(admin),
  ]);
  const corpusByHandle = new Map(
    accounts.map((a) => [`${a.platform}:${a.handle.replace(/^@/, '')}`, a.corpus]),
  );
  const tiktokHandles = accounts.filter((a) => a.platform === 'tiktok').map((a) => a.handle);
  const instagramHandles = accounts
    .filter((a) => a.platform === 'instagram')
    .map((a) => a.handle);

  // Depth per profile: weekly is fixed; backfill pages deep enough to hit
  // the target with headroom for view floors and dedupe losses.
  const accountCount = Math.max(tiktokHandles.length + instagramHandles.length, 1);
  const perProfile =
    cfg.profileResultsPerPage ??
    Math.min(100, Math.max(10, Math.ceil((cfg.targetItems * 1.5) / accountCount)));

  // Handle first. Search runs only when the account universe or its output
  // is too thin to fill the run.
  const handleSettled = await Promise.allSettled<ScrapedItem[]>([
    scrapeTikTokProfiles(tiktokHandles, corpusByHandle, perProfile),
    scrapeInstagramProfiles(instagramHandles, corpusByHandle, perProfile),
  ]);
  const scraped: ScrapedItem[] = [];
  for (const result of handleSettled) {
    if (result.status === 'fulfilled') scraped.push(...result.value);
    else console.error('handle scrape failed:', result.reason);
  }

  const handleItemCount = scraped.filter((i) => i.views >= HANDLE_MIN_VIEWS).length;
  if (
    accounts.length < MIN_ACCOUNTS_BEFORE_SEARCH ||
    handleItemCount < MIN_HANDLE_ITEMS_BEFORE_SEARCH ||
    (cfg.mode === 'backfill' && handleItemCount < cfg.targetItems)
  ) {
    const terms = await pickTerms(brand);
    const searchSettled = await Promise.allSettled<ScrapedItem[]>([
      ...terms.queries.map((q) => scrapeTikTokQuery(q, cfg.searchResultsPerPage)),
      ...terms.hashtags.map((h) => scrapeInstagramHashtag(h, cfg.searchResultsPerPage)),
    ]);
    for (const result of searchSettled) {
      if (result.status === 'fulfilled') scraped.push(...result.value);
      else console.error('search scrape failed:', result.reason);
    }
  }

  // Hard dedupe: platform plus post URL, within the batch and against history.
  const { data: existing } = await admin
    .from('trend_items')
    .select('source_url')
    .eq('company_id', companyId);
  const seen = new Set((existing ?? []).map((r) => r.source_url));

  const fresh = scraped
    .filter((i) => {
      const min = i.source_kind === 'handle' ? HANDLE_MIN_VIEWS : SEARCH_MIN_VIEWS;
      return i.views >= min && !seen.has(i.source_url);
    })
    .filter((i, idx, arr) => arr.findIndex((x) => x.source_url === i.source_url) === idx)
    // Handle items first (the corpus we chose on purpose), views only as the
    // tiebreak inside each group. Never a pure view ranking.
    .sort((a, b) =>
      a.source_kind === b.source_kind
        ? b.views - a.views
        : a.source_kind === 'handle'
          ? -1
          : 1,
    )
    .slice(0, cfg.targetItems);
  if (fresh.length === 0) return 0;

  const donorNorms = donorViewNorms(scraped);
  const donorKeeper = (item: EnrichedItem): boolean => {
    if (item.views < HANDLE_MIN_VIEWS) return false;
    const key = `${item.platform}:${(item.author_handle ?? '').replace(/^@/, '')}`;
    const norm = donorNorms.get(key);
    if (!norm || norm.sample < DONOR_NORM_MIN_SAMPLE) return true;
    return item.views >= DONOR_NORM_MULTIPLE * norm.median;
  };

  // Near-duplicate history, shared across chunks. The window scales with the
  // run so backfill dedupe does not degrade mid run.
  const { data: fingerprintRows } = await admin
    .from('trend_items')
    .select('content_fingerprint')
    .eq('company_id', companyId)
    .not('content_fingerprint', 'is', null)
    .order('scraped_at', { ascending: false })
    .limit(cfg.fingerprintWindow);
  const knownFingerprints = new Set(
    (fingerprintRows ?? []).map((r) => r.content_fingerprint as string),
  );

  // Chunked processing: enrich, judge, and insert per chunk so a killed
  // backfill keeps its partial progress and counts surface as it runs.
  let insertedTotal = 0;
  let nicheCommentBudget = cfg.commentBudgetNiche;
  let donorCommentBudget = cfg.commentBudgetDonor;
  const statsByHandle = new Map<string, { scrapes: number; keepers: number }>();
  const termUsage = new Map<
    string,
    { kind: 'query' | 'hashtag'; term: string; scrapes: number; keepers: number }
  >();
  const discovered = new Map<string, { platform: string; handle: string }>();
  const totalChunks = Math.ceil(fresh.length / cfg.chunkSize);

  for (let chunkStart = 0; chunkStart < fresh.length; chunkStart += cfg.chunkSize) {
    const chunkNumber = Math.floor(chunkStart / cfg.chunkSize) + 1;
    const chunk = fresh.slice(chunkStart, chunkStart + cfg.chunkSize);

    const enriched: EnrichedItem[] = await Promise.all(
      chunk.map(async (item) => {
        const transcript = item.format === 'video' ? await resolveTranscript(item) : null;
        const slide_texts =
          item.format === 'carousel' && item.image_urls?.length
            ? await ocrSlidesCached(admin, companyId, item.image_urls)
            : null;
        return {
          ...item,
          transcript,
          slide_texts,
          low_signal: isLowSignal(item, transcript, slide_texts),
        };
      }),
    );

    const kept: EnrichedItem[] = [];
    const fingerprints: Array<string | null> = [];
    for (const item of enriched) {
      const fp = contentFingerprint(item);
      if (fp && knownFingerprints.has(fp)) continue;
      if (fp) knownFingerprints.add(fp);
      kept.push(item);
      fingerprints.push(fp);
    }
    if (kept.length === 0) continue;

    let annotations: Annotation[] = [];
    try {
      annotations = await annotate(kept);
    } catch (e) {
      console.error('annotate failed:', e);
    }

    const [verdicts, classifications] = await Promise.all([
      runGate(brand, admin, companyId, kept, cfg.gateBatch),
      classifyItems(formats, kept, cfg.classifyBatch),
    ]);

    // Keeper: niche items pass the relevance gate; donor items outperform
    // their own account's norm. Classification never decides keeping.
    const passed = (i: number): boolean =>
      kept[i].corpus === 'niche'
        ? (verdicts.get(i)?.score ?? 0) >= RELEVANCE_THRESHOLD
        : donorKeeper(kept[i]);
    const keeperIndexes = kept.map((_, i) => i).filter(passed);

    const { ctaCounts, questions, nicheScraped, donorScraped } = await scrapeComments(
      kept,
      keeperIndexes,
      nicheCommentBudget,
      donorCommentBudget,
    );
    nicheCommentBudget -= nicheScraped;
    donorCommentBudget -= donorScraped;

    const rows = kept.map((item, i) => {
      const note = annotations.find((a) => a.index === i);
      const verdict = verdicts.get(i);
      const classification = classifications.get(i);
      return {
        company_id: companyId,
        platform: item.platform,
        source_url: item.source_url,
        author_handle: item.author_handle,
        views: item.views,
        likes: item.likes,
        comments: item.comments,
        shares: item.shares,
        transcript: item.transcript,
        cover_url: item.cover_url,
        caption: item.caption || null,
        format: item.format,
        image_urls: item.image_urls,
        slide_texts: item.slide_texts,
        source_kind: item.source_kind,
        content_fingerprint: fingerprints[i],
        low_signal: item.low_signal,
        relevance_score: verdict?.score ?? null,
        relevance_reason: verdict?.reason ?? null,
        format_id: classification?.format_id ?? null,
        slot_fills: classification?.slot_fills ?? null,
        classify_confidence: classification?.confidence ?? null,
        classify_reason: item.low_signal
          ? 'low signal: caption only, not classified'
          : classification?.reason ?? null,
        cta_keyword_count: ctaCounts.get(i) ?? null,
        hook: note?.hook ?? (item.caption ? item.caption.slice(0, 120) : null),
        why_it_works: note?.why_it_works ?? null,
      };
    });
    const { error } = await admin.from('trend_items').insert(rows);
    if (error) throw error;
    insertedTotal += rows.length;

    await harvestFormatExamples(admin, companyId, kept, classifications, new Set(keeperIndexes));

    const nicheKeepers = keeperIndexes.filter((i) => kept[i].corpus === 'niche');
    await mineClaims(admin, companyId, brand, kept, nicheKeepers, questions);

    // Accumulate run-level state; written once after all chunks.
    kept.forEach((item, i) => {
      if (item.source_kind === 'search' && passed(i) && item.author_handle) {
        const handle = item.author_handle.replace(/^@/, '');
        discovered.set(`${item.platform}:${handle}`, { platform: item.platform, handle });
      }
      if (item.source_kind === 'handle' && item.author_handle) {
        const key = `${item.platform}:${item.author_handle.replace(/^@/, '')}`;
        const cur = statsByHandle.get(key) ?? { scrapes: 0, keepers: 0 };
        cur.scrapes += 1;
        if (passed(i)) cur.keepers += 1;
        statsByHandle.set(key, cur);
      }
      if (item.source_kind === 'search' && item.source_term) {
        const kind: 'query' | 'hashtag' = item.platform === 'tiktok' ? 'query' : 'hashtag';
        const key = `${kind}:${item.source_term}`;
        const cur =
          termUsage.get(key) ?? { kind, term: item.source_term, scrapes: 0, keepers: 0 };
        cur.scrapes += 1;
        if (passed(i)) cur.keepers += 1;
        termUsage.set(key, cur);
      }
    });

    console.log(
      `scrape-trends ${cfg.mode} ${companyId} chunk ${chunkNumber}/${totalChunks}: ` +
        `${rows.length} inserted (${insertedTotal}/${cfg.targetItems} total), ` +
        `${keeperIndexes.length} keepers, comment budget left ` +
        `${nicheCommentBudget} niche / ${donorCommentBudget} donor`,
    );
  }

  // Universe expansion: authors of gate-passing search results join the
  // account universe on probation, in the niche corpus.
  if (discovered.size > 0) {
    const { error: discoverError } = await admin.from('source_accounts').upsert(
      [...discovered.values()].map((d) => ({
        company_id: companyId,
        platform: d.platform,
        handle: d.handle,
        status: 'probation',
        corpus: 'niche',
      })),
      { onConflict: 'company_id,platform,handle', ignoreDuplicates: true },
    );
    if (discoverError) console.error('discover accounts:', discoverError.message);
  }

  // Account health: keeper stats, probation promotion, junk auto-mute.
  for (const account of accounts) {
    const stats = statsByHandle.get(`${account.platform}:${account.handle.replace(/^@/, '')}`);
    const { data: current } = await admin
      .from('source_accounts')
      .select('scraped_count, keeper_count')
      .eq('id', account.id)
      .single();
    const scrapedCount = (current?.scraped_count ?? 0) + (stats?.scrapes ?? 0);
    const keeperCount = (current?.keeper_count ?? 0) + (stats?.keepers ?? 0);
    let status = account.status;
    if (account.status === 'probation' && keeperCount > 0) status = 'active';
    if (scrapedCount >= MUTE_MIN_SCRAPES && keeperCount / scrapedCount < MUTE_KEEPER_RATE) {
      status = 'muted';
    }
    const { error: statError } = await admin
      .from('source_accounts')
      .update({
        last_scraped_at: new Date().toISOString(),
        scraped_count: scrapedCount,
        keeper_count: keeperCount,
        status,
      })
      .eq('id', account.id);
    if (statError) console.error('account stats:', statError.message);
  }

  // Term memory: persist which search terms produced keepers.
  if (termUsage.size > 0) {
    const terms = mergeTermStats(brand.sourcingTerms, termUsage);
    const { error: termError } = await admin
      .from('brand_profiles')
      .update({ sourcing: { terms } })
      .eq('company_id', companyId);
    if (termError) console.error('term stats:', termError.message);
  }

  return insertedTotal;
}

async function run(companyIds: string[], cfg: RunConfig): Promise<void> {
  const admin = adminClient();
  for (const id of companyIds) {
    try {
      const n = await scrapeCompany(admin, id, cfg);
      console.log(`scrape-trends ${cfg.mode}: ${n} new trends for ${id}`);
    } catch (e) {
      console.error(`scrape-trends failed for ${id}:`, e);
    }
  }
}

Deno.serve(async (req) => {
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.kind === 'user' && caller.role !== 'admin') {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  // No body (cron, admin "Scrape now") = weekly maintenance run. The one-off
  // corpus build is opt-in: {"mode": "backfill", "target": 500}.
  let cfg = WEEKLY_CONFIG;
  try {
    const body = (await req.json()) as { mode?: string; target?: number } | null;
    if (body?.mode === 'backfill') cfg = backfillConfig(body.target ?? 200);
  } catch {
    // no or invalid JSON body: weekly
  }

  let companyIds: string[];
  if (caller.kind === 'user') {
    companyIds = [caller.companyId];
  } else {
    const { data } = await admin.from('brand_profiles').select('company_id');
    companyIds = [...new Set((data ?? []).map((r) => r.company_id))];
  }

  // Apify sync runs take minutes; answer now and finish in the background.
  EdgeRuntime.waitUntil(run(companyIds, cfg));
  return jsonResponse(
    { started: true, mode: cfg.mode, target: cfg.targetItems, companies: companyIds.length },
    202,
  );
});
