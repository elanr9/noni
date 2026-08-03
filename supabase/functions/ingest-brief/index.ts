// Admin Create paste-link flow: URL in, draft brief out. Scrapes the single
// post via Apify, transcribes audio (actor transcript, Deepgram fallback),
// OCRs carousel slides via Claude vision, then Claude drafts the brief in
// the brand voice. Nothing is written to the database; the client saves the
// admin-edited result through lib/briefs-api.ts.

import {
  adminClient,
  askClaude,
  askClaudeVision,
  authenticate,
  jsonResponse,
  legacyBrandLines,
  loadBrandContext,
  parseClaudeJson,
  type BrandContext,
} from '../_shared/wp8.ts';

type Body = { url?: string };

type SourcePost = {
  platform: 'tiktok' | 'instagram';
  caption: string;
  media_url: string | null;
  transcript_url: string | null;
  image_urls: string[];
  format: 'video' | 'photo_carousel';
};

const MAX_OCR_SLIDES = 6;

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
  mediaUrls?: string[];
  videoMeta?: { transcriptionLink?: string };
  imagePost?: { images?: Array<{ imageURL?: { urlList?: string[] } }> };
  slideshowImageLinks?: Array<{ downloadLink?: string }>;
};

async function scrapeTikTok(url: string): Promise<SourcePost | null> {
  const items = (await apifyRun('clockworks~tiktok-scraper', {
    postURLs: [url],
    // Actor transcribes videos without captions; primary transcript source.
    downloadSubtitlesOptions: 'DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES',
  })) as TikTokItem[];
  const i = items[0];
  if (!i) return null;
  const slides = (i.imagePost?.images ?? [])
    .map((img) => img.imageURL?.urlList?.[0])
    .filter((u): u is string => Boolean(u));
  const fallbackSlides = (i.slideshowImageLinks ?? [])
    .map((l) => l.downloadLink)
    .filter((u): u is string => Boolean(u));
  const imageUrls = slides.length > 0 ? slides : fallbackSlides;
  const isCarousel = imageUrls.length > 0;
  return {
    platform: 'tiktok',
    caption: i.text ?? '',
    media_url: isCarousel ? null : i.mediaUrls?.[0] ?? null,
    transcript_url: isCarousel ? null : i.videoMeta?.transcriptionLink ?? null,
    image_urls: imageUrls,
    format: isCarousel ? 'photo_carousel' : 'video',
  };
}

type InstagramItem = {
  type?: string;
  caption?: string;
  videoUrl?: string;
  images?: string[];
};

async function scrapeInstagram(url: string): Promise<SourcePost | null> {
  const items = (await apifyRun('apify~instagram-scraper', {
    directUrls: [url],
    resultsType: 'posts',
    resultsLimit: 1,
  })) as InstagramItem[];
  const i = items[0];
  if (!i) return null;
  const isCarousel = i.type === 'Sidecar' && (i.images?.length ?? 0) > 0;
  return {
    platform: 'instagram',
    caption: i.caption ?? '',
    media_url: isCarousel ? null : i.videoUrl ?? null,
    transcript_url: null,
    image_urls: isCarousel ? (i.images ?? []) : [],
    format: isCarousel ? 'photo_carousel' : 'video',
  };
}

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

async function ocrSlides(imageUrls: string[]): Promise<string[] | null> {
  try {
    const urls = imageUrls.slice(0, MAX_OCR_SLIDES);
    const system = `You transcribe the text on social media slideshow images. Answer with a single JSON object: {"slides": string[]}, one string per image in order. Each string is all readable overlay/design text on that slide, cleaned up. Use "" for a slide with no text.`;
    const raw = await askClaudeVision(system, urls, `Transcribe all ${urls.length} slides.`);
    const { slides } = parseClaudeJson<{ slides: string[] }>(raw);
    return Array.isArray(slides) ? slides.map((s) => String(s)) : null;
  } catch (e) {
    console.error('ingest-brief OCR failed:', e);
    return null;
  }
}

type RawDraft = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  format: string;
  why_it_works: string;
};

