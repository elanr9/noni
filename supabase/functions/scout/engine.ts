// Scout engine: finds creators for one company outside Noni.
//
//   planning   Claude turns the company brain and the brief into searches.
//   searching  Apify searches TikTok (keywords, hashtags) and Instagram
//              (hashtags). Accounts are grouped, filtered and the strongest
//              ~80 shortlisted.
//   enriching  Apify reads each shortlisted profile and its latest videos.
//              Avatars and covers are copied to storage (platform links expire).
//   vetting    Claude looks at each account's covers, captions and numbers,
//              scores fit, then writes a personal first message for the
//              good ones.
//   done
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

type Jobs = { search?: ApifyJob[]; enrich?: ApifyJob[]; shortlist?: Shortlisted[] };

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

type Video = { url: string; cover: string | null; views: number | null; caption: string; posted_at: string | null };

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

const SEARCH_PER_TERM_TIKTOK = 40;
const SEARCH_PER_TAG_INSTAGRAM = 40;
const MAX_SEARCH_ITEMS = 600;
const SHORTLIST_TIKTOK = 50;
const SHORTLIST_INSTAGRAM = 30;
const VIDEOS_PER_PROFILE = 6;
const VET_BATCH = 6;
const WRITE_BATCH = 8;
const MATCH_SCORE = 60;
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

async function apifyItems(datasetId: string, limit: number): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken()}&clean=true&format=json&limit=${limit}`,
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

/** Items of every job that produced any (a timed out run keeps what it got). */
async function itemsOf(jobs: ApifyJob[], platform: Platform): Promise<Record<string, unknown>[]> {
  const lists = await Promise.all(
    jobs
      .filter((j) => j.platform === platform)
      .map((j) => apifyItems(j.dataset_id, MAX_SEARCH_ITEMS).catch((e) => {
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

const PLAN_SYSTEM = `You plan a creator search for a UGC marketplace. A company wants everyday people who already post short videos in its niche to make videos about its product. They do not need to be influencers; small accounts that post often and talk to camera are often the best fit.

From the company and the brief, write the searches that will surface those people on TikTok and Instagram.

- ideal: one plain sentence describing the person to find (who they are and what they post), 25 words at most.
- tiktok_queries: 3 to 6 search phrases a real poster in this niche would have in their captions or that TikTok search would match to their videos. Phrases people actually type, not marketing words. Example for a study app: "study with me", "finals week routine".
- tiktok_hashtags: 3 to 6 hashtags without the #, specific to the niche, not giant generic tags like fyp or viral.
- instagram_hashtags: 3 to 6 hashtags without the #, niche specific, used on Reels.
- min_followers and max_followers: the follower range worth contacting. Default 500 to 250000 unless the brief says otherwise.

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
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, 6);
  return {
    ideal: stripDashes(data.ideal).slice(0, 240),
    tiktok_queries: opts.platforms.includes('tiktok') ? uniq(data.tiktok_queries.map((q) => q.toLowerCase().slice(0, 60))) : [],
    tiktok_hashtags: opts.platforms.includes('tiktok') ? uniq(data.tiktok_hashtags.map(tag)) : [],
    instagram_hashtags: opts.platforms.includes('instagram') ? uniq(data.instagram_hashtags.map(tag)) : [],
    min_followers: opts.min_followers ?? Math.max(0, data.min_followers),
    max_followers: opts.max_followers ?? Math.max(data.min_followers + 1, data.max_followers),
    platforms: opts.platforms,
    seeds: opts.seeds,
  };
}

// ---------------------------------------------------------------- search

