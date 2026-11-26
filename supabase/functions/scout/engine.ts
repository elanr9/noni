// Scout engine: finds creators for one company outside Noni.
//
//   planning   Claude turns the company brain and the brief into searches.
//   searching  Apify searches TikTok (keywords, hashtags) and Instagram
//              (hashtags). Accounts are grouped, filtered and up to ~400
//              shortlisted.
//   enriching  Apify reads each shortlisted profile and its latest videos.
//              How often they post, how recently and how their audience
//              responds are worked out here.
//   vetting    Avatars and covers are copied to storage (platform links
//              expire). Claude looks at each account's covers, captions and
//              numbers, scores fit, says who they are, then writes a personal
//              first message for the good ones.
//   done
//
// A search is sized to return hundreds of people: creators who already make
// UGC, small creators, and everyday people in the niche.
//
// Every step is short and resumable: tick() does the next bit of work for a
// run and returns. The scout-tick cron and the web page both call tick.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { generate, type LlmImage } from '../_shared/ai/llm.ts';
import { FACT_COLUMNS, renderCore } from '../_shared/ai/brain.ts';
import type { BrainFact } from '../_shared/ai/contracts.ts';
import { stripDashes } from '../_shared/wp8.ts';

// ---------------------------------------------------------------- types

export type Platform = 'tiktok' | 'instagram';

export type ScoutPlan = {
  ideal: string;
  tiktok_queries: string[];
  tiktok_hashtags: string[];
  instagram_hashtags: string[];
  min_followers: number;
  max_followers: number;
  platforms: Platform[];
  seeds: string[];
};

type ApifyJob = {
  kind: 'search' | 'enrich';
  platform: Platform;
  run_id: string;
  dataset_id: string;
  status: string;
  started_at: string;
};

/** An Apify run waiting for room on the account. */
type Queued = { kind: 'search' | 'enrich'; platform: Platform; actor: string; input: Record<string, unknown>; max_items: number };

type Jobs = { search?: ApifyJob[]; enrich?: ApifyJob[]; queue?: Queued[]; shortlist?: Shortlisted[] };

type Counts = { posts?: number; accounts?: number; shortlisted?: number; vetted?: number; matches?: number };

export type ScoutRun = {
  id: string;
  company_id: string;
  brief: string;
  plan: ScoutPlan | Record<string, never>;
  status: 'planning' | 'searching' | 'enriching' | 'vetting' | 'done' | 'failed';
  jobs: Jobs;
  counts: Counts;
  created_at: string;
  updated_at: string;
};

type Video = {
  url: string;
  cover: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  caption: string;
  posted_at: string | null;
};

type Shortlisted = {
  platform: Platform;
  handle: string;
  name: string | null;
  followers: number | null;
  posts_found: number;
  avatar: string | null;
  bio: string | null;
  videos: Video[];
};

// ---------------------------------------------------------------- limits

const SEARCH_PER_TERM_TIKTOK = 60;
const SEARCH_PER_TAG_INSTAGRAM = 80;
const MAX_TIKTOK_QUERIES = 10;
const MAX_TIKTOK_HASHTAGS = 8;
const MAX_INSTAGRAM_HASHTAGS = 10;
const MAX_DATASET_ITEMS = 2000;
// TikTok search results carry follower counts, so its shortlist is already
// in range. Instagram's do not: more profiles are read and filtered after.
const SHORTLIST_TIKTOK = 150;
const SHORTLIST_INSTAGRAM = 250;
const ENRICH_CHUNK_TIKTOK = 50;
const ENRICH_CHUNK_INSTAGRAM = 125;
const VIDEOS_PER_PROFILE = 6;
// Instagram's profile reader returns this many latest posts.
const INSTAGRAM_LATEST = 12;
const IMAGE_BATCH = 24;
const IMAGE_POOL = 16;
const VET_BATCH = 6;
const VET_PARALLEL = 4;
const WRITE_BATCH = 8;
const WRITE_PARALLEL = 3;
const MATCH_SCORE = 55;
// Nothing posted in this long: not worth a message.
const STALE_DAYS = 120;
// An Apify run still not finished after this long is given up on.
const JOB_TIMEOUT_MS = 12 * 60 * 1000;
const LEASE_MS = 140 * 1000;

// ---------------------------------------------------------------- apify

function apifyToken(): string {
  const token = Deno.env.get('APIFY_API_TOKEN');
  if (!token) throw new Error('APIFY_API_TOKEN not set');
  return token;
}

async function apifyStart(actor: string, input: Record<string, unknown>, maxItems: number): Promise<{ run_id: string; dataset_id: string; status: string }> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/runs?token=${apifyToken()}&maxItems=${maxItems}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) throw new Error(`Apify ${actor} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { data } = (await res.json()) as { data: { id: string; defaultDatasetId: string; status: string } };
  return { run_id: data.id, dataset_id: data.defaultDatasetId, status: data.status };
}

async function apifyStatus(runId: string): Promise<string> {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken()}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Apify run ${runId} ${res.status}`);
  const { data } = (await res.json()) as { data: { status: string } };
  return data.status;
}

