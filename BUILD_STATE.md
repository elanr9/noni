# Noni build state + agent handoff

Read `NONI_SPEC.md` first (it is law), then this file. This file tracks what is DONE, what is NEXT, and operational facts agents need. Update it at the end of every phase.

## Status

| WP | What | Status |
|----|------|--------|
| WP0 | Scaffold (Expo SDK 54, expo-router, strict TS, Supabase, types) | DONE |
| WP1 | Auth + roles (email+password for now, route guards) | DONE |
| WP2 | Creator core (Today, Task Detail, My Posts) | DONE |
| WP3 | Record screen (camera + teleprompter, upload, submit) | DONE |
| WP4 | Admin core (Queue, Review, Calendar manual create) | DONE |
| WP4.5 | Review thread (convo until approve) | DONE |
| WP5 | Notifications (`notify` fn + push registration) | DONE, see gotchas |
| WP3.5 | Record v2 (segments, karaoke prompter, flash) | DONE (code verified, typecheck clean; run the phone checklist below) |
| WP6 | Posting via Upload-Post (per-creator accounts) | DONE incl. approve-time stitching (live post needs the phone checklist below) |
| WP7 | Onboarding flows | DONE (code verified, typecheck clean; run the phone checklist below) |
| WP8 | UGC brain (scrape → Claude → auto-fill Today) | DONE (acceptance verified 2026-07-30: Elan Today has AI task from scraped trend, created_by null) |
| WP9 | Auto-finish (FFmpeg edit on approve → post → track) | DONE (code + deployed; phone verify: Approve → edited live post + posts row) |
| WP10 | Money: attribution + creator wallets (Stripe Connect cash out) | DONE (migration 011 + 3 fns deployed; accepts need human Stripe checkout + seeded cash-out) |
| WP11 | Metrics + Analytics + auto bounty credit on view threshold | DONE (poll-metrics deployed + daily cron; admin Analytics screen; accepts need live Upload-Post metrics + threshold credit) |
| DSv2 | Creator app redesign per `design_handoff_creator_app/README.md` (tokens, primitives, 4-tab shell, all screens) | DONE (typecheck + iOS bundle clean; needs phone pass vs screenshots) |
| WS-A | Inspiration engine foundation (schema, format seed, doctrine, post object) | DONE (migrations 015+016 applied, formats seeded) |
| WS-C | Scraping + extraction rewrite of `scrape-trends` | DONE + deployed (zero live runs; Monday cron or backfill is the acceptance run) |
| Pre-D | Handoff corrections: verdict persistence, donor keeper signal, rolling saturation, low_signal, backfill mode, donor seeds, coverage report | DONE (migration 017 applied, function redeployed 2026-07-31) |
| F | EAS build, TestFlight | NOT STARTED |

## WS-A inspiration engine foundation facts

Plan docs: `files/ugc-bible.md` (universal doctrine, never tenant edited) + `files/build-prompt.md` (workstreams A-G and contracts). Read both before touching any of this.

- **Migration 015** (`20260730160000_015_inspiration_foundation.sql`): universal `formats` table; tenant `calendar_events`, `claims`, `format_examples`, `vocabulary`, `banned_claims`, `ban_list`, `campaigns`, `weekly_batches`, `task_comments`, `format_stats`, `revenue_daily`; capability flag booleans + rolling baseline on `profiles`; `corpus`/`probation`/`keeper_rate` on `source_accounts`; `format_id`/`slot_fills`/`cta_keyword_count` on `trend_items`; post object columns + planning cycle refs on `content_tasks`; saves/profile_clicks/link_clicks/keyword_comment_count/completion_rate on `post_metrics`; Part 11 writeback columns on `hook_bank`.
- **Two-phase status machine on `content_tasks`**: `planning_status` (draft → in_review → approved → scheduled, or → rejected; E1 owns, NOT NULL, **no default — every insert states it**) and the existing production `status` (now nullable; NULL = not released to creator; `lib/tasks.ts` owns transitions). DB constraint `content_tasks_release_gate` enforces `status IS NULL OR planning_status = 'scheduled'`, which also pins rejected drafts to status NULL. Existing rows backfilled to `planning_status='scheduled'`.
- **Cron idempotency**: unique `(company_id, week_start)` on `weekly_batches` plus partial unique index `(weekly_batch_id, assigned_to, scheduled_for, slot_index)` on `content_tasks` (`slot_index int not null default 0` allows multiple planned posts per creator per day).
- **RLS change**: the company-wide `content_tasks` read policy is replaced. Admins read all (via the FOR ALL write policy); creators read only their own tasks with non-null `status`. Planning drafts are invisible to creators by RLS, not just UI. `task_comments` (planning/shot direction) is separate from `review_events` (submission review); do not merge.
- **Shared helpers** in `supabase/functions/_shared/` (all import-free so Node scripts can use them): `doctrine.ts` (BIBLE_VERSION='2', DOCTRINE = compact bible Parts 1-7, `assembleGenerationContext` — injects doctrine + exactly one format spec + claim + tenant examples + voice + vocab sample), `post-object.ts` (`PostObject`, `GenerationMeta` incl. `bible_version`, `FORMAT_IDS`), `formats-seed.ts` (Part 8 as data, 12 rows, parsed numeric length/slide ranges; Appendix A FieldVision examples).
- **Scripts**: `npx tsx scripts/seed-formats.ts [company_id]` (upserts 12 formats, replaces FieldVision `source='seed'` examples; company found by slug `fieldvision` if no arg). `npx tsx scripts/label-trends.ts list|label|progress` — minimal golden set labeling for Workstream G before the E2 UI exists (hand labels set `is_golden=true`).
- **Applied 2026-07-31**: migrations 015 + 016 live on prod (via `npx tsx scripts/apply-migration.ts <file>`, Management API over HTTPS — direct Postgres connections are blocked from this network; script also regenerates `lib/types.ts`). Formats seeded (12 rows, bible v2) + 19 FieldVision Appendix A examples. `noni-auto-fill-daily` cron unscheduled inside migration 015. The legacy task insert points (`createTask` in `lib/admin-api.ts`, `auto-fill` code) still state `planning_status: 'scheduled'` and keep working until D replaces them.
- Ownership contracts per `files/build-prompt.md`: only E1 writes `planning_status`; only F writes `format_stats`, hook bank writeback, baselines; C writes `format_examples`/`claims`/`vocabulary`/`trend_items`; D writes `content_tasks`/`weekly_batches`.

