# Noni — Technical Disclosure for Provisional Patent Filing

Prepared from a read of the repository at commit `6dde44d` (branch `main`). Every mechanism cited below carries a file path and, where useful, a function name. Where the repo contains more than one implementation of the same idea (legacy path, dormant module, feature-flagged branch), both are described and the live one is marked.

Terminology note used throughout: **"live"** means code reachable from a deployed edge function or a screen in the shipped Expo app. **"dormant"** means the module exists and compiles but nothing imports it into a runtime path.

---

## 1. System overview

Noni is a multi-tenant system for running a roster of human creators as a paid short-form-video distribution channel for a single brand. A company ("tenant") is onboarded by ingesting its website, its GitHub repository, its product screenshots, and its social handles into a structured "brand brain" (four markdown documents plus an approved product-claim library). A scraper continuously builds two separate corpora of real TikTok/Instagram posts — one taken from accounts chosen because they teach *structure* and one from accounts chosen because they teach the *audience's* language — and mines those corpora for candidate claims, audience vocabulary, and format classifications. A campaign manager builds a week of posts: each post row is stamped with a post type and a search phrase, then filled by an LLM generation call that is constrained by a fixed JSON key order, a deterministic validator, and a three-tier review scorer. Published weeks are laid out per creator with a seeded deterministic shuffle. Creators record each post as a sequence of separate camera clips against a per-clip teleprompter/beat prompter, the clips are stitched and overlaid server-side into a single 9:16 file, and approved posts are pushed to TikTok and Instagram through a third-party publishing API. Metrics are polled back daily, view milestones fire notifications, and a prepaid credit ledger pays creators per-view bounties and streak bonuses through Stripe Connect.

