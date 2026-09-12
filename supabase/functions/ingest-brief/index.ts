// Admin draft flow: { query }, { url }, { feature_id } or { media_id }, optionally with { post_type }, in;
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
  toFeatureScreenshot,
  type BrainFeature,
  type BrandContext,
} from '../_shared/wp8.ts';
import {
  brandDocBlocks,
  buildBriefSystem,
  generateValidated,
  isKill,
  loadPostType,
  normalizeGenerated,
  pickPostType,
  resolvePointMedia,
  type GenOutcome,
  type PointMedia,
  type PostTypeRow,
  type RawGenerated,
} from '../_shared/generateBrief.ts';
import type { TalkingPoint } from '../_shared/validateBrief.ts';

type Body = {
  url?: string;
  context?: string;
  query?: string;
  feature_id?: string;
  media_id?: string;
  /** A post_types.key, or "auto" to let the model pick the kind from the source. */
  post_type?: string;
  /** Lane for "auto"; defaults to video, or the scraped post's format on the url path. */
  family?: 'video' | 'photo_carousel';
};

type BrainFeatureRow = {
  id: string;
  name: string;
  sentence: string | null;
  rank: number | null;
  idea_title: string | null;
  idea_action: string | null;
  idea_example: string | null;
};

type MediaLibraryRow = {
  id: string;
  kind: string;
  path: string;
  title: string | null;
  description: string | null;
};

function mediaSourceLines(media: MediaLibraryRow, context: string | null): string[] {
  const mediaWord = media.kind === 'recording' ? 'screen recording' : 'screenshot';
  const title = media.title?.trim() ? media.title.trim() : 'Untitled';
  const description = media.description?.trim();
  return [
    'There is no source post.',
    [
      `This post is about the one product moment shown in this ${mediaWord} from our media library. Every product talking point must be about what it shows; the plug point is where it appears on screen.`,
      `Media: ${title}`,
      description ? `What it shows and how it works: ${description}` : null,
      'Write the search phrase a target viewer would type that this feature answers, and structure the post so the media lands on the product point.',
    ]
      .filter((l): l is string => l !== null)
      .join('\n'),
    ...(context ? [`Admin angle / context:\n${context.slice(0, 1500)}`] : []),
  ];
}

function pinMedia(
  pointMedia: (PointMedia | null)[],
  points: TalkingPoint[],
  media: MediaLibraryRow,
): void {
  if (pointMedia.some((m) => m?.library_path === media.path)) return;
  if (points.length === 0) return;
  const productIndex = points.findIndex((p) => p.is_product === true);
  const index = productIndex >= 0 ? productIndex : 0;
  const prior = pointMedia[index] ?? null;
  pointMedia[index] = {
    feature_id: prior?.feature_id ?? null,
    screenshot_url: prior?.screenshot_url ?? null,
    shape: prior?.shape ?? null,
    library_path: media.path,
    library_kind: media.kind === 'recording' ? 'recording' : 'screenshot',
  };
}