async function apifyItems(datasetId: string, fields: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken()}&clean=true&format=json&limit=${MAX_DATASET_ITEMS}&fields=${fields}`,
    { signal: AbortSignal.timeout(60_000) },
  );
  if (!res.ok) throw new Error(`Apify dataset ${datasetId} ${res.status}`);
  return (await res.json()) as Record<string, unknown>[];
}

const FINISHED = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

/** Refreshes job statuses; true once every job has finished (or timed out). */
async function settle(jobs: ApifyJob[]): Promise<boolean> {
  await Promise.all(
    jobs.map(async (j) => {
      if (FINISHED.has(j.status)) return;
      try {
        j.status = await apifyStatus(j.run_id);
      } catch (e) {
        console.error('scout apify status', e instanceof Error ? e.message : e);
      }
      if (!FINISHED.has(j.status) && Date.now() - Date.parse(j.started_at) > JOB_TIMEOUT_MS) j.status = 'TIMED-OUT';
    }),
  );
  return jobs.every((j) => FINISHED.has(j.status));
}

/** Starts queued Apify runs until the account has no room for another. */
async function launch(queue: Queued[], running: ApifyJob[]): Promise<{ started: ApifyJob[]; left: Queued[] }> {
  const started: ApifyJob[] = [];
  const left = [...queue];
  while (left.length) {
    const q = left[0];
    try {
      const r = await apifyStart(q.actor, q.input, q.max_items);
      started.push({ kind: q.kind, platform: q.platform, ...r, started_at: new Date().toISOString() });
      left.shift();
    } catch (e) {
      // Out of room while other runs are going: try again when one finishes.
      const busy = [...running, ...started].some((j) => !FINISHED.has(j.status));
      if (!busy) throw e;
      console.error('scout apify queue', e instanceof Error ? e.message : e);
      break;
    }
  }
  return { started, left };
}

// Only what the engine reads; whole items are several kB each.
const TIKTOK_FIELDS = 'authorMeta,webVideoUrl,videoMeta,playCount,diggCount,commentCount,text,createTimeISO';
const INSTAGRAM_POST_FIELDS = 'ownerUsername,ownerFullName,url,displayUrl,videoPlayCount,videoViewCount,likesCount,commentsCount,caption,timestamp';
const INSTAGRAM_PROFILE_FIELDS =
  'username,fullName,followersCount,private,profilePicUrlHD,profilePicUrl,biography,businessEmail,publicEmail,latestPosts';

/** Items of every job that produced any (a timed out run keeps what it got). */
async function itemsOf(jobs: ApifyJob[], platform: Platform, fields: string): Promise<Record<string, unknown>[]> {
  const lists = await Promise.all(
    jobs
      .filter((j) => j.platform === platform)
      .map((j) => apifyItems(j.dataset_id, fields).catch((e) => {
        console.error('scout apify items', e instanceof Error ? e.message : e);
        return [];
      })),
  );
  return lists.flat();
}

// ---------------------------------------------------------------- parsing

/** Drops half an emoji left by slicing; Claude's API rejects lone surrogates. */
export function wellFormed(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function cleanHandle(raw: string): string {
  return raw.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(tiktok|instagram)\.com\/@?/i, '').replace(/[/?#].*$/, '').toLowerCase();
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
function emailIn(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t?.match(EMAIL);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

type Found = Shortlisted & { views: number[]; newest: number };

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * How often and how recently an account posts, and how its audience
 * responds, from its latest posts.
 *
 * posts_per_week counts posts from the last 90 days over the days they
 * span. When every post asked for came back recent, the span is the whole
 * story; otherwise the account's full recent history is in view, so the
 * window is at least two weeks (one post yesterday is not a daily poster).
 *
 * engagement_rate is a percent: likes and comments over views on TikTok,
 * over followers on Instagram (which rarely reports views).
 */
export function signals(
  platform: Platform,
  followers: number | null,
  videos: Video[],
  now = Date.now(),
): { posts_per_week: number | null; last_post_at: string | null; engagement_rate: number | null } {
  const times = videos.map((v) => (v.posted_at ? Date.parse(v.posted_at) : NaN)).filter((t) => Number.isFinite(t) && t <= now + DAY);
  let posts_per_week: number | null = null;
  let last_post_at: string | null = null;
  if (times.length) {
    last_post_at = new Date(Math.max(...times)).toISOString();
    const recent = times.filter((t) => t > now - 90 * DAY);
    if (!recent.length) posts_per_week = 0;
    else {
      const asked = platform === 'tiktok' ? VIDEOS_PER_PROFILE : INSTAGRAM_LATEST;
      const full = times.length >= asked && recent.length === times.length;
      const span = (now - Math.min(...recent)) / DAY;
      posts_per_week = Math.min(21, round1((recent.length * 7) / Math.max(full ? 2 : 14, span)));
    }
  }
  const rates: number[] = [];
  for (const v of videos) {
    const base = platform === 'tiktok' ? v.views : followers;
    if (v.likes === null || v.likes === undefined || !base) continue;
    rates.push(((v.likes + (v.comments ?? 0)) / base) * 100);
  }
  rates.sort((a, b) => a - b);
  const mid = rates.length ? (rates.length % 2 ? rates[(rates.length - 1) / 2] : (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2) : null;
  return { posts_per_week, last_post_at, engagement_rate: mid === null ? null : Math.min(99.9, round1(mid)) };
}

function tiktokPost(item: Record<string, unknown>): { handle: string; author: Record<string, unknown>; video: Video } | null {
  const author = obj(item.authorMeta);
  const handle = str(author.name);
  const url = str(item.webVideoUrl);
  if (!handle || !url) return null;
  const vm = obj(item.videoMeta);
  return {
    handle: cleanHandle(handle),
    author,
    video: {
      url,
      cover: str(vm.coverUrl) ?? str(vm.originalCoverUrl),
      views: num(item.playCount),
      likes: num(item.diggCount),
      comments: num(item.commentCount),
      caption: wellFormed((str(item.text) ?? '').slice(0, 300)),
      posted_at: str(item.createTimeISO),
    },
  };
}

function instagramPost(item: Record<string, unknown>): { handle: string; name: string | null; video: Video } | null {
  const handle = str(item.ownerUsername);
  const url = str(item.url);
  if (!handle || !url) return null;
  return {
    handle: cleanHandle(handle),
    name: str(item.ownerFullName),
    video: {
      url,
      cover: str(item.displayUrl),
      views: num(item.videoPlayCount) ?? num(item.videoViewCount),
      // Instagram reports hidden like counts as -1, which num() drops.
      likes: num(item.likesCount),
      comments: num(item.commentsCount),
      caption: wellFormed((str(item.caption) ?? '').slice(0, 300)),
      posted_at: str(item.timestamp),
    },
  };
}

function add(map: Map<string, Found>, platform: Platform, handle: string, patch: Partial<Shortlisted>, video: Video) {
  const key = `${platform}:${handle}`;
  let f = map.get(key);
  if (!f) {
    f = { platform, handle, name: null, followers: null, posts_found: 0, avatar: null, bio: null, videos: [], views: [], newest: 0 };
    map.set(key, f);
  }
  f.name ??= patch.name ?? null;
  f.followers ??= patch.followers ?? null;
  f.avatar ??= patch.avatar ?? null;
  f.bio ??= patch.bio ?? null;
  if (!f.videos.some((v) => v.url === video.url)) {
    f.posts_found += 1;
    f.videos.push(video);
    if (video.views !== null) f.views.push(video.views);
    const t = video.posted_at ? Date.parse(video.posted_at) : 0;
    if (t > f.newest) f.newest = t;
  }
}

// ---------------------------------------------------------------- company context

async function companyContext(admin: SupabaseClient, companyId: string): Promise<{ name: string; text: string }> {
  const [{ data: company }, { data: facts }, { data: research }, { data: brand }] = await Promise.all([
    admin.from('companies').select('name, website, intake').eq('id', companyId).maybeSingle(),
    admin.from('brain_facts').select(FACT_COLUMNS).eq('company_id', companyId).neq('status', 'rejected').limit(400),
    admin.from('company_research').select('profile').eq('company_id', companyId).maybeSingle(),
    admin.from('brand_profiles').select('audience, tone, product_type').eq('company_id', companyId).maybeSingle(),
  ]);
  const name = (company?.name as string | undefined) ?? 'The company';
  const parts = [
    `Company: ${name}${company?.website ? ` (${company.website})` : ''}`,
    brand?.product_type ? `Product type: ${brand.product_type}` : null,
    brand?.audience ? `Who buys it: ${brand.audience}` : null,
    facts?.length ? renderCore(facts as BrainFact[], name, new Date()) : null,
    research?.profile ? `Industry research:\n${JSON.stringify(research.profile).slice(0, 4000)}` : null,
    company?.intake ? `Intake answers:\n${JSON.stringify(company.intake).slice(0, 1500)}` : null,
  ];
  return { name, text: parts.filter(Boolean).join('\n\n') };
}

// ---------------------------------------------------------------- planning

const PLAN_SYSTEM = `You plan a creator search for a UGC marketplace. A company wants people in its niche to make short videos about its product. It is not looking for the biggest influencer. It wants people who are cheap and easy to work with and right for the niche, and it wants hundreds of them to choose from:

