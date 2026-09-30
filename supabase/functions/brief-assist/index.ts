// Per-field brief regeneration and brief_segments derivation. Admin only.
//
// { action: "regenerate_field", field, draft, post_type?, index? }
//   Regenerates one field against the current draft (nothing is saved).
//   field: search_phrase | talking_points | talking_point (with index) |
//   hook | caption. Body regens (talking_points, talking_point) return
//   hook_may_be_stale: true — the hook was written against different content;
//   Agent 3 surfaces the nudge, nothing regenerates silently. Responses may
//   be { kill_reason } instead of content (kill rather than pad).
//
// { action: "port_format", brief_id, target_post_type }
//   Ports a finished post into the other family (video <-> slideshow) and
//   returns a draft in the same shape ingest-brief returns. Nothing is saved:
//   the client writes the draft into an empty slot in the target lane, so the
//   source post is never touched.
//
// { action: "revise", draft, feedback, post_type?, history?, example_transcript? }
//   Chat revise: rewrites the whole brief against the manager's plain
//   language feedback and returns a draft in the ingest-brief shape plus
//   revision_note (what changed, addressed to the manager). Nothing is saved.
//
// { action: "derive_segments", brief_id, overlay_labels? }
//   Derives or re-derives the render manifest for a saved brief through the
//   sync_brief_segments RPC (transactional; survivors matched by
//   talking_point_index keep overlay_text, show_on_screen, screenshot_url).
//   Called by the client right after createBrief and after edits that change
//   points or type.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  adminClient,
  askClaude,
  authenticate,
  handleCors,
  jsonResponse,
  streamJsonResponse,
  loadBrandContext,
  parseClaudeJson,
  stripDashes,
  type BrandContext,
} from '../_shared/wp8.ts';
import {
  brandDocBlocks,
  brandSystemOptions,
  brandValidationCtx,
  retryMessage,
  buildFieldSystem,
  buildPortSystem,
  buildReviseSystem,
  deriveSegments,
  generateValidated,
  isKill,
  loadPostType,
  normalizeGenerated,
  resolvePointMedia,
  sanitizeFeatureId,
  sortHooks,
  sourceBriefLines,
  toPostTypeShape,
  type PostTypeRow,
  type RawGenerated,
  type RegenField,
  type SourceBrief,
} from '../_shared/generateBrief.ts';
import {
  validateBrief,
  type BriefDraftShape,
  type TalkingPoint,
} from '../_shared/validateBrief.ts';
import {
  applyLocked,
  captureLocked,
  constraintFailures,
  constraintLines,
  extractConstraints,
  keptNote,
  lockedTexts,
  rememberForCompany,
} from '../_shared/reviseConstraints.ts';

/** The one line the chat shows after a targeted fix. */
function fieldNote(field: RegenField, index?: number): string {
  switch (field) {
    case 'hook':
      return 'Rewrote the hook options against your feedback. Everything else is untouched.';
    case 'title':
      return 'Rewrote the title. Everything else is untouched.';
    case 'caption':
      return 'Rewrote the caption and hashtags. Everything else is untouched.';
    case 'search_phrase':
      return 'Rewrote the search phrase. Everything else is untouched.';
    case 'talking_point':
      return `Rewrote point ${(index ?? 0) + 1} against your feedback. The other points, the hook and the caption are untouched.`;
    default:
      return 'Rewrote the talking points and the plug against your feedback. The hook, title and caption are untouched.';
  }
}

type ReviseTurn = { role: 'manager' | 'ai'; text: string };

type Body = {
  action?: 'regenerate_field' | 'derive_segments' | 'port_format' | 'revise';
  // regenerate_field, revise
  field?: RegenField;
  index?: number;
  post_type?: string;
  draft?: Record<string, unknown>;
  // derive_segments, port_format
  brief_id?: string;
  overlay_labels?: (string | null)[];
  // port_format
  target_post_type?: string;
  // revise
  feedback?: string;
  history?: ReviseTurn[];
  example_transcript?: string | null;
};

