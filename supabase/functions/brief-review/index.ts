// AI review for one post. Admin only, on demand: the admin hits Review in the
// post editor and this runs the three tiers against the editor's CURRENT
// draft state (nothing is saved here). Returns structured checks, per-section
// scores, and the Tier 3 spoken/written verdict. Review never blocks and
// never edits: suggestions are offered, applied client-side only when
// accepted. Overrides and edit diffs are logged client-side to
// brief_review_events on confirm.
//
// Body: { draft, post_type?, hook_index? }
//   draft: the editor state (same shape brief-assist regenerate_field takes)
//   post_type: post_types.key, for point-count and length rules
//   hook_index: which hook option is chosen (default 0); Tier 2/3 review the
//   chosen hook, not all ten options.

import {
  adminClient,
  askClaude,
  authenticate,
  handleCors,
  jsonResponse,
  loadBrandContext,
  parseClaudeJson,
} from '../_shared/wp8.ts';
import { loadPostType, toPostTypeShape } from '../_shared/generateBrief.ts';
import { runTier1Checks, type ReviewCheck } from '../_shared/validateBrief.ts';
import {
  buildTier2User,
  buildTier3User,
  parseReviewDraft,
  parseTier2,
  parseTier3,
  scoreReview,
  TIER2_SYSTEM,
  TIER3_SYSTEM,
} from '../_shared/reviewBrief.ts';

type Body = {
  draft?: Record<string, unknown>;
  post_type?: string;
  hook_index?: number;
};

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
  if (!body.draft || typeof body.draft !== 'object') {
    return jsonResponse({ error: 'draft required' }, 400);
  }

  try {
    const draft = parseReviewDraft(body.draft);
    const hookIndex =
      typeof body.hook_index === 'number' &&
      body.hook_index >= 0 &&
      body.hook_index < draft.hook_options.length
        ? body.hook_index
        : 0;
    const chosenHook = draft.hook_options[hookIndex] ?? null;

    const postType = body.post_type?.trim()
      ? await loadPostType(admin, caller.companyId, body.post_type.trim())
      : null;
    if (body.post_type?.trim() && !postType) {
      return jsonResponse({ error: `unknown post type "${body.post_type}"` }, 400);
    }
    const brand = await loadBrandContext(admin, caller.companyId);

    const tier1 = runTier1Checks(draft, {
      hashtagBank: brand.hashtagBank,
      approvedClaimIds: brand.approvedClaims.map((c) => c.id),
      postType: postType ? toPostTypeShape(postType) : null,
    });

    const [tier2Raw, tier3Raw] = await Promise.all([
      askClaude(TIER2_SYSTEM, buildTier2User(draft, chosenHook), 2048),
      askClaude(TIER3_SYSTEM, buildTier3User(draft, chosenHook), 512),
    ]);
    const tier2 = parseTier2(parseClaudeJson(tier2Raw));
    const { result: tier3, checks: tier3Checks } = parseTier3(
      parseClaudeJson(tier3Raw),
    );

    const checks: ReviewCheck[] = [...tier1, ...tier2, ...tier3Checks];
    return jsonResponse({ checks, scores: scoreReview(checks), tier3 });
  } catch (e) {
    console.error('brief-review error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'brief-review failed' },
      500,
    );
  }
});