1. People who already make UGC or brand videos in the niche.
2. Small creators who post often in the niche and are comfortable on camera.
3. Everyday people who simply are the niche and post their life (for a college soccer product: college soccer players, whether or not they think of themselves as creators).

From the company and the brief, write searches that together surface all three kinds on TikTok and Instagram. Spread the terms: some for each kind, each term reaching different people. Cover the natural variations of the niche (levels, divisions, men's and women's, roles, seasons) rather than repeating one idea.

- ideal: one plain sentence describing the person to find (who they are and what they post), 25 words at most.
- tiktok_queries: 8 to 10 search phrases a real poster in this niche would have in their captions or that TikTok search would match to their videos. Phrases people actually type, not marketing words. Example for a study app: "study with me", "finals week routine", "ugc creator student".
- tiktok_hashtags: 6 to 8 hashtags without the #, specific to the niche, not giant generic tags like fyp or viral.
- instagram_hashtags: 8 to 10 hashtags without the #, niche specific, used on Reels by ordinary people in the niche.
- min_followers and max_followers: the follower range worth contacting. Default 300 to 100000 unless the brief says otherwise.

If the brief names the kind of person (for example college soccer players), follow the brief over the company context. Never target anyone under 18.`;

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ideal', 'tiktok_queries', 'tiktok_hashtags', 'instagram_hashtags', 'min_followers', 'max_followers'],
  properties: {
    ideal: { type: 'string' },
    tiktok_queries: { type: 'array', items: { type: 'string' } },
    tiktok_hashtags: { type: 'array', items: { type: 'string' } },
    instagram_hashtags: { type: 'array', items: { type: 'string' } },
    min_followers: { type: 'integer' },
    max_followers: { type: 'integer' },
  },
};

const tag = (t: string) => t.replace(/^#/, '').replace(/\s+/g, '').toLowerCase().slice(0, 60);

export async function makePlan(
  admin: SupabaseClient,
  companyId: string,
  brief: string,
  opts: { platforms: Platform[]; seeds: string[]; min_followers?: number | null; max_followers?: number | null },
): Promise<ScoutPlan> {
  const ctx = await companyContext(admin, companyId);
  const { data } = await generate<Omit<ScoutPlan, 'platforms' | 'seeds'>>({
    task: 'scout.plan',
    tier: 'writer',
    effort: 'low',
    system: PLAN_SYSTEM,
    context: [ctx.text],
    input: [
      `Brief: ${brief.trim() || 'Find the best creators for this company.'}`,
      opts.seeds.length ? `Accounts the company likes, find people like them: ${opts.seeds.map((s) => '@' + s).join(', ')}` : null,
      `Platforms: ${opts.platforms.join(', ')}`,
    ].filter(Boolean).join('\n'),
    schema: PLAN_SCHEMA,
    maxTokens: 3000,
    companyId,
    timeoutMs: 90_000,
  });
  const uniq = (xs: string[], n: number) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, n);
  return {
    ideal: stripDashes(data.ideal).slice(0, 240),
    tiktok_queries: opts.platforms.includes('tiktok') ? uniq(data.tiktok_queries.map((q) => q.toLowerCase().slice(0, 60)), MAX_TIKTOK_QUERIES) : [],
    tiktok_hashtags: opts.platforms.includes('tiktok') ? uniq(data.tiktok_hashtags.map(tag), MAX_TIKTOK_HASHTAGS) : [],
    instagram_hashtags: opts.platforms.includes('instagram') ? uniq(data.instagram_hashtags.map(tag), MAX_INSTAGRAM_HASHTAGS) : [],
    min_followers: opts.min_followers ?? Math.max(0, data.min_followers),
    max_followers: opts.max_followers ?? Math.max(data.min_followers + 1, data.max_followers),
    platforms: opts.platforms,
    seeds: opts.seeds,
  };
}

// ---------------------------------------------------------------- search

const TIKTOK_QUIET = {
  shouldDownloadVideos: false,
  shouldDownloadCovers: false,
  shouldDownloadSubtitles: false,
  shouldDownloadSlideshowImages: false,
};

/** The Apify runs of a search: TikTok phrases, TikTok hashtags, Instagram hashtags. */
function searchQueue(plan: ScoutPlan): Queued[] {
  const queue: Queued[] = [];
  if (plan.tiktok_queries.length) {
    queue.push({
      kind: 'search', platform: 'tiktok', actor: 'clockworks~tiktok-scraper',
      input: { searchQueries: plan.tiktok_queries, resultsPerPage: SEARCH_PER_TERM_TIKTOK, ...TIKTOK_QUIET },
      max_items: plan.tiktok_queries.length * SEARCH_PER_TERM_TIKTOK,
    });
  }
  if (plan.tiktok_hashtags.length) {
    queue.push({
      kind: 'search', platform: 'tiktok', actor: 'clockworks~tiktok-scraper',
      input: { hashtags: plan.tiktok_hashtags, resultsPerPage: SEARCH_PER_TERM_TIKTOK, ...TIKTOK_QUIET },
      max_items: plan.tiktok_hashtags.length * SEARCH_PER_TERM_TIKTOK,
    });
  }
  if (plan.instagram_hashtags.length) {
    queue.push({
      kind: 'search', platform: 'instagram', actor: 'apify~instagram-hashtag-scraper',
      input: { hashtags: plan.instagram_hashtags, resultsLimit: SEARCH_PER_TAG_INSTAGRAM },
      max_items: plan.instagram_hashtags.length * SEARCH_PER_TAG_INSTAGRAM,
    });
  }
  if (!queue.length) throw new Error('No searches to run');
  return queue;
}

/** Every row of a query, past the API's 1000 row page. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data } = await page(from, from + 999);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

/** Handles this company has already seen, plus creators already on Noni. */
async function knownHandles(admin: SupabaseClient, companyId: string): Promise<Set<string>> {
  const [seen, onNoni] = await Promise.all([
    allRows<{ platform: string; handle: string }>((from, to) =>
      admin.from('scout_creators').select('platform, handle').eq('company_id', companyId).order('id').range(from, to)),
    allRows<{ instagram: string | null; tiktok: string | null }>((from, to) =>
      admin.from('creator_profiles').select('instagram, tiktok').order('user_id').range(from, to)),
  ]);
  const known = new Set<string>();
  for (const s of seen) known.add(`${s.platform}:${s.handle}`);
  for (const c of onNoni) {
    if (c.tiktok) known.add(`tiktok:${cleanHandle(c.tiktok as string)}`);
    if (c.instagram) known.add(`instagram:${cleanHandle(c.instagram as string)}`);
  }
  return known;
}

async function collect(admin: SupabaseClient, run: ScoutRun): Promise<{ shortlist: Shortlisted[]; posts: number; accounts: number }> {
  const plan = run.plan as ScoutPlan;
  const jobs = run.jobs.search ?? [];
  const [tt, ig] = await Promise.all([
    itemsOf(jobs, 'tiktok', TIKTOK_FIELDS),
    itemsOf(jobs, 'instagram', INSTAGRAM_POST_FIELDS),
  ]);
  const map = new Map<string, Found>();
  for (const item of tt) {
    const p = tiktokPost(item);
    if (!p) continue;
    add(map, 'tiktok', p.handle, {
      name: str(p.author.nickName),
      followers: num(p.author.fans),
      avatar: str(p.author.avatar),
      bio: str(p.author.signature),
    }, p.video);
  }
  for (const item of ig) {
    const p = instagramPost(item);
    if (!p) continue;
    add(map, 'instagram', p.handle, { name: p.name }, p.video);
  }

  const known = await knownHandles(admin, run.company_id);
  const lo = plan.min_followers * 0.6;
  const hi = plan.max_followers * 1.5;
  const fresh = Date.now() - STALE_DAYS * DAY;
  const pool = [...map.values()].filter((f) => {
    if (known.has(`${f.platform}:${f.handle}`)) return false;
    if (f.followers !== null && (f.followers < lo || f.followers > hi)) return false;
    if (f.newest && f.newest < fresh) return false;
    return true;
  });

  // Accounts that came up on several searches and get real views first.
  const rank = (f: Found) => f.posts_found * 2 + Math.log10((median(f.views) ?? 0) + 10);
  const pick = (platform: Platform, n: number) =>
    pool.filter((f) => f.platform === platform).sort((a, b) => rank(b) - rank(a)).slice(0, n);
  let tiktok = pick('tiktok', SHORTLIST_TIKTOK);
  let instagram = pick('instagram', SHORTLIST_INSTAGRAM);
  // One platform came back thin: give the other its room.
  if (tiktok.length < SHORTLIST_TIKTOK) instagram = pick('instagram', SHORTLIST_INSTAGRAM + SHORTLIST_TIKTOK - tiktok.length);
  else if (instagram.length < SHORTLIST_INSTAGRAM) tiktok = pick('tiktok', SHORTLIST_TIKTOK + SHORTLIST_INSTAGRAM - instagram.length);

  // The profile read replaces these videos; three are kept in case it fails.
  const shortlist = [...tiktok, ...instagram].map(({ views: _v, newest: _n, ...s }) => ({
    ...s,
    videos: s.videos.slice(0, 3),
  }));
  return { shortlist, posts: tt.length + ig.length, accounts: map.size };
}

// ---------------------------------------------------------------- enrich

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Profile reads in chunks, so each Apify run finishes in minutes. */
function enrichQueue(shortlist: Shortlisted[]): Queued[] {
  const tt = shortlist.filter((s) => s.platform === 'tiktok').map((s) => s.handle);
  const ig = shortlist.filter((s) => s.platform === 'instagram').map((s) => s.handle);
  return [
    ...chunks(tt, ENRICH_CHUNK_TIKTOK).map((profiles): Queued => ({
      kind: 'enrich', platform: 'tiktok', actor: 'clockworks~tiktok-scraper',
      input: {
        profiles,
        resultsPerPage: VIDEOS_PER_PROFILE,
        profileScrapeSections: ['videos'],
        profileSorting: 'latest',
        excludePinnedPosts: true,
        ...TIKTOK_QUIET,
      },
      max_items: profiles.length * VIDEOS_PER_PROFILE,
    })),
    ...chunks(ig, ENRICH_CHUNK_INSTAGRAM).map((usernames): Queued => ({
      kind: 'enrich', platform: 'instagram', actor: 'apify~instagram-profile-scraper',
      input: { usernames },
      max_items: usernames.length,
    })),
  ];
}

type Enriched = Shortlisted & {
  email: string | null;
  median_views: number | null;
  posts_per_week: number | null;
  last_post_at: string | null;
  engagement_rate: number | null;
};

/** Shortlisted accounts with their profile read merged in; the ones outside the plan's range, private or gone quiet are dropped. */
async function mergeEnrich(run: ScoutRun): Promise<Enriched[]> {
  const plan = run.plan as ScoutPlan;
  const jobs = run.jobs.enrich ?? [];
  const shortlist = run.jobs.shortlist ?? [];
  const [tt, ig] = await Promise.all([
    itemsOf(jobs, 'tiktok', TIKTOK_FIELDS),
    itemsOf(jobs, 'instagram', INSTAGRAM_PROFILE_FIELDS),
  ]);
  const lo = plan.min_followers * 0.6;
  const hi = plan.max_followers * 1.5;
  const stale = Date.now() - STALE_DAYS * DAY;

  const ttBy = new Map<string, { author: Record<string, unknown>; videos: Video[] }>();
  for (const item of tt) {
    const p = tiktokPost(item);
    if (!p) continue;
    const e = ttBy.get(p.handle) ?? { author: p.author, videos: [] };
    if (!e.videos.some((v) => v.url === p.video.url)) e.videos.push(p.video);
    ttBy.set(p.handle, e);
  }
  const igBy = new Map<string, Record<string, unknown>>();
  for (const item of ig) {
    const h = str(item.username);
    if (h) igBy.set(cleanHandle(h), item);
  }

  const out: Enriched[] = [];
  for (const s of shortlist) {
    let videos = s.videos;
    let { name, followers, avatar, bio } = s;
    let email: string | null = null;
    if (s.platform === 'tiktok') {
      const e = ttBy.get(s.handle);
      if (e) {
        if (e.videos.length) videos = e.videos;
        name = str(e.author.nickName) ?? name;
        followers = num(e.author.fans) ?? followers;
        avatar = str(e.author.avatar) ?? avatar;
        bio = str(e.author.signature) ?? bio;
        email = emailIn(bio, str(obj(e.author.bioLink).link));
      }
    } else {
      const p = igBy.get(s.handle);
      if (p?.private === true) continue;
      if (p) {
        name = str(p.fullName) ?? name;
        followers = num(p.followersCount) ?? followers;
        avatar = str(p.profilePicUrlHD) ?? str(p.profilePicUrl) ?? avatar;
        bio = str(p.biography) ?? bio;
        email = str(p.businessEmail) ?? str(p.publicEmail) ?? emailIn(bio);
        const latest = Array.isArray(p.latestPosts) ? (p.latestPosts as Record<string, unknown>[]) : [];
        const mapped = latest.map(instagramPost).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((x) => x.video);
        if (mapped.length) videos = mapped;
      }
    }
    if (followers !== null && (followers < lo || followers > hi)) continue;
    videos = [...videos].sort((a, b) => (b.posted_at ? Date.parse(b.posted_at) : 0) - (a.posted_at ? Date.parse(a.posted_at) : 0));
    // Measured on every post read, before the list is cut for display.
    const sig = signals(s.platform, followers, videos);
    if (sig.last_post_at && Date.parse(sig.last_post_at) < stale) continue;
    videos = videos.slice(0, VIDEOS_PER_PROFILE);
    const views = videos.map((v) => v.views).filter((v): v is number => v !== null);
    out.push({ ...s, name, followers, avatar, bio, videos, email, median_views: median(views), ...sig });
  }
  return out;
}

/** Copies one image into the scout bucket; null when it cannot be fetched. */
async function keepImage(admin: SupabaseClient, url: string | null, path: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 2_000_000) return null;
    const { error } = await admin.storage.from('scout').upload(path, bytes, { contentType: type, upsert: true });
    if (error) return null;
    return admin.storage.from('scout').getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Saves what the profile reads found. Pictures still point at the platforms; keepImages copies them. */
async function saveFound(admin: SupabaseClient, run: ScoutRun, list: Enriched[]): Promise<number> {
  const rows = list.map((c) => ({
    company_id: run.company_id,
    run_id: run.id,
    source: 'search',
    platform: c.platform,
    handle: c.handle,
    name: c.name ? wellFormed(c.name.slice(0, 120)) : null,
    avatar_url: c.avatar,
    bio: c.bio ? wellFormed(c.bio.slice(0, 500)) : null,
    followers: c.followers,
    median_views: c.median_views,
    posts_found: c.posts_found,
    posts_per_week: c.posts_per_week,
    last_post_at: c.last_post_at,
    engagement_rate: c.engagement_rate,
    email: c.email,
    videos: c.videos,
    status: 'found',
  }));
  for (const part of chunks(rows, 100)) {
    const { error } = await admin.from('scout_creators').upsert(part, { onConflict: 'company_id,platform,handle', ignoreDuplicates: true });
    if (error) throw new Error(`save creators: ${error.message}`);
  }
  const { count } = await admin.from('scout_creators').select('id', { count: 'exact', head: true }).eq('run_id', run.id);
  return count ?? 0;
}

type Unkept = { id: string; platform: Platform; handle: string; avatar_url: string | null; videos: Video[] };

/** Copies a batch's avatars and covers into storage and hands the rows to vetting. */
async function keepImages(admin: SupabaseClient, run: ScoutRun, rows: Unkept[]): Promise<void> {
  const kept = new Map<string, string | null>();
  const jobs: { url: string | null; path: string }[] = [];
  const base = (r: Unkept) => `${run.company_id}/${r.platform}/${r.handle.replace(/[^a-z0-9._-]/g, '_')}`;
  for (const r of rows) {
    jobs.push({ url: r.avatar_url, path: `${base(r)}/avatar` });
    r.videos.slice(0, VIDEOS_PER_PROFILE).forEach((v, i) => jobs.push({ url: v.cover, path: `${base(r)}/v${i}` }));
  }
  await pool(jobs, IMAGE_POOL, async (j) => {
    kept.set(j.path, await keepImage(admin, j.url, j.path));
  });
  await Promise.all(rows.map((r) =>
    admin.from('scout_creators').update({
      avatar_url: kept.get(`${base(r)}/avatar`) ?? null,
      videos: r.videos.map((v, i) => ({ ...v, cover: kept.get(`${base(r)}/v${i}`) ?? null })),
      status: 'vetting',
      updated_at: new Date().toISOString(),
    }).eq('id', r.id).eq('status', 'found')
  ));
}

// ---------------------------------------------------------------- vetting

const VET_SYSTEM = `You vet people for a brand on a UGC marketplace. The brand pays everyday people to post short videos about its product. It is not looking for big influencers. It wants people who are right for its niche, comfortable on camera, and cheap and easy to work with: people already making UGC, small creators, and ordinary people who simply are the niche. You see each account's numbers, bio, recent captions and up to two video covers.