async function draftBrief(
  brand: BrandContext,
  post: SourcePost,
  transcript: string | null,
  slideTexts: string[] | null,
): Promise<RawDraft> {
  const system = `You write UGC content briefs for creators posting on TikTok and Instagram. You always answer with a single JSON object: {"title": string, "hook": string, "script": string, "caption": string, "format": "video" | "photo_carousel", "why_it_works": string}. The title is a short punchy brief name a creator scans in a feed (under 8 words). The hook is the first spoken line, under 12 words, engineered to stop scrolling. The script is roughly 60 seconds spoken aloud, written in the brand voice, first person, no camera directions, split into 3 or 4 short paragraphs separated by blank lines, and the first paragraph starts with the hook. The caption is under 200 characters with a clear call to action. The format is "photo_carousel" only when the source is a slideshow or the idea is clearly text-on-image; otherwise "video". why_it_works is one punchy sentence a content strategist would say about why this concept performs. Plain language only, no hashtag spam (2 hashtags max).`;

  const docBlocks: string[] = [`Brand: ${brand.companyName}`];
  if (brand.docs.productTruth.trim()) {
    docBlocks.push(`Product truth:\n${brand.docs.productTruth.trim()}`);
  }
  if (brand.docs.voice.trim()) {
    docBlocks.push(`Voice:\n${brand.docs.voice.trim()}`);
  }
  if (brand.docs.learnings.trim()) {
    docBlocks.push(`What has worked so far:\n${brand.docs.learnings.trim()}`);
  }
  if (docBlocks.length === 1) docBlocks.push(legacyBrandLines(brand));

  const sourceLines = [
    `Base the brief on this ${post.platform} ${post.format === 'photo_carousel' ? 'photo slideshow' : 'video'} the admin pasted as a reference:`,
    post.caption ? `Caption: ${post.caption.slice(0, 400)}` : null,
    transcript ? `Transcript: ${transcript.slice(0, 2000)}` : null,
    slideTexts?.length
      ? `Slide texts: ${slideTexts.map((s, i) => `[${i + 1}] ${s}`).join(' ').slice(0, 2000)}`
      : null,
    'Take the hook style and structure, then rewrite the body entirely for this brand and its product. Do not mention the original creator.',
    post.format === 'photo_carousel'
      ? 'The source is a photo slideshow, so use format "photo_carousel" and write the script as slide-by-slide overlay text (one short paragraph per slide).'
      : null,
  ].filter((l): l is string => l !== null);

  const raw = await askClaude(system, [...docBlocks, '', ...sourceLines].join('\n\n'));
  return parseClaudeJson<RawDraft>(raw);
}

Deno.serve(async (req) => {
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (caller.role !== 'admin') return jsonResponse({ error: 'forbidden' }, 403);

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const url = body.url?.trim();
  if (!url) return jsonResponse({ error: 'expected { url }' }, 400);

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return jsonResponse({ error: 'That is not a valid link' }, 400);
  }
  const isTikTok = /(^|\.)tiktok\.com$/.test(host);
  const isInstagram = /(^|\.)instagram\.com$/.test(host);
  if (!isTikTok && !isInstagram) {
    return jsonResponse({ error: 'Paste a TikTok or Instagram link' }, 400);
  }

  try {
    const post = isTikTok ? await scrapeTikTok(url) : await scrapeInstagram(url);
    if (!post) {
      return jsonResponse({ error: 'Could not read that post. Check the link.' }, 404);
    }

    let transcript: string | null = null;
    let slideTexts: string[] | null = null;
    if (post.format === 'video') {
      if (post.transcript_url) transcript = await fetchApifyTranscript(post.transcript_url);
      if (!transcript && post.media_url) transcript = await transcribe(post.media_url);
    } else {
      slideTexts = await ocrSlides(post.image_urls);
    }

    const brand = await loadBrandContext(admin, caller.companyId);
    const draft = await draftBrief(brand, post, transcript, slideTexts);

    const exampleTranscript =
      transcript ??
      (slideTexts?.some((s) => s.trim())
        ? slideTexts.map((s, i) => `[${i + 1}] ${s}`).join('\n')
        : null);

    return jsonResponse({
      title: draft.title,
      hook: draft.hook,
      script: draft.script,
      caption: draft.caption,
      format: draft.format === 'photo_carousel' ? 'photo_carousel' : 'video',
      why_it_works: draft.why_it_works,
      example_url: url,
      example_transcript: exampleTranscript,
    });
  } catch (e) {
    console.error('ingest-brief error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'ingest failed' },
      500,
    );
  }
});