async function startSearch(plan: ScoutPlan): Promise<ApifyJob[]> {
  const now = new Date().toISOString();
  const jobs: ApifyJob[] = [];
  const terms = plan.tiktok_queries.length + plan.tiktok_hashtags.length;
  if (terms > 0) {
    const r = await apifyStart(
      'clockworks~tiktok-scraper',
      {
        searchQueries: plan.tiktok_queries,
        hashtags: plan.tiktok_hashtags,
        resultsPerPage: SEARCH_PER_TERM_TIKTOK,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      },
      Math.min(MAX_SEARCH_ITEMS, terms * SEARCH_PER_TERM_TIKTOK),
    );
    jobs.push({ kind: 'search', platform: 'tiktok', ...r, started_at: now });
  }
  if (plan.instagram_hashtags.length > 0) {
    const r = await apifyStart(
      'apify~instagram-hashtag-scraper',
      { hashtags: plan.instagram_hashtags, resultsLimit: SEARCH_PER_TAG_INSTAGRAM },
      Math.min(MAX_SEARCH_ITEMS, plan.instagram_hashtags.length * SEARCH_PER_TAG_INSTAGRAM),
    );
    jobs.push({ kind: 'search', platform: 'instagram', ...r, started_at: now });
  }
  if (!jobs.length) throw new Error('No searches to run');
  return jobs;
}

/** Handles this company has already seen, plus creators already on Noni. */
async function knownHandles(admin: SupabaseClient, companyId: string): Promise<Set<string>> {
  const [{ data: seen }, { data: onNoni }] = await Promise.all([
    admin.from('scout_creators').select('platform, handle').eq('company_id', companyId).limit(20000),
    admin.from('creator_profiles').select('instagram, tiktok').limit(20000),
  ]);
  const known = new Set<string>();
  for (const s of seen ?? []) known.add(`${s.platform}:${s.handle}`);
  for (const c of onNoni ?? []) {
    if (c.tiktok) known.add(`tiktok:${cleanHandle(c.tiktok as string)}`);
    if (c.instagram) known.add(`instagram:${cleanHandle(c.instagram as string)}`);
  }
  return known;
}

const DAY = 86_400_000;

async function collect(admin: SupabaseClient, run: ScoutRun): Promise<{ shortlist: Shortlisted[]; posts: number; accounts: number }> {
  const plan = run.plan as ScoutPlan;
  const jobs = run.jobs.search ?? [];
  const [tt, ig] = await Promise.all([itemsOf(jobs, 'tiktok'), itemsOf(jobs, 'instagram')]);
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
  const fresh = Date.now() - 120 * DAY;
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

  const shortlist = [...tiktok, ...instagram].map(({ views: _v, newest: _n, ...s }) => ({
    ...s,
    videos: s.videos.slice(0, VIDEOS_PER_PROFILE),
  }));
  return { shortlist, posts: tt.length + ig.length, accounts: map.size };
}

// ---------------------------------------------------------------- enrich

async function startEnrich(shortlist: Shortlisted[]): Promise<ApifyJob[]> {
  const now = new Date().toISOString();
  const jobs: ApifyJob[] = [];
  const tt = shortlist.filter((s) => s.platform === 'tiktok').map((s) => s.handle);
  const ig = shortlist.filter((s) => s.platform === 'instagram').map((s) => s.handle);
  if (tt.length) {
    const r = await apifyStart(
      'clockworks~tiktok-scraper',
      {
        profiles: tt,
        resultsPerPage: VIDEOS_PER_PROFILE,
        profileScrapeSections: ['videos'],
        profileSorting: 'latest',
        excludePinnedPosts: true,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      },
      tt.length * VIDEOS_PER_PROFILE,
    );
    jobs.push({ kind: 'enrich', platform: 'tiktok', ...r, started_at: now });
  }
  if (ig.length) {
    const r = await apifyStart('apify~instagram-profile-scraper', { usernames: ig }, ig.length);
    jobs.push({ kind: 'enrich', platform: 'instagram', ...r, started_at: now });
  }
  return jobs;
}

type Enriched = Shortlisted & { email: string | null; median_views: number | null };