## WS-C scraping + extraction facts

- **Migration 016** (`20260731130000_016_c_scrape_support.sql`): `ocr_cache` (PK `company_id,image_hash`, service-role only) and `trend_items.content_fingerprint` + partial index for near-dup detection.
- **`scrape-trends` rewritten and deployed** (2026-07-31, `--use-api` deploy, no Docker). Two corpora, never mixed: `source_accounts.corpus='format_donor'` teaches structure, `'niche'` teaches claims/vocabulary. Search terms are fallback only (runs when accounts < 3 or handle items < 8, or in backfill mode when handle output misses the target). Keeper definition differs by corpus: niche = relevance gate ≥ threshold; donor = engagement vs. own account norm (see pre-D corrections below). Stopped writing `content_templates`, `hook_bank`, `remake_mode` (gate prompt in `_shared/relevance.ts` untouched for G regression).
- **New shared prompt builders** (import-free): `_shared/classify.ts` (12-format classification + slot_fills + null reasons, thresholds 0.6 classify / 0.7 example-harvest) and `_shared/mine-claims.ts` (claims + vocabulary + per-item topics).
- **Comment scraping**: TikTok keepers only (25 comments each, `clockworks~tiktok-comments-scraper`; post budget split per corpus, see backfill prep facts). CTA keyword parsed from caption/transcript (`comment "X"`), exact-match count → `trend_items.cta_keyword_count`; question comments from niche keepers feed claim mining.
- **OCR**: first 4 slides only, cached by image content hash (sha-256 of bytes, URL-hash fallback), so reposted slideshows never re-OCR.
- **Account health**: discovered accounts (authors of gate-passing search results) insert as `status='probation'`; probation → active on first keeper; auto-mute at ≥10 scrapes with keeper rate <10%. Up to 4 probation accounts scraped per run.
- **Not live-tested yet**: no admin credentials in `.env.local` (`NONI_TEST_*` is a creator, so `scripts/run-scrape.ts` gets 403; the cron-secret path needs the Vault value). Monday's `noni-scrape-trends-weekly` cron is the acceptance run; check function logs + `trend_items`/`claims`/`vocabulary`/`format_examples` counts after.

## Pre-D corrections facts (2026-07-31, done before Workstream D)