Top-level architecture. The client is a single React Native / Expo (SDK 54, New Architecture) application with three role-scoped route groups — `app/(creator)`, `app/(admin)` (the campaign manager app), and `app/(onboarding)` — plus `app/platform-admin.tsx` and `app/company-admin.tsx`. There is no separate backend server: the backend is Supabase (Postgres 17 with row-level security, Storage, Auth, Realtime) plus 29 Deno edge functions under `supabase/functions/`. Background work is scheduled by `pg_cron` jobs that `net.http_post` into those edge functions with an `x-cron-secret` header (see `supabase/migrations/20260730060000_008_wp8_cron.sql`); there is no worker queue. Shared server logic lives in `supabase/functions/_shared/`. Third-party services, all called over plain `fetch` with no vendor SDK except Stripe: Anthropic Claude (text + vision), OpenAI (one cheap rewrite path), Apify (TikTok/Instagram scraping actors), Deepgram (speech-to-text fallback), Upload-Post (FFmpeg-as-a-service and multi-platform publishing), Creatomate (overlay rendering), Replicate (Robust Video Matting for person cutout), Expo Push, Stripe (Checkout, Connect, Transfers), Resend (invite email), GitHub REST API. A second Supabase project ("FieldVision", the first tenant's own product database) is read read-only for conversion attribution.

---

## 2. Tech stack inventory

Versions are taken from `package.json`, `app.json`, `supabase/config.toml`, and the `npm:` specifiers in the edge functions.

### Client (iOS/Android/web, single codebase)

| Thing | Version | Notes |
|---|---|---|
| TypeScript | `~5.9.2` | strict-ish; `tsconfig.json` |
| React | `19.1.0` | |
| React Native | `0.81.5` | `newArchEnabled: true` in `app.json` |
| Expo SDK | `~54.0.0` | `AGENTS.md` points at the v57 docs; the installed SDK is 54 |
| expo-router | `~6.0.24` | typed routes enabled (`app.json` → `experiments.typedRoutes`) |
| @supabase/supabase-js | `^2.111.0` | configured in `lib/supabase.ts` |
| expo-camera | `~17.0.10` | `CameraView.recordAsync` is the capture primitive |
| expo-video | `~3.0.16` | playback + `createVideoPlayer` used as a duration prober |
| expo-video-thumbnails | `~10.0.8` | first-frame thumbnails between takes |
| expo-av | `~16.0.8` | present as a dependency |
| expo-image-picker / expo-media-library / expo-image-manipulator | `~17.0.11` / `~18.2.1` / `~14.0.8` | screen-recording upload, slideshow photo pick, template avatar save |
| expo-brightness | `~14.0.8` | front-camera "flash" by driving screen brightness to 1.0 |
| expo-notifications | `~0.32.17` | Expo push token registration and tap routing |
| expo-auth-session, expo-web-browser, expo-linking, expo-crypto, expo-constants, expo-device, expo-file-system, expo-font, expo-clipboard, expo-blur, expo-status-bar | see `package.json` | |
| @expo-google-fonts/tiktok-sans | `^0.4.3` | TikTok Sans is used in the overlay editor preview so the on-device preview matches the burned-in render |
| react-native-svg | `15.12.1` | charts |
| lucide-react-native | `^1.28.0` | icon set |
| react-native-safe-area-context / screens / web / url-polyfill | see `package.json` | |
| @react-native-async-storage/async-storage | `2.2.0` | Supabase auth session storage |
| vitest | `^4.1.10` | the only test runner; one test file exists (`supabase/functions/_shared/shuffle.test.ts`) |
| eslint / eslint-config-expo | `^9.0.0` / `~10.0.0` | |
| EAS Build | `eas.json`, cli `>= 18.8.1` | iOS `ascAppId 6799189794`, bundle id `com.fieldvision.noni`, Android `ai.noni.app` |

### Backend

| Thing | Version / detail |
|---|---|
| Supabase Postgres | `major_version = 17` (`supabase/config.toml`) |
| Extensions | `pgcrypto`, `pg_cron`, `pg_net`, Supabase Vault (cron secret storage) |
| Edge runtime | Deno 2 (`supabase/config.toml` → `[edge_runtime] deno_version = 2`) |
| Edge deps | `npm:@supabase/supabase-js@2`, `npm:stripe@17` — that is the entire dependency list |
| Storage buckets | `videos` (500 MB cap, mp4/quicktime + images added in migration 034), `avatars`, `brief-assets` (10 MB, images), `account-verification` (100 MB, video+image), `feature-screenshots` (10 MB, images), `product-features` (referenced from `lib/briefs-api.ts` `listNoniLibrary`, not created in this repo's migrations) |
| Realtime | enabled; `assignments` added to the publication in migration 065 |
| RLS | on every table; helper functions `current_company_id()`, `current_role()`, `is_admin()`, `is_campaign_manager()`, `is_company_admin()`, `is_platform_admin()`, `has_permission()` |

### Third-party services (all called via `fetch` unless noted)

| Service | Where | Auth env var |
|---|---|---|
| Anthropic Messages API | `supabase/functions/_shared/wp8.ts` → `askClaude`, `askClaudeVision` | `ANTHROPIC_API_KEY`, model from `ANTHROPIC_MODEL`, default `claude-sonnet-4-5` |
| OpenAI Chat Completions | `wp8.ts` → `askOpenAI` | `OPENAI_API_KEY`, model from `OPENAI_MODEL`, default `gpt-4o-mini` |
| Apify | `scrape-trends/index.ts` → `apifyRun`; `ingest-brief/index.ts`; `brand-ingest/index.ts` | `APIFY_API_TOKEN` |
| Deepgram | `scrape-trends`, `ingest-brief` → `transcribe` (`model=nova-3&smart_format=true`) | `DEEPGRAM_API_KEY` |
| Upload-Post | `_shared/assemble.ts` (FFmpeg jobs), `post-approved/index.ts` (publish + status), `poll-metrics/index.ts` (analytics), `social-connect/index.ts` (profiles, JWT connect URL) | `UPLOAD_POST_API_KEY` |
| Creatomate | `_shared/renderAdapter.ts` | `CREATOMATE_API_KEY` |
| Replicate | `_shared/backgroundRemoval.ts` (Robust Video Matting, pinned version `2d2de06a…`) | `REPLICATE_API_TOKEN` |
| Stripe | `npm:stripe@17` in `company-billing`, `stripe-connect`, `creator-payout`, `weekly-payouts`, `stripe-webhook` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Expo Push | `_shared/push.ts` → `sendExpoPush` (`https://exp.host/--/api/v2/push/send`) | none |
| GitHub REST | `ingest-codebase/index.ts` → `githubGet`, `fetchFileText` | `GITHUB_TOKEN` |
| Resend | `ops-create-company/index.ts`, `invite-campaign-manager/index.ts` | `RESEND_API_KEY`, `INVITE_FROM_EMAIL` |
| FieldVision Postgres (PostgREST) | `sync-conversions/index.ts` → `fvRows` | `FIELDVISION_URL`, `FIELDVISION_SERVICE_KEY`, `FIELDVISION_COMPANY_ID` |
| TikTok oEmbed | `library-link/index.ts` → `tiktokOembed` | none (public endpoint) |

Other env: `CRON_SECRET`, `SATURATION_FULL_SHARE`, `APP_DEEP_LINK`, `APP_ADMIN_BILLING_DEEP_LINK`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Notably absent: no vector database, no embedding model, no LangChain-style framework, no queue (Redis/SQS), no separate web server, no ffmpeg binary in-repo (FFmpeg runs as a remote job).

---

## 3. Data model

Every table is company-scoped (`company_id`) unless noted, and every table has RLS enabled. Tables are grouped by the flow they serve. Flow flags: **[GEN]** generation, **[SCORE]** scoring/review, **[SCHED]** scheduling, **[ATTR]** attribution/metrics/money.

### 3.1 Tenancy, identity, permissions

| Table | Purpose | Key columns |
|---|---|---|
| `companies` | The tenant. | `id`, `name`, `slug` (unique), `website`, `settings` jsonb, `payouts_enabled` (mig 047). `settings` is a grab-bag holding `handles.{instagram,tiktok}`, `vertical`, `ugc_reference_handles[]`, `cadence_per_week`, `timezone`, `bounty_amount_cents`, `bounty_view_threshold`, `streak_milestones[]`, and `account_template` (see `lib/account-template.ts`). |
| `profiles` | One row per auth user, created by the `handle_new_user` trigger (mig 033_creator_journey, later revised). | `id` = `auth.users.id`, `company_id`, `role` (`admin` \| `creator` \| `campaign_manager` \| `company_admin`), `full_name`, `avatar_path`, `expo_push_token`, `onboarded`, `can_create` (dual-role admin who also records), `credential_line`, `bio_facts` jsonb, `script_mode` (`beats`\|`full`), `available`, `birthday`, `phone`, `onboarding_answers` jsonb, plus six capability-gate booleans (`has_credential`, `has_scar_tissue`, `has_transformation`, `can_film_with_second_person`, `lives_the_identity`, `on_camera_comfortable`) and `baseline_primary_signal` / `baseline_updated_at` from mig 015. The capability gates and baselines are written nowhere in the live code. |
| `company_members` | Per-manager permission flags. | `permissions` jsonb; mirrored server-side by `hasPermission()` in `_shared/wp8.ts`. |
| `company_invites` | Invite-only signup tokens. | consumed by `claim_pending_invite()` (mig 061) and `invite-campaign-manager`. |

### 3.2 Brand brain **[GEN]**

| Table | Purpose | Key columns |
|---|---|---|
| `brand_profiles` | Legacy structured brand fields plus generation-critical banks. | `tone`, `audience`, `products` jsonb, `content_pillars` jsonb, `buying_path`, `source_urls[]`, `sourcing` jsonb (holds `terms[]` = `{term, kind, keepers, scrapes}` — the search-term memory), `hashtag_bank text[]`, `banned_phrases text[]`, `product_type` (`software`\|`physical`, steers the claim-extraction prompt). |
| `brand_docs` | The four-document brain. Unique on `(company_id, kind)`. | `kind` ∈ `product_truth`, `audience_niche`, `voice`, `learnings`; `content` markdown; `human_edited` boolean — a human-edited doc is never overwritten by the AI drafter. `learnings` is machine-owned and append-only. |
| `product_features` | **The approved claim library actually used in generation.** | `name`, `what_it_does` (mechanism), `claim` (spoken line), `surface`, `source` ∈ `repo`\|`manual`\|`site`\|`screenshot`, `source_ref` (never null — hard gate), `approved`, `rejected`. |
| `search_queries` | The search-phrase bank. **[SCHED][GEN]** | `query`, `source` ∈ `manual`\|`autocomplete`\|`comments`, `season_start/end`, `used_count`, `last_used_at`. |

### 3.3 Scrape corpora **[GEN][SCORE]**

| Table | Purpose | Key columns |
|---|---|---|
| `source_accounts` | The account universe to scrape. Unique `(company_id, platform, handle)`. | `platform`, `handle`, `corpus` ∈ `format_donor`\|`niche` (the two-corpus split), `status` ∈ `active`\|`probation`\|`muted`, `last_scraped_at`, `scraped_count`, `keeper_count`, `keeper_rate` (generated stored column = keepers/scrapes), legacy `kind`. |
| `trend_items` | One scraped post. The single largest table by column count. | `platform`, `source_url`, `author_handle`, `views/likes/comments/shares`, `transcript`, `caption`, `cover_url`, `format` (`video`\|`carousel`), `image_urls` jsonb, `slide_texts` jsonb, `source_kind` (`handle`\|`search`), `content_fingerprint` (near-dup key), `low_signal` bool, `hook`, `why_it_works`, `relevance_score` int, `relevance_reason`, `remake_mode` (`beat_for_beat`\|`structure_only`), `remake_reason`, `remake_mode_overridden`, `format_id` → `formats`, `slot_fills` jsonb, `classify_confidence`, `classify_reason`, `topic` (saturation key), `cta_keyword_count`, `label` (`keep`\|`kill`), `label_reason`, `labeled_by`, `is_golden`. |
| `ocr_cache` | Content-hash OCR cache. PK `(company_id, image_hash)`. Service-role only, no RLS policies. | `image_hash` (SHA-256 of image bytes), `slide_text`. |
| `claims` | Mined candidate claims. | `claim`, `proof`, `audience_segment`, `contradicts`, `saturation_score` int 0–10 **nullable** (null = not enough corpus), `source` ∈ `onboarding`\|`harvested`\|`admin`, `status` ∈ `candidate`\|`active`\|`retired`, `confidence`, `calendar_event_id`, `last_used_at`. |
| `vocabulary` | Verbatim audience phrases. Unique `(company_id, phrase)`. | `phrase`, `source`. |
| `formats` | **Not tenant-scoped.** The twelve-format universal library seeded from `_shared/formats-seed.ts`. | `id` text PK (e.g. `two_hander_comparison`), `family` (`video`\|`slideshow`\|`either`), `when_to_use`, `why_it_works`, `slot_schema` jsonb (ordered `{key,label,required,rules,min,max}`), `kill_rules text[]`, `beat_timing`, `target_length_min/max_sec`, `slide_count_min/max`, `requires text[]`, `cta_keyword_policy`, `primary_signal` ∈ `keyword_comments`\|`saves_per_reach`\|`shares`\|`completion`\|`comment_velocity`, `bible_version`. |
| `format_examples` | Per-tenant slot-fill exemplars harvested from donor posts. | `format_id`, `slot_key`, `example`, `source` ∈ `seed`\|`harvested`\|`admin`. |
| `banned_claims`, `ban_list` | Tenant-level hard rejects. | `claim` / `phrase`. Neither is read by live code; the live ban list is `brand_profiles.banned_phrases`. |
| `content_templates`, `hook_bank` | Reusable skeletons and hook patterns (mig 014, extended mig 015). | Not read or written by live code. |

### 3.4 Authoring and scheduling **[GEN][SCHED]**

| Table | Purpose | Key columns |
|---|---|---|
| `post_types` | The eight tenant-scoped authoring types. Seeded per company by `seed_company_post_types()` / `companies_seed_post_types` trigger (mig 063). Unique `(company_id, key)`. | `key` ∈ `numbered_list`, `talking_head`, `explainer`, `contrast`, `replay_bait`, `numbered_tips`, `how_to`, `getting_started`; `family` (`video`\|`photo_carousel`); `min_points`/`max_points`; `clip_structure` ∈ `hook_points_outro`\|`single_clip`\|`slide_per_point`; `requires_plug`, `requires_credential` (both false only on `replay_bait`); `target_words_min/max` (nullable = no length check); `default_week_count` (the ratio weight); `sort_order`. |
| `briefs` | The reusable creative unit — one post's content. | `format`, `title`, `hook`, `hook_options` jsonb (8–10 scored variants), `talking_points` jsonb (`{id,text,is_product,edited_by_admin,claim_id}`), `cta` (the one plug sentence), `caption`, `hashtags text[]`, `search_phrase`, `point_count`, `target_words` (default 380), `script` (carousel slide copy), `post_type_id`, `example_url`, `example_transcript`, `why_it_works`, `kill_reason`, `generation_id` (joins to `brief_validations`), `reviewed_at`, `review_result` jsonb, `text_overlay` jsonb (`{enabled,mode,text_color,accent_color}`), `archived_at`. |
| `brief_segments` | **The render manifest.** One row per clip or slide. Unique `(brief_id, slot_index)` DEFERRABLE INITIALLY DEFERRED so re-derivation can shift indices in one transaction. | `slot_index`, `kind` ∈ `hook`\|`point`\|`outro`\|`slide`, `talking_point_index`, `overlay_text`, `show_on_screen`, `text_y` (0–1), `screenshot_url` (path in `brief-assets`), `screenshot_x`/`_y`/`_width` (normalized 0–1), `layout` ∈ `standard`\|`green_screen`, `overlay_style` jsonb (`{color, bg}`). |
| `campaigns` | **The campaign IS the week.** | `name`, `drop_date`, `status` (`draft`\|`published`), `published_at`, `notify_at`, `notified_at`, `video_target`, `slideshow_target`, `type_split` jsonb (post_type key → count), plus legacy `goal`/`starts_on`/`ends_on`. |
| `campaign_briefs` | Join table; the unassigned remainder is the creator swap pool. PK `(campaign_id, brief_id)`. | `pinned_day` 0–6 (retired: `publish-campaign` forces null), `position`. |
| `assignments` | creator × brief × date. Owns production status and money. | `campaign_id`, `brief_id`, `creator_id`, `scheduled_date`, `slot_index`, `status` ∈ `assigned`\|`recorded`\|`submitted`\|`changes_requested`\|`approved`\|`posted`, `submission_id`, `post_url`, `metrics` jsonb, `bounty_credited_at`, `bounty_amount_cents`, `music_marked_by_creator_at`, `music_approved_at`, `music_approved_by`, `task_id` (provenance from the legacy path). Unique `(campaign_id, creator_id, brief_id)` = publish idempotency. |
| `content_tasks` | **Legacy** unit, superseded by `briefs`+`assignments` but still live for the `auto-fill` path. | Two-phase status: `planning_status` ∈ `draft`\|`in_review`\|`approved`\|`rejected`\|`scheduled` and production `status` (nullable), joined by the `content_tasks_release_gate` CHECK (`status is null or planning_status = 'scheduled'`). Also carries the full post-object columns from mig 015 (`format_id`, `claim_id`, `search_phrase`, `hook_variants`, `slot_fills`, `slides`, `pinned_comment`, `audio_direction`, `shot_list`, `image_direction`, `plug`, `cta_keyword`, `target_length_sec`, `kill_reason`, `filter_flags`), `original_draft` jsonb, `generation_meta` jsonb, `feedback` smallint. |
| `weekly_batches`, `format_stats`, `revenue_daily`, `calendar_events`, `task_comments` | Planned learning-loop / planning-cycle tables from mig 015. | None are read or written by live code. |
| `brief_templates`, `brain_features`, `feature_screenshots` | Present in the generated types (`lib/types.ts`) and read by `listNoniLibrary()` in `lib/briefs-api.ts`, but **created by no migration in this repo**. |

### 3.5 Production and publishing

| Table | Purpose | Key columns |
|---|---|---|
| `recording_drafts` | Per-clip resume state during a shoot. Unique on `assignment_id`. | `segments` jsonb = `[{slot_index, kind, storage_path, duration_ms}]`. |
| `submissions` | One recording attempt. | `task_id` or `assignment_id`, `creator_id`, `video_path`, `segment_paths text[]`, `duration_seconds`, `version`, `render_status` ∈ `queued`\|`rendering`\|`ready`\|`failed`, `render_error`, `render_timeline` jsonb (the Noni-owned timeline object). |
| `submission_segments` | Per-clip state so an admin can reject clip 4 alone. | `submission_id`, `brief_segment_id`, `slot_index`, `storage_path`, `duration_ms` (captured at submit time because overlay timing is absolute), `status` ∈ `submitted`\|`approved`\|`rejected`, `attempt`. |
| `review_events` | Submission review thread. | `submission_id`, `author_id`/`reviewer_id`, `action` ∈ `approved`\|`changes_requested`\|`comment`, `note`, `segment_id`. |
| `brief_review_events` **[SCORE]** | The AI-review override log, deliberately separate from `review_events`. | `brief_id`, `event` ∈ `override`\|`edit`\|`confirm`, `check_id`, `tier`, `diff` jsonb. Indexed on `(company_id, check_id)` so a check overridden repeatedly is visible as a bad check. |
| `brief_validations` **[SCORE]** | One row per deterministic validation attempt at generation time. | `generation_id` (durable join key; `brief_id` is null at generation time), `attempt`, `passed`, `failures` jsonb, `warnings` jsonb. |
| `posts` **[ATTR]** | One row **per platform** per publish. | `task_id`/`assignment_id`, `submission_id`, `platform`, `provider_post_id` (Upload-Post request id), `post_url`, `status`, `posted_at`, `milestones_fired int[]`. |
| `post_metrics` **[ATTR]** | Append-only metric snapshots. | `post_id`, `views`, `likes`, `comments`, `shares`, `saves`, `profile_clicks`, `link_clicks`, `keyword_comment_count`, `completion_rate`, `fetched_at`. Only the first six are written. |
| `creator_accounts` | The warm-up / account-approval gate. Unique `(company_id, creator_id)`. | `status` ∈ `pending`\|`needs_changes`\|`approved`, `tiktok_handle`, `instagram_handle`, `tiktok_recording_path`, `instagram_recording_path`, `tiktok_screenshot_path`, `instagram_screenshot_path`, `reason`, `decision` jsonb (four structured booleans), `decided_by`, `decided_at`. |
| `library_items` | Idea/reference/our-post/creator-submission library. | `source` ∈ `idea`\|`our_post`\|`reference`\|`from_creator`, `text`, `url`, `thumbnail_url`, `post_type_id`, `post_id`, `used_count`, `last_used_at`. |
| `messages`, `manager_chats`, `manager_messages`, `manager_message_reactions`, `manager_chat_reads` | Creator↔admin thread (one per creator) and the manager-side group/DM chats (mig 064). | `manager_chats.kind` ∈ `brief` (keyed to a campaign) \| `dm` (ordered `user_a < user_b`), enforced by a CHECK plus two partial unique indexes. |

### 3.6 Money and attribution **[ATTR]**

| Table | Purpose | Key columns |
|---|---|---|
| `company_billing` | Prepaid balance and budget. PK `company_id`. | `stripe_customer_id`, `stripe_payment_method_id`, `bank_last4`, `bank_name`, `payouts_enabled`, `credit_balance_cents` (>= 0 CHECK), `weekly_budget_cents`, `monthly_budget_cents`. |
| `company_credit_ledger` | Every credit movement. | `kind` ∈ `topup`\|`bounty_debit`\|`streak_debit`\|`adjustment`\|`fee_company`, `amount_cents`, `gross_cents`, `fee_cents`, `assignment_id`, `stripe_checkout_session_id` **unique** (Stripe idempotency key). Partial unique index on `(assignment_id, kind)` for the two debit kinds = earning idempotency. |
| `creator_wallets` | Per-creator balance. | `available_cents`, `pending_cents`, `stripe_connect_account_id`. |
| `wallet_ledger` | Creator-side ledger. | `kind` ∈ `bounty_credit`\|`streak_bonus`\|`payout_hold`\|`payout_paid`\|`payout_failed`\|`adjustment`, `amount_cents`, `post_id`, `payout_id`, `note`. |
| `payouts`, `company_payout_runs` | Stripe Transfers and the Sunday batch claim. | `company_payout_runs` unique `(company_id, period_end)` is the run-claim lock. |
| `creator_streaks` | Consecutive complete scheduled days. | `current_streak`, `longest_streak`, `last_counted_date`, `grace_used_on`. |
| `creator_reminders` | Push-claim table. Unique `(company_id, creator_id, kind, sent_on)`. | `kind` ∈ `due_today`\|`overdue`. |
| `attribution_links` | Per-creator referral codes. | `code` **globally unique**, `creator_id`, `task_id`, `assignment_id`, `url`. |
| `revenue_events` | Stripe checkout attribution. | `attribution_link_id`, `stripe_event_id` **unique**, `amount_cents`, `occurred_at`. |
| `conversion_daily` | Aggregated conversions from the tenant's own product DB. Unique `(company_id, day, creator_id)`; `creator_id` null = company-wide row. | `new_accounts`, `free_trials`, `sales_count`, `sales_cents`, `synced_at`. |

### 3.7 Notable relationships

- A post exists twice: as a **brief** (reusable creative) and as N **assignments** (creator × date). One brief fans out to every approved creator in a week.
- `brief_segments` (what gets recorded and rendered) is deliberately separate from `briefs.talking_points` (what the creator says). The renderer and the record screen read segments; neither touches `talking_points`.
- `posts` is per-platform, `assignments` is per-post. That is why music approval and bounty state live on `assignments`, not `posts` (documented in mig 027).
- Two parallel production lineages exist end to end: `content_tasks → submissions(task_id) → posts(task_id)` (legacy, still served by `auto-fill`, `generate-script`, and fallbacks in `post-approved`/`poll-metrics`), and `campaigns → campaign_briefs → briefs → assignments → submissions(assignment_id) → posts(assignment_id)` (**live**). `assignments.task_id` records the migration provenance.

---

## 4. End-to-end flows

### 4a. Company onboarding and brain ingestion

Entry points: the admin Setup tab (`app/(admin)/(tabs)/setup.tsx`), `lib/onboarding.ts` → `runBrandIngest()`, and a monthly cron. All server work is in `supabase/functions/brand-ingest/index.ts`.

1. **Company creation.** `supabase/functions/ops-create-company/index.ts` (platform admin only) creates the `companies` row, derives a unique slug via `slugify()` + `uniqueSlug()` (probes up to 50 candidates), and optionally emails a company-admin invite through Resend (`sendAdminInviteEmail`). A trigger (`companies_seed_post_types`, mig 063) seeds the eight `post_types` rows for the new company.
2. **Source gathering.** `brand-ingest` → `gatherSources()` reads `companies.name/website/settings.handles`, then runs two fetches in parallel:
   - `crawlSite(website)` in `supabase/functions/_shared/crawlSite.ts`: fetches the homepage, regex-extracts `href="..."`, keeps same-hostname non-asset paths, ranks them by whether the path contains one of `about, product, pricing, feature, how, faq, team, mission, why` and then by path length, fetches up to 5 sub-pages, strips HTML with a regex chain (`stripHtml`), and caps at 6 000 chars/page and 20 000 chars total. Custom code, not a library.
   - `fetchRecentCaptions(tiktokHandle)`: one Apify `clockworks~tiktok-scraper` profile call, `resultsPerPage: 6`, 60 s timeout, returns up to 6 caption strings. Skipped on the interactive "Draft with AI" path (`skipCaptions: true`) because the Apify sync run alone regularly burns 60 s and the admin button budget is ~15 s.
3. **Structured profile fields.** `generateProfileFields()` sends the assembled `sourceLines()` block to Claude and expects `{tone, audience, products, pillars[]}`. Written to `brand_profiles`.
4. **Hashtag bank seeding.** `hashtagsFromCaptions()` counts `#tag` occurrences across the scraped captions with a Unicode-aware regex (`/#[\p{L}\p{N}_]+/gu`), sorts by frequency, keeps the top 10. Written **only when the bank is empty**, so an admin-edited bank is never clobbered.
5. **Document drafting.** `draftDocs()` asks Claude for a single JSON object keyed by the requested doc kinds (`product_truth`, `audience_niche`, `voice`), each value a full markdown document, with a per-kind spec string from `DOC_SPECS`. The set of draftable kinds is computed by a three-way rule in `ingestCompany()`: skip if `brand_docs.human_edited` is true; if the caller named specific docs, draft exactly those; otherwise draft only the empty ones.
6. **Cleanup path.** `action: 'cleanup_doc'` routes to `cleanupDoc()`, which is the **only** OpenAI call in the system (`askOpenAI`, `gpt-4o-mini`, temperature 0.3): it rewrites an admin's own draft into tighter markdown and returns raw markdown, not JSON.
7. **Monthly refresh.** The cron path (`refreshLearnings()`, `0 5 1 * *`) re-crawls, diffs against the current `product_truth` doc, asks Claude for `{findings: string[]}` (0–5 items, empty array if nothing changed), and **appends** a dated `## Site refresh YYYY-MM-DD` section to the machine-owned `learnings` doc. It never touches the three human docs.
8. **Socials → source accounts.** `companies.settings.ugc_reference_handles` are upserted as permanent `source_accounts` rows in the `niche` corpus by `seedSourceAccounts()` in `scrape-trends/index.ts` (assumed TikTok).
9. **Product type.** `brand_profiles.product_type` (`software`\|`physical`) must be set before the first feature ingest; it selects between two entirely different extraction prompts (§5, §6).

### 4b. Feature discovery from a codebase (`ingest-codebase`)

`supabase/functions/ingest-codebase/index.ts`. Campaign-manager auth, `company_id` must equal the caller's.

1. **URL parsing.** `parseGitHubRepoUrl()` accepts only `github.com` / `www.github.com` with exactly two path segments matching `/^[A-Za-z0-9_.-]+$/`, strips a trailing `.git`. Anything else is a 400.
2. **Tree fetch.** `githubGet('/repos/{owner}/{repo}')` for the default branch, then `git/trees/{branch}?recursive=1`. The API's `truncated` flag is surfaced in the response.
3. **File selection — custom heuristic, `shouldKeepPath()`.** Hard excludes: `node_modules/`, `.git|.next|dist|build|coverage|vendor` directories, lockfiles, `migrations/` and `supabase/migrations/`, test/spec/mock directories and `*.test.*`/`*.spec.*` files, and anything not `.tsx?|.jsx?|.mdx?|.md`. Then an *allow-list* of user-facing surfaces: any `.md(x)`, anything under `docs/`, anything under `app/|pages/|src/app/|src/pages/`, `routes?/|screens?/`, `api/|handlers?/`, files named `route|page|layout|loading.[jt]sx?`, and components whose path matches `components?/.*(screen|page|route)`. Files over 100 KB are dropped both by the tree `size` field and after fetch.
4. **Chunking.** `chunkFiles()` packs files greedily into ≤ 80 000-character chunks, cost = `path.length + content.length + 32`.
5. **Extraction.** One Claude call per chunk (`extractChunk`, `EXTRACT_SYSTEM`, `max_tokens: 4096`), files delimited with `--- FILE: {path} ---`. Returns a JSON array of `{name, what_it_does, surface, claim, source_ref}`.
6. **Sanitisation.** `sanitizeFeature()` drops any item missing `name`, `what_it_does`, `claim`, or `source_ref`. `source_ref` is a hard gate — a claim that cannot be traced to a file is discarded.
7. **Cross-chunk merge.** `mergeFeatures()` sends the whole extracted array back to Claude with `MERGE_SYSTEM`, which deduplicates by capability and requires that merged `source_ref` paths be joined with `", "` and never dropped. If the merge call returns a non-array or an empty cleaned set, the code falls back to `localDedupe()`, a deterministic normalized-name merge that unions `source_ref` paths and keeps the first non-null `surface`.
8. **Idempotent insert.** Existing `product_features.name` values are lowercased into a Set (`loadExistingNames`); novel rows insert with `source: 'repo'`, `approved: false`, `rejected: false`. Rejection is durable (mig 024) so a rescan cannot resurrect a dismissed claim. Response reports `{scanned, inserted, skipped_existing, truncated_tree}`.

A sibling function, `supabase/functions/ingest-features/index.ts`, does the same job from screenshots and a marketing page: up to 12 images resolved to signed URLs from the `feature-screenshots` bucket (`resolveImageUrls`, with `parseStoragePath()` enforcing that the path is under the caller's `company_id/` prefix), one `askClaudeVision` call, plus optionally one `crawlSite` + text call. Extracted items whose `source_ref` is not one of the labels supplied in the prompt are discarded — a per-item provenance check the model cannot bypass. `INSERT_CAP = 15` and `dropped_over_cap` is reported rather than silently truncated.

### 4c. Trend and format scraping (`scrape-trends`)

`supabase/functions/scrape-trends/index.ts`, 1 390 lines, the largest single unit of custom logic in the repo. Cron: `0 6 * * 1` (Monday 06:00 UTC). Responds `202` immediately and continues under `EdgeRuntime.waitUntil`.

**Run configuration.** Two modes. `WEEKLY_CONFIG` (target 16 items, chunk 16, comment budget 5 niche / 1 donor, fingerprint window 500, gate batch 10, classify batch 8, TikTok slots `{niche 4, donor 2}`, Instagram `{niche 3, donor 1}`, 4 results/profile, 6 results/search). `backfillConfig(target)` is opt-in via `{"mode":"backfill","target":N}`, clamped to 16…1000, and raises the comment budget by an order of magnitude (150 niche / 50 donor) because "the backfill is the one chance to build that corpus".

**Corpus split.** Every `source_accounts` row carries `corpus ∈ {format_donor, niche}`. Donors are cross-vertical product/app accounts (seeded by `scripts/seed-donor-accounts.ts` — CookSAT, Jobright, Cal AI, Quittr, Opal, Alarmy, Cleo, Cluely, Umax, Blitzit) that teach *structure*; niche accounts teach the audience's claims and vocabulary. The two corpora are never mixed: the relevance gate runs on niche only, claim mining runs on niche only, comment questions are collected from niche only, and format-example harvesting runs on donors only.

**Account selection.** `loadAccountsToScrape()` orders by `last_scraped_at ASC NULLS FIRST` (least-recently-scraped first), takes all `active` plus at most `MAX_PROBATION_PROFILES = 4` `probation` rows, then `pickPlatformAccounts()` fills each platform's per-corpus slots in that order and **spills** unfilled slots to the other corpus so a one-sided universe never wastes paid scrape capacity.

**Sourcing.** Handle-first. `scrapeTikTokProfiles` / `scrapeInstagramProfiles` batch handles `PROFILES_PER_APIFY_CALL = 4` at a time (a single deep call would hit the Apify sync-run timeout) and swallow per-group failures. Search is a *fallback only*, triggered when `accounts.length < 3`, or fewer than 8 handle items cleared `HANDLE_MIN_VIEWS`, or (backfill only) the handle yield is below target. Search terms come from `pickTerms()` (§5).

**Enrichment.** Per chunk, in parallel per item:
- Video: `resolveTranscript()` — the Apify actor's own transcript file first (`fetchApifyTranscript`, token-gated KV fetch, 30 s timeout), Deepgram `nova-3` as fallback (90 s timeout), else null.
- Carousel: `ocrSlidesCached()` — content-hash OCR cache (§5, §10).
- `isLowSignal()` marks an item where the caption is the only text (video with no transcript, carousel with no OCR text). Low-signal items are never sent to the classifier and are excluded from the golden set and coverage stats.

**Dedupe, two layers.** Hard dedupe on `(company, source_url)` against all history plus within-batch. Then `contentFingerprint()`: lowercase, strip to `[a-z0-9]`, collapse whitespace, require ≥ 40 chars, take the first 240 chars of `slide_texts.join(' ') ?? transcript ?? caption`. Compared against the last `cfg.fingerprintWindow` fingerprints (500 weekly, `max(3000, target*4)` on backfill), and the in-memory set is shared across chunks so dedupe does not degrade mid-run.

**Ordering before the cut.** `fresh` is sorted handle-items-first, with views only as a tiebreak *inside* each group, then sliced to `targetItems`. The comment is explicit: "Never a pure view ranking."

**Judgement, per chunk.** `annotate()` (hook + why_it_works for every kept item), then `runGate()` and `classifyItems()` in parallel. The keeper rule (`passed()`) is corpus-dependent: niche items need `relevance_score >= RELEVANCE_THRESHOLD (6)`; donor items need `donorKeeper()` — at least `HANDLE_MIN_VIEWS` and, when their account has ≥ 3 samples this run, ≥ 1.5× that account's own median views. Classification never decides keeping, "which would make the library unfalsifiable".

**Comment scraping.** `scrapeComments()` picks TikTok keepers with `comments > 0`, splits targets against **separate** niche and donor budgets, and makes one `clockworks~tiktok-comments-scraper` call for 25 comments/post. It extracts (a) CTA keyword counts — `ctaKeywordFromPost()` regexes `comment\s+["']?([a-z0-9]{2,15})["']?` out of the caption+transcript, then counts comments whose alphanumeric-normalized text equals that keyword exactly; (b) question comments (`endsWith('?')`, length 10–200) from niche posts only. A failed actor call still decrements both budgets so a flaky actor cannot turn into unbounded paid retries.

**Persistence and side effects.** Rows are inserted per chunk (partial progress survives a kill), then `harvestFormatExamples()` (donor keepers with `confidence >= 0.7` → one `format_examples` row per filled slot, 1–600 chars), then `mineClaims()` (§5).

**Run-level writeback.** After all chunks: authors of gate-passing *search* results are upserted as `probation`/`niche` `source_accounts` (universe expansion); per-account `scraped_count`/`keeper_count` accumulate and drive promotion (`probation` → `active` on the first keeper) and auto-mute (`scraped_count >= 10` and keeper rate `< 0.10` → `muted`); search-term stats are merged into `brand_profiles.sourcing.terms` by `mergeTermStats()`.

### 4d. Admin brief creation flow

**Week setup — the ratio.** `app/(admin)/week-setup.tsx`. The admin sets a video target and a slideshow target and picks a start day from the next seven. `splitFamily()` distributes each family's target across that family's `post_types` proportional to `default_week_count` using **largest-remainder apportionment** (floor each exact share, then hand out the remaining units in descending fractional order) so the split always sums exactly to the target. Default targets 20 video / 10 slideshow; the hint line computes the covered date range from `ceil(total / 3)` days at 3 slots/day.

**Week creation — pre-stamping.** `createWeek()` in `lib/briefs-api.ts`:
- Reuses an existing campaign on the same `drop_date` if `stampedCampaignIds()` shows it already has typed brief rows. (`stampedCampaignIds` exists because a nested PostgREST filter on `briefs.post_type_id` returns empty and previously hid real weeks — noted in the commit message and in the code comment.)
- Deletes empty leftover `draft` campaigns so two cards never stack on the same Sunday.
- Builds the search-phrase pool: `listSearchQueries()` (ordered `used_count ASC, created_at ASC`), partitioned into `fresh` (not used by any campaign with `drop_date` in the last 28 days) and `stale`, concatenated fresh-first, then assigned round-robin by slot index. The stamp is explicitly **not** a use; `used_count` bumps only when a fill succeeds (`markSearchQueryUsedByText`).
- Inserts one `briefs` row per slot with `title = phrase ?? postType.label`, `format = postType.family`, `post_type_id`, `search_phrase`; links them into `campaign_briefs` with `position`.

**Per-post authoring.** `supabase/functions/ingest-brief/index.ts` takes `{query}` **or** `{url}` (never both), plus optional `{post_type, context}`.
- *Query path* (the grid's path): no scrape, no OCR. The prompt is told to set `search_phrase` to exactly the supplied string.
- *URL path*: host must be `tiktok.com` or `instagram.com`. TikTok → `clockworks~tiktok-scraper` with `postURLs`; Instagram → `apify~instagram-scraper` with `directUrls`. Video → transcript (actor, then Deepgram); carousel → `ocrSlides()` (up to `MAX_OCR_SLIDES = 6`, uncached on this path). The source block instructs "take the hook style and structure, then rewrite the body entirely… do not mention the original creator."
- Both paths call `generateValidated()`: draft → `validateBrief` → log a `brief_validations` row → on failure, **one** retry with the failure list appended to the user message → validate and log attempt 2. Remaining failures are returned as `warnings` rather than blocking.
- A `{kill_reason}` response is a first-class outcome, propagated to the client (`generatePost()` returns `{kind:'kill'}`) and persisted on the brief so the grid slot renders empty with the reason.

**Per-field regeneration.** `supabase/functions/brief-assist/index.ts`, `action: 'regenerate_field'`, fields `search_phrase | talking_points | talking_point | hook | caption`. The current editor draft rides in the user message as context; the response is merged into the draft (`merge()`) *before* validation so the validator sees the post as the editor will. For `talking_point` the original point `id` is forced back on because "the model cannot be trusted to keep it". Body regenerations return `hook_may_be_stale: true` — the client surfaces a nudge and never silently regenerates a hook the admin may have hand-written.

**Segment derivation.** `action: 'derive_segments'` → `deriveSegments()` in `_shared/generateBrief.ts` builds the manifest from `clip_structure` (`hook_points_outro` → `[hook][point×N][outro]`; `single_clip` → one hook-kind segment; `slide_per_point` → one slide per point) and hands it to the `sync_brief_segments` Postgres function, which deletes vanished segments, moves survivors matched by `talking_point_index` (or by `kind` for hook/outro) preserving their admin-owned `overlay_text`, `show_on_screen` and `screenshot_url`, and inserts only new ones. Never delete-and-rebuild — the admin may have attached screenshots.

**Library pull.** `lib/library-api.ts` + the `library_our_posts` Postgres function (mig 029). The admin pulls from four sources (`idea`, `our_post`, `reference`, `from_creator`); `library_our_posts` does the filter/search/sort/page server-side with a lateral join to the latest `post_metrics` snapshot, because PostgREST cannot order by a lateral latest-snapshot metric. Reference links are resolved to a thumbnail by `supabase/functions/library-link/index.ts` (TikTok oEmbed first, then an `og:image`/`twitter:image` regex parse of the page HTML, capped at 256 KB, with SSRF host validation reused from `crawlSite.ts`). Using an item bumps `used_count`/`last_used_at`; it is never removed.

### 4e. AI review scoring of a completed post

`supabase/functions/brief-review/index.ts` (on-demand, admin taps Review in the post editor; nothing is saved server-side). Input: the editor's current draft, optional `post_type`, and `hook_index` (default 0) so tiers 2 and 3 review the *chosen* hook, not all ten options.

- **Tier 1 — deterministic.** `runTier1Checks()` in `_shared/validateBrief.ts`. Import-free by design so the client can re-run the identical function (`runClientTier1` in `lib/briefs-api.ts`). Details in §5.
- **Tier 2 — one structural model call.** `TIER2_SYSTEM` in `_shared/reviewBrief.ts` asks for exactly four booleans — `dialogue`, `symmetry`, `parallel_list`, `search_promise` — each with quoted evidence and, except for `search_promise`, a field-targeted rewrite suggestion. `parseTier2()` converts fired checks into `ReviewCheck` rows at `tier: 2, severity: 'warn'`.
- **Tier 3 — one binary question.** `TIER3_SYSTEM`: "does this read as SPOKEN… or as WRITTEN copy?" → `{spoken: bool, worst_line: string|null}`, `max_tokens: 512`. A `spoken: false` verdict becomes a single `reads_as_written` check.
- Tiers 2 and 3 are issued **concurrently** (`Promise.all`).
- **Scoring.** `scoreReview()` (§5) returns `{overall, hook, talking_points, cta}`.
- **The loop back.** Review never blocks and never edits. Suggestions are applied client-side only when accepted; overrides, accepted-suggestion edit diffs, and the final confirm are logged to `brief_review_events` by `logBriefReviewEvents()` / `confirmBriefReview()` in `lib/briefs-api.ts`. `appendBannedPhrases()` pushes phrases the admin removed by hand into `brand_profiles.banned_phrases`, which the next generation prompt hard-bans.

### 4f. Creator onboarding, warm-up proof capture and verification

1. **Signup.** Invite-only (mig 060). A new `auth.users` row fires `handle_new_user()`, which attaches the user to a company and inserts a `profiles` row with `role = 'creator'`, `onboarded = false`. Google sign-in uses the PKCE flow (`lib/supabase.ts` → `flowType: 'pkce'`) with `app/auth/callback.tsx` exchanging `?code=` via `exchangeCodeForSession`; a pending invite is claimed before routing (`claim_pending_invite`, mig 061).
2. **Cal-AI-style questionnaire.** `app/(onboarding)/` — name, birthday, phone, `experience`, `hardest`, `hours`, `heard`, an earnings `estimate` screen, notifications and permissions priming. Answers are buffered in memory by `lib/onboarding.ts` (`getOnboardingAnswers` / `setOnboardingAnswer`) and written to `profiles.onboarding_answers` jsonb by `saveOnboardingAnswersToProfile()`. `HOURS_TO_MONTHLY_ESTIMATE` maps the hours answer to a dollar estimate shown on the estimate screen.
3. **Account creation step.** `app/(creator)/account-setup.tsx` + `lib/account-template.ts`. The company-wide `account_template` (Instagram bio, TikTok bio, Instagram link, profile picture, example screenshot) is shown for the creator to copy; `suggestAccountNames(fullName)` generates display names (`"{First} | College Soccer Recruiting"` and two variants) and up to 10 candidate usernames by combining a normalized first-name token (NFKD, strip diacritics, strip non-alphanumerics, first 12 chars) with recruiting stems (`d1soccer`, `d1recruit`, `recruiting`, `collegerecruit`, `d1offers`), plus `d1with{tok}`, `{tok}.d1`, and last-name variants, filtered to length 3–30. The creator saves handles plus two profile screenshots through `saveCreatorAccountDraft()`, which writes `status: 'needs_changes'` — the draft state, chosen because the queue lists only `pending` rows and the status column has no `draft` value.
4. **Warm-up tutorial.** `app/(creator)/setup/warmup.tsx` is a four-page horizontal pager: three instruction pages (what warming up is, why the For You algorithm matters, a four-bullet action list) and a proof page. Reaching the last page marks `warmup_tutorial_seen` in `onboarding_answers` (`markWarmupTutorialSeen`).
5. **Proof capture.** The creator records their *own screen* outside the app (iOS/Android screen recorder) and uploads it from the camera roll: `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.85 })`. Two slots with declared minimums — `tiktok-recording` ≥ 15 s of continuous For You scrolling, `instagram-recording` ≥ 20 s covering home → explore → reels. The **only** automated check is a client-side duration test: `pickRecording()` reads `asset.duration` and rejects if `0 < seconds < minSeconds - 1` (a 1 s tolerance). A picker that reports `duration` as 0 or undefined passes.
6. **Upload and submit.** `uploadVerificationAsset()` (`lib/creator-accounts-api.ts`) PUTs the blob to the private `account-verification` bucket at `{companyId}/{creatorId}/{kind}-{Date.now()}.{ext}` — the timestamp means resubmits never collide and prior attempts are retained. `submitCreatorAccount()` upserts the row to `status: 'pending'`, clears any prior `reason`, and fires the `account_submitted` push to admins.
7. **Verification.** See §8. It is manual admin review with a four-checkbox structured verdict.
8. **The gate.** `publish-campaign` filters the creator list to those with a `creator_accounts` row at `status = 'approved'` and returns a 400 if none qualify.

### 4g. Post assignment, segmented clip recording, stitching, on-screen text, captions, publishing

**Assignment.** `supabase/functions/publish-campaign/index.ts` runs under a *caller-scoped* Supabase client (anon key + the caller's `Authorization` header) so RLS and the RPC's own admin check apply. It loads the campaign, its briefs (with `briefs.format`), all creators (`role = creator` or `can_create`), intersects with approved `creator_accounts`, forces every brief to `pinned_day: null` (pinning is retired), and calls `buildCreatorWeek(briefs, campaignId, creatorId)` per creator (§5). The resulting rows go to `publish_campaign_assignments(p_campaign_id, p_assignments)`, a `SECURITY DEFINER` function that inserts with `ON CONFLICT (campaign_id, creator_id, brief_id) DO NOTHING` and flips the campaign to `published` in one transaction. Notification timing is computed by `campaign_notify_at(drop_date)` = 20:00 America/New_York on the drop date, DST-aware; if that is in the future the function only stamps `notify_at` and the hourly `notify-scheduled` sweep fires later.

**Swap.** `listSwapPool()` / `swapAssignmentBrief()` in `lib/tasks-api.ts`. The pool is every brief in the campaign minus the ones already assigned to that creator. The update is guarded by `.eq('status','assigned')` so work in progress cannot be swapped, and `clearDraft()` wipes any clips drafted against the old brief.

**Segmented recording.** `app/(creator)/record/[id].tsx` (1 890 lines).
- `briefPlan(brief, segments)` builds the shot list. Preferred source is `brief_segments` (non-slide rows): a `hook` segment carries the chosen hook line, `point` segments carry the corresponding talking point, an `outro` segment carries `briefs.cta` or the fallback "Close it out and tell them what to do next." Fallbacks, in order: talking points + hook + cta assembled directly; then `scriptPartsPlan()`, which splits a legacy script on `\n---\n` markers or blank lines.
- Prompting is per-clip and mode-dependent. Scripted clips (hook, outro) use `Teleprompter` (`components/Teleprompter.tsx`): a word-by-word highlighter advancing one word every `250 / speed` ms with speeds `[0.75, 1, 1.25, 1.5]`, auto-scrolling to `index / (words-1) × overflow`. Point clips use `BeatPrompter`: the whole talking point held on screen for the take, plus the creator's `credential_line` from their profile — the brief itself is forbidden from containing a credential (see `CREDENTIAL_RULE`, §6) because one brief serves the whole roster.
- Capture: `beginCountdown()` (3 steps at 800 ms) → `startClip()`. Custom hardening: a `RECORD_ARM_MS = 350` sleep before `recordAsync` because `onCameraReady` can fire before `AVCaptureSession` will accept a recording; `MAX_CLIP_MS = 90 000`; a `discardClipRef` guard so a stop during the arm window discards rather than saves; and `stopClip()` arms a `STOP_WATCHDOG_MS = 5 000` timer that abandons the clip with a "Camera stalled" alert if `recordAsync` never resolves. Front-camera "flash" is `expo-brightness` driven to 1.0 with the prior value restored in `finally`.
- Per-clip save: `saveClip()` probes real duration (`probeDurationMs`), uploads immediately to `videos/{company}/{assignment}/draft-{slot}-{timestamp}.mp4`, and records the clip in `recording_drafts.segments` (`saveDraftSegment` replaces any clip at the same `slot_index`, so a retake overwrites in place). A monotonic `saveTokenRef` discards results from superseded takes.
- Review: `processPost()` resolves every kept clip to a playable URI (local when present, else a signed URL), enforces a `PROCESSING_MIN_MS = 2 000` floor so the spinner reads as work, then plays them in sequence. `sendForApproval()` calls `submitAssignmentClips()` — which re-uses the already-uploaded draft paths rather than re-uploading — creates the `submissions` row plus `submission_segments` rows, hops the status `assigned|changes_requested → recorded → submitted` through `transitionAssignment`, clears the draft, and fires `render-submission`.

**Duration probing.** `probeDurationMs()` in `lib/submissions.ts` instantiates an `expo-video` player on the local file, waits for `readyToPlay` (4 s timeout), and returns real media duration; the wall-clock measurement from the record screen is only the fallback. This matters because overlay timing on the render timeline is absolute and wall-clock includes camera start latency.

**Stitching and overlay.** `supabase/functions/render-submission/index.ts` claims the job with a status-filtered update (`.in('render_status', claimable)`) — the row itself is the lock — then runs `assembleSubmission()` in `_shared/assemble.ts` under `waitUntil`. Full FFmpeg and Creatomate detail is in §7.

**Captions.** The caption is authored on the brief (`briefs.caption` + `briefs.hashtags`), reviewed in tier 1/2, and passed to Upload-Post as the `title` form field at publish time. It is not burned into the video.

**Publishing.** `supabase/functions/post-approved/index.ts`. Resolves the target (assignment or legacy task), requires `assignments.status = 'approved'`, requires the creator to have an `upload_post_profile`, resolves the latest submission, then builds a `FormData` with `user`, `title` (the caption), `async_upload: 'true'`, and one `platform[]` entry per platform. Video posts append a 1-hour signed URL as `video` to `/api/upload`; carousels append one signed URL per slide as `photos[]` to `/api/upload_photos`. If the response carries a `request_id` but no results, `pollStatus()` polls `/api/uploadposts/status` every 2 s up to 30 times with an early exit after attempt 5 once no platform is still pending. One `posts` row is written **per platform** with `provider_post_id = request_id`, then the assignment flips to `posted` under a compare-and-set on `status = 'approved'`.

### 4h. Music attachment workflow after slideshow posts

TikTok/Instagram photo carousels published through the API carry no trending sound, so the sound is added by hand on the platform after the fact, and earnings are gated on that being done.

1. The carousel posts (`upload_photos`) and goes live.
2. The creator opens the live post, adds the trending sound in the native app, and taps "Music added" in Noni. `markMusicAdded()` (`lib/tasks-api.ts`) sets `assignments.music_marked_by_creator_at` under `.is('music_marked_by_creator_at', null)`, so a double tap is a no-op, and fires the `music_pending` push to admins. It is deliberately not a status transition.
3. `listMusicApprovalQueue()` (`lib/admin-api.ts`) lists assignments with a creator mark and no `music_approved_at`, joined to the live post links and the earliest `posted_at` across platforms, with `slideCount = brief.point_count + 2` (cover + points + close).
4. The admin either approves — `approveMusic()` stamps `music_approved_at`/`music_approved_by` and fires `music_approved` — or sends it back: `requestMusicChanges()` **clears** `music_marked_by_creator_at` (so the item leaves the queue), inserts the reasons plus note as a `review_events` comment on the latest submission, and fires a `comment` push. Tapping "Music added" again re-enters the queue.
5. The gate itself is enforced server-side in `poll-metrics/index.ts`: for an assignment whose brief `format === 'photo_carousel'`, if `music_approved_at` is null the bounty-crediting branch `continue`s. Video assignments skip the music loop entirely.

### 4i. Analytics and attribution

Three independent data paths converge in the analytics screens.

**Engagement.** `supabase/functions/poll-metrics/index.ts`, cron `0 8 * * *`. For every `posts` row with a `provider_post_id` and status `posted|pending`, it calls Upload-Post `/api/uploadposts/post-analytics/{request_id}` and normalizes the response through `extractMetrics()`, which walks `body.platforms`, skips entries with `success === false`, accepts either `post_metrics` or `metrics`, coerces with `asInt()` (clamped ≥ 0, floored), treats `views ?? impressions` as views, and keeps `saves` as **null** when the platform does not report it (distinct from zero). Each poll appends a `post_metrics` row — the table is a snapshot log, never an update-in-place, which is what makes the delta charts possible.

**Monotonic thresholds.** Thresholds are evaluated on `bestViews = max(this snapshot, every prior snapshot)`. The comment is explicit: a platform undercount on one poll must never hide a crossed threshold or claw back an earned bounty.

**Milestones.** `MILESTONES = [5 000, 10 000, 50 000, 100 000, 1 000 000]`. For each, a membership check against `posts.milestones_fired` then an atomic `claim_post_milestone(post_id, threshold)` RPC; only a `true` return counts as this poll's claim, so concurrent polls cannot double-fire. Pushes are collapsed to the single highest new threshold per post, sent once to admins ("{name}'s post crossed 50k views on tiktok") and once to the creator, with the bounty amount appended when one was credited on the same pass.

**Bounty.** Per assignment, view counts across its platform rows are rolled up, revenue is joined in from `attribution_links` → `revenue_events`, and `assignments.metrics` is patched to `{views, likes, revenue_cents}`. If `bounty_credited_at` is null, the music gate passes, and `bountyViews >= viewThreshold`, `creditAssignmentBounty()` spends company credits first and only then stamps `bounty_credited_at` under `.is('bounty_credited_at', null)` — on `insufficient_credits` it leaves the stamp null so a later poll retries, and fires one `credits_low` push per run.

**Conversion attribution.** `supabase/functions/sync-conversions/index.ts`, cron `30 7 * * *` (deliberately half an hour before the metrics poll). It reads three tables from the tenant's *own* product database over PostgREST with paginated `Range` headers (`fvRows`, 1 000/page): `user_profiles` (`created_at`, `trial_started_at`, excluding demo rows), `user_subscriptions` (`amount_cents`, `paid_at`), and `user_onboarding_intake` (`referral_code`) filtered to `referral_code in (...)` where the list is exactly this company's `attribution_links.code` values. Per-creator attribution is the join `referral_code → attribution_links.code → creator_id`. Everything is aggregated in memory keyed `"{day}|{creatorId}"` with `""` meaning the company-wide row, and upserted into `conversion_daily` on `(company_id, day, creator_id)`. The header comment states the privacy contract: individual product-user rows are never persisted in Noni, only timestamp/amount/referral-code columns are read, aggregated, and discarded.

**Stripe attribution.** `supabase/functions/stripe-webhook/index.ts` → `handleCheckoutCompleted()`. `collectCodes()` harvests a candidate code from five metadata keys (`promo_code`, `promotion_code`, `attribution_code`, `utm_campaign`, `code`), from `client_reference_id`, and from `session.discounts[].promotion_code`; `resolvePromoCodes()` additionally retrieves promotion-code objects by id. Matching codes resolve to an `attribution_links` row and upsert a `revenue_events` row on the unique `stripe_event_id`. Unrelated sessions are acknowledged and skipped rather than 500'd — a comment records that FieldVision checkouts were previously 500-ing the webhook on every delivery, and that `session.retrieve({expand})` must never be used here because Stripe rejects the deep expand.

**Client-side rollup.** `lib/analytics-api.ts` → `fetchCompanyAnalytics()`. Platform `posts` rows sharing an assignment (or task) are folded into one logical post; per-platform stats come from the latest snapshot; the cumulative snapshot series per platform is retained so `buildViewsSeries()` can compute view *deltas* over arbitrary buckets (`viewsAt(series, t)` = last snapshot at or before `t`, summed across platform rows; a bucket's value is `viewsAt(end) - viewsAt(start)`, floored at 0). Ranges: 24 h in 12×2 h buckets, 7 d in 7 days, 2 w in 14 days, 1 month in 5×7 d, 12 w in 12×7 d. Sign-ups and sales are suppressed before `firstCampaignDayOf()` — the day the company's first campaign started — and money surfaces are additionally gated by `buildMoneyGate()` on the Stripe connect date. The window is 84 days.

**Forecast.** `lib/budget-forecast.ts` → `forecastMonthlyBudget()` turns a monthly budget into expected bounty hits (`budget / bounty`), posts (`hits / 0.10` hit rate), qualifying views (`hits × threshold`), trials (`× 0.0015`), paid conversions (`× 0.25`), first-month revenue (`× $29.99`) and ROAS. The file's own header labels the revenue coefficients as research defaults for a FieldVision-style consumer SaaS, not measured values.

### 4j. Notifications

**Transport.** Expo Push only (`_shared/push.ts` → `sendExpoPush`, one POST to `exp.host` with an array of messages). Tokens live on `profiles.expo_push_token`; `adminPushTokens()` fans out to every `campaign_manager` in the company, `creatorPushTokens()` targets one creator scoped to the company.

**Dispatcher.** `supabase/functions/notify/index.ts` accepts 16 events: `submitted`, `approved`, `changes_requested`, `comment`, `published`, `message`, `account_submitted`, `account_decided`, `music_pending`, `music_approved`, `post_live`, `streak_bonus`, `streak_progress`, `company_topup`, `credits_low`, `bounty_earned`. Auth is dual: an `x-cron-secret` match makes the caller a service caller, restricted to the three `SERVICE_EVENTS` (`company_topup`, `credits_low`, `bounty_earned`); everything else requires an authenticated profile in the subject's company, and creators may only fire events about their own thread or account. `resolveSubject()` normalizes an assignment or a legacy content task into `{title, company_id, creator_id, data}` so the message templates are shared. `post_live` is composed dynamically by `postLiveMessage()`, which reads the `posts` rows for the subject and puts each platform's live URL into the push `data` payload as `{platform}_url` for deep linking.

**Deferred publish.** `notify-scheduled` (cron `5 * * * *`) sweeps campaigns where `status = 'published'`, `notify_at <= now()`, `notified_at is null`, claims each with an update guarded on `notified_at is null`, and pushes "New week is live" to every creator with an assignment in that campaign.

**Morning reminders.** `notify-reminders` (cron `15 * * * *`) is an hourly job that no-ops unless the America/New_York hour is 8 or 9 (`getNyHour()` via `Intl.DateTimeFormat`), overridable with `{force: true}`. "Today" is computed **per company** from `companies.settings.timezone` (default `America/Chicago`) using `Intl.DateTimeFormat('en-CA')`. Incomplete assignments (`assigned`, `recorded`, `changes_requested`) are grouped by `{company, creator, kind, today}` where kind is `due_today` (scheduled == today) or `overdue` (scheduled < today). The claim is an **insert** into `creator_reminders` with a unique constraint on `(company_id, creator_id, kind, sent_on)`; a `23505` violation means another run already claimed it and the loop continues. Copy is streak-aware: an active streak swaps the title to "Keep your N-day streak alive" and the body to "post today to protect your streak and keep earning".

**Tap routing.** `lib/notifications.ts` → `attachNotificationRouting()` handles both the cold-start response (`getLastNotificationResponseAsync`, guarded by a module-level `handledColdStart` flag) and foreground taps, delegating to `routeNotificationTap()` in `lib/notification-routing.ts` with the current app mode (creator vs admin) supplied as a getter so a late tap routes against the mode in effect at tap time. Every push path is a no-op on web.

---

## 5. Custom algorithms and heuristics

Each entry: input → output, method, why it exists, and what off-the-shelf approach it replaces or extends.

### 5.1 Two-corpus sourcing with per-corpus slot allocation and spill

`scrape-trends/index.ts` → `pickPlatformAccounts()`, `loadAccountsToScrape()`, `RunConfig.tiktokSlots/instagramSlots`.

- **In:** all `active` + up to 4 `probation` `source_accounts`, ordered least-recently-scraped first; per-platform slot budgets split by corpus.
- **Out:** the ordered list of handles to scrape this run.
- **Method:** take `slots.niche` from the niche accounts and `slots.donor` from the donors *preserving input order* (i.e. LRU), then compute the leftover capacity and spill it to whichever corpus still has candidates.
- **Why:** the two corpora answer different questions (structure vs audience language) and a naive "scrape the N stalest accounts" would let a large donor set starve niche sourcing or vice versa; the spill exists so a tenant with, say, no Instagram donors yet does not waste paid Apify capacity.
- **Replaces:** a flat priority queue or a single global LRU.

### 5.2 Donor keeper rule — per-account engagement norm

`scrape-trends/index.ts` → `donorViewNorms()`, `donorKeeper()`.

- **In:** every donor item sampled this run, grouped by `platform:handle`.
- **Out:** a boolean per donor item.
- **Method:** compute each donor account's **median** views over everything sampled from it in this run; keep an item if it has ≥ `HANDLE_MIN_VIEWS` (2 000) and either the account has fewer than `DONOR_NORM_MIN_SAMPLE = 3` samples (keep by default) or the item has ≥ `DONOR_NORM_MULTIPLE = 1.5×` that median.
- **Why:** an absolute view floor would just select big accounts. Normalizing to the account's own median selects *outperformance*, which is the signal that the post's structure did something. The code states the design constraint outright: classification must never decide keeping, "which would make the library unfalsifiable" — i.e. the format library must be able to fail to explain a winning post.
- **Extends:** a global view threshold or a percentile cut across a mixed corpus.

### 5.3 Relevance gate (LLM-scored, few-shot from tenant ground truth)

`_shared/relevance.ts` → `buildGatePrompt()`, `RELEVANCE_THRESHOLD = 6`; `_shared/wp8.ts` → `loadGoldenExamples()`; `scrape-trends/index.ts` → `runGate()`.

- **In:** the tenant's `audience_niche` brand doc (or a legacy fallback line block), up to 16 golden few-shot examples, and a batch of ≤ `gateBatch` niche items.
- **Out:** `{index, score 0–10, reason, remake_mode, remake_reason}` per item, persisted on `trend_items`.
- **Method:** one Claude call per batch. Few-shots are **balanced**: `loadGoldenExamples()` pulls the 60 most recent admin-labeled golden items and takes `ceil(limit/2)` keeps and `ceil(limit/2)` kills so the prompt cannot be biased toward one verdict by whatever the tenant labeled most recently. Both the golden summaries and the items under test are rendered by the *same* `summarizeItem()` function so the model sees labeled and unlabeled items in an identical shape. `remake_mode` is decided by a rule stated in the prompt, not by free judgment, with a hard guardrail that an off-niche post (score < 6) is always `structure_only`.
- **Why:** viral-but-off-niche content is the dominant failure mode of a view-ranked scraper. Scoring "would this brand's exact audience follow the account that posted this" separates reach from fit.
- **Regression harness:** `scripts/relevance-regression.ts` replays the identical prompt against every golden item with the few-shot block **deliberately empty** ("leave-the-answer-out: golden items being tested are NOT injected as few-shots, otherwise the gate just reads back the label"), and prints an agreement percentage plus every disagreement with both reasons. Exits non-zero on any disagreement.
- **Extends:** a classifier trained on labeled data, or an embedding-similarity cut against a niche centroid. Here the labeled set is the prompt.

### 5.4 Format classification against a closed twelve-format library

`_shared/classify.ts` → `buildClassifyPrompt()`; `scrape-trends/index.ts` → `classifyItems()`, `loadFormats()`.

- **In:** the twelve `formats` rows (id, family, when_to_use, slot schema) and a batch of ≤ `classifyBatch` **non-low-signal** items.
- **Out:** `{format_id | null, confidence, slot_fills, reason}` per item, all persisted.
- **Method:** the prompt is explicitly a *closed* classification with a first-class null: "Do not force a fit; a vlog, a skit, or a pure entertainment post is null." `slot_fills` must be quoted or tightly paraphrased from the actual transcript/slides, never invented, with list-like slots joined by `" | "`. Post-processing in `classifyItems()` applies `CLASSIFY_CONFIDENCE_THRESHOLD = 0.6`: below it, `format_id` is forced to null but the **raw confidence and the reason are still stored**, so an unconfident verdict is evidence rather than a silent drop. A separate, higher `EXAMPLE_CONFIDENCE_THRESHOLD = 0.7` governs whether the verdict's slot fills are good enough to become tenant `format_examples`. Low-signal (caption-only) items are never classified at all — the code calls a caption-only classification "corrupting".
- **Why:** so that the question "is the twelve-format library the right library?" is answerable from data rather than assumed. `scripts/coverage-report.ts` consumes exactly this: classified share overall and per corpus, median confidence for classified vs unclassified, format distribution, and the top 15 null reasons verbatim.
- **Extends:** a forced-choice classifier or a clustering approach; the design decision is the reserved null plus the retained reason.

### 5.5 Claim mining

`_shared/mine-claims.ts` → `buildClaimMiningPrompt()`; `scrape-trends/index.ts` → `mineClaims()`, `normalizeClaim()`.

- **In:** the audience doc (2 000-char cap), up to 60 existing claims, the niche keepers of this chunk (transcript or slides, 1 200-char cap each; caption 250), and up to 40 question comments harvested from those posts' comment sections.
- **Out:** rows in `claims` (claim, proof, audience_segment, saturation_score, confidence), phrases in `vocabulary`, and a `topic` written back onto each contributing `trend_items` row.
- **Method:** one Claude call returning three parallel structures at once — `claims[]`, `vocabulary[]`, and `topic_by_item[]`. Existing claims are passed in as a do-not-duplicate list *and* re-checked deterministically after the fact: `normalizeClaim()` lowercases and collapses to `[a-z0-9 ]`, and any mined claim whose normalized form already exists is dropped. Vocabulary is deduped with a `Set`, lowercased, trimmed, and length-filtered to 4–60 chars, then upserted with `ignoreDuplicates` on `(company_id, phrase)`.
- **Why:** the interesting claims are the ones the audience keeps *asking about*, which is why comment questions are a first-class input alongside post bodies, and why donor comments are structurally excluded from this path.
- **Replaces:** keyword extraction (TF-IDF/RAKE) or topic modelling over the corpus.

### 5.6 Saturation scoring — rolling topic share with an honest null

`scrape-trends/index.ts` → `saturationFor()` inside `mineClaims()`.

- **In:** the `topic` labels of the last `SATURATION_WINDOW_ITEMS = 200` topic-labeled niche items scraped within `SATURATION_WINDOW_DAYS = 90`; a claim's own topic label.
- **Out:** an integer 0–10, or **null**.
- **Method:** `share = count(topic) / windowTopics.length`; `score = min(10, round((share / fullShare) × 10))` where `fullShare = Number(Deno.env.get('SATURATION_FULL_SHARE') ?? 0.3)`. If the window holds fewer than `SATURATION_MIN_SAMPLE = 30` labeled items, the answer is `null`, and migration 017 explicitly dropped the column's NOT NULL and default so null can be stored: "Unknown saturation is null, never a fake zero."
- **Calibration:** the divisor is env-tunable without a redeploy precisely so it can be set from the observed topic distribution; `scripts/coverage-report.ts` prints the top-25 topic shares over the identical window and tells the operator what the top topic would score at the current default.
- **Why:** to answer "is this idea already everywhere in my niche right now" with a number that is comparable across topics and honest when the corpus is too thin.
- **Replaces:** a raw frequency count, or an unbounded novelty score.

### 5.7 Content fingerprint near-duplicate detection

`scrape-trends/index.ts` → `contentFingerprint()`.

- **In:** an enriched item.
- **Out:** a fingerprint string or null.
- **Method:** take `slide_texts.join(' ') ?? transcript ?? caption`, lowercase, replace every non-alphanumeric run with a single space, trim, collapse whitespace; require ≥ `FINGERPRINT_MIN_CHARS = 40`; return the first 240 characters. Compared as an exact set membership against a window of prior fingerprints, and the set is mutated in place so within-run duplicates are also caught.
- **Why:** "one viral post reposted by ten accounts must not appear ten times" (mig 016). URL dedupe alone cannot catch a repost.
- **Replaces:** MinHash/SimHash/shingled Jaccard or embedding-cosine dedupe. This is a normalized-prefix exact match — cheap, deterministic, and it will miss paraphrases (see §12).

### 5.8 Search-term memory and proposal

`scrape-trends/index.ts` → `pickTerms()`, `mergeTermStats()`.

- **In:** `brand_profiles.sourcing.terms` (`{term, kind, keepers, scrapes}`), the audience doc.
- **Out:** ≤ 3 TikTok queries and ≤ 3 Instagram hashtags for this run; updated keeper stats afterwards.
- **Method:** saved terms are sorted by **keeper rate** (`keepers / max(scrapes, 1)`) descending and the best fill the slots first. Only the remaining slots — and at most 2 per kind per run — are filled by a Claude call whose prompt is parameterized with the exact counts needed and the already-chosen terms as a do-not-repeat list. After the run, `mergeTermStats()` accumulates `scrapes` and `keepers` per `kind:term` and writes the merged array back.
- **Why:** a bandit-flavoured exploit/explore over search terms, where the reward signal is "did items from this term survive the relevance gate", with exploration capped so the model cannot flood the term bank.
- **Replaces:** a static hashtag list or an untracked LLM term generator.

### 5.9 Account health: probation, promotion, auto-mute

`scrape-trends/index.ts`, the per-account loop at the end of `scrapeCompany()`.

- **Method:** authors of gate-passing *search* results are upserted as `status: 'probation'`, `corpus: 'niche'` (universe expansion). Each run accumulates `scraped_count` and `keeper_count` per account; a probation account with any keeper is promoted to `active`; any account with `scraped_count >= MUTE_MIN_SCRAPES (10)` and `keeper_count / scraped_count < MUTE_KEEPER_RATE (0.10)` is set to `muted`. `MAX_PROBATION_PROFILES = 4` bounds how much of a run probation can consume, "so discovered accounts actually get scraped instead of being muted into a deadlock".
- **Why:** the account universe is self-expanding and self-pruning without an operator.

### 5.10 OCR cache keyed by image content hash

`scrape-trends/index.ts` → `imageHash()`, `sha256Hex()`, `ocrSlidesCached()`; table `ocr_cache`.

- **Method:** fetch the image bytes (20 s timeout) and SHA-256 them; if the fetch fails, fall back to hashing the URL with its query string stripped. Look up all slide hashes for the company in one `IN` query, compute the miss indices, OCR **only the misses** in a single vision call, write the results back with `upsert(..., { ignoreDuplicates: true })`, and reassemble the full slide array from the cache map. If OCR fails and nothing was cached, return null (which makes the item low-signal).
- **Why:** stated in the code — "the same slideshow reposted under a new URL costs one OCR total, ever." CDN URLs for the same image differ across posts and over time, so a URL-keyed cache would not hit.
- **Replaces:** a URL-keyed cache, or no cache.

### 5.11 `validateBrief` / `runTier1Checks` — deterministic brief validation

`_shared/validateBrief.ts`. Deliberately **import-free** so the same file runs in the Deno edge function, in Node, and inside the React Native bundle; the client re-runs the identical checks via `runClientTier1()`.

- **In:** a `BriefDraftShape`, the tenant `hashtagBank`, the list of approved `product_features` ids, and optionally the `post_types` row.
- **Out:** an array of `{check_id, tier: 1, section, severity, message}`.

**Hard fails.**
- `multi_speaker` — four regexes: `\bwait,?\s*what\b`, `\bso you'?re telling me\b`, quoted dialogue with attribution (`"…" he said|she asked|they replied`), and screenplay speaker labels at line starts (`^\s*[A-Z][a-z]{1,12}:\s+\S`, multiline). Run over the concatenation of every hook option, every talking point, and the script.
- `point_count_mismatch` — `talking_points.length !== point_count`.
- `point_count_type_range` — outside the post type's `min_points…max_points`.
- Plug block, driven entirely by `post_types.requires_plug` (false only on `replay_bait`): `plug_count` (exactly one `is_product` point), `plug_position` (never index 0 and never last), `plug_empty`, `plug_claim_untraceable` (the point's `claim_id` must be in the approved-claim id list — this is the mechanism that stops the model inventing product capability), `cta_missing`, and `cta_not_embedded` (the `cta` sentence must appear inside the `is_product` point's text after `normalizePhrase()` strips punctuation and collapses whitespace). When the type takes no plug, the inverse checks `plug_forbidden` and `cta_forbidden` fire.
- `hashtag_count` (3–5) and `hashtag_off_bank` (every tag must normalize into `brand_profiles.hashtag_bank`).
- `caption_too_long` (> 200 chars).
- `hook_option_count` (8–10) and `hook_over_9_words` per option.

**Soft warnings.**
- `target_words_range` — only when the post type carries both bounds.
- **Second-person density**, both directions: count `\byou\b|\byour\b|\byou're\b|\byours\b` over the spoken text, express per 100 words, warn below 4 (`second_person_low`) *and* above 8 (`second_person_high` — "real posts run 5 to 6, this reads as a lecture"). A two-sided band, not a floor.
- `hedges` — occurrence counts for `really, truly, actually, honestly, simply, just, very`.
- `double_adjectives` — `doubleAdjectivePhrases()` tokenizes, strips leading/trailing non-letters, and flags any window where tokens *i* and *i+1* are adjective-like and *i+2* is not. "Adjective-like" is a hand-built 90-word lexicon (`COMMON_ADJECTIVES`) OR a word longer than 5 chars ending in `ous|ful|ive|able|ible|less|ish`. A deliberate POS-tagger substitute with no dependency.
- `point_over_25_words`.
- `search_phrase_missing` / `search_phrase_not_in_caption` — the normalized search phrase must appear in the caption's **first sentence** (`firstSentence()` = everything before the first `.!?`).

**Why:** every rule here is one the model can be told and will still break. Making them deterministic means (a) generation gets a machine-checkable retry signal, (b) the client can show the same verdict without a round trip, and (c) `brief_validations` records whether the retry actually fixed it.

**Retry protocol.** `generateValidated()` in `ingest-brief/index.ts` runs validate → log attempt 1 → if failed, re-prompt with the failure list verbatim appended to the user message → validate → log attempt 2. Exactly one retry. Surviving failures downgrade into `warnings` and the draft is still returned — the admin is never blocked.

### 5.12 Post review scoring

`_shared/reviewBrief.ts` → `scoreReview()`.

- **In:** the merged tier-1/2/3 check list.
- **Out:** `{overall, hook, talking_points, cta}`, each 0–100.
- **Method:** a deduction table keyed by `"{tier}:{severity}"` — `1:fail` = 25, `1:warn` = 10, `2:warn` = 15, `3:warn` = 20 (default 10 for anything unmapped). Each section score is `clamp(100 − sum of deductions landing on that section)`. `overall = clamp(mean(hook, talking_points, cta) − deduct(caption)/2 − deduct(overall))` — caption and whole-post checks land on the overall score at **half weight** so one caption nit does not swing it as hard as a section problem.
- **Why:** the score only has to rank problems, not gate anything — review never blocks. The tier weighting encodes that a tier-3 "this reads as written" verdict is worse than a tier-2 structural tell, which is worse than a tier-1 nit but better than a tier-1 hard fail.

### 5.13 Hook generation — last, plural, scored, and re-sorted

`_shared/generateBrief.ts` → `HOOK_RULES`, `JSON_CONTRACT`, `sortHooks()`.

- **Method:** three mechanisms compose. (1) **Order as method** — the JSON contract fixes the key order `claim_id → search_phrase → point_count → talking_points → cta → script → target_words → hook_options → title → caption`, and the system prompt states why: "the order is the method… the hooks are written last against the finished body." Because decoding is autoregressive, key order *is* generation order, so the hook is conditioned on the finished talking points rather than the reverse. (2) **Plurality with self-scoring** — 8 to 10 variants, each ≤ 9 words, each scored 0–100 for "how hard it stops the viewer who typed the search phrase", with an explicit instruction not to reuse a score (forcing a total order). At least one must restate the search phrase; contradiction and curiosity angles are required. (3) **Deterministic re-sort** — `sortHooks()` accepts either `{text, score}` objects or bare strings (score 0), drops empties, sorts by score descending, and returns strings, so the stored `hook_options` array is best-first regardless of the order the model emitted.
- **Staleness signal:** regenerating the body sets `hook_may_be_stale: true` in the response. The hook is never silently regenerated because the admin may have written it by hand.
- **Extends:** single-shot hook generation, or an external reranker. The scoring is in-model but the ordering is enforced in code.

### 5.14 Talking-point generation — beats, not lines

`_shared/generateBrief.ts` → `POINT_RULES`, `plugRule()`, `CREDENTIAL_RULE`, `SECOND_PERSON_RULE`, `postTypeBlock()`, `numberedListTitle()`.

- **Method:** points are constrained to be *beats* — under 25 words, and "if a point reads as a complete performable sentence with closing rhythm, compress it", because the creator talks around the beat rather than reciting. Every point additionally carries an `overlay_label` (≤ 5 words, numbered when the type is a list) which is the on-screen text for that clip; these labels travel out-of-band in the API response and land only in `brief_segments`, never in `talking_points` jsonb.
- **Type-native shaping:** `postTypeBlock()` emits a different structure line, a different `TITLE SHAPE` exemplar, and different length rules per `post_types.key` — `contrast` gets "one speaker alternating between two sides… never two people talking"; `single_clip`/`replay_bait` gets the replay-bait rule (a 6–9 s clip whose on-screen text takes slightly longer to read than the clip runs, so the viewer loops it); carousels get "talking points are read on screen, not spoken" and put slide copy in `script`.
- **Deterministic title repair:** `numberedListTitle()` post-processes list types — if the title does not start with the chosen `point_count` digit, or is a verbatim copy of the search phrase, it is rewritten as `"{n} things to know about {topic}"` where topic is the search phrase with a leading interrogative (`is|are|does|do|how|why|what|when|should`) and trailing `?` stripped.
- **Credential separation:** the prompt forbids writing any creator credential into the hook or points, because one brief serves the whole roster and each creator's `credential_line` is rendered at record time from their profile. This is the generation-side half of a two-sided design; the recording-side half is `BeatPrompter`'s credential line.
- **Kill rather than pad:** `KILL_RULE` allows the model to answer `{"kill_reason": string}` instead of a draft, but the live rule is deliberately narrow — "almost never kill… only if the search phrase is empty or pure gibberish."

### 5.15 Seeded deterministic week layout

`_shared/shuffle.ts` → `hashSeed()`, `mulberry32()`, `seededShuffle()`, `buildFormatMix()`, `buildCreatorWeek()`. The only unit-tested module (`shuffle.test.ts`).

- **In:** the campaign's briefs (each with a format), the campaign id, and a creator id.
- **Out:** `{slots: [{brief_id, day 0–6, slot_index 0–2}], pool: brief_id[]}`.
- **Method:** an xmur3 string hash seeds a mulberry32 PRNG, which drives a Fisher–Yates shuffle; the seed is `campaignId + creatorId` (plus a `:video` / `:slides` / `:mix` suffix per stream). So the same campaign and creator always produce the same week, but two creators get different weeks — which is the point: the roster must not post the same brief on the same day. Pinned briefs are placed first (out of range or into a full day → the pool). Remaining capacity is `7 days × 3 slots − pinned`; `videosWanted` is the pool's video ratio scaled to the free capacity, clamped so neither format can be over-drawn. `buildFormatMix()` then shuffles a bag of `'video'`/`'slideshow'` tokens across the flattened day capacities and applies a **rebalance pass**: any day with ≥ 2 open slots that drew zero videos steals one from a day holding ≥ 2, so no multi-slot day is all slideshows while another hoards videos. Leftovers become the creator's swap pool.
- **Why:** determinism makes publish idempotent and debuggable (the `ON CONFLICT DO NOTHING` insert means a re-run is a no-op) while still giving each creator a distinct, format-balanced week.
- **Replaces:** `Math.random()`, a round-robin, or a constraint solver.

### 5.16 Largest-remainder ratio apportionment for week setup

`app/(admin)/week-setup.tsx` → `splitFamily()`. Described in §4d. The invariant is that the per-type counts sum **exactly** to the family target, which a naive `round(target × weight / total)` does not guarantee.

### 5.17 Search-phrase assignment with freshness partitioning

`lib/briefs-api.ts` → `createWeek()`. Described in §4d. The mechanism worth noting: a phrase is only "used" when a fill succeeds, never when a row is merely stamped, and the 28-day recency partition (`fresh` before `stale`) degrades gracefully when the bank (12 seeded phrases) is smaller than the week (30 slots) rather than erroring.

### 5.18 Retrieval / RAG

There is **no vector retrieval anywhere in this codebase** — no embeddings, no vector store, no similarity search, no chunk-and-retrieve. What takes its place is *deterministic selective context assembly*: `loadBrandContext()` (`_shared/wp8.ts`) reads a fixed set of rows, and `brandDocBlocks()` (`_shared/generateBrief.ts`) assembles a fixed set of blocks — brand name, `product_truth`, `voice`, `learnings`, the full approved-claim list with ids, and the hashtag bank. The `audience_niche` doc is deliberately **excluded** from generation ("the audience doc belongs to sourcing and the gate, not here", `_shared/wp8.ts`) and included in sourcing and gating via `audienceDoc()`. Every doc falls back to `legacyBrandLines()` when unwritten. Claims are retrieved *by id*: the prompt lists `- id {uuid}: {claim} ({what_it_does})` and the validator then checks that the returned `claim_id` is in the approved set — a closed-set citation contract enforced in code rather than a similarity search.

The dormant `_shared/doctrine.ts` → `assembleGenerationContext()` describes a stricter version of the same idea (the doctrine constant plus **exactly one** format spec, one claim, that format's tenant examples, the voice doc and a vocabulary sample, "by construction there is no way to inject a second format or a second brand doc"). It is not wired into any live path — see §12.

### 5.19 Anti-repetition

The doctrine text describes embedding-based anti-repetition ("every idea is embedded and compared against prior drafted and posted ideas"). **That is not implemented.** The anti-repetition that actually runs is: (a) the 28-day search-phrase freshness partition in `createWeek()`; (b) `content_fingerprint` dedupe on the scrape side; (c) `normalizeClaim()` exact-match dedupe on mined claims; (d) `loadExistingNames()` normalized-name dedupe on product features; (e) the swap pool excluding briefs already assigned to that creator.

### 5.20 Two-tier idempotency and claim locks

A recurring pattern worth calling out as one mechanism, because it appears in five places with the same shape — *claim the row, then do the expensive work*:

| Where | Lock |
|---|---|
| `render-submission` | `update … set render_status='rendering' where render_status in ('queued','failed'[,'rendering' for admins])` — the status filter is the lock; a second invoke mid-flight is a no-op unless an admin is explicitly restarting. |
| `poll-metrics` milestones | `claim_post_milestone(post_id, threshold)` RPC returning a boolean. |
| `poll-metrics` bounty | spend credits first, then `update assignments … where bounty_credited_at is null`; on `insufficient_credits` the stamp is left null so a later poll retries. |
| `notify-reminders` | insert into `creator_reminders` with a unique key; `23505` means someone else claimed it. |
| `notify-scheduled` / `weekly-payouts` | `update … where notified_at is null` / insert into `company_payout_runs` unique on `(company_id, period_end)`. |
| `stripe-webhook` topup | insert the ledger row **first** (unique `stripe_checkout_session_id`), and only then adjust the balance. |

### 5.21 Prepaid credit spend with asymmetric fees

`supabase/migrations/20260810010000_043_prepaid_credits.sql` → `spend_company_credits_for_earning()`; mirrored in TypeScript by `_shared/credits.ts` (`companyDebitCents` = `ceil(G × 1.10)`, `creatorNetCents` = `floor(G × 0.97)`).

- **Method:** for a gross earning G, the company is debited `ceil(G × 1.10)` and the creator is credited `floor(G × 0.97)`; the difference is booked as `fee_cents`. The function takes a `FOR UPDATE` lock on `company_billing`, refuses with `insufficient_credits` when the balance cannot cover the debit, writes the company ledger row and the creator wallet row in the same transaction, and is idempotent per `(assignment_id, kind)` via a partial unique index — a repeat call returns the prior amounts with `idempotent: true` rather than double-paying.
- **Rounding direction is deliberate and asymmetric:** ceil against the company, floor toward the creator's net, so the platform never under-collects or over-pays by a rounding cent.

### 5.22 Streaks

`supabase/migrations/20260730130000_012_streaks.sql` and `…041_streak_rewards.sql`.

- `streak_day_complete(company, creator, day)` — a scheduled day counts only when **every** assignment due that day is `submitted|approved|posted`, with a fallback to `content_tasks` when the creator has no assignments that day.
- `streak_missed_days(company, creator, after, before)` — counts distinct scheduled days in the open interval that are not complete, unioned across both lineages.
- `record_streak_approval()` — takes `FOR UPDATE` on the streak row (so two same-day approvals cannot double count or double pay), computes "today" in the **company's** timezone, and allows one grace miss per 30 days (`grace_used_on`).
- `streak_bonus_cents(days, settings)` — exact-match against the tenant's milestone list, and the *largest* milestone repeats at every integer multiple (with the shipped 3/10/31-day, $20/$100/$300 ladder, day 62 and day 93 also pay $300).
- `reset_broken_streaks()` runs at `30 8 * * *`, deliberately after `auto-fill` has created the day's work.

### 5.23 Metric extraction normalization

`poll-metrics/index.ts` → `extractMetrics()`, `asInt()`. Small but load-bearing: the provider returns a per-platform map whose shape varies (`post_metrics` vs `metrics`), whose numbers may arrive as strings, and which may carry `success: false` entries. `asInt()` floors and clamps at 0; `views` falls back to `impressions`; and `saves` is preserved as `null` when absent rather than coerced to 0, so "this platform does not report saves" and "this post has zero saves" stay distinguishable all the way to the UI, which renders a dash.

### 5.24 SSRF defence for user-supplied URLs

`_shared/crawlSite.ts` → `isPrivateOrLocalHost()`, `assertSafePublicHttpUrl()`. Blocks `localhost`, `.local`, `.internal`, `metadata.google.internal`, IPv4 loopback/private/link-local/CGNAT ranges (10/8, 127/8, 0/8, 169.254/16, 172.16–31/12, 192.168/16, 100.64–127/10), and IPv6 loopback/link-local/ULA (`::1`, `fe80:`, `fc`, `fd`); rejects embedded credentials and non-http(s) schemes. Critically, it **re-checks the final URL after redirects** (`fetchPage()` calls `assertSafePublicHttpUrl(res.url)`), which is the redirect-based SSRF bypass. Reused by `brand-ingest`, `ingest-features`, and `library-link` (which also re-validates a relative `og:image` resolved against the final page URL).

---

## 6. Prompts and prompt pipelines

Every LLM call in the repository is listed. Two transport helpers exist, both in `supabase/functions/_shared/wp8.ts`:

- `askClaude(system, user, maxTokens = 2048)` — raw `POST https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`, body `{model, max_tokens, system, messages: [{role: 'user', content: user}]}`. **No temperature, no top_p, no stop sequences, no tools, no streaming, no structured-output mode.** Model = `ANTHROPIC_MODEL` env, default `claude-sonnet-4-5`.
- `askClaudeVision(system, imageUrls, user, maxTokens = 2048)` — same, but `content` is an array of `{type: 'image', source: {type: 'url', url}}` blocks followed by one `{type: 'text'}` block.
- `askOpenAI(system, user, maxTokens = 2048)` — `POST https://api.openai.com/v1/chat/completions`, `temperature: 0.3`, model = `OPENAI_MODEL` env, default `gpt-4o-mini`. Used exactly once.

Every JSON-returning call is parsed by `parseClaudeJson<T>()`: strip a leading ```` ```json ```` fence and trailing fence, find the first `[` or `{`, `JSON.parse` from there. There is no schema validator and no repair loop at the transport layer; validation happens per-call-site.

### 6.1 Carousel slide OCR (vision)

**Where:** `scrape-trends/index.ts` → `ocrBatch()`; identical text in `ingest-brief/index.ts` → `ocrSlides()`.
**Model/params:** Claude vision, `max_tokens` default 2048. Inputs: up to 4 image URLs (scrape) or 6 (ingest-brief).

System:
```
You transcribe the text on social media slideshow images. Answer with a single JSON object: {"slides": string[]}, one string per image in order. Each string is all readable overlay/design text on that slide, cleaned up. Use "" for a slide with no text.
```
User: `Transcribe all {n} slides.`

**Output shape:** `{slides: string[]}`, mapped with `String()` and index-aligned to the input URLs.
**Feeds:** `trend_items.slide_texts` → the relevance gate, the classifier, claim mining, `contentFingerprint`, and (on the ingest-brief path) the brief generation source block. In `scrape-trends` the call is wrapped by the content-hash cache, so only cache misses are sent and the returned array is re-assembled from the cache map.
**Validation:** `Array.isArray(slides)` or return null; a null makes the item low-signal, which excludes it from classification and the golden set.

### 6.2 Trend annotation

**Where:** `scrape-trends/index.ts` → `annotate()`. `max_tokens: 4096`.

System:
```
You analyze trending short form posts for a UGC team. Answer with a single JSON array, one object per input item: {"index": number, "hook": string, "why_it_works": string}. hook: the post's attention grab in one line (quote the opening if available, otherwise infer from the caption; for slideshows the first slide is the hook). why_it_works: one punchy sentence a content strategist would say about why this post performed.
```
User (per item):
```
Item {i} ({platform} {format}, {views} views)
Caption: {caption[:300]}
Slides: [1] … [2] …          ← carousels, joined and cut at 1200 chars
Transcript: {transcript[:1200]}  ← videos; "unavailable" when null
```
**Output:** `Annotation[]` = `{index, hook, why_it_works}`.
**Feeds:** `trend_items.hook` / `.why_it_works`. On failure the whole batch is caught and logged, and `hook` degrades to `caption.slice(0,120)`.

### 6.3 Relevance gate

**Where:** `_shared/relevance.ts` → `buildGatePrompt()`; called from `scrape-trends/index.ts` → `runGate()` (`max_tokens: 4096`) and replayed by `scripts/relevance-regression.ts`.

System (verbatim; `${RELEVANCE_THRESHOLD}` interpolates to `6`):
```
You are the relevance gate for a UGC content engine. You judge scraped social posts against a brand's audience document and decide two things per post.

1. score: 0 to 10. Would this brand's exact audience follow the account that posted this? 10 means squarely in the niche and worth remaking, 0 means irrelevant. Viral but off-niche content scores low; a modest post squarely in the niche scores high. reason: one line.

2. remake_mode, by fixed rule, never freehand judgment:
- "beat_for_beat" only when the post wins on format: trending audio, a visual gimmick, or a timing-based punchline where deviating from the original structure would kill it.
- "structure_only" when the post wins on the idea: listicles, storytime, advice, hot takes, talking-head explanations. Copying these verbatim makes the brand look like a knockoff.
- Hard guardrail: if the post is outside the brand's niche (score below 6), remake_mode must be "structure_only". Take the idea only, never the execution.
remake_reason: one line naming which rule fired.

Answer with a single JSON array, one object per input item: {"index": number, "score": number, "reason": string, "remake_mode": "beat_for_beat" | "structure_only", "remake_reason": string}.
```
User:
```
Brand audience document:
{audienceDoc or "No audience document available."}

Labeled examples from this brand (ground truth, match this judgment):
- KEEP (reason): @handle (video): …
- KILL (reason): @handle (carousel): …
[balanced keeps/kills, ≤16, omitted entirely when there are none]

Posts to judge:

Item {i} ({platform} {format}, {views} views, @{handle})
Caption: {caption[:300] or "none"}
Slides: [1] … | Transcript: {transcript[:1200] or "unavailable"}
```
**Output:** `GateVerdict[]`.
**Feeds:** `trend_items.relevance_score/.relevance_reason/.remake_mode/.remake_reason`; the keeper decision for niche items (`score >= 6`); and downstream, `remake_mode` becomes an instruction line inside the task-draft prompt (§6.10).
**Validation:** batch-level try/catch; a failed batch leaves those items ungated (`relevance_score` null), and `auto-fill` treats null as still-eligible.

### 6.4 Format classification

**Where:** `_shared/classify.ts` → `buildClassifyPrompt()`; called from `classifyItems()` with `max_tokens: 8192`.

System:
```
You classify short form social posts against a closed library of twelve UGC formats. Answer with a single JSON array, one object per input item: {"index": number, "format_id": string | null, "confidence": number, "slot_fills": object, "reason": string | null}.

format_id: the single format the post instantiates, or null when it matches none cleanly. Do not force a fit; a vlog, a skit, or a pure entertainment post is null.
confidence: 0 to 1. Below 0.6 means you are guessing; prefer null with confidence 0.
slot_fills: only when format_id is set. Keys are that format's slot keys. Values are the post's actual content for that slot, quoted or tightly paraphrased from the transcript or slides, never invented. Omit slots the post does not fill. For list-like slots join the items with " | ".
reason: required whenever format_id is null or confidence is below 0.6. One short sentence naming what the post actually is (e.g. "day-in-the-life vlog, no claim or structure") or which formats it sits between. Null when the classification is confident.

The library:
- {format_id} ({family}). {when_to_use}
  Slots: {key} (required): {label}; {key}: {label}; …
[× 12]
```
User: one block per item — `Item {index} ({platform} {format})`, caption cut at 300, slides or transcript cut at 1500.

**Output:** `ClassifyVerdict[]`.
**Post-processing:** `confidence >= 0.6 && format_id` → keep the verdict; otherwise force `format_id = null`, empty `slot_fills`, and synthesize a reason if the model omitted one (`matched {id} below confidence threshold` / `no format fit, no reason given`). All verdicts are stored.
**Feeds:** `trend_items.format_id/.slot_fills/.classify_confidence/.classify_reason`; and, for donor keepers at `confidence >= 0.7`, `format_examples` rows (one per filled slot, trimmed, 1–600 chars).

### 6.5 Claim mining

**Where:** `_shared/mine-claims.ts` → `buildClaimMiningPrompt()`; called from `mineClaims()` with `max_tokens: 8192`.

System:
```
You mine an audience's own content and questions for claims a brand could build posts around. Answer with a single JSON object: {"claims": [{"claim": string, "proof": string | null, "audience_segment": string | null, "topic": string, "confidence": number}], "vocabulary": string[], "topic_by_item": [{"index": number, "topic": string}]}.

claims: statements worth making in content. Each is one sentence, concrete, in plain speech. proof: a number or named source from the material when present, else null. audience_segment: who specifically this speaks to, else null. topic: a 1 to 3 word lowercase topic label; reuse the same label for the same topic. confidence: 0 to 1 that this is a real recurring concern, not a one-off. Recurring questions and complaints are the best claims. Skip anything already covered by the existing claims list.
vocabulary: verbatim phrases the audience actually uses, lifted exactly from the material. 5 to 15 phrases, each 2 to 6 words, lowercase. No marketing language.
topic_by_item: assign every input item its dominant topic using the same labels, for saturation counting.
```
User: `Audience:\n{doc[:2000]}`, then `Existing claims (do not duplicate):` as a bullet list (≤ 60), then `Corpus:` (per item: caption ≤ 250, slides or transcript ≤ 1200), then `Questions from comment sections:` as a bullet list (≤ 40).

**Output:** `{claims[], vocabulary[], topic_by_item[]}` — three products from one call.
**Feeds:** `topic_by_item` is written to `trend_items.topic` *first* (matched by `source_url`), because the saturation window is then queried from that same table; each claim's `saturation_score` is computed by `saturationFor(claim.topic)`; claims are filtered against `existingNormalized` and inserted with `source: 'harvested'`, `status: 'candidate'`; vocabulary is deduped/length-filtered and upserted.
**Note:** the resulting `claims` and `vocabulary` rows are not read by any generation path today (§12).

### 6.6 Search-term proposal

**Where:** `scrape-trends/index.ts` → `pickTerms()`. `max_tokens: 512`.

System (interpolated with the exact remaining counts, each capped at 2 per run):
```
You turn a brand's audience document into social search inputs that surface real UGC creators the brand's audience already follows. Answer with a single JSON object: {"queries": string[], "hashtags": string[]}. queries: exactly {needQueries} TikTok search phrases (2 to 4 words, what real users type) tightly focused on the audience's real journey, not generic tips. hashtags: exactly {needHashtags} single-word Instagram hashtags (no # symbol, lowercase). Prefer terms about the audience's goals and status over broad skill content. Do not repeat these already-used terms: {joined list or "none"}.
```
User: the audience doc.
**Output:** `{queries?: string[], hashtags?: string[]}`. Hashtags are stripped of a leading `#` and lowercased; both lists are appended only up to the caps (3 queries, 3 hashtags) and only if not already present.

### 6.7 Codebase feature extraction

**Where:** `ingest-codebase/index.ts` → `EXTRACT_SYSTEM`, called by `extractChunk()` with `max_tokens: 4096`, one call per ≤ 80 000-char chunk.

```
You are reading a product codebase to build a claim library for short
form video ads. For each user facing capability, return:

name          what an admin would call it
what_it_does  one sentence, mechanism only. What happens, not what it
              means for the user.
              GOOD: "Writes personalized emails to every coach on a
                     target list and follows up automatically."
              BAD:  "Streamlines outreach so you can focus on the game."
surface       route or screen name if identifiable, else null
claim         one line a 20 year old could say on camera without sounding
              like an ad. Under 20 words. No seamless, powerful,
              revolutionary. No three item lists.
source_ref    file path

Only things a user can actually do. Skip internal utilities, admin
tooling, auth plumbing, anything behind an off feature flag. If unsure it
ships, leave it out. Return a JSON array and nothing else.
```
User: `--- FILE: {path} ---\n{content}` blocks joined by blank lines.
**Output:** a JSON array; each element passed through `sanitizeFeature()` which requires non-empty `name`, `what_it_does`, `claim`, `source_ref`.

### 6.8 Cross-chunk feature merge

**Where:** `ingest-codebase/index.ts` → `MERGE_SYSTEM`, called by `mergeFeatures()` with `max_tokens: 4096`. This is the second step of a two-step chain — map (extract per chunk) then reduce (merge across chunks).

```
You merge duplicate product feature extractions into a single list.
Deduplicate by capability (same thing under different names counts as one).
For each merged feature return:
name, what_it_does, claim, surface, source_ref

Rules:
- Prefer the clearest mechanism wording for what_it_does and claim.
- source_ref MUST survive. If merging two or more features, join their
  source_ref paths with ", " (comma-space). Never invent paths. Never drop
  a path that appeared on an input.
- surface: keep the most specific route/screen, else null.
- Return a JSON array and nothing else. Every item must have a non-empty
  source_ref.
```
User: `JSON.stringify(features, null, 2)`.
**Validation and fallback:** non-array response, or an empty cleaned set, falls back to `localDedupe()` — a deterministic normalized-name merge that unions `source_ref` paths. After the merge a second hard gate re-filters on non-empty `source_ref`.

### 6.9 Product-feature extraction from screenshots and pages (two prompt variants)

**Where:** `ingest-features/index.ts`. `extractSystem(productType)` picks between two prompts sharing a common preamble. Vision call `max_tokens: 4096` with up to 12 images; text call `max_tokens: 4096` over `crawlSite()` output.

Shared preamble (`EXTRACT_SHARED`):
```
You draft rows for a product claim library used in short form video ads.
Return a JSON array and nothing else. Each item:
name          what an admin would call it
what_it_does  one sentence, mechanism or measurable fact only. Not marketing benefit.
claim         one line a 20 year old could say on camera. Under 20 words.
              Concrete and checkable. No seamless, powerful, revolutionary,
              premium. No three item lists.
surface       where on the product/UI this came from if identifiable, else null
source_ref    the image URL or page URL this came from (copy exactly from the input labels)
```
Software variant (`EXTRACT_SOFTWARE`) appends:
```
Concrete means: what happens when the user does something.
  GOOD: "You hit send once and it goes out to fifty coaches."

SCREENSHOTS / MARKETING CAROUSELS (critical):
Read the product UI inside the image. IGNORE any headline, title, or
marketing text overlaid on or around it. Derive the claim from what the
interface shows a user doing. If a slide has no visible UI, skip it rather
than extracting from the copy.

Worked example:
  slide headline: FOLLOW UPS THAT SEND THEMSELVES
  UI shows: "12 follow ups drafted for you", "No reply in a week",
            per school rows, Send 12 follow ups button
  correct claim: If a coach doesn't reply in a week it drafts the
                 follow up and sends it

PAGES:
Ignore hero headlines and taglines. Prefer concrete UI copy, specs, pricing,
and described actions a user can take.

Only things a user can actually do or verify. Skip internal tooling and
vague brand promises.
```
Physical variant (`EXTRACT_PHYSICAL`) appends:
```
Concrete means: an attribute or spec someone who owns the product can verify.
  GOOD: "It holds forty ounces and keeps ice for a full day."

PRODUCT PHOTOS / PACKAGING (critical):
Extract ONLY from spec text: dimensions, capacity, materials, printed panel
data, care instructions, measurable claims on the back of the box.
IGNORE hero copy, taglines, lifestyle imagery, and adjectives like premium
or engineered. If an image shows no spec text, skip it rather than
extracting from marketing copy.

Worked example:
  hero copy:     ENGINEERED FOR ADVENTURE
  spec panel:    40 fl oz, 18/8 stainless, double wall vacuum, 24hr cold
  correct claim: It holds forty ounces and keeps ice for a full day

PAGES:
Ignore hero headlines, taglines, and lifestyle copy. Prefer specs,
materials, dimensions, capacity, care instructions, and measurable claims.

Only things a buyer can verify. Skip vague brand promises.
```
User (images): a label block `Image {n} source_ref={storagePath}` per image, then `Draft features from the product UI in these images.` (or `…from measurable spec text…`) and `Set source_ref to the matching source_ref label exactly.`
User (page): `page_url source_ref={url}\n\nPage text:\n{siteText}\n\nDraft features. Set every source_ref to {url} exactly.`
**Validation:** results whose `source_ref` is not in the allow-list of labels supplied in the prompt are **discarded** — a per-item provenance check enforced in code. The reason the product-type switch matters is recorded in mig 026: "Must be set before a company's first ingest; wrong-prompt rows are sticky under normalized-name idempotency."

### 6.10 Brand profile fields

**Where:** `brand-ingest/index.ts` → `generateProfileFields()`. Default `max_tokens: 2048`.
```
You analyze a brand for a UGC content engine. Answer with a single JSON object: {"tone": string, "audience": string, "products": string, "pillars": string[]}. tone: two or three sentences describing the brand voice for short form video. audience: two sentences describing who watches and buys, written so a founder nods and says "yes, that's them". products: two sentences on what is sold and the outcome customers get. pillars: 5 to 7 short content pillar names (2 to 4 words each) tailored to this brand, ordered by expected performance.
```
User: `sourceLines(src)` — brand name, website, handles, website text, recent captions.
**Validation:** throws `'Claude returned an incomplete brand profile'` unless `audience`, `products`, and an array `pillars` are all present.

### 6.11 Brand document drafting

**Where:** `brand-ingest/index.ts` → `draftDocs()`. `max_tokens: 8192`.
```
You write brand knowledge documents for a UGC content engine. Each document is markdown with short sections and concrete specifics, no filler, written so a content strategist can act on it directly. Answer with a single JSON object whose keys are exactly: {kinds joined}. Each value is the full markdown document as a string.

Document specs:
{one line per requested kind, from DOC_SPECS}
```
`DOC_SPECS` verbatim:
- `product_truth`: "what the product does, who pays for it and why, the 3 to 5 killer features worth plugging in content, natural product-plug angles (how to slot the product into a tips list or story without sounding like an ad), and banned claims or topics."
- `audience_niche`: "exactly who the audience is, their pains and dreams in their own words, the niche boundaries (what is squarely in the niche, what is adjacent, what is out), the account types they already follow, and the language and slang they use."
- `voice`: "how the brand sounds in short form content, with 5 to 8 real example lines written in that voice (hooks, mid-script lines, CTA lines), and what the voice never does."

**Guard:** only docs that are empty (or explicitly requested) **and** not `human_edited` are drafted; a human-edited doc raises "This doc was saved by a human. Clear it and save an empty doc, or edit it yourself."

### 6.12 Learnings refresh (monthly cron)

**Where:** `brand-ingest/index.ts` → `refreshLearnings()`. `max_tokens: 1024`.
```
You maintain the learnings document of a UGC content engine. Given the brand's current product document and freshly crawled site and social material, list only genuinely new or changed facts worth knowing for content creation (new features, pricing changes, positioning shifts, new campaigns). Answer with a single JSON object: {"findings": string[]}. 0 to 5 findings, one sentence each. Return an empty array if nothing changed.
```
User: the current `product_truth` doc (≤ 4000 chars) plus `sourceLines(src)`.
**Feeds:** appended to `brand_docs.learnings` as `\n\n## Site refresh {YYYY-MM-DD}\n- finding\n- finding`. Never overwrites; never touches human docs.

### 6.13 Brand-doc cleanup (the only OpenAI call)

**Where:** `brand-ingest/index.ts` → `cleanupDoc()`, via `askOpenAI` (`gpt-4o-mini`, `temperature: 0.3`, `max_tokens: 4096`), input capped at 12 000 chars.
```
You clean up brand knowledge documents for a UGC content engine. {CLEANUP_SPECS[kind]} Rewrite the user's draft into tight markdown: short sections, concrete specifics, no filler, no invented facts or features. Keep every real claim. Do not wrap the answer in JSON or code fences — return only the cleaned markdown document.
```
`CLEANUP_SPECS.product_truth`: "This is a product truth doc: what the product does, who pays, killer features, natural plug angles, banned claims."
`CLEANUP_SPECS.audience_niche`: "This is an audience niche doc: who the audience is, pains and dreams, niche boundaries, accounts they follow, language they use."
**Output:** raw markdown, returned to the editor. The header comment gives the reason for the provider switch: it is the "cheap ChatGPT path for light edits".

### 6.14 The structured brief generator (the main generation prompt)

**Where:** `_shared/generateBrief.ts` → `buildBriefSystem(postType, fallbackFormat, bannedPhrases)`. Called from `ingest-brief/index.ts` → `generateOnce()` with `max_tokens: 4096`.

The system prompt is assembled as a `\n\n`-joined list of blocks. In order:

1. `You write structured UGC content briefs for creators posting on TikTok and Instagram from their own accounts.`
2. `KILL_RULE`:
```
KILL ONLY AS LAST RESORT: almost never kill. If the topic is thin, still write the best concrete brief you can from product truth and audience. Do NOT kill because the topic is a competitor, a comparison, or feels awkward for a plug — pick the closest approved claim and angle the plug as what to do instead. Only answer {"kill_reason": string} if the search phrase is empty or pure gibberish with zero usable topic.
```
3. The contract, with the ordering rationale stated in the prompt itself:
```
Otherwise answer with a single JSON object, no markdown fences, no preamble. Generate the keys IN THIS EXACT ORDER — the order is the method: the claim and search phrase anchor the body, the hooks are written last against the finished body, the caption after the hooks:
{"claim_id": string | null, "search_phrase": string, "point_count": number, "talking_points": [{"id": string, "text": string, "is_product": boolean, "claim_id": string | null, "overlay_label": string}], "cta": string | null, "script": string | null, "target_words": number, "hook_options": [{"text": string, "score": number}], "title": string, "caption": string, "hashtags": string[], "why_it_works": string}
```
4. `postTypeBlock(postType, fallbackFormat)` — dynamic. With a post type it emits: `POST TYPE: {label} ({family}). Structure: {hook clip, one clip per talking point, outro clip | one single clip | photo carousel, one slide per talking point}. Talking points: {min} to {max} — pick the count this topic actually supports.` Then, conditionally:
   - `contrast` → `CONTRAST: one speaker alternating between two sides (red flags vs green flags, D3 commit vs D1 commit, 10 offers vs 0 offers). Never two people talking.`
   - `single_clip` → `REPLAY BAIT: one 6 to 9 second clip carrying on-screen text that takes slightly longer to read than the clip runs, so the viewer loops it. The hook options are candidates for that on-screen text. The single talking point says what the creator does on camera during the clip.`
   - a per-key `TITLE SHAPE:` line — `numbered_list`/`numbered_tips`: "lead with point_count, then a list frame tied to the topic — e.g. \"5 tips for a perfect highlight video\"… Never paste the search phrase as the title."; `talking_head`: "first-person or direct address story beat…"; `explainer`: "why/how explainer…"; `contrast`: "two sides with \"vs\" or clear opposition…"; `replay_bait`: "short loop provocation matching the on-screen text vibe, under 8 words."; `how_to`; `getting_started`.
   - carousel → `SLIDES: talking points are read on screen, not spoken. The first slide's text is the hook. script holds the slide-by-slide overlay copy, one short paragraph per talking point, in order.` Video → `SCRIPT: null for video; the talking points are the brief.`
   - `TARGET WORDS: target_words between {min} and {max}; the talking points must hold enough substance to fill it.` — or, when the type has no bounds, "no length target for this type; set target_words to your honest estimate of spoken words."
   Without a post type (legacy path) the block degrades to a generic format line, "POINT COUNT: 3 to 10; point_count comes from the concept ("5 tips" means 5), default 4", and no length target.
5. `Rules, measured against real high performing posts. Follow the numbers exactly.`
6. `plugRule(requiresPlug)` — when the type requires a plug:
```
CLAIM AND PLUG (settle this first): pick the one approved claim from the message that fits this topic best (or the closest useful one) and put its id in the top-level claim_id. Competitor or comparison topics still get a plug — angle it as the practical next step using a real approved capability (emails, school list, film, price), never invent competitor facts or fake positioning. The plug is ONE sentence composed from that claim — mechanism, not benefit: "writes and sends the emails and follows up", never "streamlines your outreach". Put that exact sentence in cta AND inside exactly one talking point, riding with that point's advice (set is_product true and claim_id on that point). Never the first point, never the last, never a standalone plug point.
```
   when it does not (`replay_bait`): `PLUG: this type takes NO plug and NO credential. claim_id null, cta null, is_product false on every point. Do not mention the product.`
7. `SEARCH_PHRASE_RULE`: `SEARCH PHRASE: the search string a target viewer actually types with a deadline in mind, e.g. "why am i not getting recruited for college soccer".`
8. `POINT_RULES`:
```
TALKING POINTS: beats, not lines. Under 25 words each. A creator reads a point and starts talking; they do not recite it. If a point reads as a complete performable sentence with closing rhythm, compress it. Give every point a short unique id. Also give every point an overlay_label: the on-screen label for its clip, 5 words or fewer, numbered when the type is a list ("4. Great thumbnail").
```
9. `CREDENTIAL_RULE`:
```
CREDENTIAL: never write a creator credential, background claim, or playing history into the hook or any talking point. "As a former D1 player, here are five tips" is forbidden. One brief serves the whole roster; each creator's credential renders at record time from their profile, so a written one doubles up. The hook starts at the content.
```
10. `SECOND_PERSON_RULE`: `SECOND PERSON: aim for 5 to 6 uses of "you" or "your" per 100 words. Every strong post talks straight at one person.`
11. `HOOK_RULES`:
```
HOOKS (write these LAST, against the finished talking points): hook_options is 8 to 10 variants, each 9 words or fewer. At least one restates the search phrase so a searcher knows they landed right; include contradiction and curiosity angles. Score each 0 to 100 for how hard it stops the viewer who typed the search phrase; do not reuse the same score. Single speaker only. No "Wait what?", no second voice, no dialogue, ever.
```
12. `TITLE: the admin-facing name of THIS post format — never copy search_phrase into title. For numbered_list and numbered_tips the title MUST start with the chosen point_count digit and a list phrase (tips / things / mistakes / signs). Other types follow TITLE SHAPE above. Keep it under 12 words.`
13. `CAPTION_RULES`: `CAPTION (after the hooks): under 200 characters, no hashtags inside it, and the search phrase appears in the first sentence. HASHTAGS: 3 to 5 tags chosen from the hashtag bank in the message by topical fit, not the same set every time.`
14. `WHY IT WORKS: one punchy sentence a content strategist would say about why this concept performs.`
15. When the tenant has any: `BANNED PHRASES: the admin has banned these exact phrases; never use them: {phrases joined with " | "}`

**User message** = `brandDocBlocks(brand)` then a blank line then the source lines. `brandDocBlocks()` emits `Brand: {name}`, then `Product truth:\n…`, `Voice:\n…`, `What has worked so far:\n…` for each non-empty doc (falling back to `legacyBrandLines()` when none exist), then either
```
Approved claims (the ONLY source for the plug; reference by id):
- id {uuid}: {claim} ({what_it_does})
```
or `Approved claims: none exist yet. Write the brief without a product plug (cta null, is_product false).`, then either `Hashtag bank (pick 3 to 5): {tags}` or `Hashtag bank: empty.`

Source lines, query path:
```
There is no source post. Draft a brief that answers this search phrase a target viewer types with a deadline in mind:
Search phrase (set search_phrase in the JSON to exactly this string): {query}
Invent the structure from the search phrase and brand.
Admin angle / context:\n{context[:1500]}          ← optional
```
Source lines, URL path:
```
Base the brief on this {platform} {video|photo slideshow} the admin pasted as a reference:
Caption: {caption[:400]}
Transcript: {transcript[:2000]}
Slide texts: [1] … [2] …            (cut at 2000)
Admin angle / context (follow this closely when rewriting — keep the source structure but shift the story to this angle):\n{context[:1500]}
Take the hook style and structure, then rewrite the body entirely for this brand and its product. Do not mention the original creator.
```

**Retry injection.** On a validation failure the second call appends:
```
Your previous draft failed validation. Fix every one of these and return the corrected JSON:
- {failure message}
- {failure message}
```

**Output normalization** (`normalizeGenerated()`): `kill_reason` short-circuits; each point gets `id ?? "p{n}-{8 hex}"`; `overlay_label` is split off into a parallel `overlayLabels` array (never stored in `talking_points`); `point_count` defaults to the array length; `target_words` defaults to 380; hooks go through `sortHooks()`; list-type titles go through `numberedListTitle()`; `script` is forced to null for video.

**Next hop:** `validateBrief` → one retry → `brief_validations` log → client `createBrief()` → `brief-assist { action: 'derive_segments' }` → `brief_segments` rows → the record screen and the render timeline.

### 6.15 Per-field regeneration prompts

**Where:** `_shared/generateBrief.ts` → `buildFieldSystem(field, postType, fallbackFormat, bannedPhrases)`; called from `brief-assist/index.ts` with `max_tokens: 4096`.

Common preamble:
```
You revise one part of a structured UGC content brief for creators posting on TikTok and Instagram. The current brief is in the message; regenerate ONLY what is asked and keep it consistent with the parts the admin is keeping. Answer with a single JSON object, no markdown fences, no preamble.
```
Per field, the preamble is followed by the reused rule blocks plus a narrow contract:

| field | contract | rule blocks reused |
|---|---|---|
| `search_phrase` | `{"search_phrase": string}` — "Write the search phrase the finished talking points actually answer, different from the current one." | `SEARCH_PHRASE_RULE` |
| `talking_points` | keys in this exact order: `{"claim_id", "point_count", "talking_points", "cta", "script", "target_words"}` | `KILL_RULE`, `postTypeBlock`, `plugRule`, `POINT_RULES`, `CREDENTIAL_RULE`, `SECOND_PERSON_RULE`, banned phrases |
| `talking_point` | `{"talking_point": {...}}` plus: "Regenerate ONLY the talking point at the index named in the message. Keep its id. Do not duplicate or contradict the other points; they stay exactly as given. If it is the is_product point, it stays the plug point: keep its claim_id and compose the plug sentence from that approved claim (the same sentence stays in cta, so keep it a single plug sentence riding with the point's advice)." | `KILL_RULE`, `POINT_RULES`, `CREDENTIAL_RULE`, `SECOND_PERSON_RULE`, banned phrases |
| `hook` | `{"hook_options": [{"text": string, "score": number}]}` | `HOOK_RULES`, `CREDENTIAL_RULE`, banned phrases |
| `caption` | `{"caption": string, "hashtags": string[]}` | `CAPTION_RULES`, banned phrases |

**User message** = `brandDocBlocks(brand)` + `draftContext(draft)` (title, search phrase, format, an indexed list of talking points annotated `(product point, claim {id})`, the plug sentence, hook options best-first, caption, hashtags, and slide copy when present) + a one-line ask.

**Validation chain:** the regenerated field is `merge()`d into the full draft first, so `validateBrief` scores the post as the editor will see it; on failure exactly one retry with the failure list; the point `id` is forcibly restored after the merge.

### 6.16 Review tier 2 (structural AI-tells)

**Where:** `_shared/reviewBrief.ts` → `TIER2_SYSTEM`; `brief-review/index.ts` with `max_tokens: 2048`, issued in parallel with tier 3.
```
You review one short-form social post script for structural tells that AI wrote it.
Check exactly four things:
1. dialogue: more than one speaker is implied anywhere in the spoken lines.
2. symmetry: balanced symmetrical clauses ("not X, but Y", "it isn't A, it's B", mirrored halves).
3. parallel_list: a three-item parallel list inside one sentence ("fast, easy, and cheap").
4. search_promise: the post does NOT deliver what the search phrase promises (fire when it fails to deliver).
For each fired check quote the offending line as evidence and, except for search_promise, offer one rewritten replacement that keeps the meaning and reads as one person talking.
Suggestions target a field: {"field":"talking_point","index":N,"replacement":"..."} for spoken lines, {"field":"hook","replacement":"..."} for the hook, {"field":"caption","replacement":"..."} for the caption.
Return ONLY JSON:
{"dialogue":{"fired":bool,"evidence":string|null,"suggestion":object|null},"symmetry":{...same},"parallel_list":{...same},"search_promise":{"fired":bool,"evidence":string|null}}
```
User (`buildTier2User` → `draftBlock`):
```
Search phrase the post must deliver on: {search_phrase or "(none)"}

Hook: {chosen hook or hook_options[0] or "(none)"}

Spoken lines, in order:
[0] {text}
[1] (product plug) {text}
…

Plug sentence: {cta or "(none)"}

Caption: {caption or "(none)"}

Slide copy:
{script}          ← carousels only
```
**Output → checks:** `parseTier2()` emits `{check_id: dialogue_implied | symmetrical_clauses | parallel_list | search_promise_unmet, tier: 2, severity: 'warn'}` with the evidence quoted into the message; suggestions are accepted only if `field` is one of the five known targets and `replacement` is non-empty (`toSuggestion()`).

### 6.17 Review tier 3 (spoken vs written)

**Where:** `_shared/reviewBrief.ts` → `TIER3_SYSTEM`; `max_tokens: 512`.
```
You read one short-form social post script. Answer one question only:
does this read as SPOKEN, like one person talking to a friend, or as WRITTEN copy?
Return ONLY JSON: {"spoken":bool,"worst_line":string|null}
worst_line is the single most written-sounding line, quoted verbatim. Null when spoken is true.
```
User: the same `draftBlock` as tier 2.
**Output → checks:** `parseTier3()` defaults `spoken` to true when the key is absent (`raw.spoken !== false`), nulls `worst_line` when spoken, and otherwise emits one `reads_as_written` check at `tier: 3, severity: 'warn'` (the heaviest deduction in the scoring table, 20 points).

### 6.18 Legacy task draft (still live on the `auto-fill` and `generate-script` paths)

**Where:** `_shared/wp8.ts` → `generateTaskDraft(brand, trend)`. Default `max_tokens: 2048`.
```
You write UGC content briefs for creators posting on TikTok and Instagram. You always answer with a single JSON object: {"title": string, "hook": string, "script": string, "caption": string, "brief": string, "format": "video" | "photo_carousel"}. The title is a short punchy task name a creator scans in a feed (under 8 words). The hook is the first spoken line, under 12 words, engineered to stop scrolling. The script is roughly 60 seconds spoken aloud, written in the brand voice, first person, no camera directions, split into 3 or 4 short paragraphs separated by blank lines, and the first paragraph starts with the hook. The caption is under 200 characters with a clear call to action. The brief is one or two plain sentences telling the creator what this post is and why they are making it, like a short job description (no script text). The format is "photo_carousel" only when the idea is clearly a text-on-image slideshow (lists, tips, before/after stills); otherwise "video". Plain language only, no hashtag spam (2 hashtags max).
```
User: selective doc injection (`Brand:`, `Product truth:`, `Voice:`, `What has worked so far:`, falling back to `legacyBrandLines`), a `CTA:` line mapped from `brand_profiles.buying_path` via `BUYING_PATH_CTA` (`link_in_bio` → "send viewers to the link in bio", `dms` → "tell viewers to DM the account", `website` → "point viewers to the website"), then the trend block:
```
Base the brief on this trending {platform} {post|photo slideshow} ({views} views):
Its hook: {hook}
Why it works: {why_it_works}
Caption: {caption[:400]}
Slide texts: [1] … [2] …
Transcript: {transcript[:2000]}
{remakeLine}
Mode reason: {remake_reason}
The source is a photo slideshow, so use format "photo_carousel" and write the script as slide-by-slide overlay text (one short paragraph per slide).
Do not mention the original creator.
```
`remakeLine` is one of two fixed strings selected by the gate's `remake_mode` — this is the point where the gate's rule-based verdict becomes a generation instruction:
```
Remake mode: BEAT FOR BEAT. This post wins on format. Keep its structure, timing, and visual concept intact and swap in this brand and its people; deviating from the format kills it.
```
```
Remake mode: STRUCTURE ONLY. This post wins on the idea. Take the hook style and skeleton, then rewrite the body entirely in the brand voice. Copying it verbatim makes the brand look like a knockoff.
```
With no trend: `No trend reference. Draft an original brief from one of the content pillars.`
**Post-processing:** throws if `title`, `script`, or `caption` is missing; `estimateSeconds()` computes `round(words / 150 × 60)` clamped to 20–90 s (≈150 spoken words per minute) into `content_tasks.estimated_seconds`.

### 6.19 The dormant doctrine prompt

**Where:** `_shared/doctrine.ts` → `DOCTRINE` (a ~60-line constant covering distribution physics, universal rules, banned constructions, the search layer, the comment engine, selection rules, and a fixed generation order) and `assembleGenerationContext()`, which concatenates the doctrine with exactly one rendered `FormatSpec`, one claim (including its saturation, rendered as "Saturation: unknown (corpus too small to measure)" when null), that format's tenant examples, the voice doc, and a vocabulary sample.

**Nothing imports either.** `scripts/seed-formats.ts` imports only `BIBLE_VERSION` from this file. The live generator (`generateBrief.ts`) implements a different, narrower contract: it never injects the doctrine text, never injects a `formats` row, and draws its plug from `product_features` rather than from `claims`. Several doctrine rules did survive into the live prompt in reworded form (hooks ≤ 9 words, hooks last and plural, the plug riding inside a body item and never first or last, banned hedges and adjective stacking, the search phrase in the caption's first sentence, 3–5 hashtags, kill rather than pad) — those are the ones that also became deterministic checks in `validateBrief`.

### 6.20 Chain summary

| Chain | Steps | Validation between steps |
|---|---|---|
| Codebase → claims | extract (N calls, one per chunk) → merge (1 call) | `sanitizeFeature` after each; `localDedupe` fallback; `source_ref` hard gate twice; normalized-name idempotency against the DB |
| Scrape → library | OCR (cached) / transcribe → annotate → **gate ∥ classify** → comments → claim-mine | per-batch try/catch; confidence thresholds; corpus routing; normalized-claim dedupe |
| Brief fill | generate → `validateBrief` → (retry once with failures) → validate → log | `brief_validations` rows per attempt; kill short-circuits |
| Field regen | generate → merge into draft → validate → (retry once) → validate | id restoration; `hook_may_be_stale` flag |
| Review | tier 1 (deterministic) ∥ **tier 2 ∥ tier 3** (concurrent) → score | field allow-list on suggestions; `spoken` defaults true |
| Brand ingest | crawl ∥ captions → profile fields → docs (conditional) | `human_edited` guard; incomplete-profile throw |

---

## 7. Video and media pipeline

No FFmpeg binary ships with this codebase. FFmpeg runs as a remote job on Upload-Post's FFmpeg editor endpoint; Noni composes the command string and submits it with a list of input URLs. `{input0}…{inputN}` and `{output}` are Upload-Post placeholders substituted server-side.

### 7.1 Job runner

`_shared/assemble.ts` → `runFfmpegJob({admin, apiKey, files, fullCommand, outputPath, label})`:
1. `POST https://api.upload-post.com/api/uploadposts/ffmpeg/jobs/upload` with `{files, full_command, output_extension: 'mp4'}` and `Authorization: Apikey {key}`.
2. Poll `GET .../ffmpeg/jobs/{job_id}` every **3 000 ms**, up to **50 attempts** (≈150 s ceiling). `FINISHED` breaks, `ERROR` throws, exhaustion throws `ffmpeg {label} timed out`.
3. `GET .../ffmpeg/jobs/{job_id}/download`, read as `ArrayBuffer`, upload to the `videos` bucket at `outputPath` with `contentType: 'video/mp4', upsert: true`.

Inputs are always 1-hour signed Supabase Storage URLs produced by `signVideoUrls()`.

### 7.2 Command 1 — normalize + concat + trim + loudness, in a single pass

`_shared/assemble.ts` → `stitchAndEditPass()`. For N clips, the generated command is:

```
ffmpeg -y -hide_banner -ss 0.15 -i {input0} -i {input1} … -i {inputN-1} \
  -filter_complex "
    [0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[v0];
    [0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0];
    …repeated per input i…
    [v0][a0][v1][a1]…concat=n=N:v=1:a=1[cv][ca];
    [ca]silenceremove=stop_periods=1:stop_duration=0.25:stop_threshold=-45dB:detection=peak,
        loudnorm=I=-16:TP=-1.5:LRA=11[outa]
  " \
  -map "[cv]" -map "[outa]" \
  -c:v h264_nvenc -preset p5 -cq 23 \
  -c:a aac -b:a 128k -shortest {output}
```

Design points recorded in the code comments:
- **One job, one re-encode.** Stitching and the edit pass were previously two jobs; they were merged so there is a single re-encode and a single poll against the wall clock. The same command handles `N = 1`, which is why the old standalone edit pass could be deleted.
- **Per-input normalization is mandatory before concat.** Capture pins codec and resolution, "but expo-camera cannot pin fps or audio sample rate, and front/back camera flips can change frame size." Hence `fps=30`, scale-to-cover + centre `crop=1080:1920`, `setsar=1`, and `aresample=48000` + `fltp`/stereo on every input.
- **Head trim.** `-ss 0.15` is placed **before the first `-i` only**, so it is an input seek applied to input 0 alone — described as "sync-safe". This 150 ms is mirrored in the render timeline as `HEAD_TRIM_MS = 150`.
- **Tail trim.** `silenceremove` with `stop_periods=1, stop_duration=0.25, stop_threshold=-45dB, detection=peak` removes trailing silence from the concatenated audio; `-shortest` truncates video to the shortened audio. The timeline comment notes this only shortens the final clip and never shifts a start, which is what makes absolute overlay timing safe.
- **Loudness.** `loudnorm=I=-16:TP=-1.5:LRA=11` — single-pass EBU R128 at the streaming-platform target.
- **Encoder.** `h264_nvenc -preset p5 -cq 23`, AAC 128 kbps — i.e. the remote service is expected to have NVENC.

Output: `videos/{companyId}/{targetId}/{version}-edited.mp4`, written back to `submissions.video_path`.

### 7.3 Command 2 — green-screen chroma-key composite (pre-pass)

`_shared/assemble.ts` → `greenScreenComposite()`. Runs **before** stitching, per segment whose `brief_segments.layout = 'green_screen'` and which has a screenshot, so that downstream nothing knows the difference.

```
ffmpeg -y -hide_banner -loop 1 -i {input0} -i {input1} -i {input2} \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg];
    [1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,
         chromakey=0x00FF00:0.28:0.06[fg];
    [bg][fg]overlay=shortest=1[outv]
  " \
  -map "[outv]" -map 2:a? \
  -c:v h264_nvenc -preset p5 -cq 23 -c:a aac -b:a 128k -shortest {output}
```
- input0 = the brief's screenshot (`-loop 1`, becomes the full-frame background), input1 = the matting output (creator on solid green), input2 = the original raw clip, present **only** to supply audio (`-map 2:a?`, optional-stream syntax) because the matting output is video-only.
- `chromakey=0x00FF00:0.28:0.06` — similarity 0.28, blend 0.06.
- Output path `videos/{company}/{target}/{version}-gs-{slot}.mp4`, and `segmentPaths[slot]` is replaced in place so the stitch consumes the composite.

**Matting.** `_shared/backgroundRemoval.ts` → `removeBackground()`: `POST https://api.replicate.com/v1/predictions` with the pinned Robust Video Matting version `2d2de06a76a837a4ba92b6164bf8bfd3ddb524a1fb64b0d8ae055af17fa22503` and `input: {input_video, output_type: 'green-screen'}`, then poll every 3 000 ms up to 100 attempts (≈300 s). This is the only file that knows Replicate's request shape.

**Fallback when `REPLICATE_API_TOKEN` is absent.** `renderGreenScreenClip()` in `_shared/renderAdapter.ts` composites the clip **uncut** as a circular bubble over the full-frame screenshot via Creatomate — image on track 1 at 100%×100% `fit: cover`, video on track 2 at `x: 50%`, `y: 76%`, `width: 42%`, `border_radius: 50%`, with a shadow. Because a circle needs equal pixel sides and width/height are percentages of *different* frame dimensions, the bubble height is computed as `bubbleWidth × frameWidth / frameHeight`. An `overlayWarning` string is returned to the caller and surfaced to the admin. If neither Replicate nor Creatomate is configured the assembly throws with an explicit message naming both env vars.

### 7.4 The render timeline (service-agnostic intermediate representation)

`_shared/renderTimeline.ts` → `buildRenderTimeline({briefSegments, durationsMs, textOverlay})`. This is the pipeline's canonical object; the render service sits behind a thin adapter that consumes it. It is persisted on `submissions.render_timeline`.

```ts
{ width: 1080, height: 1920,
  text_overlay: { enabled, mode, text_color, accent_color },
  clips:  [{ slot_index, duration_ms }],
  texts:  [{ text, start_ms, duration_ms, y }],
  images: [{ screenshot_path, start_ms, duration_ms, x, y, width }] }
```
Construction: walk the clips in order maintaining a cursor. `effectiveMs = max(0, durationsMs[i] − (i === 0 ? HEAD_TRIM_MS : 0))` — the head trim is subtracted from clip 0 only, matching `-ss 0.15`. `brief_segments` are matched to clips **by array order** after sorting on `slot_index`. A text element is emitted when the overlay is enabled, the segment has `show_on_screen`, and the trimmed `overlay_text` is non-empty; its duration is `min(TEXT_HOLD_MS = 3000, effectiveMs)` and its `y` is `segment.text_y ?? TEXT_Y (0.45)`. An image element is emitted for any segment with a `screenshot_url` **except** `green_screen` ones (already composited into the clip), spanning the clip's whole duration, at `screenshot_x ?? 0.5`, `screenshot_y ?? 0.62`, `screenshot_width ?? 0.85`. `cursorMs += effectiveMs`.

Timing is **absolute on the stitched output**, which is why per-clip `duration_ms` must be captured at submit time; if any clip lacks a duration the whole overlay pass is skipped with a warning rather than guessed (`'overlays skipped: this submission has no per-clip durations'`).

### 7.5 On-screen text and screenshot compositing

`_shared/renderAdapter.ts` — the only file that knows Creatomate's shape.

`toElements()` builds `[{type:'video', track:1, source: signedStitchedUrl}, …texts, …images]`. Text elements share `TEXT_BASE` = `{x:'50%', x_alignment:'50%', y_alignment:'50%', font_family:'TikTok Sans', font_weight:'700', line_height:'128%'}`; the comment states the reason for the font choice: "TikTok Sans is TikTok's own caption font, open sourced on Google Fonts… Using it is what makes burned-in text read as native TikTok/Instagram text instead of 'an edit'." Every mode is **one auto-wrapping element**, exactly like a TikTok text box, and newlines in the overlay text become line breaks inside the same bubble (`text.split('\n').map(trim).filter(nonEmpty).join('\n')`).

Three modes (`textProps(overlay)`), all at `width: '78%'`:

| mode | properties |
|---|---|
| `box` (default) | `font_size_maximum: 4.4 vmin`, `fill_color: text_color`, `background_color: accent_color`, `background_x_padding: 58%`, `background_y_padding: 42%`, `background_border_radius: 52%` — a rounded pill hugging each wrapped line |
| `outline` | `font_weight: 800`, `font_size_maximum: 4.6 vmin`, `fill_color: text_color`, `stroke_color: accent_color`, `stroke_width: 0.4 vmin` |
| `plain` | `font_size_maximum: 4.2 vmin`, `fill_color: text_color`, `shadow_color: rgba(0,0,0,0.6)`, `shadow_blur: 1.2 vmin` |

Defaults live in `DEFAULT_TEXT_OVERLAY` (`{enabled: true, mode: 'box', text_color: '#B73B6B', accent_color: '#F9C9DC'}`) with the DB column default set to TikTok's palette red `#EA403F` on white (mig 039: "so burned-in captions read as native TikTok text"). Image elements convert normalized coordinates to percentages and add `fit: 'contain'`, `border_radius: '2.5 vmin'`, and a shadow.

`runRender()` posts to `https://api.creatomate.com/v1/renders`, polls every **3 000 ms** up to **40 attempts** (≈120 s), then downloads the finished MP4 and returns the bytes. The caller uploads them to `videos/{company}/{target}/{version}-rendered.mp4` and repoints `submissions.video_path`.

### 7.6 Client-side placement and preview (the coordinates that drive the render)

Two admin surfaces write the normalized coordinates the timeline consumes:

- `components/admin/editor/PlacementSheet.tsx` — a 9:16 canvas standing in for the creator's recording. `PanResponder`-driven drag for the screenshot and a separate vertical drag for the text bubble, plus a width slider clamped to `[0.3, 1.0]`. Defaults are mirrored from `renderTimeline.ts` (`DEFAULT_X 0.5`, `DEFAULT_Y 0.62`, `DEFAULT_WIDTH 0.85`, `DEFAULT_TEXT_Y 0.45`). The screenshot's aspect ratio is measured once with `Image.getSize`. The header comment states the contract: "Coordinates are normalized 0-1 center + width fraction, the same shape the render timeline uses, so what is saved here is exactly what the render places."
- `components/admin/editor/OverlayEditor.tsx` — a story-style composer with two modes. Text mode opens focused; Done dismisses the keyboard and the text becomes freely draggable and pinchable; a bottom-right "Add text" commits. Media mode drags/pinches the screenshot with three snap chips (`top_left` 0.23/0.19/0.46, `top_right` 0.77/0.19/0.46, `center` 0.5/0.46/0.66) while free drag stays authoritative. Font sizes `[20, 26, 32]` with a pinch range of 14–64, a ten-swatch colour palette, and a `mixHex()` helper that washes the chosen colour into a pastel box fill (default `#EB4C89`, "TikTok Classic"). It saves `overlay_text`, `show_on_screen`, `overlay_style {color, bg, size, x}`, `text_y`, and `screenshot_x/y/width`. The preview loads the real `TikTokSans_700Bold` font so the on-device preview matches the burned-in output.

`components/creator/SegmentOverlayPreview.tsx` renders the same overlay live on the record screen, so the creator frames the shot around where the text and screenshot will land.

### 7.7 Publishing payload construction

`post-approved/index.ts`. A single `FormData`:

| field | value |
|---|---|
| `user` | `profiles.upload_post_profile` (created as `c_{uuid without dashes, first 20 chars}` by `social-connect`) |
| `title` | the brief's `caption` (falling back to `title`, then `'New post'`) |
| `async_upload` | `'true'` |
| `platform[]` | one entry per platform — `['tiktok','instagram']` for assignments; `content_tasks.platforms` for legacy tasks |
| `video` | a 1-hour signed URL to the finished MP4 — video posts, `POST /api/upload` |
| `photos[]` | one 1-hour signed URL per slide, in slide order — carousels, `POST /api/upload_photos` |

Carousel slides are the creator's picked photos, uploaded by `submitAssignmentPhotos()` to `videos/{company}/{assignment}/{version}-slide-{n}.{jpg|png|webp}` (migration 034 widened the `videos` bucket's mime allow-list to admit images). Carousels are never stitched or overlaid: `render-submission` marks any non-`.mp4`/`.mov` submission `render_status: 'ready'` immediately, and the trending sound is added by hand afterwards (§4h).

### 7.8 Other media handling

- **Thumbnails.** `expo-video-thumbnails` `getThumbnailAsync(uri, {time: 0})` for the between-takes preview.
- **Duration probing.** `expo-video` `createVideoPlayer` used purely as a metadata prober (§4g).
- **Screenshots into briefs.** `uploadSegmentScreenshot()` (`lib/briefs-api.ts`) fetches the local URI, converts to a blob, and uploads to `brief-assets/{companyId}/{briefId}/{segmentId}.jpg` with `upsert: true`; reads are 1-hour signed URLs.
- **Warm-up recordings and profile screenshots.** `account-verification` bucket, timestamped paths, 100 MB cap.
- **Format conversion.** There is none on-device. Everything is uploaded as captured (`video/mp4` content type asserted at upload) and all conversion happens inside the two FFmpeg commands above.

---

## 8. Warm-up verification specifics

**Summary up front: verification is manual admin review. There is no OCR, no ML, no automated classification, and no frame analysis of the screen recording anywhere in this repository.** The only automated check on the media is a client-side duration comparison. The schema, however, was deliberately shaped so that an automated pass could be added later without a data migration.

### 8.1 What "warm-up" is

`app/(creator)/setup/warmup.tsx`, `INFO_PAGES`. The creator is instructed to spend 15–20 minutes per app searching for niche content, liking and saving it, following relevant accounts, and watching videos to the end, so the recommendation algorithm classifies the fresh account into the target niche before its first post. The stated rationale in the copy: "A warm account gets shown to soccer players and their parents. A cold account gets shown to nobody, no matter how good the post is."

### 8.2 Capture

The recording is made **outside Noni** with the operating system's own screen recorder; Noni never drives capture. The creator then imports it from the camera roll:

```ts
ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.85 })
```

Two required slots, declared in `RECORDING_SLOTS`:

| kind | label | hint | `minSeconds` |
|---|---|---|---|
| `tiktok-recording` | TikTok For You recording | 15 seconds minimum of continuous For You scrolling | 15 |
| `instagram-recording` | Instagram recording | 20 seconds scrolling home, then explore, then reels | 20 |

### 8.3 The one automated check

`pickRecording()`:
```ts
const seconds = (asset.duration ?? 0) / 1000;
if (seconds > 0 && seconds < slot.minSeconds - 1) { Alert.alert('Recording too short', …); return; }
```
A client-side duration floor with a 1-second tolerance. Note the `seconds > 0` guard: if the picker reports no duration (0 or `undefined`), the check is skipped and the file is accepted. Nothing re-validates duration server-side. Nothing inspects a single frame.

### 8.4 Storage

`uploadVerificationAsset()` (`lib/creator-accounts-api.ts`) → private `account-verification` bucket, path `{companyId}/{creatorId}/{kind}-{Date.now()}.{mp4|jpg}`, `contentType: 'video/mp4'`, `upsert: false`. The timestamp means every resubmission is a new object and prior attempts are retained. Bucket policy (mig 027): any member of the company may read objects under their company's folder; any authenticated user may insert under their own company prefix. 100 MB file cap, mime allow-list `video/mp4, video/quicktime, image/jpeg, image/png, image/webp`. Reads by the admin go through 1-hour signed URLs (`signedVerificationUrl`).

### 8.5 Submission

`submitCreatorAccount()` upserts `creator_accounts` on `(company_id, creator_id)` with `status: 'pending'`, both recording paths, both handles, both profile screenshots, and `reason: null` (clearing any prior send-back), then fires the `account_submitted` push to every campaign manager. Step 1 of the flow (`saveCreatorAccountDraft`) writes `status: 'needs_changes'` as a draft state, because the approval queue lists only `pending` rows and the CHECK constraint has no `draft` value.

The warm-up screen additionally requires that step 1 is complete — both handles and both profile screenshots must already be on the row — and refuses with "Finish step one first" otherwise. A slot already uploaded can be left as-is on resubmission; `existingRecordingPath()` reuses the stored path.

### 8.6 Evaluation — manual, but structured

`app/(admin)/account-approval/[accountId].tsx` plays both recordings from signed URLs alongside both profile screenshots and the account template, and presents four checkboxes defined in `lib/creator-accounts-api.ts`:

```ts
export const DECISION_CHECKS = [
  { key: 'instagram_recording_ok',    label: 'Instagram recording shows home, explore, reels' },
  { key: 'tiktok_recording_ok',       label: 'TikTok For You recording is 15s or longer' },
  { key: 'feed_is_niche',             label: 'Feed is college soccer and recruiting content' },
  { key: 'profile_matches_template',  label: 'Profiles match the account template' },
];
```

`decideAccount()` writes `status` (`approved` | `needs_changes`), `reason` (**required** when sending back — enforced in the function, not only the UI), `decision` as a four-boolean jsonb object, `decided_by`, and `decided_at`, then fires the `account_decided` push.

The design intent is recorded twice, in the migration and in the API module:
> "decision is structured data (not a free-text note) so this can later become an automated vision check." (mig 027)
> "The admin decision, stored as structured data (not free text) so the same checks can later run as an automated vision pass over the uploads." (`lib/creator-accounts-api.ts`)

So the four booleans are simultaneously the human verdict and the label schema a future classifier would predict — and the recordings are retained under stable paths, which is the training corpus. That corpus is being accumulated today; nothing consumes it.

### 8.7 What the verdict gates

`publish-campaign/index.ts` intersects the company's creators with `creator_accounts` rows at `status = 'approved'` and refuses to publish at all if the intersection is empty ("no creators with approved accounts; approve accounts in Review first"). An unapproved creator therefore receives no assignments, which means no recording, no publishing, and no bounty. `lib/setup.ts` → `deriveSetupState()` drives the creator-side checklist off the same row.

### 8.8 The parallel account-template mechanism

`lib/account-template.ts` stores a company-wide standard in `companies.settings.account_template` (Instagram bio, TikTok bio, Instagram link, profile-picture path, example-screenshot path) and `suggestAccountNames()` generates candidate display names and handles (§4f). The fourth decision checkbox — "Profiles match the account template" — is the human comparison of the submitted profile screenshots against that stored standard. The template's profile picture is saved to the creator's camera roll via `expo-media-library` (the `savePhotosPermission` string in `app.json` names exactly this) so they can set it on both platforms.

---

## 9. Third-party integrations

| Service | Data in | Data out | SDK or wrapper |
|---|---|---|---|
| **Anthropic** | System + user strings; for vision, public/signed image URLs as `{type:'image', source:{type:'url'}}` blocks. No tenant PII beyond brand documents and public post text. | Text, always expected to be JSON. | **Custom wrapper**, no SDK: `askClaude` / `askClaudeVision` in `_shared/wp8.ts` are hand-rolled `fetch` calls. `parseClaudeJson()` strips fences and locates the first bracket. No temperature/top_p/tools/streaming/structured-output. Retries are per-call-site, not in the transport. |
| **OpenAI** | One doc-cleanup call. | Raw markdown. | Custom `fetch` wrapper `askOpenAI`, `temperature: 0.3`. |
| **Apify** | Actor input JSON: `{profiles[]}`, `{searchQueries[], resultsPerPage}`, `{hashtags[], resultsLimit}`, `{usernames[], resultsLimit}`, `{postURLs[]}`, `{directUrls[], resultsType, resultsLimit}`, plus `downloadSubtitlesOptions: 'DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES'` and `shouldDownloadCovers: true`. Actors used: `clockworks~tiktok-scraper`, `clockworks~tiktok-comments-scraper`, `apify~instagram-hashtag-scraper`, `apify~instagram-profile-scraper`, `apify~instagram-scraper`. | Arrays of post objects; a transcript file URL in the actor's KV store. | **Custom wrapper**: `apifyRun()` calls the synchronous `run-sync-get-dataset-items` endpoint with a 240 s `AbortSignal.timeout`. Meaningful custom logic on top: profile batching at 4 handles per call to stay inside the sync-run timeout; per-group try/catch so one bad handle does not kill a run; `tiktokSlideUrls()` normalizing two different actor shapes for photo-mode posts (`imagePost.images[].imageURL.urlList[0]` vs `slideshowImageLinks[].downloadLink`); `mapTikTok`/`mapInstagram` normalizing both platforms into one `ScrapedItem` type; and a note that the Instagram profile actor's `resultsLimit` is best-effort and may be ignored. |
| **Deepgram** | `{url: mediaUrl}` to `/v1/listen?model=nova-3&smart_format=true`, 90 s timeout. | `results.channels[0].alternatives[0].transcript`. | Thin `fetch` wrapper (`transcribe`). It is the **fallback** tier: the Apify actor's own transcription is tried first, and `resolveTranscript()` is the custom two-tier resolver. |
| **Upload-Post** | Four distinct surfaces. (1) FFmpeg jobs: `{files[], full_command, output_extension}` — Noni composes the entire filtergraph. (2) Publishing: multipart `FormData` with signed media URLs. (3) Status: `request_id`. (4) Analytics: `request_id` + optional platform. (5) User management: `{username}`, and `generate-jwt` with `{username, platforms, show_calendar, connect_title, connect_description}`. | Job ids and MP4 bytes; per-platform `{success, url, post_id, error}`; a per-platform metrics map; a hosted `access_url` for the creator to link their accounts. | **Custom wrappers throughout** (`_shared/assemble.ts`, `post-approved`, `poll-metrics`, `social-connect`). The polling loops, the deterministic profile-username derivation (`c_{uuid.slice}`), the 409-tolerant profile creation, the `extractMetrics` shape normalizer, and the early-exit poll heuristic are all Noni code. |
| **Creatomate** | A `source` object: `{output_format, width, height, [duration], elements[]}` built by `toElements()` from Noni's own `RenderTimeline`. | A render id, then a URL, then MP4 bytes. | **Custom adapter** (`_shared/renderAdapter.ts`), explicitly isolated: "This is the ONLY file that knows Creatomate's request shape. If the service changes, this file is replaced and the pipeline stays untouched." |
| **Replicate** | `{version: '2d2de06a…', input: {input_video, output_type: 'green-screen'}}`. | A URL to the matted video. | **Custom wrapper** (`_shared/backgroundRemoval.ts`), same isolation note. Model version is pinned. |
| **Supabase** | Everything. | Everything. | Official `@supabase/supabase-js` v2 on both sides. Non-standard usage worth noting: server code uses the **service-role** client for cross-tenant work but `publish-campaign` deliberately builds a **caller-scoped** anon client so RLS applies; `lib/supabase.ts` overrides `global.fetch` with `expo/fetch` on native (RN's fetch rejects some HTTPS with "Network request failed") and the browser fetch on web, and pins `flowType: 'pkce'`; several transactional operations are pushed into Postgres functions (`publish_campaign_assignments`, `sync_brief_segments`, `spend_company_credits_for_earning`, `claim_post_milestone`, `library_our_posts`, `record_streak_approval`) rather than done client-side. |
| **Stripe** | Official `npm:stripe@17`. Three flows: Checkout in `setup` mode (save a payment method) and `payment` mode (prepaid top-up, min $10, max budget $100 000); Connect Express onboarding for creators; `transfers.create` for payouts. | Sessions, SetupIntents, PaymentMethods, Accounts, Transfers, and webhook events (`checkout.session.completed`, `transfer.created/updated/reversed`, `account.updated`). | SDK, with custom logic around it: signature verification via `constructEventAsync`; the `collectCodes`/`resolvePromoCodes` attribution harvest (§4i) including an explicit prohibition on deep `expand`; a hold-then-transfer payout protocol with compensating rollback (`payCreator` moves `available → pending` under a compare-and-set on the prior balance, and on transfer failure restores the balance, writes a `payout_failed` ledger row, and marks the payout failed); and the ledger-first idempotency on top-ups. |
| **Expo Push** | `[{to, title, body, data}]` per token. | Count only; the response body is not inspected beyond `res.ok`. | Thin custom wrapper. No receipt checking, no token pruning. |
| **GitHub REST** | Repo metadata, recursive git tree, raw file contents (`Accept: application/vnd.github.raw`), `X-GitHub-Api-Version: 2022-11-28`, 30 s timeouts. | JSON and raw text. | Custom `fetch` wrapper (`githubGet`, `fetchFileText`). The URL allow-list and the file-selection heuristic are Noni's. |
| **Resend** | `{from, to[], subject, html}`. | Ignored beyond success. | Thin `fetch` wrapper in `ops-create-company` and `invite-campaign-manager`. |
| **FieldVision Postgres** | Read-only PostgREST queries against three tables with column projections and a `referral_code=in.(…)` filter. | Rows, aggregated in memory and discarded. | **Custom paginated reader** `fvRows()` using `Range` headers, 1 000 rows/page. |
| **TikTok oEmbed** | A public post URL. | `{thumbnail_url, title}`. | Thin wrapper in `library-link`; falls through to a custom `og:image`/`twitter:image` regex parser when oEmbed returns nothing. |

**Platform note.** Noni never talks to the TikTok or Instagram APIs directly. Reading is via Apify actors; writing and metrics are via Upload-Post; the creator's account linkage is a hosted Upload-Post connect page reached through a generated JWT URL, so no platform OAuth tokens ever enter Noni's database. What Noni stores per creator is a single opaque `upload_post_profile` string.

---

## 10. Performance details

Every number below is literal in the code or in a code comment.

### Cron cadences

| Job | Schedule | Target | Migration |
|---|---|---|---|
| `noni-scrape-trends-weekly` | `0 6 * * 1` (Mon 06:00 UTC) | `scrape-trends` | 008 |
| `noni-auto-fill-daily` | `0 7 * * *` — **created in 008, then `cron.unschedule`d in migration 015** | `auto-fill` | 008 / 015 |
| `noni-brand-ingest-monthly` | `0 5 1 * *` | `brand-ingest` (learnings refresh) | 008 |
| `noni-sync-conversions-daily` | `30 7 * * *` — "half an hour before the 08:00 poll-metrics job so the analytics tab wakes up with both sides of the chart fresh" | `sync-conversions` | 031 |
| `noni-poll-metrics-daily` | `0 8 * * *` | `poll-metrics` | 013 |
| `noni-reset-streaks-daily` | `30 8 * * *` — "after auto-fill (07:00 UTC) has created today's tasks" | `reset_broken_streaks()` (SQL, not HTTP) | 012 |
| `noni-notify-scheduled-hourly` | `5 * * * *` — ":05 so an 8PM ET notify_at is already due when it runs" | `notify-scheduled` | 032 |
| `noni-weekly-payouts` | `10 * * * *` — hourly, but the function no-ops unless America/New_York is Sunday 20:00–20:59 | `weekly-payouts` | 042 |
| `noni-notify-reminders-hourly` | `15 * * * *` — hourly, function acts only in NY hour 8–9 | `notify-reminders` | 045 |

`net.http_post` timeouts: 10 000 ms for most jobs, 30 000 ms for reminders, 120 000 ms for payouts. Because the heavy functions return `202` immediately and continue under `EdgeRuntime.waitUntil`, the cron timeout only has to cover the handshake.

### Batch sizes and budgets (`scrape-trends`)

| Parameter | Weekly | Backfill |
|---|---|---|
| `targetItems` | 16 | `clamp(target, 16, 1000)` |
| `chunkSize` | 16 | 20 |
| `commentBudgetNiche` / `Donor` | 5 / 1 | 150 / 50 |
| `fingerprintWindow` | 500 | `max(3000, target × 4)` |
| `gateBatch` / `classifyBatch` | 10 / 8 | 20 / 16 |
| TikTok slots (niche/donor) | 4 / 2 | 7 / 5 |
| Instagram slots (niche/donor) | 3 / 1 | 5 / 3 |
| `profileResultsPerPage` | 4 | `min(100, max(10, ceil(targetItems × 1.5 / accountCount)))` |
| `searchResultsPerPage` | 6 | 30 |

Fixed constants: `SEARCH_MIN_VIEWS = 10 000`, `HANDLE_MIN_VIEWS = 2 000`, `MAX_OCR_SLIDES = 4` ("Plan cap: OCR the first four slides only"), `MAX_PROBATION_PROFILES = 4`, `MAX_QUERIES = 3`, `MAX_HASHTAGS = 3`, `MIN_ACCOUNTS_BEFORE_SEARCH = 3`, `MIN_HANDLE_ITEMS_BEFORE_SEARCH = 8`, `COMMENTS_PER_POST = 25`, `MUTE_MIN_SCRAPES = 10`, `MUTE_KEEPER_RATE = 0.1`, `FINGERPRINT_MIN_CHARS = 40`, `DONOR_NORM_MULTIPLE = 1.5`, `DONOR_NORM_MIN_SAMPLE = 3`, `SATURATION_WINDOW_ITEMS = 200`, `SATURATION_WINDOW_DAYS = 90`, `SATURATION_MIN_SAMPLE = 30`, `PROFILES_PER_APIFY_CALL = 4`.

Other batch caps: `ingest-codebase` `MAX_FILE_BYTES = 100 KB`, `CHUNK_CHAR_BUDGET = 80 000`; `ingest-features` `MAX_IMAGES = 12`, `INSERT_CAP = 15`; `ingest-brief` `MAX_OCR_SLIDES = 6`; `crawlSite` `PAGE_CHAR_CAP = 6 000`, `TOTAL_CHAR_CAP = 20 000`, `MAX_SUBPAGES = 5`; `library-link` `HTML_BYTE_CAP = 256 KB`; `sync-conversions` `PAGE_SIZE = 1 000`; `loadGoldenExamples` reads 60 rows and returns ≤ 16 balanced; existing-claims context ≤ 60; comment questions ≤ 40; vocabulary phrases 4–60 chars.

### Timeouts and polling

| Operation | Interval | Attempts | Ceiling |
|---|---|---|---|
| Upload-Post FFmpeg job | 3 000 ms | 50 | ~150 s |
| Creatomate render | 3 000 ms | 40 | ~120 s |
| Replicate matting | 3 000 ms | 100 | ~300 s |
| Upload-Post publish status | 2 000 ms | 30 (early exit after 5 when nothing is pending) | ~60 s |
| `run-scrape.ts` observer | 20 000 ms | — | 10 min |

`AbortSignal.timeout` values: Apify sync run 240 000 ms; Apify transcript fetch 30 000 ms; Deepgram 90 000 ms; image fetch for hashing 20 000 ms; GitHub 30 000 ms; `crawlSite` page fetch 15 000 ms; `library-link` 10 000 ms. Signed URLs are uniformly 3 600 s.

### Client-side timing constants

`app/(creator)/record/[id].tsx`: `COUNTDOWN_STEP_MS = 800` (3 steps), `MAX_CLIP_MS = 90 000`, `PROGRESS_REF_MS = 20 000` (the progress ring fills against a 20 s reference, not the clip's real max), `PROCESSING_MIN_MS = 2 000`, `STOP_WATCHDOG_MS = 5 000`, `RECORD_ARM_MS = 350`, teleprompter speeds `[0.75, 1, 1.25, 1.5]`. `components/Teleprompter.tsx`: `MS_PER_WORD = 250` at speed 1. `lib/submissions.ts`: `PROBE_TIMEOUT_MS = 4 000`.

### Render timing constants

`HEAD_TRIM_MS = 150` (mirrors `-ss 0.15`), `TEXT_HOLD_MS = 3 000`, `TEXT_Y = 0.45`, `IMAGE_Y = 0.62`, `IMAGE_WIDTH = 0.85`, output `1080 × 1920`, `fps=30`, audio 48 kHz stereo AAC 128 kbps, `loudnorm I=-16 TP=-1.5 LRA=11`, `silenceremove stop_duration=0.25 stop_threshold=-45dB`, `chromakey 0x00FF00:0.28:0.06`, NVENC `preset p5 cq 23`, green-screen bubble `width 0.42` at `y 0.76`.

### Caching layers

1. **OCR content-hash cache** — `ocr_cache`, keyed `(company_id, sha256(image bytes))`, unbounded lifetime. The stated payoff: "the same slideshow reposted under a new URL costs one OCR total, ever."
2. **Transcript tier order** — the Apify actor's own transcription is used when present so Deepgram is only paid for on the miss.
3. **Golden few-shot cache** — none; `loadGoldenExamples` re-queries per gate run.
4. **In-run fingerprint set** — the near-duplicate set is loaded once and mutated across chunks so later chunks are deduped against earlier ones without another query.
5. **Draft clip reuse** — clips uploaded between takes are referenced by path at submit time rather than re-uploaded (`submitAssignmentClips`).
6. No HTTP response cache, no CDN layer, no memoized LLM responses.

### Rate limits and quotas found in code

- Supabase Auth (`config.toml`): 2 emails/hour, 30 SMS/hour, 150 token refreshes / 5 min / IP, 30 sign-ins / 5 min / IP, 30 OTP verifications / 5 min / IP.
- PostgREST `max_rows = 1000`.
- Storage global cap 50 MiB (`config.toml`), overridden per bucket in migrations (videos 500 MB, account-verification 100 MB, image buckets 10 MB).
- Business caps: `MAX_MONTHLY_BUDGET_CENTS = 10 000 000` ($100 000), `MIN_TOPUP_CENTS = 1 000` ($10), `MAX_NEW_PER_CREATOR = 5` and `cadence ≤ 7` in `auto-fill`, `TREND_MAX_AGE_DAYS = 45`, trend query `limit(50)`, `SLOTS_PER_DAY = 3`, `DAYS_PER_WEEK = 7`.
- No client-side rate limiting or backoff anywhere; failed LLM/actor calls are caught and skipped, not retried with jitter.

### Measured or asserted numbers appearing in comments

- "~150 spoken words per minute" — `estimateSeconds()`.
- "Real posts run 5.2 to 6.2 [second-person uses per 100 words]. Above 8 reads as a listicle lecturing the viewer." — `validateBrief.ts`.
- Distribution physics in the dormant `DOCTRINE`: 70% retention past 3 s, 60% at 15 s, 50% at 30 s; a ~1.7 s stay-or-swipe decision; a 9–15 s primary cut; a plug rate of one in four or five posts.
- Forecast coefficients (`lib/budget-forecast.ts`, self-labelled as research defaults): hit rate 0.10, ~2.5 posts/creator/day, 0.15% of qualifying views → trials, 25% of trials → paid, $29.99 first-month revenue.
- Golden-set target: "60 to 80 labeled, ~30 reserved as few shot, rest held out" — `scripts/label-trends.ts`.
- "~20 creators at 30 posts a week is a search problem" — the stated reason `library_our_posts` moved server-side (mig 029).
- Admin "Draft with AI" must stay under ~15 s, and an Apify profile sync "regularly burns 60s alone" — `brand-ingest`, the reason for `skipCaptions`.
- Default bounty $20 at 5 000 views; streak ladder 3 d/$20, 10 d/$100, 31 d/$300; fees 10% company, 3% creator.

---

## 11. Potentially novel combinations

My reading as a technical collaborator, ordered from strongest to weakest. I have tried to be conservative and to say plainly where a subsystem is standard.

### Strong candidates

**A. Two-corpus scraping where the keeper rule differs by corpus, and classification is deliberately excluded from the keeper decision.**
The combination is: (i) partition the source-account universe into a *structure* corpus and an *audience* corpus; (ii) apply an audience-relevance LLM gate to one and a per-account engagement-norm test (≥ 1.5× that account's own median views in this run, min sample 3) to the other; (iii) route the downstream products by corpus — donors may only yield format exemplars, niche may only yield claims, vocabulary, topics and comment questions; (iv) run a shared format classifier over both but forbid the classifier from influencing whether an item is kept, expressly so the format library remains falsifiable. Point (iv) is the unusual one. Most content-mining systems let the taxonomy select the corpus, which makes the taxonomy unfalsifiable by construction; here the corpus is selected on an independent signal and the taxonomy's coverage is then *measured* (`scripts/coverage-report.ts` reports classified share, median confidence for classified vs unclassified, and the top null reasons verbatim). The reserved null with a retained reason and confidence is what makes that measurement possible.
*Prior art to check:* social listening / trend-detection patents; "content taxonomy coverage measurement"; per-account baseline normalization for outlier detection in social analytics (this specific piece is likely known in isolation).

**B. Generation order enforced through JSON key order, with a deterministic validator whose failures are fed back as the retry prompt, and the whole attempt log persisted.**
Three ideas compose here. First, using the autoregressive property of the decoder as a control mechanism: the prompt states "Generate the keys IN THIS EXACT ORDER — the order is the method", so the hook is provably conditioned on the finished talking points rather than the reverse, without a second call. Second, an import-free validator (`validateBrief.ts`) that runs unchanged in the edge function, in Node, and in the React Native bundle, so the client can pre-flight the identical verdict. Third, exactly one retry whose user message contains the validator's failure strings verbatim, with both attempts written to `brief_validations` keyed by a `generation_id` minted before anything is saved — so "did the retry fix it" is a queryable fact per check.
*Prior art to check:* constrained decoding and JSON-schema-guided generation (well covered); self-correction / critique-revise loops (well covered). What may be narrower is the *persisted per-check attempt ledger* joined to a pre-save generation id, and the tri-runtime single-source validator.

**C. Traceable-claim enforcement: a closed approved-claim set, referenced by id in the generation contract, and verified deterministically after generation.**
The prompt supplies `- id {uuid}: {claim} ({what_it_does})` and demands the chosen id back in `claim_id`; `validateBrief` then fails `plug_claim_untraceable` unless that id is in the approved set, and separately fails `cta_not_embedded` unless the normalized plug sentence appears verbatim inside the designated talking point. Upstream, every approved claim was itself extracted with a mandatory `source_ref` (a repo file path, an image storage path, or a page URL) that is hard-gated twice and, on the vision path, checked against an allow-list of labels supplied in the prompt so the model cannot invent a provenance. The result is an end-to-end chain: source artifact → claim row → claim id in the post → the exact sentence in the script. For a regulated-advertising angle this chain is the interesting part.
*Prior art to check:* grounded generation / citation enforcement (heavily covered in the RAG literature). The narrower angle is the *pre-approved closed set with human approval state, id-referenced in the output contract, positionally constrained in the body, and byte-checked afterwards* — plus deriving that set from a codebase.

**D. Deriving marketing claims from a product's source code with a route-surface heuristic and a map-reduce merge that must preserve file paths.**
`shouldKeepPath()` selects the files that describe *user-facing surfaces* (app/pages routers, `route|page|layout` filenames, `routes/screens/api/handlers` directories, docs) and excludes tests, migrations, build output and lockfiles; the extraction prompt asks for mechanism-not-benefit phrasing with worked good/bad examples; the merge prompt's hardest rule is that `source_ref` must survive and be joined, never dropped or invented, with a deterministic `localDedupe()` fallback that unions the paths. Feature discovery from code is not new; *feature discovery from code as the provenance root of an advertising claim library, with the file path carried through a two-stage LLM chain as a first-class, twice-gated field* is the specific thing.
*Prior art to check:* automated release notes / changelog generation from commits and diffs; documentation generation. Those generate developer-facing text from code, not ad claims with retained provenance.

**E. Brief-as-render-manifest: one artifact drives the shot list, the prompter, the recording UI, and the burned-in overlays.**
`brief_segments` is a per-clip row carrying `kind`, the on-screen text, its normalized position, an optional screenshot with normalized centre/width, and a per-clip `layout` (`standard` vs `green_screen`). The same rows are (i) the record screen's clip plan and prompter content, (ii) the live overlay preview the creator frames against, and (iii) the render timeline's text and image elements. Re-derivation preserves the admin's manual work by matching survivors on `talking_point_index` inside a transaction using a DEFERRABLE unique constraint so slot indices can shift — an unusually careful bit of schema design for what is nominally a CMS table. The composition with the *editor* side is what makes it interesting: the admin drags a text bubble on a 9:16 canvas in the app, the coordinates are saved in exactly the units the renderer consumes, and the creator sees the same overlay live while recording.
*Prior art to check:* video templating systems (Creatomate/Shotstack/Bannerbear) — they own the template, whereas here the template is derived from the script's structure and is the recording plan too.

**F. Absolute-timing overlay derived from per-clip durations captured at submit time, with a head-trim constant shared between the FFmpeg command and the timeline builder.**
`-ss 0.15` on input 0 and `HEAD_TRIM_MS = 150` are the same number in two places, and `buildRenderTimeline` subtracts it from clip 0 only. Tail silence removal is chosen specifically because it "only shortens the final clip and never shifts a start". Durations are probed from the media file rather than measured by wall clock because wall clock includes camera start latency. When any duration is missing the overlay pass is *skipped with a warning* rather than estimated. This is careful engineering more than invention, but the invariant — trims may only shorten the tail so that every overlay start remains valid — is a real design constraint expressed in code.

**G. Publish-time deterministic per-creator week layout.**
Seeded Fisher–Yates (xmur3 + mulberry32) keyed on `campaignId + creatorId`, with pinned placement first, a ratio-preserving format bag, and a rebalance pass that prevents an all-slideshow day, plus an `ON CONFLICT DO NOTHING` insert so republishing is a no-op. Seeded shuffles are ordinary; the combination of *determinism as the idempotency mechanism for a fan-out write* with *per-creator decorrelation of a shared content pool* and *a format-mix rebalance* is at least a specific, defensible arrangement. The largest-remainder apportionment in week setup (`splitFamily`) is textbook and I would not claim it.

**H. Verification-gated distribution with a structured human verdict shaped as a future label schema.**
A creator cannot receive assignments until an admin approves a screen recording proving their account's recommendation feed has been warmed into the target niche. The verdict is four booleans, not free text, and the recordings are retained at stable paths — i.e. the manual process is deliberately emitting labelled training data for the classifier that would replace it. The *gate* (warm-up proof as a precondition for distribution) is the more interesting half; the "structured verdict as a future label schema" is a good engineering habit that may be too generic to claim.

### Moderate

**I. Corpus-scoped comment mining with separate budgets and a CTA-keyword counter.** Harvesting question comments as claim input from one corpus while harvesting only CTA-keyword counts from the other, with per-corpus budgets that are decremented even on actor failure, is a specific arrangement. The CTA counter itself (`comment "keyword"` regex → exact normalized comment match) is simple.

**J. Rolling-window topic-share saturation with a calibratable divisor and an explicit null.** The mechanism is a share ratio; the defensible parts are the refusal to emit a number below a minimum sample (backed by a migration that dropped NOT NULL to make null storable) and the operator-facing calibration report that tells you what to set the divisor to.

**K. Two-sided second-person density band plus a dependency-free double-adjective detector.** Style checks are common; a *two-sided* band (warn below 4 and above 8 per 100 words, with the stated reason that too much reads as a lecture) and a hand-built adjective lexicon plus suffix rule standing in for a POS tagger inside a React Native bundle are unusual choices, though individually small.

**L. Music-approval as an earnings gate for carousel posts.** Because the publishing API cannot attach a trending sound to a photo carousel, the creator adds it manually and the payout is withheld until an admin confirms — implemented as a per-assignment timestamp checked inside the bounty-crediting branch, with send-back clearing the creator's mark rather than adding a status. A neat solution to a platform-capability gap; whether it is patentable is a judgement call.

**M. Prepaid credit ledger with asymmetric rounding and dual idempotency.** `ceil(G × 1.10)` charged / `floor(G × 0.97)` paid, ledger-row-first Stripe idempotency, and a partial unique index on `(assignment_id, kind)`. Sound financial engineering; almost certainly not novel.

### Standard — I would not claim these

- Supabase multi-tenancy with `company_id` + RLS helper functions.
- Expo Router role-scoped route groups, Expo push registration and tap routing.
- Stripe Checkout / Connect / Transfers, including the hold-then-transfer pattern.
- `pg_cron` + `pg_net` + Vault-stored secret as a scheduler.
- The teleprompter itself (word-by-word highlight with proportional auto-scroll).
- Multi-clip capture and server-side concat.
- Chroma-key compositing, `loudnorm`, `silenceremove`, scale-crop-to-9:16.
- SSRF host validation (though the post-redirect re-check is the part people forget).
- Snapshot-log metrics tables with client-side delta bucketing.
- Referral-code → conversion attribution.
- LLM-as-judge scoring, few-shot prompting, JSON-mode-ish output parsing.

### Cross-cutting observation

If a single claim were to be drafted around this system, the through-line I would point at is **falsifiability as an architectural principle applied to an LLM content pipeline**: at four separate points the design deliberately preserves the evidence that the system's own model of the world is wrong. The classifier stores its null verdicts with reasons instead of forcing a fit, and a report measures the resulting coverage. The keeper decision is held independent of the classifier so the taxonomy can fail to explain a winner. Saturation returns null rather than zero below a minimum sample, and a migration was written to make that storable. The review overrides are logged per `check_id` and indexed, on the stated theory that "a check overridden twenty times is a wrong check". And the gate has a leave-the-answer-out regression harness that exits non-zero on disagreement. Each individual mechanism has prior art; the composition — an LLM pipeline instrumented so that every heuristic it depends on is continuously measurable against retained ground truth — is the thing I found genuinely unusual reading this repository.

---

## 12. Open questions and gaps

### Referenced but missing from this repository

- **`brain_features`, `feature_screenshots`, `brief_templates`.** All three appear in the generated types (`lib/types.ts`) and `brain_features` + `feature_screenshots` are read live by `listNoniLibrary()` in `lib/briefs-api.ts` (the screenshot library the manager attaches to brief clips, ordered by an "AI virality rank" — `brain_features.rank`, `score`, `reason`, `idea_title/idea_action/idea_example`). **No migration in `supabase/migrations/` creates them**, and no code writes them. The comment says admins fill this on "the web Company Brain page", so there is a **web application outside this repository** that owns those tables, their storage bucket (`product-features`), and whatever computes `rank`/`score`. That ranking logic is not documented here and should be obtained before filing if it is to be claimed.
- **`files/ugc-bible.md`** is the source document behind `DOCTRINE`, `FORMAT_SEED`, and `APPENDIX_A_EXAMPLES`. It is in the repo but is prose, not code; the numbers in `doctrine.ts` are described as "the parsed numbers". Whether the bible's retention-gate figures are measured or asserted is not determinable from code.

### Dormant code — built, not wired

- **`_shared/doctrine.ts`.** `DOCTRINE` (the compacted bible) and `assembleGenerationContext()` are imported by nothing. Only `BIBLE_VERSION` is used, by `scripts/seed-formats.ts`. The live generator implements a different contract.
- **`_shared/post-object.ts`.** `PostObject`, `FormatId`, `GenerationMeta`, `FORMAT_IDS` — imported by nothing.
- **The twelve-format library is write-mostly.** `formats` is read only by `scrape-trends` (to build the classifier prompt). `format_examples` is written by the harvester and by the seed script and read by neither. So the library currently classifies the corpus but does not steer generation.
- **`claims` and `vocabulary` are write-only.** `scrape-trends` writes them (and reads `claims` only to dedupe). Nothing in `ingest-brief` / `brief-assist` reads either. The "approved claims" in the live generation prompt come from `product_features`, a **different table** populated by the codebase/screenshot/site ingesters. These two claim lineages are unconnected in code. This is the single most consequential gap for anyone reading the architecture documents and assuming the mined claims feed generation — they do not, today.
- **`weekly_batches`, `format_stats`, `revenue_daily`, `calendar_events`, `task_comments`, `content_templates`, `hook_bank`, `banned_claims`, `ban_list`** — created by migrations, referenced only by `scripts/apply-inspiration-foundation.ts`. The learning loop those tables were designed for (format weights, benching, rolling baselines, hook writeback) is **not implemented**. `format_stats.weight`, `status`, `baseline_primary_signal` and `profiles.baseline_primary_signal` are never written.
- **Creator capability gates.** The six booleans on `profiles` (mig 015) that the doctrine's selection rules describe as "hard filters applied first" are never read or written.
- **`post_metrics.profile_clicks`, `link_clicks`, `keyword_comment_count`, `completion_rate`** are never populated — but `formats.primary_signal` names `completion` and `keyword_comments` as ranking signals, so the signals the format library says it ranks on are not being collected.
- **`content_tasks` post-object columns** (`format_id`, `claim_id`, `hook_variants`, `slot_fills`, `slides`, `pinned_comment`, `audio_direction`, `shot_list`, `image_direction`, `cta_keyword`, `target_length_sec`, `filter_flags`, `planning_status` beyond the constant `'scheduled'`) are written only by the backfill and by `auto-fill`'s fixed values.

### Two live paths for the same thing

- **Legacy vs current production lineage.** `content_tasks` (with `auto-fill` and `generate-script`) still runs, and `post-approved`, `poll-metrics`, `notify`, `submissions`, and `posts` all carry dual-key branches. The **live** path for new work is `campaigns → briefs → assignments`. `auto-fill`'s cron was unscheduled in migration 015, so the legacy generator now only runs if invoked by hand, but the code is reachable and the function is deployed (`config.toml` lists it).
- **Two green-screen implementations.** Replicate matting + FFmpeg chroma key is preferred; the Creatomate circle-bubble composite is the fallback when `REPLICATE_API_TOKEN` is unset. Which is live depends on deployment env, which I cannot read from the repo.
- **Two edit-pass trigger points.** `render-submission` at submit time is the live path; `post-approved` retains an assemble-on-approve fallback for submissions whose `render_status !== 'ready'`.
- **Two brief editors.** `post_type_id IS NULL` opens the legacy sheet (`components/admin/BriefEditSheet.tsx`); typed briefs open the new editor. `brief-assist { derive_segments }` refuses legacy briefs outright.
- **`campaign_briefs.pinned_day`** is honoured by `buildCreatorWeek` but `publish-campaign` forces it to null — "Pin to day is retired… the column stays for historical display."
- **Streak milestones defined twice.** Migration 012 seeds 7/14/30-day at $10/$25/$75; migration 041 overwrites every company with 3/10/31-day at $20/$100/$300 (an unconditional `update`, not a conditional one). 041 is live.
- **Two budget columns.** `weekly_budget_cents` and `monthly_budget_cents`; `set_budget` writes monthly and derives weekly as `floor(monthly/4)`. `forecastWeeklyBudget()` is marked `@deprecated`.

### Things I could not determine from the repo alone

1. **Deployment state.** Which edge functions are actually deployed, which env vars are set in production (Replicate and Creatomate in particular gate real behaviour), and whether the `pg_cron` jobs from the migrations are live on the hosted project.
2. **`ANTHROPIC_MODEL` in production.** The default is `claude-sonnet-4-5`; the env may override it. Which model produced any measured results is unknown.
3. **`SATURATION_FULL_SHARE`.** Default 0.3; the calibration report exists precisely because the right value is data-dependent. Whether it has been calibrated is unknown.
4. **Whether the backfill has been run**, and therefore whether `claims`, `vocabulary`, `format_examples`, and the golden set have meaningful size. The golden-set target (60–80 labels) is stated in a script comment, not achieved in code.
5. **Any measured performance figures.** Nothing in the repo records observed retention, hit rates, gate agreement, classification coverage, or render latency. The forecast coefficients are self-labelled as research defaults. Every number in §10 is a configured constant or a stated assumption, not an observation.
6. **Multi-tenancy in practice.** Several places assume a single tenant: `handle_new_user` attaches new users to the *oldest* company; `sync-conversions` requires exactly one company unless `FIELDVISION_COMPANY_ID` is set; the seeded `post_types`, `search_queries`, `hashtag_bank`, and `product_features` are FieldVision-specific; `DECISION_CHECKS` hardcodes "college soccer and recruiting content"; `account-template.ts` hardcodes recruiting handle stems; `numberedListTitle()` falls back to the literal topic `'college recruiting'`. The system is architecturally multi-tenant and operationally single-tenant.
7. **Testing.** One test file exists (`shuffle.test.ts`). `scripts/acceptance-agent{2,4,5,7}.ts` are manual acceptance scripts. There are no tests for `validateBrief`, the timeline builder, the credit math, or any prompt.
8. **The `manager_chats` feature's completeness.** Migration 064 and `lib/manager-messages-api.ts` (729 lines) exist; how much of the UI is wired is not something I verified screen by screen.
9. **Whether `remake_mode` reaches the live generator.** It is produced by the gate, stored on `trend_items`, and consumed by `generateTaskDraft` — which is on the **legacy** path. `ingest-brief`'s URL path does not read `remake_mode`; it always applies structure-only language. So the beat-for-beat branch may be effectively dormant in the live flow.
10. **`brief_segments.overlay_style`** (per-point colour and background pill, mig 064) is written by `OverlayEditor` but the render adapter reads only the brief-level `text_overlay`; per-segment colour does not appear to reach the burned-in output.

### Documentation in the repo that should be read alongside this

`HANDOFF.md` (62 KB), `CREATOR_HANDOFF.md` (36 KB), `noni-build-final.md` (26 KB), `files/ugc-bible.md`, `files/build-prompt.md`, `instructions-from-claude/noni-final-spec.md`, `docs/HANDOFF.md`, `docs/QA-CREATOR-FLOW.md`, `docs/STRIPE_PREPAID_SETUP.md`, and the five `design_handoff_*` directories. These are design and handoff documents, not code; where they conflict with the code, this disclosure follows the code.

---

## Appendix: raw file tree, top three levels

```
.
├── AGENTS.md
├── CREATOR_HANDOFF.md
├── HANDOFF.md
├── LICENSE
├── README.md
├── SUPABASE_ACCESS.md
├── app.json
├── eas.json
├── eslint.config.js
├── noni-build-final.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── .claude/
│   └── settings.json
├── .cursor/
│   └── rules/            (project.mdc, supabase-access.mdc)
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── company-admin.tsx
│   ├── platform-admin.tsx
│   ├── (admin)/          (_layout, (tabs)/, account-approval/, account-template.tsx,
│   │                      chat/, creator/, kitchen-sink.tsx, messages/, music/, post/,
│   │                      review/, week/, week-day.tsx, week-setup.tsx)
│   ├── (auth)/           (_layout, invite-required.tsx, login.tsx)
│   ├── (creator)/        (_layout, (tabs)/, account-setup.tsx, assignment/, balance.tsx,
│   │                      chat.tsx, kitchen-sink.tsx, messages/, post/, posts/, record/,
│   │                      settings.tsx, setup/, upload/)
│   ├── (onboarding)/     (_layout, _shell, birthday, done, estimate, experience, hardest,
│   │                      heard, hours, index, manager, name, notifications, permissions,
│   │                      phone-number)
│   └── auth/
│       └── callback.tsx
├── assets/               (app icons, splash, logo svg/png)
├── components/
│   ├── AccountSwitcherCaret.tsx, AccountSwitcherSheet.tsx, ChatThread.tsx,
│   │   FormatInfoSheet.tsx, OnboardingUI.tsx, ReviewThread.tsx, Screen.tsx,
│   │   StatusChip.tsx, Teleprompter.tsx
│   ├── admin/            (approval/, chat/, creator/, editor/, grid/, insights/, library/,
│   │                      messages/, review/, setup/, shared/, + ~20 top-level components)
│   ├── creator/          (AreaChart, ChatKit, Chips, MiniStat, MonthGrid, PostCard,
│   │                      PostGridTile, PostPager, PostRow, SegmentOverlayPreview,
│   │                      SlideNav, SplitBar, SwapSheet, TeleprompterOverlay, Toast,
│   │                      WeekStrip, posts-shared.ts)
│   ├── layout/           (Screen.tsx)
│   ├── states/           (CountUp, KeepClipConfirm, SentBackCard, SoftToast,
│   │                      SuccessState, UnlinkedSocials, skeletons, index)
│   └── ui/               (~20 primitives: Button, Dropdown, Icon, MediaCard, Sheet…)
├── design/               (design briefs + screens/ugc-reference)
├── design_handoff_admin_app/
├── design_handoff_campaign_manager/          (tasks/, reference_ui/, tokens/, assets/)
├── design_handoff_campaign_manager_briefs_app/
├── design_handoff_creator_app/
├── design_handoff_noni_creator/              (tokens/, assets/, support.js)
├── Claude design cursor creator app handoff/ (screenshots/, FLOWS.md, SCREENS.md)
├── docs/
│   ├── HANDOFF.md, QA-CREATOR-FLOW.md, STRIPE_PREPAID_SETUP.md
│   └── legal/            (privacy-policy.md, terms-of-service.md)
├── files/
│   ├── build-prompt.md
│   └── ugc-bible.md
├── instructions-from-claude/
│   ├── noni-final-spec.md
│   └── voice-doc-v1.md
├── lib/                  (36 modules: admin-api, analytics-api, auth, briefs-api,
│                          creator-accounts-api, manager-messages-api, submissions,
│                          tasks-api, types.ts (generated, 3890 lines), …)
├── scripts/              (acceptance-agent{2,4,5,7}, apply-inspiration-foundation,
│                          apply-migration, coverage-report, env, label-trends,
│                          relevance-regression, run-scrape, seed-donor-accounts,
│                          seed-formats, seed-niche-accounts, attach-profile.sql)
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   ├── _shared/      (assemble, backgroundRemoval, classify, crawlSite, credits,
│   │   │                  doctrine, formats-seed, generateBrief, mine-claims,
│   │   │                  post-object, push, relevance, renderAdapter, renderTimeline,
│   │   │                  reviewBrief, shuffle(+test), validateBrief, wp8)
│   │   └── 29 functions/ (auto-fill, brand-ingest, brief-assist, brief-review,
│   │                      company-billing, connect-return, creator-payout,
│   │                      generate-script, ingest-brief, ingest-codebase,
│   │                      ingest-features, invite-campaign-manager, library-link,
│   │                      notify, notify-reminders, notify-scheduled,
│   │                      ops-create-company, poll-metrics, post-approved,
│   │                      publish-campaign, render-submission, scrape-trends,
│   │                      social-connect, stripe-connect, stripe-webhook,
│   │                      sync-conversions, weekly-payouts)
│   └── migrations/       (68 files, 20260729230000_001 … 20260814230000_065)
└── theme/
    └── tokens.ts
```
