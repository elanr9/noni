// Admin draft flow: { query }, { url }, { feature_id } or { media_id }, optionally with { post_type }, in;
// structured draft brief out (or { kill_reason } when generation refuses to
// pad). URL path reads the stored reference study, or scrapes via Apify,
// transcribes (actor / Deepgram) or OCRs carousels and studies it once, then
// drafts. Query path drafts from the search string alone.
// Both paths share the generation core in _shared/generateBrief.ts and
// validateBrief (one retry), and log to brief_validations (brief_id null,
// joined later by generation_id). The brief itself is only saved by the
// client through lib/briefs-api.ts; segments are derived after save through
// brief-assist { action: "derive_segments" }.

import {
  adminClient,
  askClaude,
  authenticate,
  handleCors,
  jsonResponse,
  streamJsonResponse,
  loadBrandContext,
  parseClaudeJson,
  toFeatureScreenshot,
  type BrainFeature,
  type BrandContext,
} from '../_shared/wp8.ts';
import {
  brandDocBlocks,
  brandSystemOptions,
  brandValidationCtx,
  retryMessage,
  buildBriefSystem,
  generateValidated,
  isKill,
  loadPostType,
  managerRuleLines,
  normalizeGenerated,
  pickPostType,
  resolvePointMedia,
  type GenerateOptions,
  type GenOutcome,
  type PointMedia,
  type PostTypeRow,
  type RawGenerated,
} from '../_shared/generateBrief.ts';
import { regexConstraints } from '../_shared/reviseConstraints.ts';
import type { TalkingPoint } from '../_shared/validateBrief.ts';
import { readSocialPost, socialHost } from '../_shared/scrapeSocial.ts';
import {
  loadStudy,
  maybeDistillPlaybook,
  patternLines,
  studyReference,
} from '../_shared/referenceStudy.ts';

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