- **Migration 017** (`20260731180000_017_pre_d_corrections.sql`, applied to prod): `trend_items.classify_confidence/classify_reason/topic/low_signal` + partial index for the saturation window; `claims.saturation_score` is now nullable with no default (null = unknown, never zero — `doctrine.ts` renders it as "Saturation: unknown").
- **Every classification verdict is stored** (handoff item 2): `classifyItems` keeps unconfident verdicts as `format_id null` + raw `classify_confidence` + `classify_reason` (prompt in `_shared/classify.ts` returns a reason for null/low verdicts). Coverage of the 12-format library is now measurable.
- **Donor keeping decoupled from classification** (item 3): donor keeper = views ≥ 2k and ≥ 1.5× the account's median views this run (norm needs ≥ 3 sampled posts, else floor only). `harvestFormatExamples` requires keeper + ≥ 0.7 classification. Unclassifiable-but-kept donor posts land in `trend_items` with a null-reason: the library-coverage evidence.
- **Saturation from a rolling window** (item 5): per-item topic written back to `trend_items.topic` after mining; score = topic share of the last 200 topic-labeled items / 90 days, scaled so `SATURATION_FULL_SHARE` (edge env var, default 0.3, deliberately not hardcoded — calibrate from the post-backfill topic distribution) of the window = 10. Below 30 sampled topics every score is null.
- **`low_signal` flag** (item B): video without transcript or carousel without OCR text. Skipped by format classification and example harvest, still gated/mined (caption is legitimate there). `scripts/label-trends.ts list` filters it out of the golden set.
- **Backfill mode** (item 1): POST `{"mode":"backfill","target":500}` to `scrape-trends` (admin JWT or cron secret; no body = weekly). Raises caps (12 TikTok / 8 IG profiles, depth ≈ 1.5×target/accounts capped at 100, search 30/term), processes in chunks of 20 with per-chunk inserts and progress logs, fingerprint history window max(3000, 4×target), comment budget per corpus (see backfill prep facts). Profile scrapes go to Apify in groups of 4 handles per sync call to dodge the sync-run timeout.
- **Donor accounts seeded** (item 4): 10 TikTok `format_donor` accounts for FieldVision via `scripts/seed-donor-accounts.ts` (idempotent). Shape: small app/product-driven UGC accounts (skits, screen demos, keyword CTAs), all handle-verified live: lukascooksat, employed.nickolai, calai.app, quittr.app, opal, alarmy_official, meetcleo, cluely, umaxapp, blitzitapp.
- **Coverage report**: `npx tsx scripts/coverage-report.ts` (service role env) — % classified of classifiable items split by corpus, per-format distribution, top null reasons, topic share distribution + `SATURATION_FULL_SHARE` calibration hint. Run it after the backfill.
- **Item A (claims status enum drift) was a non-issue**: prod constraint verified live as `candidate | active | retired` (the plan naming), 0 rows in `claims`. No migration needed.

## Backfill prep facts (2026-07-31, before the backfill run)

- **Niche account universe seeded**: 18 `corpus='niche', status='active'` accounts for FieldVision via `scripts/seed-niche-accounts.ts` (mirrors the donor seed: service role, fieldvision slug lookup, idempotent upsert on `(company_id, platform, handle)`). Every handle verified live (bio + follower count fetched 2026-07-31), no guesses. TikTok (8): collegesoccerguy, odysseycollegerecruiting, thecollegesoccercoach (consultants), im.mya (college soccer player creator, 2.4M), thegirlsacademyleague, topdrawersoccer (media), ncsa_sports + sportsrecruits (general recruiting, secondary). Instagram (10): ecnlgirls, theecnl, girlsacademyleague (leagues), slammersfc, mvlasoccerclub, solarsoccerclub (ECNL clubs), future500idcamp (ID camp), traceup (highlight video), soccermomsunfiltered (parent), girlssoccernetwork (media). Rejected as dead/unverifiable: future500idcamp TikTok (2 followers), theecnl TikTok (8), surfcupsports IG (could not read bio/followers), recruit.fluency (280), soccerwire (183), idsportsusa, 2adays, and the highlight-editor SaaS TikToks (playcut/sportsync/streetplay, all <50).
- **Comment budget split per corpus** (deployed 2026-07-31): `RunConfig.commentPostBudget` replaced by `commentBudgetNiche`/`commentBudgetDonor` (backfill 150/50, weekly 5/1), tracked separately across chunks. All 10 donors are TikTok and comment scraping is TikTok-keeper-only, so a shared pool would let donors (whose comments cannot feed claim mining) starve the niche questions. One actor call per chunk covers both target lists; a failed call still counts each corpus's targets against its own budget. Question comments now come from niche keepers only (donor questions would mix corpora); donor comment scraping yields `cta_keyword_count` only.
- **Profile slots are corpus-aware** (deployed 2026-07-31, before the backfill): `RunConfig.maxTiktokProfiles`/`maxInstagramProfiles` replaced by `tiktokSlots`/`instagramSlots`, each `{niche, donor}` (backfill: TikTok 7/5, IG 5/3; weekly: TikTok 4/2, IG 3/1). `pickPlatformAccounts` fills each corpus's slots least-recently-scraped first (actives before probation, as before), then unfilled slots spill to the other corpus, so IG having zero donors today still scrapes 8 niche IG profiles and neither corpus can consume a run.

## WP3.5 + WP6 phone checklist (human + verify)

1. Log in as creator → Settings → Connect socials → link TikTok/Instagram (Upload-Post hosted page).
2. Record a multi-segment take (stop between script parts, flip camera, flash on both facings, karaoke prompter with tap-pause), submit.
3. Approve as admin, confirm one stitched video goes live on the creator's account and My Posts shows the link.
4. Upload-Post free plan blocks TikTok posting; upgrade if that error appears. FFmpeg API quota is 30 media minutes/month on free.

## WP9 phone checklist

1. Approve a submitted video as admin (no further taps). Expect longer wait: stitch (if multi) + basic edit + Upload-Post.
2. Confirm `submissions.video_path` ends in `-edited.mp4`, a `posts` row exists, task status is `posted`, and the clip is live on the creator's linked account.

