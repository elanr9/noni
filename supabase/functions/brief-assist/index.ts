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
// { action: "derive_segments", brief_id, overlay_labels? }
//   Derives or re-derives the render manifest for a saved brief through the
//   sync_brief_segments RPC (transactional; survivors matched by
//   talking_point_index keep overlay_text, show_on_screen, screenshot_url).
//   Called by the client right after createBrief and after edits that change
//   points or type.

import {
  adminClient,
  askClaude,
  authenticate,
  handleCors,
  jsonResponse,
  loadBrandContext,
  parseClaudeJson,
} from '../_shared/wp8.ts';
import {
  brandDocBlocks,
  buildFieldSystem,
  buildPortSystem,
  deriveSegments,
  generateValidated,
  isKill,
  loadPostType,
  normalizeGenerated,
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

type Body = {
  action?: 'regenerate_field' | 'derive_segments' | 'port_format';
  // regenerate_field
  field?: RegenField;
  index?: number;
  post_type?: string;
  draft?: Record<string, unknown>;
  // derive_segments, port_format
  brief_id?: string;
  overlay_labels?: (string | null)[];
  // port_format
  target_post_type?: string;
};

const POST_TYPE_COLUMNS =
  'id, key, label, family, min_points, max_points, clip_structure, requires_plug, requires_credential, target_words_min, target_words_max';

const REGEN_FIELDS: RegenField[] = [
  'search_phrase',
  'talking_points',
  'talking_point',
  'hook',
  'caption',
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

function draftContext(draft: BriefDraftShape): string[] {
  return [
    'Current brief:',
    `Title: ${draft.title || '(none)'}`,
    `Search phrase: ${draft.search_phrase ?? '(none)'}`,
    `Format: ${draft.format}`,
    `Talking points (${draft.talking_points.length}):\n${draft.talking_points
      .map(
        (p, i) =>
          `[${i}]${p.is_product ? ` (product point, claim ${p.claim_id})` : ''} ${p.text ?? '(empty)'}`,
      )
      .join('\n')}`,
    `Plug sentence (cta): ${draft.cta ?? '(none)'}`,
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
  overlay_label?: string | null;
};

type RawFieldOut = {
  kill_reason?: string;
  search_phrase?: string;
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
    text: typeof raw.text === 'string' ? raw.text : null,
    is_product: raw.is_product === true,
    edited_by_admin: false,
    claim_id: raw.claim_id ?? null,
  };
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

      const sourceType = (brief.post_types ?? null) as PostTypeRow | null;
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
        brand.bannedPhrases,
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
              `Your previous draft failed validation. Fix every one of these and return the corrected JSON:\n${priorFailures.map((f) => `- ${f}`).join('\n')}`,
            );
          }
          const raw = await askClaude(
            system,
            [...brandDocBlocks(brand), '', ...lines].join('\n\n'),
            4096,
          );
          return normalizeGenerated(
            parseClaudeJson<RawGenerated>(raw),
            targetType.family,
            targetType.key,
          );
        },
        {
          hashtagBank: brand.hashtagBank,
          approvedClaimIds: brand.approvedClaims.map((c) => c.id),
        },
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
      const postType = (brief.post_types ?? null) as PostTypeRow | null;
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

    if (body.action !== 'regenerate_field') {
      return jsonResponse(
        {
          error:
            'expected action "regenerate_field", "derive_segments" or "port_format"',
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
    const validationCtx = {
      hashtagBank: brand.hashtagBank,
      approvedClaimIds: brand.approvedClaims.map((c) => c.id),
      postType: postType ? toPostTypeShape(postType) : null,
    };
    const system = buildFieldSystem(field, postType, draft.format, brand.bannedPhrases);

    const askLines: string[] = [];
    if (field === 'talking_point') {
      askLines.push(
        `Regenerate the talking point at index ${body.index}. Every other point stays exactly as given.`,
      );
    } else if (field === 'talking_points') {
      askLines.push('Regenerate the full set of talking points (and the plug).');
    } else if (field === 'hook') {
      askLines.push('Regenerate the hook options against the talking points above.');
    } else if (field === 'caption') {
      askLines.push('Regenerate the caption and hashtags for the brief above.');
    } else {
      askLines.push('Regenerate the search phrase for the brief above.');
    }

    const generate = async (priorFailures: string[]): Promise<RawFieldOut> => {
      const lines = [...draftContext(draft), '', ...askLines];
      if (priorFailures.length) {
        lines.push(
          `Your previous answer failed validation. Fix every one of these:\n${priorFailures.map((f) => `- ${f}`).join('\n')}`,
        );
      }
      const raw = await askClaude(
        system,
        [...brandDocBlocks(brand), '', ...lines].join('\n\n'),
        4096,
      );
      return parseClaudeJson<RawFieldOut>(raw);
    };

    // Merge the regenerated field into the draft so validation sees the
    // post as the editor will after applying it.
    const merge = (out: RawFieldOut): { merged: BriefDraftShape; overlayLabels: (string | null)[] } => {
      const merged: BriefDraftShape = { ...draft };
      let overlayLabels: (string | null)[] = [];
      if (field === 'search_phrase') {
        merged.search_phrase = out.search_phrase?.trim() || draft.search_phrase;
      } else if (field === 'talking_points') {
        const points = (out.talking_points ?? []).map((p, i) =>
          toPoint(p, `p${i + 1}-${crypto.randomUUID().slice(0, 8)}`),
        );
        overlayLabels = (out.talking_points ?? []).map((p) =>
          typeof p.overlay_label === 'string' && p.overlay_label.trim()
            ? p.overlay_label.trim()
            : null,
        );
        merged.talking_points = points;
        merged.point_count =
          typeof out.point_count === 'number' ? out.point_count : points.length;
        merged.cta =
          typeof out.cta === 'string' && out.cta.trim() ? out.cta.trim() : null;
        merged.script =
          draft.format === 'photo_carousel' ? (out.script ?? null) : null;
        if (typeof out.target_words === 'number') merged.target_words = out.target_words;
      } else if (field === 'talking_point') {
        const index = body.index!;
        const current = draft.talking_points[index];
        // Force the original id; the point is regenerated in place and the
        // model cannot be trusted to keep it.
        const point = out.talking_point
          ? { ...toPoint(out.talking_point, current.id), id: current.id }
          : current;
        merged.talking_points = draft.talking_points.map((p, i) =>
          i === index ? point : p,
        );
        overlayLabels =
          typeof out.talking_point?.overlay_label === 'string'
            ? [out.talking_point.overlay_label.trim()]
            : [null];
      } else if (field === 'hook') {
        merged.hook_options = sortHooks(out.hook_options);
      } else {
        merged.caption = out.caption ?? draft.caption;
        merged.hashtags = Array.isArray(out.hashtags)
          ? out.hashtags.map((h) => String(h))
          : draft.hashtags;
      }
      return { merged, overlayLabels };
    };

    let out = await generate([]);
    if (out.kill_reason?.trim()) {
      return jsonResponse({ kill_reason: out.kill_reason.trim() });
    }
    let { merged, overlayLabels } = merge(out);
    let result = validateBrief(merged, validationCtx);
    if (!result.passed) {
      out = await generate(result.failures);
      if (out.kill_reason?.trim()) {
        return jsonResponse({ kill_reason: out.kill_reason.trim() });
      }
      ({ merged, overlayLabels } = merge(out));
      result = validateBrief(merged, validationCtx);
    }
    const warnings = result.passed
      ? result.warnings
      : [...result.failures, ...result.warnings];

    // Body changed under the hook: it was written against different content.
    // Flag it; never regenerate the hook silently, the admin may have
    // hand-written it.
    const hookMayBeStale = field === 'talking_points' || field === 'talking_point';

    if (field === 'search_phrase') {
      return jsonResponse({ search_phrase: merged.search_phrase, warnings });
    }
    if (field === 'talking_points') {
      return jsonResponse({
        talking_points: merged.talking_points,
        cta: merged.cta,
        point_count: merged.point_count,
        script: merged.script,
        target_words: merged.target_words,
        overlay_labels: overlayLabels,
        hook_may_be_stale: hookMayBeStale,
        warnings,
      });
    }
    if (field === 'talking_point') {
      return jsonResponse({
        talking_point: merged.talking_points[body.index!],
        overlay_label: overlayLabels[0] ?? null,
        index: body.index,
        hook_may_be_stale: hookMayBeStale,
        warnings,
      });
    }
    if (field === 'hook') {
      return jsonResponse({ hook_options: merged.hook_options, warnings });
    }
    return jsonResponse({ caption: merged.caption, hashtags: merged.hashtags, warnings });
  } catch (e) {
    console.error('brief-assist error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'brief-assist failed' },
      500,
    );
  }
});