const MAX_REVISE_HISTORY = 8;
const MAX_REVISE_TURN_CHARS = 2000;

function parseHistory(value: unknown): ReviseTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is ReviseTurn =>
        t !== null &&
        typeof t === 'object' &&
        ((t as ReviseTurn).role === 'manager' || (t as ReviseTurn).role === 'ai') &&
        typeof (t as ReviseTurn).text === 'string' &&
        (t as ReviseTurn).text.trim().length > 0,
    )
    .slice(-MAX_REVISE_HISTORY)
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_REVISE_TURN_CHARS) }));
}

const POST_TYPE_COLUMNS =
  'id, key, label, family, min_points, max_points, clip_structure, requires_plug, requires_credential, target_words_min, target_words_max';

const REGEN_FIELDS: RegenField[] = [
  'search_phrase',
  'talking_points',
  'talking_point',
  'hook',
  'caption',
  'title',
];

function parsePoints(value: unknown): TalkingPoint[] {
  if (!Array.isArray(value)) return [];
  const points: TalkingPoint[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    points.push({
      id: typeof raw.id === 'string' ? raw.id : String(points.length + 1),
      text: typeof raw.text === 'string' ? raw.text : null,
      is_product: raw.is_product === true,
      edited_by_admin: raw.edited_by_admin === true,
      claim_id: typeof raw.claim_id === 'string' ? raw.claim_id : null,
      script: raw.script === true,
    });
  }
  return points;
}

/** Slide copy lives in overlay_style.boxes; overlay_text is the legacy mirror. */
function segmentText(overlayText: unknown, overlayStyle: unknown): string | null {
  if (overlayStyle !== null && typeof overlayStyle === 'object') {
    const boxes = (overlayStyle as Record<string, unknown>).boxes;
    if (Array.isArray(boxes)) {
      const joined = boxes
        .map((b) =>
          b !== null && typeof b === 'object'
            ? String((b as Record<string, unknown>).text ?? '')
            : '',
        )
        .filter((t) => t.trim().length > 0)
        .join(' ');
      if (joined.trim()) return joined.trim();
    }
  }
  if (typeof overlayText === 'string' && overlayText.trim()) {
    return overlayText.trim();
  }
  return null;
}

/** The hook the manager actually chose or typed; hook_options[0] otherwise. */
function parseChosenHook(raw: Record<string, unknown>, draft: BriefDraftShape): string | null {
  if (typeof raw.hook === 'string' && raw.hook.trim()) return raw.hook.trim();
  return draft.hook_options[0]?.trim() || null;
}

/** Tolerant read of the editor's current draft state. */
function parseClientDraft(raw: Record<string, unknown>): BriefDraftShape {
  const points = parsePoints(raw.talking_points);
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    search_phrase:
      typeof raw.search_phrase === 'string' && raw.search_phrase.trim()
        ? raw.search_phrase.trim()
        : null,
    format: raw.format === 'photo_carousel' ? 'photo_carousel' : 'video',
    point_count:
      typeof raw.point_count === 'number' ? raw.point_count : points.length,
    target_words: typeof raw.target_words === 'number' ? raw.target_words : 380,
    hook_options: Array.isArray(raw.hook_options)
      ? raw.hook_options.filter((h): h is string => typeof h === 'string')
      : [],
    talking_points: points,
    cta: typeof raw.cta === 'string' && raw.cta.trim() ? raw.cta.trim() : null,
    caption: typeof raw.caption === 'string' ? raw.caption : '',
    hashtags: Array.isArray(raw.hashtags)
      ? raw.hashtags.filter((h): h is string => typeof h === 'string')
      : [],
    why_it_works: typeof raw.why_it_works === 'string' ? raw.why_it_works : '',
    script: typeof raw.script === 'string' && raw.script.trim() ? raw.script : null,
  };
}