## WP7 onboarding facts

- `(onboarding)/index` branches by role: admin → `company.tsx` (13 steps per spec section 7), creator → `creator.tsx` (name/selfie → permissions → connect socials → `practice.tsx` teleprompter tutorial). No profile row → "ask your admin" card.
- Company flow writes on the final step only: `companies.name/website`, `brand_profiles` (tone, audience, products jsonb `{description}`, buying_path, content_pillars, source_urls), `companies.settings` (handles, cadence_per_week, approvers, tone), then `profiles.onboarded=true` → lands on `/(admin)/calendar`. Creator flow saves name/avatar at step 1, `onboarded=true` after (or on skipping) the practice clip → lands on `/(creator)`.
- **Brand study screen is real (WP8)**: step 3 fires `runBrandIngest` in `lib/onboarding.ts` (calls the `brand-ingest` edge function) while the same progress states stream; the last phase stays active until the call resolves. On any failure it silently falls back to generic suggestions so onboarding never dead-ends.
- **Invite creators is a stub**: share sheet with a `noni://` deep link message, no invite tokens. Attaching roles still goes through `scripts/attach-profile.sql`.
- Migration 007 added a private `avatars` storage bucket (jpeg/png, 5MB): same-company read, users write only their own `company_id/user_id.jpg`. `profiles.avatar_path` stores that path.
- `expo-image-picker` installed with `--legacy-peer-deps` (same peer conflict as expo-brightness). Practice clip is throwaway: never uploaded, reuses the record-screen Expo Go gotchas (onCameraReady gate, stop watchdog, maxDuration failsafe).
- WP7 phone checklist: fresh admin (onboarded=false) through all 13 company steps → lands on Calendar; fresh creator through selfie/permissions/socials/practice → lands on Today. Reset a test user with `update profiles set onboarded=false where id=...`.

## Record v2 facts (WP3.5)

- `submissions.segment_paths text[]` (migration 006) holds ordered clip paths; `video_path` is the first clip on submit.
- Single segment uploads to the spec path `company/task/version.mp4` and skips stitching. Multi uploads `version-1.mp4 … version-n.mp4`.
- `post-approved` stitches multi-segment takes via Upload-Post FFmpeg API (`POST /api/uploadposts/ffmpeg/jobs/upload`, JSON body with signed segment URLs, poll job, download, store as `version-stitched.mp4`) then updates `video_path` to the stitched file before posting. Expo Go cannot run FFmpeg locally.
- **WP9 basic edit** (same FFmpeg API, after stitch / on single clip): `-ss 0.15` head trim, `silenceremove` tail + `-shortest`, `loudnorm`, scale/crop to 1080x1920 → stores `version-edited.mp4`, updates `video_path`, then Upload-Post. Shared `runFfmpegJob` helper. Creatomate templates stay in section 13.
- Admin Review plays `video_path`, so before approve a multi-segment take previews only clip 1. Fine for now; flag if admins complain.
- Recording is gated on `onCameraReady`; a 5s watchdog after stop discards the clip and resets the UI if `recordAsync` hangs (Expo Go SDK 54 new arch bug). Flipping the camera stops a recording (expo-camera behavior), so flip is hidden while recording.
- Front flash = white edge glow + `expo-brightness` maxed during recording (restored after). Rear flash = `enableTorch`. `expo-brightness` installed with `--legacy-peer-deps` (pre-existing react 19.1 / react-dom 19.2 peer conflict; plain `npx expo install` fails).
- Script parts split on `---` lines first, else blank-line paragraphs; segment k records part min(k, last).

## Bounty cards + college targeting (WP8.5)

