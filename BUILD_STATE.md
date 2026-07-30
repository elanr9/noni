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
| WP4.5 | Review thread (convo until approve) | NOT STARTED |
| WP5 | Notifications (`notify` fn + push registration) | DONE, see gotchas |
| WP3.5 | Record v2 (segments, karaoke prompter, flash) | DONE (code verified, typecheck clean; run the phone checklist below) |
| WP6 | Posting via Upload-Post (per-creator accounts) | DONE incl. approve-time stitching (live post needs the phone checklist below) |
| WP7 | Onboarding flows | DONE (code verified, typecheck clean; run the phone checklist below) |
| WP8 | UGC brain (scrape → Claude → auto-fill Today) | DONE (acceptance verified 2026-07-30: Elan Today has AI task from scraped trend, created_by null) |
| WP9 | Auto-finish (FFmpeg edit on approve → post → track) | DONE (code + deployed; phone verify: Approve → edited live post + posts row) |
| WP10 | Money: attribution + creator wallets (Stripe Connect cash out) | NOT STARTED |
| WP11 | Metrics + Analytics + auto bounty credit on view threshold | NOT STARTED |
| F | EAS build, TestFlight | NOT STARTED |

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
- Bounty numbers are display-only until WP10/WP11, centralized in [`lib/bounty.ts`](lib/bounty.ts) (`BOUNTY_AMOUNT_USD=20`, `BOUNTY_VIEW_THRESHOLD=5000`). WP10 moves defaults into `companies.settings`; WP11 auto-credits wallets when polled views cross the threshold.
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
- Client entry points: `lib/tasks-api.ts` `transitionTask` fires `notify`; `lib/admin-api.ts` `reviewTask` fires `notify` + awaits `post-approved` on approve.

## Operational facts (read before touching infra)

- Supabase project: `zdcmmzofnrdqbwexuqnm`. `.env.local` (gitignored) has `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, Expo public keys, test creds.
- `supabase db push` HANGS. Apply SQL: `POST https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query` with `Bearer $SUPABASE_ACCESS_TOKEN`, then insert the version row into `supabase_migrations.schema_migrations`. Always also write the migration file to `supabase/migrations/`.
- Deploy functions with CLI: `npx supabase functions deploy <name> --project-ref $SUPABASE_PROJECT_REF --use-api`.
- **The Cursor Supabase MCP server points at the WRONG project (`npuhpegvrcwqytsekpag`). Do not use it for writes.** A stray `notify` function deployed there still needs manual deletion from its dashboard.
- Table grants were once wiped (42501 errors). Migration 003 restored defaults. If PostgREST 42501 appears again, check grants first.
- Push notifications: no EAS projectId yet (`npx eas init` pending), so token registration no-ops. Android Expo Go cannot receive push (SDK 53+); needs dev build. `lib/notifications.ts` guards all of this.
- Test accounts (both FieldVision, onboarded): `elan@gmail.com` / `.` (creator, has seeded tasks + upload_post_profile `c_6c0fa294a76a4299b9ac`), `admin@gmail.com` / `.` (admin).
- Typecheck: `npx tsc --noEmit` (Deno functions excluded via tsconfig). Run before finishing any task.
- Third-party keys go in edge function secrets only. WP8 keys set: `ANTHROPIC_API_KEY`, `APIFY_API_TOKEN`, `DEEPGRAM_API_KEY`. Still needed later: Stripe (WP10). Upload-Post key is set (was pasted in chat; rotate eventually). `CRON_SECRET` is set (paired with Vault `cron_secret`).
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
Repo: /Users/elanromo/noni. Read NONI_SPEC.md (law, esp. WP4.5 + review_events) then BUILD_STATE.md. Build the feedback convo: migrate review_events.reviewer_id → author_id; RLS so creators insert action=comment on own submissions; shared thread UI on admin Review + creator Task Detail (all events across the task's submissions); comment composer both sides (no status flip); Request Changes still requires note; notify on comment. Accepts per spec. Typecheck, then update BUILD_STATE.md.
```

### Prompt — WP10 Money (attribution + wallets)
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md (law, esp. WP10 schema + edge fns) then BUILD_STATE.md. Build: attribution_links per task + stripe-webhook → revenue_events; migration for creator_wallets / wallet_ledger / payouts; stripe-connect + creator-payout edge fns (FieldVision Stripe + Connect Express); creator Balance screen (available/pending/history/Cash out). Do NOT credit bounties here — WP11 poll-metrics owns that. Ask for STRIPE_SECRET_KEY + webhook secret. Accepts per spec. Typecheck, then update BUILD_STATE.md.
```

### Prompt — WP11 Metrics + auto bounty
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md (law, esp. WP11) then BUILD_STATE.md. Build poll-metrics daily cron (Upload-Post analytics → post_metrics); on each write, if views ≥ company bounty_view_threshold and no wallet_ledger bounty_credit for that post, credit creator_wallets once; admin Analytics screen (views, revenue, per-creator, best hooks, bounty credits). Accepts per spec. Typecheck, then update BUILD_STATE.md.
```

### Prompt — Phase F Ship
```
Repo: /Users/elanromo/noni. Read NONI_SPEC.md then BUILD_STATE.md. Phase F: run npx eas init (ask me to log in), EAS build, TestFlight submit, honest permission strings, app icon + splash. Also: re-verify push notifications now that an EAS projectId exists (BUILD_STATE.md gotchas). Update BUILD_STATE.md when shipped.
```
