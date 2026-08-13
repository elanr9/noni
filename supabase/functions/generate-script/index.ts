import {
  adminClient,
  authenticate,
  generateTaskDraft,
  handleCors,
  jsonResponse,
  loadBrandContext,
  type TrendForPrompt,
} from '../_shared/wp8.ts';

type Body = { trend_id?: string };

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
    let trend: TrendForPrompt | null = null;
    if (body.trend_id) {
      const { data } = await admin
        .from('trend_items')
        .select(
          'platform, hook, transcript, why_it_works, views, company_id, format, caption, slide_texts, remake_mode, remake_reason',
        )
        .eq('id', body.trend_id)
        .eq('company_id', caller.companyId)
        .maybeSingle();
      if (!data) return jsonResponse({ error: 'trend not found' }, 404);
      trend = data;
    }

    const brand = await loadBrandContext(admin, caller.companyId);
    const draft = await generateTaskDraft(brand, trend);
    return jsonResponse(draft);
  } catch (e) {
    console.error('generate-script error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'generation failed' },
      500,
    );
  }
});
