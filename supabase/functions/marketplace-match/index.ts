// Ranks every listed creator against one marketplace listing.
//
// A manager opens Market and asks for the best creators for their campaign.
// This reads the listing, what the company sells and who it sells to, and
// each creator's resume and track record, and has Claude give every creator
// a 0 to 100 fit score with one short line of why. Scores are saved in
// marketplace_matches (migration 155); the directory sorts by them.
//
// POST { listing_id } -> { ranked }
import { adminClient, authenticate, handleCors, jsonResponse, streamJsonResponse } from '../_shared/wp8.ts';
import { generate } from '../_shared/ai/llm.ts';

type CreatorRow = {
  creator_id: string;
  age: number | null;
  gender: string | null;
  location: string | null;
  bio: string | null;
  followers: number | null;
  experience: string | null;
  campaigns_done: string | null;
  best_campaign: string | null;
  niches: string[] | null;
  on_camera: string | null;
  weekly_capacity: string | null;
  portfolio: unknown;
  total_views: number;
  posts_live: number;
  total_earned_cents: number;
  is_member: boolean;
};

const SYSTEM = `You match UGC creators to a brand's campaign for a creator marketplace.

You get one campaign and a numbered list of creators. Score every creator from 0 to 100 on how well they fit this campaign, and give one plain line of why.

What matters, in order:
1. Audience and niche fit. Would this person's content and the people who watch it plausibly care about this product? A stated niche that matches the campaign counts most. Adjacent niches count some.
2. Proof. Views and posts already delivered on the platform, past paid work, a campaign they describe well. Real numbers beat claims.
3. Fit to what the campaign asks for: posting pace they can keep, platform, age the campaign asks for, comfort on camera.
A brand new creator with a strong niche fit is a real candidate. Do not bury them under experienced creators with no fit.

Scoring guide: 85 and up is someone the brand should invite today. 65 to 84 is a good fit. 40 to 64 could work. Under 40 is a poor fit.

The reason is one sentence, 16 words at most, written to the brand, about this creator and this campaign. Name the concrete thing ("Fitness and food creator with 240k views on past posts"). No dashes, no hype, no names.

Never score on gender, race, or anything about a person other than what bears on the campaign's stated requirements. Return every creator exactly once, by its number.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ranks'],
  properties: {
    ranks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'score', 'why'],
        properties: {
          n: { type: 'integer' },
          score: { type: 'integer' },
          why: { type: 'string' },
        },
      },
    },
  },
};

const BATCH = 40;
const MAX_CREATORS = 400;

function creatorLine(n: number, c: CreatorRow): string {
  const bits: string[] = [];
  if (c.niches?.length) bits.push(`niches: ${c.niches.join(', ')}`);
  if (c.experience) bits.push(`experience: ${c.experience === 'pro' ? 'paid UGC before' : c.experience === 'some' ? 'a little' : 'brand new'}`);
  if (c.campaigns_done) bits.push(`campaigns done: ${c.campaigns_done}`);
  if (c.best_campaign) bits.push(`best campaign: ${c.best_campaign.slice(0, 240)}`);
  bits.push(`views on Noni posts: ${c.total_views}`, `posts live: ${c.posts_live}`, `earned: $${Math.round(c.total_earned_cents / 100)}`);
  if (c.followers !== null) bits.push(`followers (self reported): ${c.followers}`);
  if (c.age !== null) bits.push(`age: ${c.age}`);
  if (c.location) bits.push(`based in: ${c.location}`);
  if (c.weekly_capacity) bits.push(`can make per week: ${c.weekly_capacity}`);
  if (c.on_camera) bits.push(`on camera: ${c.on_camera}`);
  if (Array.isArray(c.portfolio) && c.portfolio.length) bits.push(`portfolio links: ${c.portfolio.length}`);
  if (c.bio) bits.push(`bio: ${c.bio.slice(0, 240)}`);
  return `${n}. ${bits.join('; ')}`;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  if (!caller.companyId) return jsonResponse({ error: 'no active company' }, 400);
  const companyId = caller.companyId;

  const body = ((await req.json().catch(() => null)) ?? {}) as { listing_id?: string };
  if (!body.listing_id) return jsonResponse({ error: 'listing_id is required' }, 400);

  const { data: listing } = await admin
    .from('marketplace_listings')
    .select('id, company_id, title, tagline, about, requirements, niches, platforms, posts_per_week, min_age')
    .eq('id', body.listing_id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!listing) return jsonResponse({ error: 'listing not found' }, 404);

  return streamJsonResponse(async () => {
    const [{ data: company }, { data: brand }, { data: rows, error }] = await Promise.all([
      admin.from('companies').select('name, website, intake').eq('id', companyId).maybeSingle(),
      admin.from('brand_profiles').select('audience, tone, product_type').eq('company_id', companyId).maybeSingle(),
      admin.rpc('marketplace_creator_rows', { p_company_id: companyId, p_listing_id: listing.id }),
    ]);
    if (error) return { error: error.message };

    const creators = ((rows ?? []) as CreatorRow[]).filter((c) => !c.is_member).slice(0, MAX_CREATORS);
    if (creators.length === 0) return { ranked: 0 };

    const campaign = [
      `Company: ${company?.name ?? 'Unknown'}${company?.website ? ` (${company.website})` : ''}`,
      brand?.product_type ? `Product type: ${brand.product_type}` : null,
      brand?.audience ? `Who buys it: ${brand.audience}` : null,
      `Campaign: ${listing.title}`,
      listing.tagline ? `Pitch: ${listing.tagline}` : null,
      listing.about ? `About: ${listing.about}` : null,
      listing.requirements ? `Looking for: ${listing.requirements}` : null,
      listing.niches?.length ? `Niches wanted: ${listing.niches.join(', ')}` : null,
      listing.platforms?.length ? `Platforms: ${listing.platforms.join(', ')}` : null,
      `Posts per week: ${listing.posts_per_week}`,
      `Minimum age: ${listing.min_age}`,
    ]
      .filter(Boolean)
      .join('\n');

    const batches: CreatorRow[][] = [];
    for (let i = 0; i < creators.length; i += BATCH) batches.push(creators.slice(i, i + BATCH));

    const scored: { listing_id: string; creator_id: string; score: number; reason: string | null; computed_at: string }[] = [];
    const now = new Date().toISOString();
    let failed = 0;
    // Three batches at a time keeps a 400 creator run inside the request.
    for (let i = 0; i < batches.length; i += 3) {
      const results = await Promise.allSettled(
        batches.slice(i, i + 3).map((batch) =>
          generate<{ ranks: { n: number; score: number; why: string }[] }>({
            task: 'marketplace.match',
            tier: 'fast',
            system: SYSTEM,
            context: [campaign],
            input: `Creators\n${batch.map((c, k) => creatorLine(k + 1, c)).join('\n')}`,
            schema: SCHEMA,
            maxTokens: 6000,
            companyId,
            timeoutMs: 80_000,
          }).then(({ data }) => ({ batch, ranks: data.ranks })),
        ),
      );
      for (const r of results) {
        if (r.status !== 'fulfilled') {
          failed += 1;
          console.error('marketplace-match batch failed', r.reason instanceof Error ? r.reason.message : r.reason);
          continue;
        }
        const seen = new Set<number>();
        for (const rank of r.value.ranks) {
          const c = r.value.batch[rank.n - 1];
          if (!c || seen.has(rank.n)) continue;
          seen.add(rank.n);
          scored.push({
            listing_id: listing.id,
            creator_id: c.creator_id,
            score: Math.max(0, Math.min(100, Math.round(rank.score))),
            reason: rank.why.replace(/\s*[—–]\s*/g, ', ').trim().slice(0, 200) || null,
            computed_at: now,
          });
        }
      }
    }

    if (scored.length === 0) return { error: 'The ranking did not come back. Try again in a minute.' };
    const { error: saveError } = await admin.from('marketplace_matches').upsert(scored, { onConflict: 'listing_id,creator_id' });
    if (saveError) return { error: saveError.message };
    return { ranked: scored.length, failed_batches: failed };
  });
});
