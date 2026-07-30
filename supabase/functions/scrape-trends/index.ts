import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  askClaude,
  authenticate,
  jsonResponse,
  loadBrandContext,
  parseClaudeJson,
} from '../_shared/wp8.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const MIN_VIEWS = 10000;
const MAX_ITEMS_PER_RUN = 8;

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
};

async function scrapeTikTok(queries: string[]): Promise<ScrapedItem[]> {
  const items = (await apifyRun('clockworks~tiktok-scraper', {
    searchQueries: queries,
    resultsPerPage: 6,
    shouldDownloadCovers: true,
    // Actor generates a transcript per video (TikTok CC when present, else
    // its own speech-to-text) and returns a fetchable transcriptionLink. This
    // is our primary transcript source; Deepgram is the fallback.
    downloadSubtitlesOptions: 'DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES',
  })) as TikTokItem[];
  return items
    .filter((i) => i.webVideoUrl)
    .map((i) => ({
      platform: 'tiktok' as const,
      source_url: i.webVideoUrl!,
      author_handle: i.authorMeta?.name ?? null,
      views: i.playCount ?? 0,
      likes: i.diggCount ?? null,
      comments: i.commentCount ?? null,
      shares: i.shareCount ?? null,
      caption: i.text ?? '',
      media_url: i.mediaUrls?.[0] ?? null,
      cover_url: i.videoMeta?.coverUrl ?? i.videoMeta?.originalCoverUrl ?? null,
      transcript_url: i.videoMeta?.transcriptionLink ?? null,
    }));
}

type InstagramItem = {
  url?: string;
  caption?: string;
  videoUrl?: string;
  displayUrl?: string;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  ownerUsername?: string;
};

async function scrapeInstagram(hashtags: string[]): Promise<ScrapedItem[]> {
  const items = (await apifyRun('apify~instagram-hashtag-scraper', {
    hashtags,
    resultsLimit: 6,
  })) as InstagramItem[];
  return items
    .filter((i) => i.url)
    .map((i) => ({
      platform: 'instagram' as const,
      source_url: i.url!,
      author_handle: i.ownerUsername ?? null,
      views: i.videoPlayCount ?? i.videoViewCount ?? 0,
      likes: i.likesCount ?? null,
      comments: i.commentsCount ?? null,
      shares: null,
      caption: i.caption ?? '',
      media_url: i.videoUrl ?? null,
      cover_url: i.displayUrl ?? null,
      transcript_url: null,
    }));
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

type SearchTerms = { queries: string[]; hashtags: string[] };

async function deriveSearchTerms(
  admin: SupabaseClient,
  companyId: string,
): Promise<SearchTerms> {
  const brand = await loadBrandContext(admin, companyId);
  const system = `You turn a brand's niche into social search inputs that surface real UGC creators the brand's audience already follows. Answer with a single JSON object: {"queries": string[], "hashtags": string[]}. queries: 3 TikTok search phrases (2 to 4 words, what real users type) tightly focused on the brand's exact vertical and the audience's real journey, not generic sport tips. hashtags: 3 single-word Instagram hashtags (no # symbol, lowercase). Prefer terms about the audience's goals and status (e.g. recruiting, commitment, roster, gameday, film) over broad skill drills.`;
  const user = [
    `Brand: ${brand.companyName}`,
    brand.vertical ? `Vertical: ${brand.vertical.replace(/_/g, ' ')}` : null,
    brand.products ? `Product: ${brand.products}` : null,
    brand.audience ? `Audience: ${brand.audience}` : null,
    brand.pillars.length ? `Pillars: ${brand.pillars.join(', ')}` : null,
    brand.referenceHandles.length
      ? `Reference creators whose style fits: ${brand.referenceHandles.map((h) => `@${h}`).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
  const terms = parseClaudeJson<SearchTerms>(await askClaude(system, user, 512));
  if (!terms.queries?.length || !terms.hashtags?.length) {
    throw new Error('Claude returned no search terms');
  }
  return {
    queries: terms.queries.slice(0, 3),
    hashtags: terms.hashtags.slice(0, 3).map((h) => h.replace(/^#/, '')),
  };
}

type Annotation = { index: number; hook: string; why_it_works: string };

async function annotate(
  items: Array<ScrapedItem & { transcript: string | null }>,
): Promise<Annotation[]> {
  const system = `You analyze trending short form posts for a UGC team. Answer with a single JSON array, one object per input item: {"index": number, "hook": string, "why_it_works": string}. hook: the post's attention grab in one line (quote the transcript's opening if available, otherwise infer from the caption). why_it_works: one punchy sentence a content strategist would say about why this post performed.`;
  const user = items
    .map(
      (it, i) =>
        `Item ${i} (${it.platform}, ${it.views} views)\nCaption: ${it.caption.slice(0, 300)}\nTranscript: ${it.transcript ? it.transcript.slice(0, 1200) : 'unavailable'}`,
    )
    .join('\n\n');
  return parseClaudeJson<Annotation[]>(await askClaude(system, user, 4096));
}

async function scrapeCompany(admin: SupabaseClient, companyId: string): Promise<number> {
  const terms = await deriveSearchTerms(admin, companyId);

  const [tiktok, instagram] = await Promise.allSettled([
    scrapeTikTok(terms.queries),
    scrapeInstagram(terms.hashtags),
  ]);
  if (tiktok.status === 'rejected') console.error('tiktok scrape:', tiktok.reason);
  if (instagram.status === 'rejected') console.error('instagram scrape:', instagram.reason);

  const scraped = [
    ...(tiktok.status === 'fulfilled' ? tiktok.value : []),
    ...(instagram.status === 'fulfilled' ? instagram.value : []),
  ];

  const { data: existing } = await admin
    .from('trend_items')
    .select('source_url')
    .eq('company_id', companyId);
  const seen = new Set((existing ?? []).map((r) => r.source_url));

  const fresh = scraped
    .filter((i) => i.views >= MIN_VIEWS && !seen.has(i.source_url))
    .filter((i, idx, arr) => arr.findIndex((x) => x.source_url === i.source_url) === idx)
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_ITEMS_PER_RUN);
  if (fresh.length === 0) return 0;

  const withTranscripts = await Promise.all(
    fresh.map(async (item) => ({
      ...item,
      transcript: await resolveTranscript(item),
    })),
  );

  let annotations: Annotation[] = [];
  try {
    annotations = await annotate(withTranscripts);
  } catch (e) {
    console.error('annotate failed:', e);
  }

  const rows = withTranscripts.map((item, i) => {
    const note = annotations.find((a) => a.index === i);
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
      hook: note?.hook ?? (item.caption ? item.caption.slice(0, 120) : null),
      why_it_works: note?.why_it_works ?? null,
    };
  });
  const { error } = await admin.from('trend_items').insert(rows);
  if (error) throw error;
  return rows.length;
}

async function run(companyIds: string[]): Promise<void> {
  const admin = adminClient();
  for (const id of companyIds) {
    try {
      const n = await scrapeCompany(admin, id);
      console.log(`scrape-trends: ${n} new trends for ${id}`);
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

  let companyIds: string[];
  if (caller.kind === 'user') {
    companyIds = [caller.companyId];
  } else {
    const { data } = await admin.from('brand_profiles').select('company_id');
    companyIds = [...new Set((data ?? []).map((r) => r.company_id))];
  }

  // Apify sync runs take minutes; answer now and finish in the background.
  EdgeRuntime.waitUntil(run(companyIds));
  return jsonResponse({ started: true, companies: companyIds.length }, 202);
});
