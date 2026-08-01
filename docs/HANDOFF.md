# Handoff: Inspiration Engine (post Workstream A + C)

You are picking up mid-build of the inspiration and post generation system. Workstreams A (foundation) and C (scraping/extraction) are done and deployed. Workstream D (weekly planner + generation) is next, but five corrections listed at the bottom come first. Do those before D.

## Read first, in this order

1. `ugc-bible.md` — the universal content doctrine, version 2. Twelve formats with named slots, distribution physics, banned constructions, the post object contract, cadence, learning loop. This is law; tenants never edit it.
2. `build-prompt.md` — the build plan: workstreams A through G, data model, ownership contracts.
3. `BUILD_STATE.md` — sections "WS-A inspiration engine foundation facts" and "WS-C scraping + extraction facts", plus "Operational facts" before touching infra.
4. The code itself:
   - `supabase/migrations/20260730160000_015_inspiration_foundation.sql` — the foundation migration (applied to prod).
   - `supabase/migrations/20260731130000_016_c_scrape_support.sql` — OCR cache + near-dup fingerprint (applied to prod).
   - `supabase/functions/_shared/doctrine.ts` — `BIBLE_VERSION`, `DOCTRINE` (compacted bible Parts 1-7), `assembleGenerationContext` (the input contract for D's generator).
   - `supabase/functions/_shared/post-object.ts` — `PostObject`, `GenerationMeta`, `FORMAT_IDS`.
   - `supabase/functions/_shared/formats-seed.ts` — Part 8 of the bible as data (12 formats) plus Appendix A FieldVision examples.
   - `supabase/functions/_shared/classify.ts` — format classification prompt builder, `CLASSIFY_CONFIDENCE_THRESHOLD = 0.6`, `EXAMPLE_CONFIDENCE_THRESHOLD = 0.7`.
   - `supabase/functions/_shared/mine-claims.ts` — claim mining prompt builder.
   - `supabase/functions/scrape-trends/index.ts` — the rewritten scraper (Workstream C), deployed.
   - `scripts/label-trends.ts` — golden set labeling CLI (`list | label <id> keep|kill | progress`).

All `_shared` prompt-builder files are deliberately import-free (no Deno or npm imports) so Node scripts like `scripts/relevance-regression.ts` can import them.

## Production state, per workstream

**Live in prod:**
- Migrations 015 and 016 are applied to the linked project (`zdcmmzofnrdqbwexuqnm`). `lib/types.ts` was regenerated from the live schema.
- `formats` seeded: 12 rows, `bible_version = '2'`. `format_examples`: 19 FieldVision seed rows (`source='seed'`).
- Rewritten `scrape-trends` is deployed but **has never run live**. The Monday cron `noni-scrape-trends-weekly` is the de facto acceptance run. After it fires, check function logs and counts in `trend_items`, `claims`, `vocabulary`, `format_examples`.
- The `noni-auto-fill-daily` cron was unscheduled inside migration 015. The `auto-fill` code remains but nothing calls it on a schedule. Remaining crons: `noni-brand-ingest-monthly`, `noni-poll-metrics-daily`, `noni-reset-streaks-daily`, `noni-scrape-trends-weekly`.
- Legacy WP8 pieces (`brand-ingest`, `poll-metrics`, admin "Scrape now" button in `app/(admin)/trends.tsx`) are unchanged and still live.

**Dormant (code exists, nothing exercises it):**
- The entire format-donor path. `source_accounts.corpus` is `'format_donor' | 'niche'`, but every existing and discovered account is `'niche'`. Donor classification -> `format_examples` harvesting (`harvestFormatExamples` in scrape-trends) is dead until donor accounts exist.
- `assembleGenerationContext`, `PostObject`, `GenerationMeta` — built for D, consumed by nothing yet.
- `slot_index` on `content_tasks` and the whole planning-status machinery — waiting for D/E1.

**Not built:**
- D: weekly batch planner + generation (was hard-blocked on C; now blocked on the corrections below).
- E1: admin planning review UI (owns `planning_status` transitions).
- E2: library management UI (claims/vocabulary/format_examples/accounts curation) — wave 2.
- F: learning loop (win detection vs `profiles.baseline_primary_signal`, `format_stats` weight updates, `hook_bank` writeback).
- G: relevance/classification regression harness is partially there (`scripts/relevance-regression.ts`), but the golden set has **0 of 60-80 labels** and only 16 candidate `trend_items` exist. Labeling is user-blocked via `scripts/label-trends.ts`; starvation is the pipeline's fault (see immediate work item 1).

## The two-phase status machine — do not bypass this

`content_tasks` has two independent statuses:

- `planning_status` (text, **NOT NULL, no default**): `draft -> in_review -> approved -> scheduled`, or `rejected`. This is admin review of AI drafts. Because there is no default, **every insert must state it explicitly** — that is intentional, so no code path can create a task without declaring where it sits in planning.
- `status` (text, **nullable**): the production flow `assigned -> recorded -> submitted -> changes_requested -> approved -> posted`. NULL means "not released to a creator." Transitions only through the functions in `lib/tasks.ts`, never raw updates.

The DB constraint `content_tasks_release_gate` enforces `status IS NULL OR planning_status = 'scheduled'`. You physically cannot give a task a production status until planning review has scheduled it, and a `rejected` draft is pinned to `status NULL`. Do not weaken this constraint, do not add a default to `planning_status`, and do not set `status` and `planning_status` in the same statement unless `planning_status` is `'scheduled'`.

RLS backs the same rule: creators can only select their own rows where `status` is non-null, so planning drafts are invisible to creators at the database level. Admins read everything.

Two legacy insert points intentionally write `planning_status: 'scheduled'` so the old flow keeps working until D replaces it: `createTask` in `lib/admin-api.ts` and the insert in `supabase/functions/auto-fill/index.ts`. When D lands, its inserts use `'draft'`/`'in_review'` and those legacy paths get torn out.

`task_comments` (planning-phase discussion) is separate from `review_events` (production submission review). Do not merge them.

## Ownership contracts (who writes which tables)

- **C** (`scrape-trends`): writes `trend_items`, `format_examples` (harvested), `claims`, `vocabulary`, `source_accounts` health fields, `ocr_cache`.
- **D**: writes `content_tasks` and `weekly_batches`. Never touches `planning_status` after insert.
- **E1**: the only writer of `planning_status` transitions.
- **F**: the only writer of `format_stats`, `hook_bank` writeback columns, and `profiles.baseline_primary_signal`.
- `lib/tasks.ts`: the only writer of production `status` transitions.
- `formats` is code (seeded by `scripts/seed-formats.ts`); nothing writes it at runtime.

## How the deployed scraper works (summary)

Per company in `supabase/functions/scrape-trends/index.ts` (`scrapeCompany`): load active accounts (max 6 TikTok / 4 Instagram, `MAX_TIKTOK_PROFILES`/`MAX_INSTAGRAM_PROFILES`) plus up to 4 probation accounts; handle-scrape first; search/hashtags only as fallback (`MIN_ACCOUNTS_BEFORE_SEARCH = 3`, `MIN_HANDLE_ITEMS_BEFORE_SEARCH = 8`). View floors 2k handle / 10k search, hard dedupe on `source_url`, cap `MAX_ITEMS_PER_RUN = 16`. Enrich (Apify transcript link -> Deepgram fallback -> caption; OCR first 4 slides via `ocrSlidesCached`, content-hash cached in `ocr_cache`). Near-dup dedupe via `contentFingerprint` against `trend_items.content_fingerprint`. Then two judgments: relevance gate (`_shared/relevance.ts`, niche items only) and format classification (`classifyItems`, all items). Keeper = gate pass for niche, confident classification for donors (see item 3 below — this is wrong). Comment scrape TikTok keepers (`MAX_COMMENT_POSTS = 6`, `COMMENTS_PER_POST = 25`) for `cta_keyword_count` + question comments. Writes: `trend_items`, donor slot fills to `format_examples` (>= 0.7 confidence), niche keepers + questions through `mineClaims` to `claims`/`vocabulary`. Account health: discovered search authors insert as `status='probation'`; probation -> active on first keeper; auto-mute at >= 10 scrapes with keeper rate < 10% (`MUTE_MIN_SCRAPES`, `MUTE_KEEPER_RATE`).

## Operational facts

- Direct Postgres connections are blocked from this dev network. Apply migrations with `npx tsx scripts/apply-migration.ts supabase/migrations/<file>.sql` (Supabase Management API over HTTPS; also records the version and regenerates `lib/types.ts`). Requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` in `.env.local`.
- Deploy functions with `supabase functions deploy <name> --project-ref zdcmmzofnrdqbwexuqnm --use-api` with `SUPABASE_ACCESS_TOKEN` exported (no Docker needed). The deploy API occasionally 502s; retry once.
- There are **no admin app credentials** in `.env.local` — `NONI_TEST_EMAIL/PASSWORD` is a creator account, so calling `scrape-trends` with it returns 403 (`scripts/run-scrape.ts` exists but is blocked on this; the cron-secret path returned 401, the value from `/v1/projects/{ref}/secrets` did not match). Manual runs go through the admin app's "Scrape now" button or wait for the cron.
- The Supabase MCP server in this workspace points at the **wrong project** (`npuhpegvrcwqytsekpag`). Do not use it against Noni. Use the scripts.

## Known failure modes

1. **Apify blank media URLs (unfixed, serious).** `clockworks~tiktok-scraper` sometimes returns empty `mediaUrls` even with download options set, and the transcript link can be absent. `resolveTranscript` then returns null and downstream prompts silently fall back to the caption. For format classification of a video this is corrupting: a post gets classified on a one-line caption with no error raised. This happened in the WP8 acceptance run (2026-07-30, all 8 items caption-only). See smaller item B below.
2. **Comment actor mapping unverified.** `scrapeComments` maps `clockworks~tiktok-comments-scraper` output as `{text, videoWebUrl | postUrl}` defensively but has never run live. If field names differ, `cta_keyword_count` stays null and question mining is empty — silently.
3. **The rewrite has zero live runs.** Monday's cron is the first. Anything from actor input shapes to insert column mismatches could surface there.
4. **OCR cache URL-hash fallback.** If the image fetch fails, `imageHash` hashes the query-stripped URL instead of bytes, which defeats cross-repost dedupe for that image.

## Immediate work, in order, before Workstream D

### 1. Bulk backfill mode for scrape-trends

The weekly caps (`MAX_ITEMS_PER_RUN = 16`, `MAX_TIKTOK_PROFILES = 6`) are maintenance-sized. Everything downstream is starved: the golden set needs 60-80 labeled items and only 16 `trend_items` exist total; the coverage study (item 2) needs ~500; `format_examples` harvesting has nothing to chew. Add a one-off backfill mode (e.g. a `{"mode": "backfill", "target": 500}` body param on the function, or a dedicated script) that raises the caps, pages deeper per account (`resultsPerPage` is currently 4 per profile), and loops until the target is hit. Keep dedupe and enrichment; consider batching the Claude calls harder. Budget note: backfill implies real Apify/Deepgram/Claude spend, so surface counts as it runs.

### 2. Stop discarding unclassified posts

`classifyItems` in `supabase/functions/scrape-trends/index.ts` keeps a verdict only when `v.confidence >= CLASSIFY_CONFIDENCE_THRESHOLD && v.format_id` and throws the rest away. Store every verdict: `format_id = null` with the confidence and a reason (extend `buildClassifyPrompt` in `supabase/functions/_shared/classify.ts` to return a `reason` for null verdicts, and persist it on `trend_items` — add a column, e.g. `classify_reason`, plus store the raw confidence). The point: if a large share of real posts do not fit the 12 formats, the library is wrong, and that must be measurable before D generates against it. This was requested earlier and did not land.

### 3. Fix the circularity in donor keeping

In `scrapeCompany`, `passed(i)` for a `format_donor` item is `classifications.has(i)` — a donor post is a keeper if and only if it confidently matches a format we already wrote. Harvested `format_examples` can therefore only ever reinforce the existing library; the pipeline cannot falsify it. Keep donors on a signal independent of classification (engagement relative to the account's norm, or a structure-quality judgment that does not reference the 12 formats), and record classification outcome separately. Unclassifiable-but-kept donor posts are exactly the evidence item 2 is looking for.

### 4. Seed format_donor accounts across ~10 verticals

The donor half of the system is dead code: no `source_accounts` row has `corpus='format_donor'`. Pick roughly ten cross-vertical accounts known for strong structure (different niches so structure generalizes), insert them with `corpus='format_donor', status='active'` (script or SQL via `scripts/apply-migration.ts`-style runner; unique key is `company_id, platform, handle`). Until then `harvestFormatExamples` never fires.

### 5. Fix the saturation formula

`mineClaims` computes `saturationFor(topic) = min(10, round(10 * topicCount / totalNicheItemsThisRun))`. Two defects: it divides by the current run's corpus size, so scores shrink as the corpus grows (backwards — saturation should reflect how crowded a topic is, and more data should sharpen it, not dilute it), and at n=16 it is pure noise. Replace with a rolling window: count topic frequency over the last N niche `trend_items` (e.g. 90 days or last 200 items — requires persisting the per-item topic, add a `topic` column to `trend_items` or a small `trend_topics` table), and return null/unknown saturation below a minimum sample (e.g. 30 items) rather than a fake number. `claims.saturation_score` consumers must treat null as "unknown", not zero.

## Smaller items

- **A. Claims status enum drift.** Migration 015 created `claims.status` as `candidate | approved | banned`; the plan says `candidate | active | retired`. Reconcile with a small migration before E2 builds UI on the wrong vocabulary (decide which naming wins; the plan's naming was deliberate: `retired` is not the same claim state as `banned`, which is what `banned_claims` is for).
- **B. Apify blank media URL fallback is silent.** When a video has no transcript, the item flows on with caption-only text and gets classified anyway (failure mode 1 above). At minimum: mark such items (`transcript IS NULL AND format='video'`) as ineligible for format classification and for `format_examples` harvesting, or store a `low_signal` flag so downstream consumers can filter. Do not let caption-only videos into the golden set or the coverage stats without a flag.