- Migration 009: `trend_items.cover_url`, `content_tasks.format` (`video`|`photo_carousel`, default video), `content_tasks.brief`, `content_tasks.estimated_seconds`. Types in [`lib/types.ts`](lib/types.ts) hand-edited to match.
- Creator Today ([`app/(creator)/index.tsx`](app/(creator)/index.tsx)) renders [`components/TaskCard.tsx`](components/TaskCard.tsx): full-bleed inspiration cover + play glyph, format tab (Video/Slideshow), title, 1-2 sentence brief, footer `~time · $20 at 5k views`. Task detail ([`app/(creator)/task/[id].tsx`](app/(creator)/task/[id].tsx)) has the same media hero (tap = open `source_url` via Linking, no WebView), brief block, bounty/time row. Record button only shows for `format=video`; `photo_carousel` shows an honest "coming soon, match the slides" stub (no fake camera).
- Bounty numbers are display-only until WP11 credits wallets. Defaults live in `companies.settings` (`bounty_amount_cents`, `bounty_view_threshold`); `lib/bounty.ts` reads them. WP11 auto-credits when polled views cross the threshold.
- `listMyTasks`/`getTask` in [`lib/tasks-api.ts`](lib/tasks-api.ts) now join the inspiration trend (`TaskWithTrend`). Admin Trends cards show the cover thumbnail too.
- Scrape targeting: `deriveSearchTerms` + `generateTaskDraft` in [`_shared/wp8.ts`](supabase/functions/_shared/wp8.ts) now read `companies.settings.vertical` + `ugc_reference_handles` and bias toward the audience's journey (recruiting/commits/film/gameday) over generic drills. For FieldVision (`vertical=college_soccer`) the re-scrape returned `#collegerecruiting`, highlight-reel, D1, AI-film trends. `generateTaskDraft` also returns `brief`, `format`, and `estimatedSeconds` (~150 wpm, clamped 20-90s); auto-fill + generate-script persist them.
- Apify covers: TikTok scraper called with `shouldDownloadCovers`; cover from `videoMeta.coverUrl`, IG from `displayUrl`. Last run: 8/8 trends had covers.
- Record ([`app/(creator)/record/[id].tsx`](app/(creator)/record/[id].tsx)) was already feature-complete (flash glow + torch, flip, TikTok segments, karaoke prompter, stitch on approve). This pass only polished discoverability: bigger circular flash/flip rail buttons with state labels, and a "N parts, stop between each" hint before the first clip. If controls seem missing on device it is Expo Go, not the code.

## WP8 UGC brain facts