function featureSourceLines(feature: BrainFeatureRow, context: string | null): string[] {
  const angleParts = [
    feature.idea_title?.trim() ? feature.idea_title.trim() : null,
    feature.idea_action?.trim() ? feature.idea_action.trim() : null,
  ].filter((p): p is string => p !== null);
  const example = feature.idea_example?.trim();
  const angle = angleParts.length
    ? `Angle that has worked: ${angleParts.join(' — ')}${example ? ` (${example})` : ''}`
    : example
      ? `Angle that has worked: ${example}`
      : null;
  return [
    'There is no source post.',
    [
      `This post is about one product feature. Every product talking point must be about it and must carry feature_id "${feature.id}".`,
      `Feature: ${feature.name}`,
      feature.sentence?.trim() ? `What it is: ${feature.sentence.trim()}` : null,
      angle,
    ]
      .filter((l): l is string => l !== null)
      .join('\n'),
    ...(context ? [`Admin angle / context:\n${context.slice(0, 1500)}`] : []),
  ];
}

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
    postType?.key ?? null,
    new Set(brand.features.map((f) => f.id)),
  );
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const url = body.url?.trim();
  const query = body.query?.trim();
  const featureId = body.feature_id?.trim();
  const mediaId = body.media_id?.trim();
  const context = body.context?.trim() || null;
  const inputCount = [url, query, featureId, mediaId].filter(Boolean).length;
  if (inputCount > 1) {
    return jsonResponse(
      { error: 'expected exactly one of { url }, { query }, { feature_id }, { media_id }' },
      400,
    );
  }
  if (inputCount === 0) {
    return jsonResponse(
      { error: 'expected { url }, { query }, { feature_id } or { media_id }' },
      400,
    );
  }

  let requestedType: PostTypeRow | null = null;
  const autoType = body.post_type?.trim() === 'auto';
  if (body.post_type?.trim() && !autoType) {
    requestedType = await loadPostType(admin, caller.companyId, body.post_type.trim());
    if (!requestedType) {
      return jsonResponse({ error: `unknown post type "${body.post_type}"` }, 400);
    }
  }
  const resolvePostType = async (
    sourceLines: string[],
    fallbackFamily: 'video' | 'photo_carousel',
  ): Promise<PostTypeRow | null> => {
    if (!autoType) return requestedType;
    return pickPostType(admin, caller.companyId, body.family ?? fallbackFamily, sourceLines);
  };

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
      const postType = await resolvePostType(sourceLines, 'video');
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
        point_media: await resolvePointMedia(admin, caller.companyId, brand.features, outcome.featureIds, outcome.draft.talking_points),
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

  // Feature path: the brief is anchored on one brain_features row. The
  // model writes the search phrase itself.
  if (featureId) {
    try {
      const { data: featureRow, error: featureError } = await admin
        .from('brain_features')
        .select('id, name, sentence, rank, idea_title, idea_action, idea_example')
        .eq('id', featureId)
        .eq('company_id', caller.companyId)
        .maybeSingle();
      if (featureError) throw new Error(featureError.message);
      if (!featureRow) return jsonResponse({ error: 'unknown feature' }, 400);
      const feature = featureRow as BrainFeatureRow;

      const loaded = await loadBrandContext(admin, caller.companyId);
      let features: BrainFeature[] = loaded.features;
      if (!features.some((f) => f.id === feature.id)) {
        const { data: shots, error: shotsError } = await admin
          .from('feature_screenshots')
          .select('id, feature_id, path, shape, sort_order')
          .eq('feature_id', feature.id)
          .eq('company_id', caller.companyId)
          .order('sort_order', { ascending: true });
        if (shotsError) throw new Error(shotsError.message);
        features = [
          {
            id: feature.id,
            name: feature.name,
            sentence: feature.sentence,
            rank: feature.rank,
            screenshots: (shots ?? []).map((s) => toFeatureScreenshot(admin, s)),
          },
          ...features,
        ];
      }
      const brand: BrandContext = { ...loaded, features };
      const validationCtx = {
        hashtagBank: brand.hashtagBank,
        approvedClaimIds: brand.approvedClaims.map((c) => c.id),
      };
      const generationId = crypto.randomUUID();
      const sourceLines = featureSourceLines(feature, context);
      const postType = await resolvePostType(sourceLines, 'video');
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
        overlay_labels: outcome.overlayLabels,
        point_media: await resolvePointMedia(admin, caller.companyId, brand.features, outcome.featureIds, outcome.draft.talking_points),
        post_type_id: postType?.id ?? null,
        generation_id: generationId,
        warnings,
        example_url: null,
        example_transcript: null,
      });
    } catch (e) {
      console.error('ingest-brief feature error:', e);
      return jsonResponse(
        { error: e instanceof Error ? e.message : 'ingest failed' },
        500,
      );
    }
  }

  if (mediaId) {
    try {
      const { data: mediaRow, error: mediaError } = await admin
        .from('media_library')
        .select('id, kind, path, title, description')
        .eq('id', mediaId)
        .eq('company_id', caller.companyId)
        .maybeSingle();
      if (mediaError) throw new Error(mediaError.message);
      if (!mediaRow) return jsonResponse({ error: 'unknown media' }, 400);
      const media = mediaRow as MediaLibraryRow;

      const brand = await loadBrandContext(admin, caller.companyId);
      const validationCtx = {
        hashtagBank: brand.hashtagBank,
        approvedClaimIds: brand.approvedClaims.map((c) => c.id),
      };
      const generationId = crypto.randomUUID();
      const sourceLines = mediaSourceLines(media, context);
      const postType = await resolvePostType(sourceLines, 'video');
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
      const pointMedia = await resolvePointMedia(
        admin,
        caller.companyId,
        brand.features,
        outcome.featureIds,
        outcome.draft.talking_points,
      );
      pinMedia(pointMedia, outcome.draft.talking_points, media);
      return jsonResponse({
        ...outcome.draft,
        overlay_labels: outcome.overlayLabels,
        point_media: pointMedia,
        post_type_id: postType?.id ?? null,
        generation_id: generationId,
        warnings,
        example_url: null,
        example_transcript: null,
      });
    } catch (e) {
      console.error('ingest-brief media error:', e);
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
    const postType = await resolvePostType(sourceLines, post.format);
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
      point_media: await resolvePointMedia(admin, caller.companyId, brand.features, outcome.featureIds, outcome.draft.talking_points),
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