async function generateOnce(
  brand: BrandContext,
  postType: PostTypeRow | null,
  fallbackFormat: 'video' | 'photo_carousel',
  sourceLines: string[],
  priorFailures: string[],
): Promise<GenOutcome> {
  const lines = [...sourceLines, ...managerRuleLines(brand)];
  if (priorFailures.length) {
    lines.push(
      retryMessage(priorFailures, 'draft'),
    );
  }
  const raw = await askClaude(
    buildBriefSystem(postType, fallbackFormat, brandSystemOptions(brand)),
    lines.join('\n\n'),
    8000,
    { cachedPrefix: brandDocBlocks(brand).join('\n\n') },
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
  // A count the manager typed into the angle ("give me 5 points") is
  // enforced, not hoped for: it overrides the type's range and a wrong count
  // is a validation failure.
  const askedCount = context ? regexConstraints(context).pointCount : null;
  const countLine =
    askedCount !== null
      ? `REQUIRED POINT COUNT: the manager asked for exactly ${askedCount} talking points. point_count is ${askedCount} and talking_points has exactly ${askedCount} entries; this overrides the post type's range. A numbered list title leads with ${askedCount}.`
      : null;
  const countOptions: GenerateOptions = {
    extraFailures: (d) =>
      askedCount !== null && d.talking_points.length !== askedCount
        ? [
            `the manager asked for exactly ${askedCount} talking points and you returned ${d.talking_points.length}; write exactly ${askedCount}, each a real point, never padding and never merging`,
          ]
        : [],
  };
  const resolvePostType = async (
    sourceLines: string[],
    fallbackFamily: 'video' | 'photo_carousel',
    mode: 'fit' | 'mirror' = 'fit',
  ): Promise<PostTypeRow | null> => {
    const type = autoType
      ? await pickPostType(admin, caller.companyId, body.family ?? fallbackFamily, sourceLines, mode)
      : requestedType;
    return type && askedCount !== null
      ? { ...type, min_points: askedCount, max_points: askedCount }
      : type;
  };

  // Query path: no scrape / transcribe / OCR. This is the grid's path: the
  // row is pre-stamped with a post type and a search phrase.
  if (query) {
    return streamJsonResponse(async () => {
    try {
      const brand = await loadBrandContext(admin, caller.companyId);
      const validationCtx = brandValidationCtx(brand);
      const generationId = crypto.randomUUID();
      const sourceLines = [
        'There is no source post. Draft a brief that answers this search phrase a target viewer types with a deadline in mind:',
        `Search phrase (set search_phrase in the JSON to exactly this string): ${query}`,
        'Invent the structure from the search phrase and brand.',
        ...(context ? [`Admin angle / context:\n${context.slice(0, 1500)}`] : []),
        ...(countLine ? [countLine] : []),
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
        countOptions,
      );
      if (isKill(outcome)) {
        return {
          kill_reason: outcome.kill_reason,
          generation_id: generationId,
          post_type_id: postType?.id ?? null,
        };
      }
      return {
        ...outcome.draft,
        search_phrase: query,
        overlay_labels: outcome.overlayLabels,
        point_media: await resolvePointMedia(admin, caller.companyId, brand.features, outcome.featureIds, outcome.draft.talking_points, postType?.family ?? body.family ?? 'video'),
        post_type_id: postType?.id ?? null,
        generation_id: generationId,
        warnings,
        example_url: null,
        example_transcript: null,
      };
    } catch (e) {
      console.error('ingest-brief query error:', e);
      return { error: e instanceof Error ? e.message : 'ingest failed' };
    }
    });
  }

  // Feature path: the brief is anchored on one brain_features row. The
  // model writes the search phrase itself.
  if (featureId) {
    return streamJsonResponse(async () => {
    try {
      const { data: featureRow, error: featureError } = await admin
        .from('brain_features')
        .select('id, name, sentence, rank, idea_title, idea_action, idea_example')
        .eq('id', featureId)
        .eq('company_id', caller.companyId)
        .maybeSingle();
      if (featureError) throw new Error(featureError.message);
      if (!featureRow) return { error: 'unknown feature' };
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
      const validationCtx = brandValidationCtx(brand);
      const generationId = crypto.randomUUID();
      const sourceLines = [...featureSourceLines(feature, context), ...(countLine ? [countLine] : [])];
      const postType = await resolvePostType(sourceLines, 'video');
      const { outcome, warnings } = await generateValidated(
        admin,
        caller.companyId,
        generationId,
        postType,
        (priorFailures) =>
          generateOnce(brand, postType, 'video', sourceLines, priorFailures),
        validationCtx,
        countOptions,
      );
      if (isKill(outcome)) {
        return {
          kill_reason: outcome.kill_reason,
          generation_id: generationId,
          post_type_id: postType?.id ?? null,
        };
      }
      return {
        ...outcome.draft,
        overlay_labels: outcome.overlayLabels,
        point_media: await resolvePointMedia(admin, caller.companyId, brand.features, outcome.featureIds, outcome.draft.talking_points, postType?.family ?? body.family ?? 'video'),
        post_type_id: postType?.id ?? null,
        generation_id: generationId,
        warnings,
        example_url: null,
        example_transcript: null,
      };
    } catch (e) {
      console.error('ingest-brief feature error:', e);
      return { error: e instanceof Error ? e.message : 'ingest failed' };
    }
    });
  }

  if (mediaId) {
    return streamJsonResponse(async () => {
    try {
      const { data: mediaRow, error: mediaError } = await admin
        .from('media_library')
        .select('id, kind, path, title, description')
        .eq('id', mediaId)
        .eq('company_id', caller.companyId)
        .maybeSingle();
      if (mediaError) throw new Error(mediaError.message);
      if (!mediaRow) return { error: 'unknown media' };
      const media = mediaRow as MediaLibraryRow;

      const brand = await loadBrandContext(admin, caller.companyId);
      const validationCtx = brandValidationCtx(brand);
      const generationId = crypto.randomUUID();
      const sourceLines = [...mediaSourceLines(media, context), ...(countLine ? [countLine] : [])];
      const postType = await resolvePostType(sourceLines, 'video');
      const mediaFamily = postType?.family ?? body.family ?? 'video';
      if (mediaFamily === 'photo_carousel' && media.kind === 'recording') {
        return { error: 'Slideshows use screenshots only' };
      }
      const { outcome, warnings } = await generateValidated(
        admin,
        caller.companyId,
        generationId,
        postType,
        (priorFailures) =>
          generateOnce(brand, postType, 'video', sourceLines, priorFailures),
        validationCtx,
        countOptions,
      );
      if (isKill(outcome)) {
        return {
          kill_reason: outcome.kill_reason,
          generation_id: generationId,
          post_type_id: postType?.id ?? null,
        };
      }
      const pointMedia = await resolvePointMedia(
        admin,
        caller.companyId,
        brand.features,
        outcome.featureIds,
        outcome.draft.talking_points,
        mediaFamily,
      );
      pinMedia(pointMedia, outcome.draft.talking_points, media);
      return {
        ...outcome.draft,
        overlay_labels: outcome.overlayLabels,
        point_media: pointMedia,
        post_type_id: postType?.id ?? null,
        generation_id: generationId,
        warnings,
        example_url: null,
        example_transcript: null,
      };
    } catch (e) {
      console.error('ingest-brief media error:', e);
      return { error: e instanceof Error ? e.message : 'ingest failed' };
    }
    });
  }

  const host = socialHost(url!);
  if (!host) {
    try {
      new URL(url!);
    } catch {
      return jsonResponse({ error: 'That is not a valid link' }, 400);
    }
    return jsonResponse({ error: 'Paste a TikTok or Instagram link' }, 400);
  }

  return streamJsonResponse(async () => {
  try {
    // A reference is scraped and studied once; every later draft from it
    // reads the stored study instead of paying Apify and Deepgram again.
    let study = await loadStudy(admin, caller.companyId, url!);
    // A caption-only row is a failed read. Retry so the spoken track or
    // slide text is what the draft is written from.
    const hasSource = Boolean(
      study?.transcript?.trim() || study?.slide_texts?.some((s) => s.trim()),
    );
    if (!study || !hasSource) {
      const read = await readSocialPost(url!);
      if (!read) {
        return { error: 'Could not read that post. Check the link.' };
      }
      study = await studyReference(admin, caller.companyId, url!, { alreadyRead: read }).catch(
        (e) => {
          console.warn('ingest-brief study failed:', e instanceof Error ? e.message : e);
          return {
            id: '',
            url: url!,
            status: 'failed' as const,
            platform: read.post.platform,
            format: read.post.format,
            caption: read.post.caption,
            transcript: read.transcript,
            slide_texts: read.slideTexts,
            pattern: null,
            error: e instanceof Error ? e.message.slice(0, 300) : 'study failed',
          };
        },
      );
      if (study?.status === 'done') {
        maybeDistillPlaybook(admin, caller.companyId).catch((e) =>
          console.warn('playbook distill failed:', e instanceof Error ? e.message : e),
        );
      }
    }
    if (!study) return { error: 'Could not read that post. Check the link.' };
    const post = {
      platform: study.platform ?? host,
      format: (study.format === 'photo_carousel' ? 'photo_carousel' : 'video') as
        | 'video'
        | 'photo_carousel',
      caption: study.caption ?? '',
    };
    const transcript = study.transcript;
    const slideTexts = study.slide_texts;

    const brand = await loadBrandContext(admin, caller.companyId);
    const validationCtx = brandValidationCtx(brand);

    const sourceLines = [
      `Base the brief on this ${post.platform} ${post.format === 'photo_carousel' ? 'photo slideshow' : 'video'} the admin pasted as a reference. It already performed in this niche:`,
      ...(post.caption ? [`Caption: ${post.caption.slice(0, 400)}`] : []),
      ...(transcript ? [`Transcript: ${transcript.slice(0, 2500)}`] : []),
      ...(slideTexts?.length
        ? [
            `Slide texts: ${slideTexts.map((s, i) => `[${i + 1}] ${s}`).join(' ').slice(0, 2500)}`,
          ]
        : []),
      ...(study.pattern ? [`Breakdown of why this reference works:\n${patternLines(study.pattern)}`] : []),
      ...(context
        ? [
            `Admin angle / context (follow this closely when rewriting; keep the source structure but shift the story to this angle):\n${context.slice(0, 1500)}`,
          ]
        : []),
      `Keep the hook shape, the structure, the pacing and the level of detail of this reference; match how specific its points are and how its on-screen text reads. Rewrite every line in fresh words. Its insider facts may be used when they are true for this brand's audience, reworded, never copied. The plug names ${brand.productName} out loud; the reference's product is never mentioned. Do not mention the original creator.`,
      ...(countLine ? [countLine] : []),
    ];

    // Nothing is saved yet, so brief_id stays null; generation_id joins the
    // validation rows to the brief once the admin saves it.
    const generationId = crypto.randomUUID();
    const postType = await resolvePostType(sourceLines, post.format, 'mirror');
    const { outcome, warnings } = await generateValidated(
      admin,
      caller.companyId,
      generationId,
      postType,
      (priorFailures) =>
        generateOnce(brand, postType, post.format, sourceLines, priorFailures),
      validationCtx,
      countOptions,
    );
    if (isKill(outcome)) {
      return {
        kill_reason: outcome.kill_reason,
        generation_id: generationId,
        post_type_id: postType?.id ?? null,
      };
    }

    const exampleTranscript =
      transcript ??
      (slideTexts?.some((s) => s.trim())
        ? slideTexts.map((s, i) => `[${i + 1}] ${s}`).join('\n')
        : null);

    return {
      ...outcome.draft,
      overlay_labels: outcome.overlayLabels,
      point_media: await resolvePointMedia(admin, caller.companyId, brand.features, outcome.featureIds, outcome.draft.talking_points, postType?.family ?? post.format),
      post_type_id: postType?.id ?? null,
      generation_id: generationId,
      warnings,
      example_url: url,
      example_transcript: exampleTranscript,
    };
  } catch (e) {
    console.error('ingest-brief error:', e);
    return { error: e instanceof Error ? e.message : 'ingest failed' };
  }
  });
});