function draftContext(draft: BriefDraftShape, chosenHook: string | null = null): string[] {
  return [
    'Current brief:',
    `Title: ${draft.title || '(none)'}`,
    `Search phrase: ${draft.search_phrase ?? '(none)'}`,
    `Format: ${draft.format}`,
    `Talking points (${draft.talking_points.length}):\n${draft.talking_points
      .map(
        (p, i) =>
          `[${i}]${p.is_product ? ` (product point, claim ${p.claim_id})` : ''}${p.edited_by_admin ? ' (edited by the manager)' : ''} ${p.text ?? '(empty)'}`,
      )
      .join('\n')}`,
    `Plug sentence (cta): ${draft.cta ?? '(none)'}`,
    ...(chosenHook ? [`Hook the manager is using: ${chosenHook}`] : []),
    `Hook options (best first): ${draft.hook_options.join(' | ') || '(none)'}`,
    `Caption: ${draft.caption || '(none)'}`,
    `Hashtags: ${draft.hashtags.join(' ') || '(none)'}`,
    ...(draft.script ? [`Slide copy:\n${draft.script}`] : []),
  ];
}

type RawPointOut = {
  id?: string;
  text?: string | null;
  is_product?: boolean;
  claim_id?: string | null;
  feature_id?: string | null;
  overlay_label?: string | null;
};

type RawFieldOut = {
  kill_reason?: string;
  search_phrase?: string;
  title?: string;
  claim_id?: string | null;
  point_count?: number;
  talking_points?: RawPointOut[];
  talking_point?: RawPointOut;
  cta?: string | null;
  script?: string | null;
  target_words?: number;
  hook_options?: Array<{ text?: string; score?: number } | string>;
  caption?: string;
  hashtags?: string[];
};

function toPoint(raw: RawPointOut, fallbackId: string): TalkingPoint {
  return {
    id: raw.id?.trim() || fallbackId,
    text: typeof raw.text === 'string' ? stripDashes(raw.text) : null,
    is_product: raw.is_product === true,
    edited_by_admin: false,
    claim_id: raw.claim_id ?? null,
  };
}

type FieldRegenArgs = {
  admin: SupabaseClient;
  companyId: string;
  brand: BrandContext;
  draft: BriefDraftShape;
  postType: PostTypeRow | null;
  field: RegenField;
  index?: number;
  knownFeatureIds: Set<string>;
  /** Chat revise: the manager's words, applied to this one part. */
  feedback?: string;
  standingInstructions?: string[];
  requiredPointCount?: number | null;
};

/**
 * Regenerates one part of the draft against the rest of it and returns the
 * response body the editor applies. Shared by the Regenerate buttons and by
 * chat revise when the feedback only touches one part, so "the hook needs to
 * be better" costs one small call instead of a whole rewrite.
 */