async function mergeEnrich(run: ScoutRun): Promise<Enriched[]> {
  const jobs = run.jobs.enrich ?? [];
  const shortlist = run.jobs.shortlist ?? [];
  const [tt, ig] = await Promise.all([itemsOf(jobs, 'tiktok'), itemsOf(jobs, 'instagram')]);

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

  return shortlist.map((s): Enriched => {
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
    videos = [...videos]
      .sort((a, b) => (b.posted_at ? Date.parse(b.posted_at) : 0) - (a.posted_at ? Date.parse(a.posted_at) : 0))
      .slice(0, VIDEOS_PER_PROFILE);
    const views = videos.map((v) => v.views).filter((v): v is number => v !== null);
    return { ...s, name, followers, avatar, bio, videos, email, median_views: median(views) };
  });
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

async function saveEnriched(admin: SupabaseClient, run: ScoutRun, list: Enriched[]): Promise<number> {
  const rows: Record<string, unknown>[] = [];
  await pool(list, 8, async (c) => {
    const base = `${run.company_id}/${c.platform}/${c.handle.replace(/[^a-z0-9._-]/g, '_')}`;
    const avatar = await keepImage(admin, c.avatar, `${base}/avatar`);
    const videos = await Promise.all(
      c.videos.map(async (v, i) => ({ ...v, cover: i < VIDEOS_PER_PROFILE ? await keepImage(admin, v.cover, `${base}/v${i}`) : null })),
    );
    rows.push({
      company_id: run.company_id,
      run_id: run.id,
      source: 'search',
      platform: c.platform,
      handle: c.handle,
      name: c.name ? wellFormed(c.name.slice(0, 120)) : null,
      avatar_url: avatar,
      bio: c.bio ? wellFormed(c.bio.slice(0, 500)) : null,
      followers: c.followers,
      median_views: c.median_views,
      posts_found: c.posts_found,
      email: c.email,
      videos,
      status: 'vetting',
    });
  });
  if (!rows.length) return 0;
  const { error } = await admin.from('scout_creators').upsert(rows, { onConflict: 'company_id,platform,handle', ignoreDuplicates: true });
  if (error) throw new Error(`save creators: ${error.message}`);
  return rows.length;
}

// ---------------------------------------------------------------- vetting

const VET_SYSTEM = `You vet creators for a brand on a UGC marketplace. The brand pays everyday people to post short videos about its product. You see each account's numbers, bio, recent captions and up to three video covers.

For every creator decide:
- score 0 to 100: how well this person fits the brand's ideal creator. Weigh, in order: their content is clearly in the niche the brand wants; they are a real individual who shows up on camera (covers with a face, talking, filming themselves); they post regularly and recently; their views are healthy for their size. 85 and up: message them today. 60 to 84: good fit. Under 60: skip.
- is_person: false for brands, businesses, meme or repost pages, fan pages, news pages, and faceless compilation accounts.
- likely_minor: true if they look or say they are under 18 (high school freshman to junior, "15", "16 yo", "class of" a year that makes them under 18). When unsure and they look young, true.
- why: one short sentence to the brand, 12 words at most, naming the concrete thing about their content ("Films his 5am gym routine and talks to camera daily"). Do not repeat follower or view counts, the brand sees those. No names, no semicolons, no hype.
- tags: one to three short niche tags, lowercase ("gym", "college soccer", "morning routine").

Never score on looks, race, gender or anything not about the content and fit. Return every creator exactly once, by number.`;

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
        required: ['n', 'score', 'is_person', 'likely_minor', 'why', 'tags'],
        properties: {
          n: { type: 'integer' },
          score: { type: 'integer' },
          is_person: { type: 'boolean' },
          likely_minor: { type: 'boolean' },
          why: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
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
  posts_found: number;
  videos: Video[];
  why: string | null;
  tags: string[];
};

function creatorText(n: number, r: Row): string {
  const caps = r.videos.slice(0, 4).map((v) => `"${v.caption.replace(/\s+/g, ' ').slice(0, 140)}"${v.views !== null ? ` (${v.views} views)` : ''}`);
  const text = [
    `${n}. ${r.platform} @${r.handle}${r.name ? ` (${r.name})` : ''}`,
    `followers: ${r.followers ?? 'unknown'}; median views of recent videos: ${r.median_views ?? 'unknown'}; came up on ${r.posts_found} searched posts`,
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
  const { data } = await generate<{ creators: { n: number; score: number; is_person: boolean; likely_minor: boolean; why: string; tags: string[] }[] }>({
    task: 'scout.vet',
    tier: 'fast',
    system: VET_SYSTEM,
    context: [ctx, `Ideal creator: ${plan.ideal}\nBrief: ${run.brief || 'none'}`],
    input: `Creators\n\n${lines.join('\n\n')}`,
    images,
    schema: VET_SCHEMA,
    maxTokens: 4000,
    companyId: run.company_id,
    timeoutMs: 100_000,
  });
  const seen = new Set<number>();
  await Promise.all(data.creators.map(async (c) => {
    const r = rows[c.n - 1];
    if (!r || seen.has(c.n)) return;
    seen.add(c.n);
    const score = Math.max(0, Math.min(100, Math.round(c.score)));
    const match = score >= MATCH_SCORE && c.is_person && !c.likely_minor;
    await admin.from('scout_creators').update({
      score,
      why: clip(c.why, 160),
      tags: c.tags.map((t) => t.toLowerCase().trim().slice(0, 30)).filter(Boolean).slice(0, 3),
      likely_minor: c.likely_minor,
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

const ROW_COLUMNS = 'id, platform, handle, name, bio, followers, median_views, posts_found, videos, why, tags';

/** One slice of vetting; true when the run has nothing left to vet or write. */
async function vetStep(admin: SupabaseClient, run: ScoutRun): Promise<boolean> {
  const ctx = (await companyContext(admin, run.company_id)).text;
  const { data: toVet } = await admin.from('scout_creators').select(ROW_COLUMNS)
    .eq('run_id', run.id).eq('status', 'vetting').limit(VET_BATCH * 3);
  if (toVet?.length) {
    const batches: Row[][] = [];
    for (let i = 0; i < toVet.length; i += VET_BATCH) batches.push(toVet.slice(i, i + VET_BATCH) as Row[]);
    const results = await Promise.allSettled(batches.map((b) => vetBatch(admin, run, ctx, b)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error('scout vet batch', r.reason instanceof Error ? r.reason.message : r.reason);
      }
    });
    // Do not loop on a batch that failed: those creators are skipped.
    await Promise.all(results.map((r, i) =>
      r.status === 'rejected'
        ? admin.from('scout_creators').update({ status: 'skipped' }).in('id', batches[i].map((x) => x.id))
        : null
    ));
    return false;
  }
  const { data: toWrite } = await admin.from('scout_creators').select(ROW_COLUMNS)
    .eq('run_id', run.id).eq('status', 'match').is('dm', null).order('score', { ascending: false }).limit(WRITE_BATCH * 2);
  if (toWrite?.length) {
    const batches: Row[][] = [];
    for (let i = 0; i < toWrite.length; i += WRITE_BATCH) batches.push(toWrite.slice(i, i + WRITE_BATCH) as Row[]);
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
    admin.from('scout_creators').select('id', { count: 'exact', head: true }).eq('run_id', runId).neq('status', 'vetting'),
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
      const search = await startSearch(run.plan as ScoutPlan);
      await save(admin, run, { plan: run.plan, status: 'searching', jobs: { search }, lease_until: null });
      return;
    }

    if (run.status === 'searching') {
      const search = run.jobs.search ?? [];
      if (!(await settle(search))) {
        await save(admin, run, { jobs: { ...run.jobs, search }, lease_until: null });
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
      const enrich = await startEnrich(shortlist);
      await save(admin, run, {
        status: 'enriching', jobs: { search, enrich, shortlist },
        counts: { posts, accounts, shortlisted: shortlist.length }, lease_until: null,
      });
      return;
    }

    if (run.status === 'enriching') {
      const enrich = run.jobs.enrich ?? [];
      if (!(await settle(enrich))) {
        await save(admin, run, { jobs: { ...run.jobs, enrich }, lease_until: null });
        return;
      }
      const list = await mergeEnrich({ ...run, jobs: { ...run.jobs, enrich } });
      const saved = await saveEnriched(admin, run, list);
      await save(admin, run, {
        status: 'vetting', jobs: { search: run.jobs.search, enrich },
        counts: { ...run.counts, shortlisted: saved }, lease_until: null,
      });
      return;
    }

    if (run.status === 'vetting') {
      // Keep going while there is time left in the lease.
      const t0 = Date.now();
      let finished = await vetStep(admin, run);
      while (!finished && Date.now() - t0 < 40_000) {
        await admin.from('scout_runs').update({ lease_until: new Date(Date.now() + LEASE_MS).toISOString() }).eq('id', run.id);
        finished = await vetStep(admin, run);
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