For every person decide:
- score 0 to 100: how well this person fits who the brand is looking for. Judge the content and the person, not the size of the account; the brand sees followers, posting and engagement itself and small accounts are welcome. 85 and up: exactly the niche and films themselves, talks to camera or already makes brand style videos. 70 to 84: in the niche and on camera often. 55 to 69: clearly the person the brief describes and posts themselves, even if casual, unpolished or not thinking of themselves as a creator. Under 55: wrong niche, not on camera at all, or not a real individual.
- is_person: false for brands, businesses, teams, clubs, schools, coaches selling a service, meme or repost pages, fan pages, news pages, and faceless compilation accounts.
- likely_minor: true if they look or say they are under 18 (high school freshman to junior, "15", "16 yo", "class of" a year that makes them under 18). When unsure and they look young, true.
- kind: "ugc" if they already make UGC or brand videos (says UGC or creator for brands in the bio, posts sponsored or product videos). "creator" if they post made for an audience content regularly (series, tips, vlogs, talking to camera). "niche" if they are simply a person in the niche posting their own life.
- on_camera: true if they appear in their own videos (face on the covers, filming themselves, talking).
- gender: "female" or "male" when the profile makes it plain (pronouns, a men's or women's team, how they describe themselves, how they present on their covers). Otherwise "unknown". This is only so the brand can filter; it never changes the score.
- age: "under 18", "18-24", "25-34" or "35+" when the profile makes it plain (class year, college year, stated age, life stage). A current college student or college athlete is "18-24". Otherwise "unknown".
- why: one short sentence to the brand, 12 words at most, naming the concrete thing about their content ("Films his 5am gym routine and talks to camera daily"). Do not repeat follower or view counts, the brand sees those. No names, no semicolons, no hype.
- tags: one to three short niche tags, lowercase ("gym", "college soccer", "morning routine").