- Four edge functions, all sharing `supabase/functions/_shared/wp8.ts` (Claude call, JSON parsing, brand context, task draft prompt, auth): `brand-ingest`, `scrape-trends`, `generate-script`, `auto-fill`.
- **Auth model**: `generate-script` requires an admin JWT. The other three are deployed `--no-verify-jwt` and accept EITHER an admin JWT OR an `x-cron-secret` header. The secret lives in two places that must match: edge secret `CRON_SECRET` and Vault secret `cron_secret` (used by pg_cron). Rotate both together.
- **Cron (migration 008)**: pg_cron + pg_net. `noni-scrape-trends-weekly` (Mon 06:00 UTC), `noni-auto-fill-daily` (07:00 UTC), `noni-brand-ingest-monthly` (1st, 05:00 UTC). Jobs read the secret from `vault.decrypted_secrets` at run time; nothing secret is in the migration file.
- `scrape-trends` and `auto-fill` return 202 immediately and finish in the background (`EdgeRuntime.waitUntil`); Apify sync runs take minutes. Check function logs for per-company results. Cron-triggered runs process every company that has a `brand_profiles` row (companies without one are skipped everywhere, including auto-fill).
- `scrape-trends`: Claude derives 3 TikTok search phrases + 3 IG hashtags from pillars/products → `clockworks~tiktok-scraper` (searchQueries, shouldDownloadCovers, `downloadSubtitlesOptions: DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES`) and `apify~instagram-hashtag-scraper` in parallel → filter ≥10K views, dedupe on source_url → top 8 → transcript resolver (actor `videoMeta.transcriptionLink` fetched with APIFY token first, Deepgram nova-3 on any `mediaUrls[0]` as fallback, else null → caption drives analysis) → one batched Claude call for hook + why_it_works → insert `trend_items`.
- Transcripts: Apify's video-download `mediaUrls` come back empty on the free plan, so Deepgram rarely has a URL. The actor's own transcription (~$0.27/run, ~$1/mo weekly) is now primary; it returns real text only for clips with speech (~1 in 5; many `transcriptionLink` records 404 as they live in the actor owner's short-retention store). Captions cover the rest and produce good briefs, so partial transcript coverage is expected and fine.
- `auto-fill`: per creator, deficit = `settings.cadence_per_week` (default 3, max 5 new per run) minus active tasks (assigned/recorded/submitted/changes_requested). Fills from top trends ≤45 days old, rotating so creators get different trends, skipping trends already used for that creator. Tasks insert with `created_by = null` (that is the "AI created it" marker), `inspiration_trend_id`, due dates spread over coming days.
- `brand-ingest`: fetches site text (15s timeout) + recent TikTok captions via Apify when a handle is known (60s timeout, skipped without APIFY key) → Claude → upserts `brand_profiles`. During onboarding the body carries name/website/handles because the company flow only persists them at the final step.
- Claude model is `claude-sonnet-4-5`, overridable via edge secret `ANTHROPIC_MODEL`.
- Admin UI: Trends screen (`app/(admin)/trends.tsx`) with Scrape now + Turn into task (generate-script → createTask with inspiration_trend_id, due tomorrow); Calendar form gained "Generate with AI" filling title/script/caption. Both are fallbacks; the daily cron is the product.

## Architecture decisions made after spec was written

- Posting provider is **Upload-Post** (Ayrshare was too expensive). Key stored as edge secret `UPLOAD_POST_API_KEY`.
- Upload-Post profiles are **per creator** (`profiles.upload_post_profile`, format `c_<uuid20>`), created lazily by `social-connect`. Posts go to the assigned creator's accounts, never a company account.
- `posts.ayrshare_post_id` renamed to `provider_post_id` (migration 004).
- Edge functions live: `notify`, `post-approved`, `social-connect`, `brand-ingest`, `scrape-trends`, `generate-script`, `auto-fill`. All verify the caller's JWT + company scope server-side (WP8 ones also accept the cron secret, see WP8 facts).
- Client entry points: `lib/tasks-api.ts` `transitionTask` fires `notify`; `lib/admin-api.ts` `reviewTask` fires `notify` + awaits `post-approved` on approve; `lib/review-events.ts` `insertComment` fires `notify` with `event: comment` (no status flip).

## WP4.5 Review thread facts

- Migration 010: `review_events.reviewer_id` → `author_id`; RLS policy `creators comment own submissions` (INSERT only, `action=comment`, own submission + assigned task). Admins keep `admins write reviews` for all actions.
- Shared UI: [`components/ReviewThread.tsx`](components/ReviewThread.tsx) on admin Review + creator Task Detail. Events are task-scoped (all submissions for the task), chronological.
- Comment composer both sides via `insertComment` — never flips `content_tasks.status`. Request Changes still requires a note and uses `reviewTask` → status transition. Creator Task Detail shows latest `changes_requested` note as a banner when status is `changes_requested`.
- `notify` accepts `comment`: admin author → push assigned creator; creator author → push company admins. Redeployed 2026-07-30.

## WP10 Money facts

- Migration `011_wp10_wallets`: `creator_wallets`, `wallet_ledger`, `payouts` (+ RLS; creators read/insert own wallet, read own ledger/payouts; balance mutations via service role in edge fns). Seeded `companies.settings`: `bounty_amount_cents=2000`, `bounty_view_threshold=5000` (simple fixed bounty — no per-1k formula).
- Edge fns on `zdcmmzofnrdqbwexuqnm`: `stripe-webhook` (**`--no-verify-jwt`**, verifies `Stripe-Signature`), `stripe-connect` (Express Account Link), `creator-payout` (hold available → Transfer → pending until webhook → paid). Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (pasted in chat — rotate after accepts). Webhook destination **Noni** → `…/functions/v1/stripe-webhook` (checkout.session.completed, transfer.created/updated/reversed, account.updated).
- Attribution: webhook matches checkout promo/UTM/`client_reference_id` → `attribution_links.code` → `revenue_events` (idempotent on `stripe_event_id`). Does **not** write `bounty_credit` — WP11 `poll-metrics` owns that.
- App: creator Balance (`/(creator)/balance`) via Settings — available / pending / ledger / Cash out / Connect setup. `lib/bounty.ts` reads company settings.
- Accepts checklist: (a) test Stripe checkout with a code matching an `attribution_links.code` → `revenue_events` row; (b) seed a `wallet_ledger` bounty_credit + bump `available_cents`, Cash out → pending + Transfer, webhook flips payout to `paid`.
- Connect Express must be enabled on the FieldVision Stripe account. **Blocked until platform profile questionnaire is completed:** https://dashboard.stripe.com/connect/accounts/overview (API error: “complete your platform profile to use Connect”). After that, creator flow is: Profile → Wallet → Set up payouts → Stripe hosted ID + bank → Cash out.
- HTTPS return for Account Links: `connect-return` edge fn (`verify_jwt=false`) redirects to `noni://balance`.

## WP11 Metrics facts

- Edge fn `poll-metrics` on `zdcmmzofnrdqbwexuqnm` (`--no-verify-jwt`, cron secret or admin JWT). Pulls Upload-Post `GET /api/uploadposts/post-analytics/{provider_post_id}` per `posts` row → inserts `post_metrics`. Then if max views for that post ≥ `companies.settings.bounty_view_threshold` and no `wallet_ledger` `bounty_credit` for `post_id`, inserts credit + bumps `creator_wallets.available_cents` (unique `(post_id, kind)` prevents double pay).
- Cron `noni-poll-metrics-daily` at 08:00 UTC (migration 013); same Vault `cron_secret` / edge `CRON_SECRET` as WP8.
- Admin Analytics (`/(admin)/analytics`): totals, per creator, best hooks, per post, bounty credits; **Poll metrics now** invokes the fn. Client loader in `lib/admin-api.ts` (`fetchAdminAnalytics`, `startMetricsPoll`).
- Accepts checklist: (a) Poll now on a live post → `post_metrics` row with real views; (b) temporarily lower `bounty_view_threshold` (or seed high views) → one `bounty_credit` + wallet bump; re-poll does not double credit.

## Streaks facts

- Migration `012_streaks` (applied): `creator_streaks` (current/longest streak, `last_counted_date`, `grace_used_on`; creators+admins read, writes only via security definer fns). A day counts when a task flips to `approved` (trigger `content_tasks_streak` → `record_streak_approval`, row locked so same-day approvals count once). Missed scheduled days = distinct `due_date`s between last counted day and today; rest days skipped. One grace miss per 30 days.
- Milestones in `companies.settings.streak_milestones` (seeded `[{7,$10},{14,$25},{30,$75}]`); largest repeats every multiple (60, 90...). Crossing one inserts `wallet_ledger` kind `streak_bonus` + bumps `available_cents`. Day boundary = `settings.timezone`, default `America/Chicago`.
- pg_cron `noni-reset-streaks-daily` (08:30 UTC, after auto-fill) runs `reset_broken_streaks()` — pure SQL, no edge fn — zeroing streaks with 2+ misses (or 1 with no grace).
- App: streak pill on creator Home greeting (`app/(creator)/(tabs)/index.tsx`), tap toasts next bonus via [`lib/streaks.ts`](lib/streaks.ts) (`fetchMyStreak`, `parseStreakMilestones`, `streakBonusText`). `creator_streaks` types hand-added to `lib/types.ts`.
- Trigger + 7-day milestone payout smoke tested on remote 2026-07-30 (test rows reverted).

## Creator design v2 facts (DSv2)

- Spec is `design_handoff_creator_app/README.md` (every hex/px/duration is contract); screenshots in `design_handoff_creator_app/screenshots/` at 0.58 scale.
- Tokens live in `theme/tokens.ts`; primitives in `components/ui/` (Button, Icon, StatusChip rewrite, EmptyState, TabBar, MediaCard, Wordmark, Skeleton, Segmented, Dropdown, PressableScale); screen parts in `components/creator/`.
- Creator routing is now `app/(creator)/(tabs)/` (index=Home, posts, analytics, profile) inside the headerless Stack; task/[id] and record/[id] stay pushed full screen. Old index/my-posts/settings deleted; `/(creator)` hrefs became `/(creator)/(tabs)` in profile.ts, practice.tsx, admin `_layout`.
- New deps: react-native-svg, expo-blur, lucide-react-native (lucide needed `--legacy-peer-deps`, unrelated react-dom peer conflict).
- Swap uses `swapTaskTrend` + `listTrends` in `lib/tasks-api.ts` (creators can read `trend_items` and update own tasks per RLS). Earnings math in `lib/earnings.ts` ($1.50 CPM, $20 tiers — placeholder model per handoff §9). Analytics aggregates `post_metrics` in `lib/analytics.ts` (views/likes/comments/shares only; no followers/saves columns).
- Known gaps (schema-driven, flagged in handoff §9): no scheduled-time column so pager labels are "Post N"; `trend_items` has no format/tags so Inspiration filter treats all as Reels; no virality field so that sort/chip is omitted; TikTok/IG icons are Lucide stand-ins (music-2, at-sign).

## Operational facts (read before touching infra)

- Supabase project: `zdcmmzofnrdqbwexuqnm`. `.env.local` (gitignored) has `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, Expo public keys, test creds.
- `supabase db push` HANGS. Apply SQL: `POST https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query` with `Bearer $SUPABASE_ACCESS_TOKEN`, then insert the version row into `supabase_migrations.schema_migrations`. Always also write the migration file to `supabase/migrations/`.
- Deploy functions with CLI: `npx supabase functions deploy <name> --project-ref $SUPABASE_PROJECT_REF --use-api`.
- **The Cursor Supabase MCP server points at the WRONG project (`npuhpegvrcwqytsekpag`). Do not use it for writes.** A stray `notify` function deployed there still needs manual deletion from its dashboard.
- Table grants were once wiped (42501 errors). Migration 003 restored defaults. If PostgREST 42501 appears again, check grants first.
- Push notifications: no EAS projectId yet (`npx eas init` pending), so token registration no-ops. Android Expo Go cannot receive push (SDK 53+); needs dev build. `lib/notifications.ts` guards all of this.
- Test accounts (both FieldVision, onboarded): `elan@gmail.com` / `.` (creator, has seeded tasks + upload_post_profile `c_6c0fa294a76a4299b9ac`), `admin@gmail.com` / `.` (admin).
- Typecheck: `npx tsc --noEmit` (Deno functions excluded via tsconfig). Run before finishing any task.
- Third-party keys go in edge function secrets only. Set: `ANTHROPIC_API_KEY`, `APIFY_API_TOKEN`, `DEEPGRAM_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Upload-Post key, `CRON_SECRET` (paired with Vault `cron_secret`). Rotate Stripe keys after WP10 accepts.
- WP8 acceptance run (2026-07-30): brand-ingest wrote FieldVision brand profile; scrape-trends inserted 8 TikTok items (hooks + why_it_works via Claude; Deepgram transcripts came back empty this run — Apify `mediaUrls` were blank even with `shouldDownloadVideos`, so analysis fell back to captions and still produced usable briefs); auto-fill created 6 tasks with `created_by=null` + `inspiration_trend_id` (5 for Noni Test Creator, 1 for Elan after cadence bumped to 5). Open Today as `elan@gmail.com` / `.` and you should see **Solo Training AI Edge**.

## Phase prompts (paste into a fresh agent chat)

Each prompt assumes the agent reads `NONI_SPEC.md` + `BUILD_STATE.md` first. After a phase completes, update the Status table and remaining-work notes, then use the next prompt.

### Prompt — WP3.5 Record v2
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md (law) then BUILD_STATE.md (state + infra gotchas). Rewrite the Record screen (app/(creator)/record/[id].tsx + components/Teleprompter.tsx) as Record v2. Known bug: recording starts before onCameraReady so recordAsync can hang in Expo Go (SDK 54, new arch) and stop does nothing — gate on onCameraReady and add an error failsafe so the user is never stuck. Build: (1) reliable start/stop shutter with recording timer; (2) TikTok-style segments — stop saves a segment, record starts the next, segment pills with durations, delete-last, progress bar (pause = segments; expo-camera cannot pause one clip); (3) between-segment instruction cards from script parts (split on paragraphs or --- markers): "Part 2 of 3 — flip the camera" with camera-flip button; (4) karaoke teleprompter — word-by-word highlight in the accent color, speed control, tap pauses script only, no restart-from-top on pause; (5) flash — rear torch via enableTorch, front = white edge glow + expo-brightness maxed while recording; (6) multi-segment submissions upload all clips and are concatenated server-side at approve time via Upload-Post FFmpeg API (POST /api/ffmpeg, docs.upload-post.com) inside the post-approved edge function — Expo Go cannot run FFmpeg locally; single segment skips stitching. This needs a small migration for segment paths on submissions (apply via Management API per this file, never supabase db push). Keep Expo Go (App Store) compatible, wireframe styling, TS strict, npx tsc --noEmit clean. Accepts when: on a real phone you can record multi-segment takes with flash + karaoke prompter, submit, and approve results in one stitched video posted live. Update BUILD_STATE.md when done (mark WP3.5 and WP6 verified).
```

### Prompt — WP7 Onboarding
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md (law) then BUILD_STATE.md (state + infra gotchas). Build WP7 onboarding exactly per spec section 7: company flow (brand questions writing to brand_profiles + companies.settings, brand-ingest screen may stub the edge call) and creator flow (name/avatar, permissions, connect socials via existing social-connect edge function, teleprompter tutorial, profiles.onboarded=true). Wireframe styling only. Accepts when a fresh admin and fresh creator each finish their flow and land on the right home screen. Typecheck before done, then update BUILD_STATE.md.
```

### Prompt — WP8 UGC brain
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md (law, esp. sections 1, 8, WP8) then BUILD_STATE.md. Build WP8: brand-ingest, scrape-trends (Apify + Deepgram), generate-script (Claude), plus a scheduled auto-fill that turns top trends into assigned tasks in each creator's Today with zero admin action. Swap the onboarding brand study stub (brandIngestStub in lib/onboarding.ts, used by app/(onboarding)/company.tsx step 3) for the real brand-ingest call with the same streamed progress states. Calendar = oversight/override, Generate button = fallback. Trends screen with Turn into task. Keys: ask me for Anthropic, Apify, Deepgram; store as edge secrets only. Accepts when a creator opens Today and finds real AI-generated tasks derived from scraped trends that no admin touched. Typecheck, then update BUILD_STATE.md.
```

### Prompt — WP9 Auto-finish
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md (law, esp. WP9) then BUILD_STATE.md. Extend the post-approved edge function with a background FFmpeg basic pass (trim dead air, normalize audio, conform 1080x1920) before the Upload-Post call. Upload-Post exposes an FFmpeg API (POST /api/ffmpeg, docs.upload-post.com) — prefer it over self-hosting. Accepts when tapping Approve alone results in an edited video live on the creator's linked account with a posts row, zero further human steps. Typecheck, then update BUILD_STATE.md.
```

### Prompt — WP4.5 Review thread
```
DONE — see WP4.5 Review thread facts above.
```

### Prompt — WP10 Money (attribution + wallets)
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md (law, esp. WP10 schema + edge fns) then BUILD_STATE.md. Build: attribution_links per task + stripe-webhook → revenue_events; migration for creator_wallets / wallet_ledger / payouts; stripe-connect + creator-payout edge fns (FieldVision Stripe + Connect Express); creator Balance screen (available/pending/history/Cash out). Do NOT credit bounties here — WP11 poll-metrics owns that. Ask for STRIPE_SECRET_KEY + webhook secret. Accepts per spec. Typecheck, then update BUILD_STATE.md.
```

### Prompt — WP11 Metrics + auto bounty
```
DONE — see WP11 Metrics facts above.
```

### Prompt — Phase F Ship
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md then BUILD_STATE.md. Phase F: run npx eas init (ask me to log in), EAS build, TestFlight submit, honest permission strings, app icon + splash. Also: re-verify push notifications now that an EAS projectId exists (BUILD_STATE.md gotchas). Update BUILD_STATE.md when shipped.
```
