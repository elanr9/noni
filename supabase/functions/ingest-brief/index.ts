// Admin draft flow: { query } or { url }, optionally with { post_type }, in;
// structured draft brief out (or { kill_reason } when generation refuses to
// pad). URL path scrapes via Apify, transcribes (actor / Deepgram), OCRs
// carousels, then drafts. Query path drafts from the search string alone.
// Both paths share the generation core in _shared/generateBrief.ts and
// validateBrief (one retry), and log to brief_validations (brief_id null,
// joined later by generation_id). The brief itself is only saved by the
// client through lib/briefs-api.ts; segments are derived after save through
// brief-assist { action: "derive_segments" }.

import {
  adminClient,
  askClaude,
  askClaudeVision,
  authenticate,
  handleCors,
  jsonResponse,
  loadBrandContext,
  parseClaudeJson,
  type BrandContext,
} from '../_shared/wp8.ts';
import {
  brandDocBlocks,
  buildBriefSystem,
  isKill,
  loadPostType,
  normalizeGenerated,
  toPostTypeShape,
  type GenOutcome,
  type PostTypeRow,
  type RawGenerated,
} from '../_shared/generateBrief.ts';
import { validateBrief, type ValidationResult } from '../_shared/validateBrief.ts';

type Body = { url?: string; context?: string; query?: string; post_type?: string };

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

async function generateOnce(
  brand: BrandContext,
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  sourceLines: string[],
  priorFailures: string[],
): Promise<GenOutcome> {
  const lines = [...sourceLines];
  if (priorFailures.length) {
    lines.push(
      `Your previous draft failed validation. Fix every one of these and return the corrected JSON:\n${priorFailures.map((f) => `- ${f}`).join('\n')}`,
    );
  }
  const raw = await askClaude(
    buildBriefSystem(postType, fallbackFormat, brand.bannedPhrases),
    [...brandDocBlocks(brand), '', ...lines].join('\n\n'),
    4096,
  );
  return normalizeGenerated(
    parseClaudeJson<RawGenerated>(raw),
    postType ? postType.family : fallbackFormat,
  );
}