Never score on looks, race, gender or age. Return every person exactly once, by number.`;

const VET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['creators'],
  properties: {
    creators: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'score', 'is_person', 'likely_minor', 'kind', 'on_camera', 'gender', 'age', 'why', 'tags'],
        properties: {
          n: { type: 'integer' },
          score: { type: 'integer' },
          is_person: { type: 'boolean' },
          likely_minor: { type: 'boolean' },
          kind: { type: 'string', enum: ['ugc', 'creator', 'niche'] },
          on_camera: { type: 'boolean' },
          gender: { type: 'string', enum: ['female', 'male', 'unknown'] },
          age: { type: 'string', enum: ['under 18', '18-24', '25-34', '35+', 'unknown'] },
          why: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

type Vetted = {
  n: number;
  score: number;
  is_person: boolean;
  likely_minor: boolean;
  kind: string;
  on_camera: boolean;
  gender: string;
  age: string;
  why: string;
  tags: string[];
};

const WRITE_SYSTEM = `You write the first message a brand sends a creator, as a DM on TikTok or Instagram, sent by hand from the brand's own account. It must read like one real person writing to another, never like a template or a mass blast.

Rules for the DM:
- 2 to 4 short sentences, 280 characters at most.
- Open with something specific about one of their actual videos (the topic or moment from its caption), not generic praise.
- Say who you are in a few words (first person, from the brand) and that you want to pay them to make videos about the product.
- End with the link placeholder {link} on its own, exactly as written, so they can see the details and join.
- Lowercase casual tone is fine. No emoji, no dashes, no hashtags, no "collab opportunity", no "we'd love to", no hype.