async function regenerateField(args: FieldRegenArgs): Promise<Record<string, unknown>> {
  const { admin, companyId, brand, draft, postType, field, index, knownFeatureIds } = args;
  const validationCtx = {
    ...brandValidationCtx(brand),
    postType: postType ? toPostTypeShape(postType) : null,
  };
  const system = buildFieldSystem(field, postType, draft.format, brandSystemOptions(brand));

  const askLines: string[] = [];
  if (field === 'talking_point') {
    askLines.push(
      `Regenerate the talking point at index ${index}. Every other point stays exactly as given.`,
    );
  } else if (field === 'talking_points') {
    askLines.push('Regenerate the full set of talking points (and the plug).');
  } else if (field === 'hook') {
    askLines.push('Regenerate the hook options against the talking points above.');
  } else if (field === 'caption') {
    askLines.push('Regenerate the caption and hashtags for the brief above.');
  } else if (field === 'title') {
    askLines.push('Rewrite the title for the brief above.');
  } else {
    askLines.push('Regenerate the search phrase for the brief above.');
  }
  if (args.standingInstructions?.length) {
    askLines.push(
      `Standing instructions from the manager (always in force):\n${args.standingInstructions.map((s) => `- ${s}`).join('\n')}`,
    );
  }
  if (args.feedback) {
    askLines.push(
      `The manager's feedback on this part (it is law; the new version must fix exactly this):\n${args.feedback.slice(0, 3000)}`,
    );
  }
  const requiredCount = field === 'talking_points' ? args.requiredPointCount ?? null : null;
  if (requiredCount !== null) {
    askLines.push(
      `REQUIRED POINT COUNT: the manager asked for exactly ${requiredCount} talking points. point_count is ${requiredCount} and talking_points has exactly ${requiredCount} entries; this overrides the post type's range.`,
    );
  }
  const validate = (merged: BriefDraftShape) => {
    const base = validateBrief(merged, validationCtx);
    if (requiredCount !== null && merged.talking_points.length !== requiredCount) {
      base.failures.push(
        `the manager asked for exactly ${requiredCount} talking points and you returned ${merged.talking_points.length}; write exactly ${requiredCount}`,
      );
      base.passed = false;
    }
    return base;
  };

  const generate = async (priorFailures: string[]): Promise<RawFieldOut> => {
    const lines = [...draftContext(draft), '', ...askLines];
    if (priorFailures.length) {
      lines.push(retryMessage(priorFailures, 'answer'));
    }
    const raw = await askClaude(system, lines.join('\n\n'), 8000, {
      cachedPrefix: brandDocBlocks(brand).join('\n\n'),
    });
    return parseClaudeJson<RawFieldOut>(raw);
  };

  // Merge the regenerated field into the draft so validation sees the
  // post as the editor will after applying it.
  const merge = (
    out: RawFieldOut,
  ): {
    merged: BriefDraftShape;
    overlayLabels: (string | null)[];
    featureIds: (string | null)[];
  } => {
    const merged: BriefDraftShape = { ...draft };
    let overlayLabels: (string | null)[] = [];
    let featureIds: (string | null)[] = [];
    if (field === 'search_phrase') {
      merged.search_phrase = out.search_phrase?.trim()
        ? stripDashes(out.search_phrase)
        : draft.search_phrase;
    } else if (field === 'title') {
      merged.title = out.title?.trim() ? stripDashes(out.title) : draft.title;
    } else if (field === 'talking_points') {
      const points = (out.talking_points ?? []).map((p, i) =>
        toPoint(p, `p${i + 1}-${crypto.randomUUID().slice(0, 8)}`),
      );
      overlayLabels = (out.talking_points ?? []).map((p) =>
        typeof p.overlay_label === 'string' && p.overlay_label.trim()
          ? stripDashes(p.overlay_label)
          : null,
      );
      featureIds = (out.talking_points ?? []).map((p) =>
        sanitizeFeatureId(p.feature_id, knownFeatureIds),
      );
      merged.talking_points = points;
      merged.point_count =
        typeof out.point_count === 'number' ? out.point_count : points.length;
      merged.cta =
        typeof out.cta === 'string' && out.cta.trim() ? stripDashes(out.cta) : null;
      merged.script =
        draft.format === 'photo_carousel' && out.script ? stripDashes(out.script) : null;
      if (typeof out.target_words === 'number') merged.target_words = out.target_words;
    } else if (field === 'talking_point') {
      const at = index!;
      const current = draft.talking_points[at];
      // Force the original id; the point is regenerated in place and the
      // model cannot be trusted to keep it.
      const point = out.talking_point
        ? { ...toPoint(out.talking_point, current.id), id: current.id, script: current.script }
        : current;
      merged.talking_points = draft.talking_points.map((p, i) => (i === at ? point : p));
      // The plug sentence lives in cta too; a regenerated plug point carries
      // its new sentence there.
      if (point.is_product && typeof out.cta === 'string' && out.cta.trim()) {
        merged.cta = stripDashes(out.cta);
      }
      overlayLabels =
        typeof out.talking_point?.overlay_label === 'string'
          ? [stripDashes(out.talking_point.overlay_label)]
          : [null];
      featureIds = [sanitizeFeatureId(out.talking_point?.feature_id, knownFeatureIds)];
    } else if (field === 'hook') {
      merged.hook_options = sortHooks(out.hook_options).map(stripDashes);
    } else {
      merged.caption = out.caption ? stripDashes(out.caption) : draft.caption;
      merged.hashtags = Array.isArray(out.hashtags)
        ? out.hashtags.map((h) => String(h).replace(/[-–—]/g, ''))
        : draft.hashtags;
    }
    return { merged, overlayLabels, featureIds };
  };

  let out = await generate([]);
  if (out.kill_reason?.trim()) return { kill_reason: stripDashes(out.kill_reason) };
  let { merged, overlayLabels, featureIds } = merge(out);
  let result = validate(merged);
  if (!result.passed) {
    out = await generate(result.failures);
    if (out.kill_reason?.trim()) return { kill_reason: stripDashes(out.kill_reason) };
    ({ merged, overlayLabels, featureIds } = merge(out));
    result = validate(merged);
  }
  const warnings = result.passed
    ? result.warnings
    : [...result.failures, ...result.warnings];

  // Body changed under the hook: it was written against different content.
  // Flag it; never regenerate the hook silently, the admin may have
  // hand-written it.
  const hookMayBeStale = field === 'talking_points' || field === 'talking_point';
  const family = postType?.family ?? draft.format;

  if (field === 'search_phrase') return { search_phrase: merged.search_phrase, warnings };
  if (field === 'title') return { title: merged.title, warnings };
  if (field === 'talking_points') {
    return {
      talking_points: merged.talking_points,
      cta: merged.cta,
      point_count: merged.point_count,
      script: merged.script,
      target_words: merged.target_words,
      overlay_labels: overlayLabels,
      point_media: await resolvePointMedia(admin, companyId, brand.features, featureIds, merged.talking_points, family),
      hook_may_be_stale: hookMayBeStale,
      warnings,
    };
  }
  if (field === 'talking_point') {
    const point = merged.talking_points[index!];
    return {
      talking_point: point,
      cta: merged.cta,
      overlay_label: overlayLabels[0] ?? null,
      point_media: await resolvePointMedia(admin, companyId, brand.features, featureIds, [point], family),
      index,
      hook_may_be_stale: hookMayBeStale,
      warnings,
    };
  }
  if (field === 'hook') return { hook_options: merged.hook_options, warnings };
  return { caption: merged.caption, hashtags: merged.hashtags, warnings };
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

  try {
    if (body.action === 'port_format') {
      if (!body.brief_id) return jsonResponse({ error: 'brief_id required' }, 400);
      const target = body.target_post_type?.trim();
      if (!target) return jsonResponse({ error: 'target_post_type required' }, 400);

      const { data: brief, error } = await admin
        .from('briefs')
        .select(
          `id, title, search_phrase, format, hook, hook_options, talking_points, cta, caption, hashtags, script, post_types (${POST_TYPE_COLUMNS})`,
        )
        .eq('id', body.brief_id)
        .eq('company_id', caller.companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!brief) return jsonResponse({ error: 'brief not found' }, 404);

      const targetType = await loadPostType(admin, caller.companyId, target);
      if (!targetType) {
        return jsonResponse({ error: `unknown post type "${target}"` }, 400);
      }

      const { data: segments, error: segmentError } = await admin
        .from('brief_segments')
        .select('overlay_text, overlay_style, slot_index')
        .eq('brief_id', body.brief_id)
        .eq('company_id', caller.companyId)
        .order('slot_index');
      if (segmentError) throw new Error(segmentError.message);

      const sourceType = (brief.post_types ?? null) as unknown as PostTypeRow | null;
      const sourceHookOptions = Array.isArray(brief.hook_options)
        ? (brief.hook_options as unknown[]).filter(
            (h): h is string => typeof h === 'string',
          )
        : [];
      const source: SourceBrief = {
        title: (brief.title as string | null) ?? '',
        searchPhrase: (brief.search_phrase as string | null) ?? null,
        format: brief.format === 'photo_carousel' ? 'photo_carousel' : 'video',
        postTypeLabel: sourceType?.label ?? null,
        hook: (brief.hook as string | null) ?? sourceHookOptions[0] ?? null,
        talkingPoints: parsePoints(brief.talking_points).map((p) => ({
          text: p.text,
          is_product: p.is_product,
        })),
        cta: (brief.cta as string | null) ?? null,
        caption: (brief.caption as string | null) ?? null,
        hashtags: Array.isArray(brief.hashtags)
          ? (brief.hashtags as unknown[]).filter(
              (h): h is string => typeof h === 'string',
            )
          : [],
        script: (brief.script as string | null) ?? null,
        overlayTexts: (segments ?? [])
          .map((s) => segmentText(s.overlay_text, s.overlay_style))
          .filter((t): t is string => t !== null),
      };
      if (source.talkingPoints.length === 0) {
        return jsonResponse(
          { error: 'that post has no talking points to port yet' },
          400,
        );
      }

      const brand = await loadBrandContext(admin, caller.companyId);
      const generationId = crypto.randomUUID();
      const system = buildPortSystem(
        targetType,
        targetType.family,
        brandSystemOptions(brand),
      );
      const askLine = `Port this ${source.format === 'photo_carousel' ? 'slideshow' : 'video'} into a ${targetType.label} ${targetType.family === 'photo_carousel' ? 'slideshow' : 'video'}.`;

      const { outcome, warnings } = await generateValidated(
        admin,
        caller.companyId,
        generationId,
        targetType,
        async (priorFailures) => {
          const lines = [...sourceBriefLines(source), '', askLine];
          if (priorFailures.length) {
            lines.push(
              retryMessage(priorFailures, 'draft'),
            );
          }
          const raw = await askClaude(
            system,
            lines.join('\n\n'),
            8000,
            { cachedPrefix: brandDocBlocks(brand).join('\n\n') },
          );
          return normalizeGenerated(
            parseClaudeJson<RawGenerated>(raw),
            targetType.family,
            targetType.key,
            new Set(brand.features.map((f) => f.id)),
          );
        },
        brandValidationCtx(brand),
      );
      if (isKill(outcome)) {
        return jsonResponse({
          kill_reason: outcome.kill_reason,
          generation_id: generationId,
          post_type_id: targetType.id,
        });
      }
      return jsonResponse({
        ...outcome.draft,
        overlay_labels: outcome.overlayLabels,
        point_media: await resolvePointMedia(admin, caller.companyId, brand.features, outcome.featureIds, outcome.draft.talking_points, targetType.family),
        post_type_id: targetType.id,
        generation_id: generationId,
        warnings,
        example_url: null,
        example_transcript: null,
      });
    }

    if (body.action === 'derive_segments') {
      if (!body.brief_id) return jsonResponse({ error: 'brief_id required' }, 400);
      const { data: brief, error } = await admin
        .from('briefs')
        .select(
          'id, hook, hook_options, talking_points, post_type_id, post_types (id, key, label, family, min_points, max_points, clip_structure, requires_plug, requires_credential, target_words_min, target_words_max)',
        )
        .eq('id', body.brief_id)
        .eq('company_id', caller.companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!brief) return jsonResponse({ error: 'brief not found' }, 404);
      const postType = (brief.post_types ?? null) as unknown as PostTypeRow | null;
      if (!postType) {
        return jsonResponse(
          { error: 'legacy brief has no post type; segments are not derived' },
          400,
        );
      }
      const points = parsePoints(brief.talking_points);
      const hookOptions = Array.isArray(brief.hook_options)
        ? (brief.hook_options as unknown[]).filter(
            (h): h is string => typeof h === 'string',
          )
        : [];
      const segments = deriveSegments({
        clipStructure: postType.clip_structure,
        hook: (brief.hook as string | null) ?? hookOptions[0] ?? null,
        talkingPoints: points,
        overlayLabels: body.overlay_labels,
      });
      const { data: rows, error: rpcError } = await admin.rpc('sync_brief_segments', {
        p_brief_id: body.brief_id,
        p_company_id: caller.companyId,
        p_segments: segments,
      });
      if (rpcError) throw new Error(rpcError.message);
      return jsonResponse({ segments: rows });
    }

    // Chat revise: the manager says what is wrong in plain language and the
    // whole brief is rewritten against that feedback. Nothing is saved; the
    // client applies the returned draft the same way it applies ingest-brief.
    if (body.action === 'revise') {
      const feedback = body.feedback?.trim();
      if (!feedback) return jsonResponse({ error: 'feedback required' }, 400);
      if (!body.draft || typeof body.draft !== 'object') {
        return jsonResponse({ error: 'draft required' }, 400);
      }
      const draft = parseClientDraft(body.draft);
      const chosenHook = parseChosenHook(body.draft, draft);
      const history = parseHistory(body.history);
      const exampleTranscript = body.example_transcript?.trim() || null;
      const loadedType = body.post_type?.trim()
        ? await loadPostType(admin, caller.companyId, body.post_type.trim())
        : null;
      if (body.post_type?.trim() && !loadedType) {
        return jsonResponse({ error: `unknown post type "${body.post_type}"` }, 400);
      }
      const [brand, constraints] = await Promise.all([
        loadBrandContext(admin, caller.companyId),
        extractConstraints(
          history.filter((t) => t.role === 'manager').map((t) => t.text),
          feedback,
          draft.talking_points.length,
        ),
      ]);
      // "We do not have that feature, do not do that again" is saved for
      // every future post and applied to this one right now.
      const remembered = await rememberForCompany(admin, caller.companyId, constraints.remember);
      const standing = [
        ...constraints.standingInstructions,
        ...constraints.remember.map((r) => r.insight),
      ];
      const rememberedNote = remembered.length
        ? ` Noted for every future post: ${remembered.map((r) => r.insight).join(' ')}`
        : '';
      // The manager's count outranks the post type's range, in the prompt
      // and in validation alike.
      const postType: PostTypeRow | null =
        loadedType && constraints.pointCount !== null
          ? { ...loadedType, min_points: constraints.pointCount, max_points: constraints.pointCount }
          : loadedType;
      const knownFeatureIds = new Set(brand.features.map((f) => f.id));

      // Targeted feedback regenerates one part and leaves the rest untouched;
      // "the hook needs to be better" never costs a whole rewrite.
      const productIndex = draft.talking_points.findIndex((p) => p.is_product);
      const targeted: { field: RegenField; index?: number } | null = (() => {
        switch (constraints.scope) {
          case 'hook':
            return draft.talking_points.length ? { field: 'hook' } : null;
          case 'title':
            return { field: 'title' };
          case 'caption':
            return { field: 'caption' };
          case 'search_phrase':
            return { field: 'search_phrase' };
          case 'cta':
            return productIndex >= 0
              ? { field: 'talking_point', index: productIndex }
              : { field: 'talking_points' };
          case 'point':
            return constraints.pointIndex !== null
              ? { field: 'talking_point', index: constraints.pointIndex }
              : { field: 'talking_points' };
          case 'points':
            return { field: 'talking_points' };
          default:
            return null;
        }
      })();
      if (targeted) {
        return streamJsonResponse(async () => {
          const out = await regenerateField({
            admin,
            companyId: caller.companyId,
            brand,
            draft,
            postType,
            field: targeted.field,
            index: targeted.index,
            knownFeatureIds,
            feedback,
            standingInstructions: standing,
            requiredPointCount: constraints.pointCount,
          });
          if (typeof out.kill_reason === 'string') return out;
          return {
            ...out,
            scope: 'field',
            field: targeted.field,
            revision_note: `${fieldNote(targeted.field, targeted.index)}${rememberedNote}`,
          };
        });
      }

      const locked = captureLocked(draft, chosenHook, constraints);
      const generationId = crypto.randomUUID();
      const system = buildReviseSystem(postType, draft.format, brandSystemOptions(brand));
      let revisionNote = '';

      // A full rewrite runs past the gateway's 150s idle timeout; stream
      // keepalive bytes until the draft is ready.
      return streamJsonResponse(async () => {
        const { outcome, warnings } = await generateValidated(
          admin,
          caller.companyId,
          generationId,
          postType,
          async (priorFailures) => {
            const lines = [...draftContext(draft, chosenHook)];
            if (exampleTranscript) {
              lines.push(
                `Reference post this brief was modeled on (structure and hook shape only, never its niche or product):\n${exampleTranscript.slice(0, 2000)}`,
              );
            }
            if (history.length) {
              lines.push(
                `Conversation so far:\n${history
                  .map((t) => `${t.role === 'manager' ? 'Manager' : 'You'}: ${t.text.trim()}`)
                  .join('\n')}`,
              );
            }
            lines.push(`Newest feedback from the manager (apply all of it):\n${feedback.slice(0, 3000)}`);
            lines.push(...constraintLines({ ...constraints, standingInstructions: standing }, locked));
            if (priorFailures.length) {
              lines.push(
                retryMessage(priorFailures, 'revision'),
              );
            }
          const raw = await askClaude(
            system,
            lines.join('\n\n'),
            8000,
            { cachedPrefix: brandDocBlocks(brand).join('\n\n') },
          );
          const parsed = parseClaudeJson<RawGenerated>(raw);
          revisionNote =
              typeof parsed.revision_note === 'string' ? parsed.revision_note.trim() : '';
            const generated = normalizeGenerated(
              parsed,
              postType ? postType.family : draft.format,
              postType?.key ?? null,
              new Set(brand.features.map((f) => f.id)),
            );
            if (isKill(generated)) return generated;
            // Locks are enforced here, not trusted: the model's output is
            // overwritten before validation ever sees it.
            return { ...generated, draft: applyLocked(generated.draft, locked) };
          },
          brandValidationCtx(brand),
          {
            lockedTexts: lockedTexts(locked),
            extraFailures: (d) => constraintFailures(d, constraints),
          },
        );
        if (isKill(outcome)) {
          return { kill_reason: outcome.kill_reason, generation_id: generationId };
        }
        const kept = keptNote(constraints, locked);
        const note = stripDashes(revisionNote) || 'Revised the post against your feedback.';
        return {
          ...outcome.draft,
          scope: 'full',
          hook: locked.hook ?? outcome.draft.hook_options[0] ?? null,
          revision_note: `${kept ? `${note} ${kept}` : note}${rememberedNote}`,
          overlay_labels: outcome.overlayLabels,
          point_media: await resolvePointMedia(
            admin,
            caller.companyId,
            brand.features,
            outcome.featureIds,
            outcome.draft.talking_points,
            postType?.family ?? draft.format,
          ),
          post_type_id: postType?.id ?? null,
          generation_id: generationId,
          warnings,
        };
      });
    }

    if (body.action !== 'regenerate_field') {
      return jsonResponse(
        {
          error:
            'expected action "regenerate_field", "derive_segments", "port_format" or "revise"',
        },
        400,
      );
    }
    const field = body.field;
    if (!field || !REGEN_FIELDS.includes(field)) {
      return jsonResponse({ error: `field must be one of ${REGEN_FIELDS.join(', ')}` }, 400);
    }
    if (!body.draft || typeof body.draft !== 'object') {
      return jsonResponse({ error: 'draft required' }, 400);
    }
    const draft = parseClientDraft(body.draft);
    if (
      field === 'talking_point' &&
      (typeof body.index !== 'number' ||
        body.index < 0 ||
        body.index >= draft.talking_points.length)
    ) {
      return jsonResponse({ error: 'index must point at an existing talking point' }, 400);
    }

    let postType: PostTypeRow | null = null;
    if (body.post_type?.trim()) {
      postType = await loadPostType(admin, caller.companyId, body.post_type.trim());
      if (!postType) {
        return jsonResponse({ error: `unknown post type "${body.post_type}"` }, 400);
      }
    }
    const brand = await loadBrandContext(admin, caller.companyId);
    return jsonResponse(
      await regenerateField({
        admin,
        companyId: caller.companyId,
        brand,
        draft,
        postType,
        field,
        index: body.index,
        knownFeatureIds: new Set(brand.features.map((f) => f.id)),
      }),
    );
  } catch (e) {
    console.error('brief-assist error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'brief-assist failed' },
      500,
    );
  }
});