async function generateValidated(
  admin: ReturnType<typeof adminClient>,
  companyId: string,
  generationId: string,
  postType: PostTypeRow | null,
  draftOnce: (priorFailures: string[]) => Promise<GenOutcome>,
  validationCtx: { hashtagBank: string[]; approvedClaimIds: string[] },
): Promise<{ outcome: GenOutcome; warnings: string[] }> {
  const ctx = {
    ...validationCtx,
    postType: postType ? toPostTypeShape(postType) : null,
  };
  const logAttempt = async (attempt: number, res: ValidationResult) => {
    const { error } = await admin.from('brief_validations').insert({
      company_id: companyId,
      generation_id: generationId,
      attempt,
      passed: res.passed,
      failures: res.failures,
      warnings: res.warnings,
    });
    if (error) console.error('brief_validations insert failed:', error.message);
  };

  let outcome = await draftOnce([]);
  if (isKill(outcome)) return { outcome, warnings: [] };
  let result = validateBrief(outcome.draft, ctx);
  await logAttempt(1, result);
  if (!result.passed) {
    const retry = await draftOnce(result.failures);
    if (isKill(retry)) return { outcome: retry, warnings: [] };
    outcome = retry;
    result = validateBrief(outcome.draft, ctx);
    await logAttempt(2, result);
  }
  const warnings = result.passed
    ? result.warnings
    : [...result.failures, ...result.warnings];
  return { outcome, warnings };
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (caller.role !== 'admin') return jsonResponse({ error: 'forbidden' }, 403);

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const url = body.url?.trim();
  const query = body.query?.trim();
  const context = body.context?.trim() || null;
  if (url && query) {
    return jsonResponse({ error: 'expected { url } or { query }, not both' }, 400);
  }
  if (!url && !query) {
    return jsonResponse({ error: 'expected { url } or { query }' }, 400);
  }

  let postType: PostTypeRow | null = null;
  if (body.post_type?.trim()) {
    postType = await loadPostType(admin, caller.companyId, body.post_type.trim());
    if (!postType) {
      return jsonResponse({ error: `unknown post type "${body.post_type}"` }, 400);
    }
  }

  // Query path: no scrape / transcribe / OCR. This is the grid's path: the
  // row is pre-stamped with a post type and a search phrase.
  if (query) {
    try {
      const brand = await loadBrandContext(admin, caller.companyId);
      const validationCtx = {
        hashtagBank: brand.hashtagBank,
        approvedClaimIds: brand.approvedClaims.map((c) => c.id),
      };
      const generationId = crypto.randomUUID();
      const sourceLines = [
        'There is no source post. Draft a brief that answers this search phrase a target viewer types with a deadline in mind:',
        `Search phrase (set search_phrase in the JSON to exactly this string): ${query}`,
        'Invent the structure from the search phrase and brand.',
        ...(context ? [`Admin angle / context:\n${context.slice(0, 1500)}`] : []),
      ];
      const { outcome, warnings } = await generateValidated(
        admin,
        caller.companyId,
        generationId,
        postType,
        (priorFailures) =>
          generateOnce(brand, postType, 'video', sourceLines, priorFailures),
        validationCtx,
      );
      if (isKill(outcome)) {
        return jsonResponse({
          kill_reason: outcome.kill_reason,
          generation_id: generationId,
          post_type_id: postType?.id ?? null,
        });
      }
      return jsonResponse({
        ...outcome.draft,
        search_phrase: query,
        overlay_labels: outcome.overlayLabels,
        post_type_id: postType?.id ?? null,
        generation_id: generationId,
        warnings,
        example_url: null,
        example_transcript: null,
      });
    } catch (e) {
      console.error('ingest-brief query error:', e);
      return jsonResponse(
        { error: e instanceof Error ? e.message : 'ingest failed' },
        500,
      );
    }
  }

  let host: string;
  try {
    host = new URL(url!).hostname;
  } catch {
    return jsonResponse({ error: 'That is not a valid link' }, 400);
  }
  const isTikTok = /(^|\.)tiktok\.com$/.test(host);
  const isInstagram = /(^|\.)instagram\.com$/.test(host);
  if (!isTikTok && !isInstagram) {
    return jsonResponse({ error: 'Paste a TikTok or Instagram link' }, 400);
  }

  try {
    const post = isTikTok ? await scrapeTikTok(url!) : await scrapeInstagram(url!);
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
    const validationCtx = {
      hashtagBank: brand.hashtagBank,
      approvedClaimIds: brand.approvedClaims.map((c) => c.id),
    };

    const sourceLines = [
      `Base the brief on this ${post.platform} ${post.format === 'photo_carousel' ? 'photo slideshow' : 'video'} the admin pasted as a reference:`,
      ...(post.caption ? [`Caption: ${post.caption.slice(0, 400)}`] : []),
      ...(transcript ? [`Transcript: ${transcript.slice(0, 2000)}`] : []),
      ...(slideTexts?.length
        ? [
            `Slide texts: ${slideTexts.map((s, i) => `[${i + 1}] ${s}`).join(' ').slice(0, 2000)}`,
          ]
        : []),
      ...(context
        ? [
            `Admin angle / context (follow this closely when rewriting — keep the source structure but shift the story to this angle):\n${context.slice(0, 1500)}`,
          ]
        : []),
      'Take the hook style and structure, then rewrite the body entirely for this brand and its product. Do not mention the original creator.',
    ];

    // Nothing is saved yet, so brief_id stays null; generation_id joins the
    // validation rows to the brief once the admin saves it.
    const generationId = crypto.randomUUID();
    const { outcome, warnings } = await generateValidated(
      admin,
      caller.companyId,
      generationId,
      postType,
      (priorFailures) =>
        generateOnce(brand, postType, post.format, sourceLines, priorFailures),
      validationCtx,
    );
    if (isKill(outcome)) {
      return jsonResponse({
        kill_reason: outcome.kill_reason,
        generation_id: generationId,
        post_type_id: postType?.id ?? null,
      });
    }

    const exampleTranscript =
      transcript ??
      (slideTexts?.some((s) => s.trim())
        ? slideTexts.map((s, i) => `[${i + 1}] ${s}`).join('\n')
        : null);

    return jsonResponse({
      ...outcome.draft,
      overlay_labels: outcome.overlayLabels,
      post_type_id: postType?.id ?? null,
      generation_id: generationId,
      warnings,
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