Also write an email version for creators with a public email: a subject of 6 words at most and a body of 3 to 5 short sentences, same rules, ending with {link}.`;

const WRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['messages'],
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'dm', 'email_subject', 'email_body'],
        properties: {
          n: { type: 'integer' },
          dm: { type: 'string' },
          email_subject: { type: 'string' },
          email_body: { type: 'string' },
        },
      },
    },
  },
};

type Row = {
  id: string;
  platform: Platform;
  handle: string;
  name: string | null;
  bio: string | null;
  followers: number | null;
  median_views: number | null;
  posts_per_week: number | null;
  posts_found: number;
  videos: Video[];
  why: string | null;
  tags: string[];
};

function creatorText(n: number, r: Row): string {
  const caps = r.videos.slice(0, 4).map((v) => `"${v.caption.replace(/\s+/g, ' ').slice(0, 140)}"${v.views !== null ? ` (${v.views} views)` : ''}`);
  const text = [
    `${n}. ${r.platform} @${r.handle}${r.name ? ` (${r.name})` : ''}`,
    `followers: ${r.followers ?? 'unknown'}; median views of recent videos: ${r.median_views ?? 'unknown'}; posts a week: ${r.posts_per_week ?? 'unknown'}; came up on ${r.posts_found} searched posts`,
    r.bio ? `bio: ${r.bio.replace(/\s+/g, ' ').slice(0, 200)}` : null,
    caps.length ? `recent captions: ${caps.join(' | ')}` : null,
  ].filter(Boolean).join('\n');
  return wellFormed(text);
}

const clip = (s: string, n: number) => wellFormed(stripDashes(s).replace(/\s+/g, ' ').trim().slice(0, n));

async function vetBatch(admin: SupabaseClient, run: ScoutRun, ctx: string, rows: Row[]): Promise<void> {
  const images: LlmImage[] = [];
  const lines = rows.map((r, i) => {
    const covers = r.videos.map((v) => v.cover).filter((c): c is string => Boolean(c)).slice(0, 2);
    const first = images.length + 1;
    for (const c of covers) images.push({ url: c });
    const imgNote = covers.length ? `\nvideo covers: images ${first}${covers.length > 1 ? ` and ${first + 1}` : ''}` : '\nno covers';
    return creatorText(i + 1, r) + imgNote;
  });
  const plan = run.plan as ScoutPlan;
  const { data } = await generate<{ creators: Vetted[] }>({
    task: 'scout.vet',
    tier: 'fast',
    system: VET_SYSTEM,
    context: [ctx, `Ideal creator: ${plan.ideal}\nBrief: ${run.brief || 'none'}`],
    input: `Creators\n\n${lines.join('\n\n')}`,
    images,
    schema: VET_SCHEMA,
    maxTokens: 5000,
    companyId: run.company_id,
    timeoutMs: 100_000,
  });
  const seen = new Set<number>();
  await Promise.all(data.creators.map(async (c) => {
    const r = rows[c.n - 1];
    if (!r || seen.has(c.n)) return;
    seen.add(c.n);
    const score = Math.max(0, Math.min(100, Math.round(c.score)));
    const minor = c.likely_minor || c.age === 'under 18';
    const match = score >= MATCH_SCORE && c.is_person && !minor;
    await admin.from('scout_creators').update({
      score,
      why: clip(c.why, 160),
      tags: c.tags.map((t) => t.toLowerCase().trim().slice(0, 30)).filter(Boolean).slice(0, 3),
      likely_minor: minor,
      kind: c.kind === 'ugc' || c.kind === 'creator' || c.kind === 'niche' ? c.kind : null,
      on_camera: c.on_camera,
      gender: c.gender === 'female' || c.gender === 'male' ? c.gender : null,
      age: c.age === '18-24' || c.age === '25-34' || c.age === '35+' ? c.age : null,
      status: match ? 'match' : 'skipped',
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
  }));
  // Anything Claude left out is skipped, never left in vetting forever.
  const missed = rows.filter((_, i) => !seen.has(i + 1)).map((r) => r.id);
  if (missed.length) await admin.from('scout_creators').update({ status: 'skipped' }).in('id', missed);
}

async function writeBatch(admin: SupabaseClient, run: ScoutRun, ctx: string, rows: Row[]): Promise<void> {
  const { data } = await generate<{ messages: { n: number; dm: string; email_subject: string; email_body: string }[] }>({
    task: 'scout.write',
    tier: 'writer',
    effort: 'low',
    system: WRITE_SYSTEM,
    context: [ctx],
    input: `Creators\n\n${rows.map((r, i) => creatorText(i + 1, r) + (r.why ? `\nwhy they fit: ${r.why}` : '')).join('\n\n')}`,
    schema: WRITE_SCHEMA,
    maxTokens: 6000,
    companyId: run.company_id,
    timeoutMs: 110_000,
  });
  await Promise.all(data.messages.map(async (m) => {
    const r = rows[m.n - 1];
    if (!r) return;
    const withLink = (s: string) => (s.includes('{link}') ? s : `${s.trim()}\n{link}`);
    await admin.from('scout_creators').update({
      dm: withLink(stripDashes(m.dm).trim().slice(0, 400)),
      email_subject: clip(m.email_subject, 80),
      email_body: withLink(stripDashes(m.email_body).trim().slice(0, 1200)),
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
  }));
}

const ROW_COLUMNS = 'id, platform, handle, name, bio, followers, median_views, posts_per_week, posts_found, videos, why, tags';

/** One slice of vetting; true when the run has nothing left to copy, vet or write. */
async function vetStep(admin: SupabaseClient, run: ScoutRun, ctx: string): Promise<boolean> {
  const [{ data: toKeep }, { data: toVet }] = await Promise.all([
    admin.from('scout_creators').select('id, platform, handle, avatar_url, videos')
      .eq('run_id', run.id).eq('status', 'found').limit(IMAGE_BATCH),
    admin.from('scout_creators').select(ROW_COLUMNS)
      .eq('run_id', run.id).eq('status', 'vetting').limit(VET_BATCH * VET_PARALLEL),
  ]);
  if (toKeep?.length || toVet?.length) {
    // Pictures for the next accounts are copied while Claude vets these.
    const keeping = toKeep?.length
      ? keepImages(admin, run, toKeep as Unkept[]).catch(async (e) => {
        console.error('scout keep images', e instanceof Error ? e.message : e);
        // Never stuck here: vetted without pictures instead.
        await admin.from('scout_creators').update({ avatar_url: null, status: 'vetting' })
          .in('id', toKeep.map((x) => x.id as string)).eq('status', 'found');
      })
      : null;
    const batches = chunks((toVet ?? []) as Row[], VET_BATCH);
    const results = await Promise.allSettled(batches.map((b) => vetBatch(admin, run, ctx, b)));
    // Do not loop on a batch that failed: those creators are skipped.
    await Promise.all(results.map((r, i) => {
      if (r.status !== 'rejected') return null;
      console.error('scout vet batch', r.reason instanceof Error ? r.reason.message : r.reason);
      return admin.from('scout_creators').update({ status: 'skipped' }).in('id', batches[i].map((x) => x.id));
    }));
    await keeping;
    return false;
  }
  const { data: toWrite } = await admin.from('scout_creators').select(ROW_COLUMNS)
    .eq('run_id', run.id).eq('status', 'match').is('dm', null).order('score', { ascending: false }).limit(WRITE_BATCH * WRITE_PARALLEL);
  if (toWrite?.length) {
    const batches = chunks(toWrite as Row[], WRITE_BATCH);
    const results = await Promise.allSettled(batches.map((b) => writeBatch(admin, run, ctx, b)));
    let wrote = false;
    for (const r of results) {
      if (r.status === 'fulfilled') wrote = true;
      else console.error('scout write batch', r.reason instanceof Error ? r.reason.message : r.reason);
    }
    // Nothing written at all: fall back to a plain message rather than spin.
    if (!wrote) {
      for (const b of batches) {
        await admin.from('scout_creators').update({ dm: 'hey, loved your recent videos. we want to pay you to make a few about our app, details here: {link}' }).in('id', b.map((x) => x.id));
      }
    }
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- tick

async function countsOf(admin: SupabaseClient, runId: string): Promise<{ vetted: number; matches: number }> {
  const [{ count: vetted }, { count: matches }] = await Promise.all([
    admin.from('scout_creators').select('id', { count: 'exact', head: true }).eq('run_id', runId).not('status', 'in', '(found,vetting)'),
    admin.from('scout_creators').select('id', { count: 'exact', head: true }).eq('run_id', runId).in('status', ['match', 'contacted', 'replied', 'applied', 'joined']),
  ]);
  return { vetted: vetted ?? 0, matches: matches ?? 0 };
}

async function save(admin: SupabaseClient, run: ScoutRun, patch: Partial<ScoutRun> & { error?: string | null; finished_at?: string; lease_until?: string | null }) {
  await admin.from('scout_runs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', run.id);
}

/** Takes the run's lease; false when another worker holds it. */
async function lease(admin: SupabaseClient, runId: string): Promise<ScoutRun | null> {
  const now = new Date();
  const { data } = await admin
    .from('scout_runs')
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq('id', runId)
    .in('status', ['planning', 'searching', 'enriching', 'vetting'])
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select('*')
    .maybeSingle();
  return (data as ScoutRun | null) ?? null;
}

/** Advances one run by one step. Safe to call any time, from anywhere. */
export async function tick(admin: SupabaseClient, runId: string): Promise<void> {
  const run = await lease(admin, runId);
  if (!run) return;
  try {
    if (run.status === 'planning') {
      // Planning happens when the run is created; a run left here lost its
      // worker. Plan again from the brief.
      if (!('ideal' in run.plan)) {
        const plan = await makePlan(admin, run.company_id, run.brief, { platforms: ['tiktok', 'instagram'], seeds: [] });
        run.plan = plan;
      }
      const { started, left } = await launch(searchQueue(run.plan as ScoutPlan), []);
      await save(admin, run, { plan: run.plan, status: 'searching', jobs: { search: started, queue: left }, lease_until: null });
      return;
    }

    if (run.status === 'searching') {
      const search = run.jobs.search ?? [];
      await settle(search);
      const { started, left } = await launch(run.jobs.queue ?? [], search);
      search.push(...started);
      if (left.length || !search.every((j) => FINISHED.has(j.status))) {
        await save(admin, run, { jobs: { ...run.jobs, search, queue: left }, lease_until: null });
        return;
      }
      const { shortlist, posts, accounts } = await collect(admin, { ...run, jobs: { ...run.jobs, search } });
      if (!shortlist.length) {
        await save(admin, run, {
          status: 'done', jobs: { search }, counts: { posts, accounts, shortlisted: 0, vetted: 0, matches: 0 },
          finished_at: new Date().toISOString(), lease_until: null,
        });
        return;
      }
      const first = await launch(enrichQueue(shortlist), []);
      await save(admin, run, {
        status: 'enriching', jobs: { search, enrich: first.started, queue: first.left, shortlist },
        counts: { posts, accounts, shortlisted: shortlist.length }, lease_until: null,
      });
      return;
    }

    if (run.status === 'enriching') {
      const enrich = run.jobs.enrich ?? [];
      await settle(enrich);
      const { started, left } = await launch(run.jobs.queue ?? [], enrich);
      enrich.push(...started);
      if (left.length || !enrich.every((j) => FINISHED.has(j.status))) {
        await save(admin, run, { jobs: { ...run.jobs, enrich, queue: left }, lease_until: null });
        return;
      }
      const list = await mergeEnrich({ ...run, jobs: { ...run.jobs, enrich } });
      const saved = await saveFound(admin, run, list);
      await save(admin, run, {
        status: 'vetting', jobs: { search: run.jobs.search, enrich },
        counts: { ...run.counts, shortlisted: saved }, lease_until: null,
      });
      return;
    }

    if (run.status === 'vetting') {
      // Keep going while there is time left in the lease.
      const t0 = Date.now();
      const ctx = (await companyContext(admin, run.company_id)).text;
      let finished = await vetStep(admin, run, ctx);
      while (!finished && Date.now() - t0 < 40_000) {
        await admin.from('scout_runs').update({ lease_until: new Date(Date.now() + LEASE_MS).toISOString() }).eq('id', run.id);
        finished = await vetStep(admin, run, ctx);
      }
      const c = await countsOf(admin, run.id);
      await save(admin, run, {
        counts: { ...run.counts, ...c },
        ...(finished ? { status: 'done' as const, finished_at: new Date().toISOString() } : {}),
        lease_until: null,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('scout tick', run.id, message);
    await save(admin, run, { status: 'failed', error: message.slice(0, 500), lease_until: null });
  }
}
