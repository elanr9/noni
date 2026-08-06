# HANDOFF — Noni admin rebuild

Every agent reads this file before starting and appends its section before
reporting done. Agents run in separate sessions and cannot see each other's
work; this file is the only shared state. The build plan is
`noni-build-final.md` in the repo root.

**Do not confuse this file with `docs/HANDOFF.md`**, which documents the
abandoned inspiration-engine build and is kept only as history.

## Operational traps

- The Supabase MCP server points at the **FieldVision product database**
  (`npuhpegvrcwqytsekpag`), a different project. Never use it for Noni.
- Direct Postgres connections are blocked from this dev network. Apply
  migrations with
  `npx tsx scripts/apply-migration.ts supabase/migrations/<file>.sql`
  (Management API; also records the version and regenerates `lib/types.ts`).
  Needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` in `.env.local`.
- Deploy edge functions with
  `supabase functions deploy <name> --project-ref zdcmmzofnrdqbwexuqnm --use-api`
  (token exported, no Docker). The API occasionally 502s; retry once.
- Run `npx tsc --noEmit` before reporting done.

---

## Agent 1 — data model — 2026-08-06

Done: migration `supabase/migrations/20260806000000_027_admin_rebuild_data_model.sql`,
applied to the linked project and recorded; `lib/types.ts` regenerated from the
live schema; `briefs.search_query` renamed to `search_phrase` with mechanical
field renames in `lib/briefs-api.ts`, `app/(admin)/(tabs)/create.tsx`,
`supabase/functions/ingest-brief/index.ts`,
`supabase/functions/_shared/validateBrief.ts`. `npx tsc --noEmit` clean.

### Schema touched (full detail — you cannot see the migration file)

**`post_types`** (new, seeded for FieldVision, company-scoped)
- `id uuid pk`, `company_id`, `key text` (unique per company), `label text`
- `family text` — `video | photo_carousel`
- `min_points int`, `max_points int`
- `clip_structure text` — `hook_points_outro | single_clip | slide_per_point`.
  Clip count is DERIVED, never set by a human: `hook_points_outro` = 1 + N + 1,
  `single_clip` = 1 (replay_bait), `slide_per_point` = N slides.
- `requires_plug bool`, `requires_credential bool` — both false only on
  `replay_bait`. The exemptions live on the type; do not special-case the
  validator.
- `default_week_count int` — the prefilled editable split on week setup:
  numbered_list 8, talking_head 5, explainer 3, contrast 2, replay_bait 2,
  numbered_tips 5, how_to 3, getting_started 2.
- `sort_order int`
- Seeded keys: `numbered_list, talking_head, explainer, contrast, replay_bait`
  (video), `numbered_tips, how_to, getting_started` (photo_carousel).
- RLS: same-company read, admins write.

**`campaigns`** (extended — the campaign IS the week; there is no `weeks` table)
- `+ video_target int default 20`, `+ slideshow_target int default 10`
- `+ type_split jsonb default '{}'` — post_type key -> count. A pool, not a
  lock; posts stay retypeable and the grid header shows live drift.
- Already had: `drop_date`, `status draft|published`, `published_at`,
  `campaign_briefs` join (with `position`), `publish_campaign_assignments` RPC.

**`briefs`** (extended)
- `search_query` RENAMED to `search_phrase`.
- `+ post_type_id uuid -> post_types` — **null = legacy brief**; opens in the
  old sheet with old validation (Agent 3 owns that path).
- `+ cta text` — the FieldVision plug field. The plug also rides INSIDE one
  talking point as a single sentence; never its own point or clip.
- `+ kill_reason text` — non-null means generation refused to pad; the slot
  renders empty with the reason.
- `+ reviewed_at timestamptz` — set when the admin confirms AI review.
- `+ review_result jsonb` — latest scores/suggestions payload (Agent 4 owns
  the shape).
- Kept: `script` (legacy carousels), `hook_options` (see shape note below),
  `talking_points jsonb`, `hashtags`, `point_count`, `target_words`,
  `generation_id`.

**`brief_segments`** (new) — the render manifest
- `id`, `company_id`, `brief_id -> briefs cascade`, `slot_index int`
- `kind text` — `hook | point | outro | slide`
- `talking_point_index int` nullable — links a point/slide segment to its
  talking point
- `overlay_text text`, `show_on_screen bool default true`,
  `screenshot_url text`
- `unique (brief_id, slot_index) DEFERRABLE INITIALLY DEFERRED` — so
  re-derivation can shift indices in one transaction. Do not delete-then-insert
  to dodge collisions; just update inside a transaction.
- RLS: same-company read, admins write.

THE SPLIT (settled, overrides the build doc): `talking_points` jsonb = what the
creator SAYS, spoken content only, plug inside one entry. `brief_segments` =
what gets RENDERED and RECORDED, one row per clip or slide INCLUDING hook and
outro, carrying the on-screen text, the toggle, and any screenshot. The doc
put `show_on_screen`/`screenshot_url` on talking points — ignore that; the hook
title card (the biggest on-screen text in the reference posts) could not exist
there. `TalkingPoint` in `_shared/validateBrief.ts` is unchanged:
`{id, text, is_product, edited_by_admin, claim_id}`.

DERIVATION (Agent 2 on creation, Agent 3 on edit; also in the table comment):
- numbered_list with 5 points -> [hook][point 0..4][outro]
- replay_bait -> one `hook`-kind segment (single clip)
- carousel with 5 points -> [slide 0..4]; no hook/outro clip, the hook is the
  first slide's overlay_text
- Default overlay_text: hook segment = the hook line; point segment = a short
  label ("4. Great thumbnail"), not the sentence; outro = null with
  show_on_screen false; slide = the talking point text (read, not spoken).
- RE-DERIVE, never rebuild: match survivors by `talking_point_index`, preserve
  their `overlay_text` and `screenshot_url`, add/remove at the tail only. The
  admin may have attached screenshots.

**`submission_segments`** (new; note migration 006 only added
`submissions.segment_paths text[]` — there was no table before)
- `id`, `company_id`, `submission_id -> submissions cascade`
- `brief_segment_id -> brief_segments` nullable (null on backfilled legacy rows)
- `slot_index int`, `storage_path text`
- `duration_ms int` — REQUIRED at submit time for new recordings (overlay
  timing is absolute on the render timeline); null on legacy backfill.
- `status text` — `submitted | approved | rejected` (per-clip rejection)
- `attempt int default 1` — increments per segment on redo
- RLS: same-company read, admins write, creators insert on own submissions.
- Backfilled: one row per `segment_paths` entry, status `approved` where the
  parent assignment/task was approved/posted, else `submitted`.

**`review_events`** (extended)
- `+ segment_id uuid -> submission_segments` nullable. Per-clip rejection
  comments live HERE, in the existing submission review system. Do not build a
  second comment system.

**`brief_review_events`** (new) — the AI review override log. DELIBERATE
DEVIATION: the doc said to write overrides to `review_events`, but that table
is the production submission thread with submission-joined RLS. Approved by
the admin in conversation.
- `id`, `company_id`, `brief_id -> briefs cascade`, `author_id -> profiles`
- `event text` — `override | edit | confirm`
- `check_id text` — which check fired (Agent 4 defines stable ids)
- `tier int`, `diff jsonb` (`{field, before, after}` on edits)
- Indexed on `(brief_id, created_at)` and `(company_id, check_id)` — the
  overridden-twenty-times query is the point of this table.
- RLS: same-company read, admins write.

**`brand_profiles`** — `+ banned_phrases text[] default '{}'`. When the admin
rewrites a generated line, the removed phrase appends here; generation must
avoid these.

**`library_items`** (new)
- `source text` — `idea | our_post | reference | from_creator` (the four chips)
- `text`, `url`, `thumbnail_url`, `post_type_id`, `creator_id`,
  `post_id -> posts` (for our_post rows), `used_count int`, `last_used_at`,
  `created_by`
- RLS: same-company read, admins write, creators may insert `from_creator`
  rows only (with `created_by = auth.uid()`).

**`creator_accounts`** (new) — account approval gate, one row per creator
(`unique (company_id, creator_id)`)
- `status text` — `pending | needs_changes | approved` (state machine;
  approval and Upload-Post handle linking are the same moment)
- `tiktok_handle`, `instagram_handle`
- `instagram_recording_path`, `tiktok_recording_path`,
  `instagram_screenshot_path`, `tiktok_screenshot_path` — in the
  `account-verification` bucket
- `reason text` (required by the app on needs_changes), `decision jsonb`
  (structured, so this can become an automated vision check), `decided_by`,
  `decided_at`
- RLS: admins read/write company rows; creators read/insert own row and update
  own row while status != approved (the resubmit path).

**`messages`** (new) — one thread per creator, keyed `(company_id, creator_id)`
- `author_id`, `body`, nullable `brief_id` / `assignment_id` for inline post
  references. The per-post chat in Review is this thread scrolled to the post.
- RLS: admins read/write company; creators read own thread, insert with
  `creator_id = auth.uid() and author_id = auth.uid()`.

**`assignments`** (extended) — slideshow music state
- `+ music_marked_by_creator_at timestamptz` (creator's one "Music added" tap)
- `+ music_approved_at timestamptz`, `+ music_approved_by uuid -> profiles`
- DECISION (why assignments, not posts): `post-approved` inserts one `posts`
  row PER PLATFORM — two per assignment — and only after Upload-Post responds,
  with `failed`/`pending` states possible, so there is no reliable 1:1 posts
  row. "Music added" is one tap covering both platforms, and the assignment
  owns earnings. Earnings gate: `poll-metrics` writes `bounty_credit` to
  `wallet_ledger`; for photo_carousel briefs it must additionally require
  `music_approved_at is not null` on the assignment (Agent 7/8 wires this).

**`posts`** (extended)
- `+ milestones_fired int[] default '{}'` — thresholds 5000/10000/50000/
  100000/1000000 append when the notification fires; check membership before
  firing so a re-poll never re-triggers.

**Storage buckets** (new, both private, company-id first folder segment)
- `brief-assets` — segment screenshot uploads, images 10MB, admin write,
  same-company read.
- `account-verification` — creator recordings + screenshots, video+image
  100MB, authenticated company write, same-company read.

### New shared helpers

None. Type regen only (`lib/types.ts`).

### Deviations

- `brief_review_events` instead of writing AI-review events to `review_events`
  (approved; reasons above).
- Render fields (`overlay_text`, `show_on_screen`, `screenshot_url`) live on
  `brief_segments`, not on talking points as the doc says (approved; the hook
  title card cannot exist otherwise).
- `hook_variants` from the doc = the existing `briefs.hook_options` jsonb;
  kept the existing name.
- The doc's "rename search_query" also does NOT apply to the query bank: the
  table is `search_queries` with column `query`; only `briefs.search_phrase`
  was renamed.
- Not re-added because they already exist from migration 022:
  `profiles.credential_line text`, `profiles.bio_facts jsonb`,
  `profiles.available boolean` (also `script_mode`). The credential renders at
  record time from the profile, never baked into a brief.

### Facts other agents need

- **Grid row states need no status column.** All four derive from the briefs
  row in the single grid query (join post_types, no segments needed):
  `complete` = `reviewed_at is not null`; `filled` (unreviewed) = hook, cta,
  caption present, hashtag count 3-5, talking_points length within the type's
  min/max; `partial` = any of those present; `empty` = none and
  `kill_reason` null. A killed slot renders empty with the reason.
- **`hook_options` now holds 8 to 10 scored variants** (best first), not 2.
  Nothing in the DB assumes a count, but the current Create sheet
  (`app/(admin)/(tabs)/create.tsx`) has an A/B radio with a `padHooks` helper
  assuming exactly two, and `app/(creator)/record/[id].tsx` falls back to
  `hook_options[0]`. The old sheet survives only as the legacy editor
  (Agent 3); the `[0]` fallback stays correct since best-first ordering is the
  contract (Agent 2).
- **Deployed `ingest-brief` still emits `search_query`** in its draft JSON.
  `normalizeDraftResponse` in `lib/briefs-api.ts` accepts both names; Agent 2
  deletes that fallback when deploying the rewritten function (whose local
  source is already renamed to `search_phrase`, including the prompt JSON
  contract).
- The account template (bio text, profile picture, example screenshot) goes in
  `companies.settings` jsonb, the existing pattern for company settings
  (Agent 6). Template assets can live in the `account-verification` bucket.
- `weekly_batches`, `content_tasks`, and everything listed in the build doc's
  do-not-touch list are untouched.

### Left open

- Agent 2: derive `brief_segments` on creation per the rules above; write
  `duration_ms` at submit time is Agent 8's capture change.
- Agent 4: define stable `check_id` strings; write `brief_review_events` and
  append removed phrases to `brand_profiles.banned_phrases`.
- Agent 7/8: the music gate condition in `poll-metrics` bounty crediting, and
  `milestones_fired` idempotency (verify by forcing two polls, one
  notification).

---

## Agent 2 — generation — 2026-08-06

Done: migration `supabase/migrations/20260806100000_028_generation_support.sql`
(applied and recorded, `lib/types.ts` regenerated);
`supabase/functions/_shared/generateBrief.ts` (new generation core);
`supabase/functions/_shared/validateBrief.ts` rewritten;
`supabase/functions/ingest-brief/index.ts` rewritten and DEPLOYED;
`supabase/functions/brief-assist/index.ts` (new, DEPLOYED);
`supabase/config.toml` gained `[functions.brief-assist]`;
`lib/briefs-api.ts` lost the `search_query` fallback and now throws
`kill_reason` as the error message so the old Create sheet surfaces it.
Acceptance run against the deployed functions with a real topic (raw output
in the conversation, all checks passed); `npx tsc --noEmit` clean.

### Schema touched (migration 028)

- `post_types` + `target_words_min int` / `target_words_max int`, both
  nullable. Null on both = no length check. The old global 300-450 target was
  DELETED as a rule (it measured two sub-2k-view creators; a symptom, not a
  target). Seeded guesses to replace once thirty posts have performance:
  numbered_list 200/400; talking_head, explainer, contrast 150/300;
  replay_bait and all carousels null/null.
- `sync_brief_segments(p_brief_id, p_company_id, p_segments jsonb)` RPC:
  transactional derive/re-derive of `brief_segments`. Needed because Postgres
  `ON CONFLICT` cannot arbitrate on the DEFERRABLE unique constraint and
  PostgREST calls cannot share a transaction. Survivors are matched by
  `talking_point_index` (points, slides) or by `kind` (hook, outro) and KEEP
  their `overlay_text`, `show_on_screen`, `screenshot_url`; removed rows are
  deleted, new rows inserted. Never call the table directly for re-derives;
  call the RPC (via brief-assist).

### Generation contract (what Agent 3 builds against)

`ingest-brief` body: `{ query }` or `{ url }`, plus optional `post_type`
(post_types.key) and optional `context`. The grid path is
`{ query, post_type }`. Response is either

- `{ kill_reason, generation_id, post_type_id }` — generation refused to pad
  (no approved claim fits a required plug, topic too thin). Slot stays empty
  with the reason; nothing else is returned. Or
- the draft: old fields plus `cta` (the single plug sentence, also embedded
  verbatim in the one `is_product` talking point), `post_type_id`,
  `overlay_labels` (model-authored on-screen labels, index-aligned with
  talking_points, live only in brief_segments, never in talking_points
  jsonb), `hook_options` now 8-10 strings BEST FIRST (scored server-side,
  scores not exposed), `generation_id`, `warnings`.

Generation order is enforced by JSON key order in one model call
(autoregressive = key order is generation order): claim -> search phrase ->
talking points (+plug) -> hooks LAST against the finished body -> caption.
The prompt forbids writing a credential, background claim, or playing
history into the hook or any talking point; credentials render at record
time from `profiles.credential_line`.

`brief-assist` (new function, admin only):

- `{ action: "derive_segments", brief_id, overlay_labels? }` — derives or
  re-derives segments for a SAVED brief through the RPC. Agent 3 calls this
  right after `createBrief` (forwarding the draft's `overlay_labels`) and
  after any edit that changes points, hook, or type. 400 on legacy briefs
  (null post_type_id). Returns `{ segments }`.
- `{ action: "regenerate_field", field, draft, post_type?, index? }` — field
  is `search_phrase | talking_points | talking_point | hook | caption`.
  `talking_point` takes `index` and regenerates ONE point in place, keeping
  the others in context and preserving the point's id; if it is the
  is_product point it stays the plug with its claim_id. Nothing is saved;
  the current editor state rides in `draft`. Body regens (`talking_points`,
  `talking_point`) return `hook_may_be_stale: true` — the hook was written
  against different content. Surface it as a nudge; NEVER regenerate the
  hook silently, the admin may have hand-written it. Any regen can return
  `{ kill_reason }` instead of content.

### validateBrief changes

Hook cap 9 words (was 12). Hashtags 3 to 5 (was exactly 5). Hook count 8-10
hard-fails. Point count checked against the type's min/max. Plug rules read
from the post_types row (`requires_plug` false = is_product points and cta
are failures), no replay_bait special case; on plug types the cta must be
non-empty and embedded (normalized substring) in the single is_product
point, claim_id must be an approved product_features id, never first or
last. Length is a soft warning only when both target_words bounds are
non-null. `product_point_blocked` is gone from the shape — kill replaced it.

### Deviations

- None from the confirmed plan. Note for Agent 4: measured second person
  density on the acceptance draft came out 10.1 per 100 words, well above
  the 5-6 corpus band; the validator warns only under 4 per the spec
  ("warn below 4"). If overshooting reads as pushy in real drafts, that is a
  prompt tweak in `_shared/generateBrief.ts` (SECOND_PERSON_RULE), not a new
  validator rule.

### New shared helpers

- `supabase/functions/_shared/generateBrief.ts`: `buildBriefSystem`,
  `buildFieldSystem`, `normalizeGenerated` (kill-aware), `sortHooks`
  (best-first), `deriveSegments` (HANDOFF defaults), `loadPostType`,
  `toPostTypeShape`, `brandDocBlocks`.
- `loadBrandContext` in `_shared/wp8.ts` now also returns `bannedPhrases`
  from `brand_profiles.banned_phrases`; both prompts refuse them.
- `scripts/acceptance-agent2.ts`: rerunnable acceptance (mints a one-time
  admin session via magic link; the env NONI_TEST_* account is a CREATOR,
  not an admin, despite its label).

### Left open

- Agent 3: send `post_type` on generation, call derive_segments after
  createBrief and after edits, persist `cta` / `post_type_id` /
  `kill_reason` on save. Admin-confirmed scope additions:
  1. Nothing generates when the post editor opens. AI assist is on demand
     only, per field or fill-whole-post. Opening a row must not trigger a
     model call.
  2. Surface `hook_may_be_stale` as a nudge on the hook field when a body
     regen returns it. Never auto-regenerate the hook; it may be
     hand-written.
  3. Render `kill_reason` on the grid row itself. A killed slot stays empty
     with the reason visible while scanning 30 rows, not buried in a toast.
  4. The hook field shows ALL 8-10 options, best-first, default index 0.
     The old sheet's padHooks two-option behavior is a legacy shim, not the
     target.
  5. Live type split in the grid header. The week setup counts are a pool;
     retyping a post must update the header split so drift is visible.
  6. Stub the Library picker: an entry point in the post editor that opens
     the Library filtered to that post's type, for filling the post or
     attaching example_url. Agent 5 builds it; note the interface here when
     stubbing.
  7. Persist overlay fields to segments, not to talking points.
     `show_on_screen` and `screenshot_url` live on `brief_segments`;
     `talking_points` stays spoken content only, no parallel copies on the
     points array. Mechanics: derive/re-derive rows through brief-assist
     derive_segments (the RPC); write toggle and screenshot edits as direct
     updates to the existing `brief_segments` row (admin-write RLS covers
     it). The RPC never overwrites those fields on surviving rows, so
     direct edits stick across re-derives — do not try to push them through
     the RPC payload.
- Agent 4: `brief_review_events` writing and appending removed phrases to
  `brand_profiles.banned_phrases` (generation already consumes them).
- The deployed old-shape contract is gone: `search_query` is no longer
  emitted anywhere.

---

## Agent 6 — Creators, messaging, approvals — 2026-08-06

Done, by file:

- **Creators tab** `app/(admin)/(tabs)/creators.tsx`: card per creator with
  earned / posts / views / approval; sort control over those four
  (admin-confirmed: "earned, posts, views, plus approval rate").
  `fetchCreatorLeaderboard` in `lib/admin-api.ts` reworked: `earnedCents` is
  the positive `wallet_ledger` sum; followers/revenue/paid columns and the
  Upload-Post follower fetch are gone from this screen.
- **Creator profile** `app/(admin)/creator/[id].tsx`: rebuilt Instagram-style.
  Stats header (earned, posted count, views), grid/calendar toggle, chat
  button top right. Grid tiles are `components/admin/PostTile.tsx`
  (expo-video-thumbnails over signed video URLs, session-cached; carousels
  fall back to an icon tile). Calendar is a month grid; tapping a marked day
  lists that day's posts.
- **Post detail** `app/(admin)/creator/post/[assignmentId].tsx`: the video
  (or slideshow via `slidesFromScript`), views, payout
  (`bounty_amount_cents`), saves, likes, comments, caption, and open-on-
  platform links. Data via `fetchAssignmentPostDetail` in `lib/admin-api.ts`
  (posts -> latest `post_metrics` per platform, rollup fallback).
- **Messaging** — ONE system, two admin entry points, as specced.
  `lib/messages-api.ts` (`listThread`, `sendMessage`, joins brief/assignment
  for the inline post reference). `components/ChatThread.tsx` renders the
  thread + composer (5s poll; there is no realtime anywhere in this app).
  Admin screen `app/(admin)/chat/[creatorId].tsx`; entry 1 is the creator
  profile header, entry 2 is a chat button on `app/(admin)/review/[id].tsx`
  passing `?assignment=`, which scrolls to that post's messages and attaches
  the post reference to the composer. Creator side (admin-approved addition):
  `app/(creator)/chat.tsx`, reached from the profile tab.
- **Music approvals** in the Review tab (`app/(admin)/(tabs)/index.tsx`):
  a section above the submission queue, shown only when nonempty. Row =
  `components/admin/MusicApprovalRow.tsx` with platform links and an inline
  one-tap Approve (no detail screen). `listMusicApprovalQueue` /
  `approveMusic` in `lib/admin-api.ts` — queue is
  `music_marked_by_creator_at not null and music_approved_at null`; approve
  writes `music_approved_at` / `music_approved_by` only.
- **Account approvals**: queue section in the Review tab ->
  `app/(admin)/account-approval/[accountId].tsx` (recordings via expo-video,
  screenshots, handles, a four-item structured checklist, Approve /
  Needs changes). `lib/creator-accounts-api.ts` owns the state machine
  (`decideAccount` requires a reason on needs_changes; Approve is disabled
  until all four checks are ticked; `decision` jsonb stores the checklist —
  see `DECISION_CHECKS` — so it can become a vision check later).
- **Creator account setup** `app/(creator)/account-setup.tsx`: status banner
  (pending / needs_changes with the reason / approved), the template
  (copyable bio via expo-clipboard, downloadable picture via
  expo-file-system + expo-media-library, example screenshot), handle inputs,
  four proof uploads with duration validation, submit/resubmit (resubmit
  keeps assets that were not re-picked and flips status back to pending).
  Entry points: banner on creator Home when not approved
  (`app/(creator)/(tabs)/index.tsx`) and a row in the profile tab.
- **Account template** `app/(admin)/account-template.tsx` (from Settings):
  bio + profile picture + example screenshot, stored in
  `companies.settings.account_template`
  (`{bio, profile_picture_path, example_screenshot_path}`, parse/save in
  `lib/account-template.ts`); assets live under
  `account-verification/<company_id>/template/`.
- **The gate is enforced**: `supabase/functions/publish-campaign/index.ts`
  now assigns only to creators with an approved `creator_accounts` row
  (admin-approved deviation from the build doc's "fan-out unchanged").
  DEPLOYED. Errors with "no creators with approved accounts" if none pass.
- Deps added: expo-clipboard, expo-media-library (+ app.json plugin entry
  for the save-photos permission), expo-video-thumbnails.

Schema touched:

- Migration `supabase/migrations/20260806123000_029_backfill_creator_accounts.sql`
  (applied and recorded): backfills approved `creator_accounts` rows
  (decision `{"backfilled": true}`) for creators who already have
  assignments, so the new publish gate does not break the two existing
  creators. No columns added or changed anywhere.

New shared helpers:

- `lib/messages-api.ts` — the one-thread-per-creator API.
- `lib/creator-accounts-api.ts` — account approval state machine, uploads to
  `account-verification`, `signedVerificationUrl`, `DECISION_CHECKS`.
- `lib/account-template.ts` — read/write `companies.settings.account_template`.
- `components/ChatThread.tsx` — shared thread UI (admin + creator screens).
- `components/admin/PostTile.tsx`, `components/admin/MusicApprovalRow.tsx`.
- In `lib/admin-api.ts`: `listMusicApprovalQueue`, `approveMusic`,
  `fetchAssignmentPostDetail`.

Deviations:

- Publish gate in `publish-campaign` (above) — admin approved.
- Creator-side chat screen added — admin approved (RLS already allowed it;
  Agent 7's "new message from a creator" notification assumes it).
- Music approval has no detail screen; the row's platform links plus inline
  Approve are the "open the post, confirm, approve" flow. Ten taps a week.
- The Creators sort control also includes approval rate (admin's pick), not
  just the three card stats from the build doc.

Known traps for later agents:

- Migration version `20260806120000` was already recorded remotely by a
  parallel agent while never existing in this repo. If apply-migration says
  "already recorded, skipping" for a NEW file, your SQL DID NOT RUN —
  rename to a unique timestamp and reapply (029 here is `20260806123000`).
- `poll-metrics` never writes `post_metrics.saves`; the post detail shows a
  dash until someone teaches the poller to fetch saves from Upload-Post.

Left open:

- Agent 7 (notifications): fire pushes for new creator message, account
  submitted, account decided, music pending, music approved. Nothing here
  invokes `notify`; the events are readable from `messages`,
  `creator_accounts.status` and the assignment music columns.
- Agent 7/8: the earnings gate itself — `poll-metrics` bounty crediting must
  require `music_approved_at is not null` on photo_carousel assignments.
  Approval here only stamps the columns.
- Agent 8: the creator "Music added" one-tap button that sets
  `music_marked_by_creator_at`; the admin queue is live and reads it.
- Upload-Post handle linking remains the existing `social-connect` flow in
  the creator profile tab; `creator_accounts` stores the self-reported
  handles from the approval step but nothing pushes them into Upload-Post.

---

## Agent 3 — setup, grid, editor — 2026-08-06

Done, by file:
- `lib/briefs-api.ts` extended: `generatePost` (fill via ingest-brief;
  kill is a returned outcome, never an exception), `assistRegenerateField`
  and `assistDeriveSegments` (brief-assist), `listBriefSegments` /
  `updateBriefSegment` / `uploadSegmentScreenshot` / `signedScreenshotUrl`
  (direct render-field writes + brief-assets storage), `listPostTypes`,
  `getBrief`, `createWeek` (campaign + 30 pre-stamped briefs +
  campaign_briefs), `briefRowState` (the four grid states),
  `markSearchQueryUsedByText`. `BriefDraft` gained `cta`, `post_type_id`,
  `overlay_labels` and lost `product_point_blocked`; `BriefInput` gained
  `cta`, `post_type_id`, `kill_reason`; `createBrief` writes them;
  `listCampaignBriefs` now joins `post_types`. The old throwing
  `ingestBrief` / `ingestBriefFromQuery` are gone; `generatePost` is the
  only generation entry point.
- `app/(admin)/week-setup.tsx` + `components/admin/setup/StepperRow.tsx`:
  three stepped screens (ratio 20/10, video split, slideshow split),
  defaults from `post_types.default_week_count`, splits must sum. Creates
  the campaign, stamps 30 briefs (lowest `used_count` phrase first,
  deduped against phrases used in campaigns from the last 28 days and
  within the batch; the phrase is the provisional title since
  `briefs.title` is NOT NULL).
- `app/(admin)/(tabs)/create.tsx` rewritten into the Briefs grid (tab
  relabeled Briefs in `(tabs)/_layout.tsx`): `Videos x/20 | Slideshows
  x/10` switcher, live type split chips under it (count/pool, drift in
  amber), one `PostRow` per post with the four states worded on the row,
  `kill_reason` rendered on the row itself. Legacy briefs (null
  post_type_id) open the old `BriefEditSheet` unchanged, with old
  validation and remove-from-campaign. BacklogSheet kept.
- `components/admin/grid/PostRow.tsx`: row rendering.
- `app/(admin)/post/[id].tsx` + `components/admin/editor/{FillSheet,
  HookOptionsField,PointsEditor,SegmentsSection,TypePicker}.tsx`: the post
  editor. Nothing generates on open. Fill sheet offers fill-from-phrase
  (`{ query, post_type }`) and fill-from-link (`{ url, post_type,
  context }`). Per-field regen buttons on search phrase, hooks, points
  (all + one-in-place), caption. Hook field shows ALL 8-10 options
  best-first, default index 0, every option editable;
  `hook_may_be_stale` renders as an amber nudge and never auto-regens.
  Save persists `cta` / `post_type_id` / `kill_reason` and calls
  derive_segments (forwarding the latest generation's `overlay_labels`)
  when points, hook, or type changed, or on first derive. Segments
  section: `overlay_text` edits, `show_on_screen` toggles, screenshot
  attach/remove — all direct `brief_segments` row updates, never the RPC.
  A kill from fill persists to the brief immediately (before any save) so
  the grid shows it even if she backs out.
- `app/(admin)/_layout.tsx`: registered `week-setup` and `post/[id]`.

Schema touched: none.

New shared helpers: everything above in `lib/briefs-api.ts`.

Deviations (all admin-approved in conversation):
- Switcher counts show FILLED (filled + reviewed) per side, not complete —
  Agent 4's publish button carries its own "X of 30 reviewed" state. Two
  numbers for two questions.
- `briefRowState` refines Agent 1's "cta present" for filled: types with
  `requires_plug` false (replay_bait) do not require a cta, matching
  validateBrief.
- `used_count` bumps when a fill from that phrase succeeds
  (`markSearchQueryUsedByText`), never at stamping time.
- Calendar-as-view-toggle inside Briefs is DEFERRED; the Calendar tab is
  untouched.
- Touched `app/(admin)/creator/[id].tsx` (Agent 6's in-flight file, out of
  my scope) only to cast two router.push calls to `Href`: it references
  `/(admin)/creator/post/[assignmentId]` and `/(admin)/chat/[creatorId]`,
  routes that do not exist yet, and the running Expo server regenerated
  the typed-routes union mid-session, breaking `tsc`. Behavior unchanged
  (object form became the equivalent path string). Agent 6: delete the
  casts when the routes exist.

Library picker interface (for Agent 5): the post editor's "Choose from
Library" button (`openLibraryStub` in `app/(admin)/post/[id].tsx`) should
open the Library filtered to the post's type (`post_types.key`) with two
pick actions: FILL the post (same field application as `generatePost`'s
draft path) or ATTACH as example (set editor `exampleUrl`, persisted to
`briefs.example_url` on save). Picking marks the item used, never removes
it. Once the picker lands, `BacklogSheet` on the grid and the orphaned
`components/admin/QueryBankSheet.tsx` are removable.

Left open:
- Agent 4: review flow sets `reviewed_at` (nothing flips rows to
  complete today), publish gating "X of 30 reviewed", `brief_review_events`.
- Agent 5: the real Library picker (interface above).
- Old draft campaigns created before week setup have no stamped rows or
  type_split; the grid renders whatever campaign_briefs exist (legacy
  rows open the old sheet). Only new weeks get the 30-row stamp.
- The query bank holds 12 seeded queries for 30 slots; stamping cycles
  the pool after deduping, so repeats within a week are possible until
  the bank grows. Seeding more queries is content work, not code.

---

## Agent 5 — Library — 2026-08-06

### AGENT 7, READ THIS FIRST — posts were invisible under RLS, now fixed

The `posts` and `post_metrics` SELECT policies from migration 001 scoped
ONLY through `content_tasks.task_id`. Every post written by the assignment
fan-out (migration 021, `task_id` null, `assignment_id` set) was invisible
to all client queries — the existing analytics screen
(`lib/analytics.ts` `fetchAnalytics`) has been silently reading legacy
rows only. **Migration `20260806120000_029_library_reads.sql` (applied)
recreates all four posts/post_metrics policies to accept either the
content_tasks or the assignments path**, both scoped by
`current_company_id()`. Client queries on these tables now see
assignment-path posts. If your time series was built or tested before
this migration, retest; if you were planning a workaround, delete it.

Done: migration 029 (applied and recorded, `lib/types.ts` regenerated);
`supabase/functions/library-link/index.ts` (new, DEPLOYED) +
`supabase/config.toml` entry; `lib/library-api.ts` (new);
`app/(admin)/(tabs)/library.tsx` (new tab, registered in
`(tabs)/_layout.tsx` between Calendar and Creators);
`components/admin/LibraryItemCard.tsx` and
`components/admin/LibraryPickerSheet.tsx` (new);
`scripts/acceptance-agent5.ts` (rerunnable, cleans up after itself).
Acceptance run against the deployed backend passed: link preview resolves
og:image, private/metadata hosts are rejected, bulk idea insert works, and
`library_our_posts` was verified end to end with a seeded
brief→assignment→submission→post→metrics chain read through the admin's
RLS (latest snapshot wins, search hits, then deleted).

### Schema touched (migration 029)

- `posts` + `post_metrics`: the four RLS policy recreations above. No
  columns changed.
- `library_our_posts(p_days, p_creator_id, p_post_type_id, p_search,
  p_sort, p_limit, p_offset)` — SQL function, SECURITY INVOKER (RLS
  applies), company-scoped explicitly via `current_company_id()`. One row
  per live posts row (status 'failed' excluded), joined to
  assignment→brief→post_type and creator profile, plus the LATEST
  post_metrics snapshot (post_metrics is an append-only time series;
  PostgREST cannot order by a lateral latest-snapshot value, which is why
  this is a function). Legacy content_tasks posts are included with null
  post_type. `p_days` null = all time; `p_sort` = 'top' (views desc,
  default) | 'recent'. Limit clamped to 200.

### The Library, decisions settled

- One tab, four chips (Ideas, Our posts, References, From creator), one
  list. Quick capture is a single field pinned at top that ROUTES BY
  CONTENT: a pasted http(s) URL saves as a reference (thumbnail resolves
  in the background via library-link, non-blocking), anything else saves
  one idea per non-empty line — the Google Doc bulk import is one paste.
  No sheet, no form, no category picker anywhere.
- "Our posts" reads LIVE from posts via the RPC — nothing syncs posts
  into `library_items`. An `our_post` library row is created lazily on
  first use from the picker, solely to carry `used_count` /
  `last_used_at` (`markOurPostUsed` find-or-creates by `post_id`).
  Default view is top performers in the last 60 days; Recent toggle,
  creator and type dropdown filters, topic search (brief title, hook,
  caption, search phrase).
- Using an item always increments, never removes. There is no delete
  path in the UI at all.

### New shared helpers

- `lib/library-api.ts`: `listLibraryItems` (source, search, optional
  postTypeId meaning "this type OR untyped"), `listOurPosts` (RPC),
  `captureQuick`, `saveReference`, `markLibraryItemUsed`,
  `markOurPostUsed`, `listCreatorOptions`, `isCaptureUrl`.
- `supabase/functions/library-link`: admin-only `{ url }` →
  `{ thumbnail_url, title }`. TikTok via public oEmbed (no key), else
  og:image / twitter:image parse. SSRF: reuses
  `assertSafePublicHttpUrl` from `_shared/crawlSite.ts` on the input URL,
  on the post-redirect final URL, and on the resolved image URL. No new
  env keys.

### The picker (Agent 3, wire `openLibraryStub` to this)

`components/admin/LibraryPickerSheet.tsx`:

```
<LibraryPickerSheet
  visible={boolean}
  postTypeId={string | null}   // briefs.post_type_id (uuid, NOT the key);
                               // null (legacy brief) shows everything
  onClose={() => void}
  onPick={(pick: LibraryPick) => void}
/>
type LibraryPick =
  | { kind: 'example'; url: string }   // set editor exampleUrl ->
                                       // briefs.example_url on save
  | { kind: 'fill'; text: string }     // raw text, NOT a draft: feed it
                                       // to the fill sheet's query path
                                       // (generatePost { query, post_type })
```

Filtering: our_post rows filter by post_type_id exactly; other sources
show typed matches PLUS untyped items (ideas carry no type). Items with
both url and text offer both actions; single-capability items pick
directly. The picker marks the item used internally (fire and forget) —
do not mark again in the editor. Close the sheet in `onPick`; the picker
does not self-close.

### Deviations

- None from the confirmed plan. The plan itself deviated from the build
  doc once, admin-approved: the picker interface is defined here rather
  than by Agent 3's stub, since Agent 5 owns the component.

### Left open

- Agent 3: mount LibraryPickerSheet per the contract above; then delete
  `BacklogSheet` and the orphaned `QueryBankSheet` as your section notes.
- Agent 6/7: `npx tsc --noEmit` currently fails with two errors in
  `app/(admin)/chat/[creatorId].tsx` and `app/(admin)/review/[id].tsx` —
  Agent 6's in-flight uncommitted files referencing routes that do not
  exist yet (typed-routes staleness, same class Agent 3 hit). Zero errors
  in Agent 5 files; verified by filtering the run at hand-off time.
- Creator-side submission UI for `from_creator` items is nobody's scope
  yet (RLS already permits creator inserts with `created_by =
  auth.uid()`); the chip renders whatever arrives.
- Instagram link previews are best effort: IG serves og:image
  inconsistently to server fetches and the oEmbed API needs a token we
  deliberately do not add. A reference with no resolvable thumbnail
  still saves, text falls back to the URL host.

---

## Agent 8 — video and slideshow pipeline — 2026-08-06

### WHERE FFMPEG RUNS — the spec's open question, answered

FFmpeg runs on **Upload-Post's hosted FFmpeg Editor API**
(`api.upload-post.com/api/uploadposts/ffmpeg/jobs/...`), not in the edge
function and not on a worker of ours. `post-approved` signs storage URLs,
submits a JSON job carrying a full ffmpeg command string with `{inputN}` /
`{output}` placeholders, polls job status (3s interval, 150s cap), downloads
the MP4, and re-uploads it to the `videos` bucket. Same API key as posting
(`UPLOAD_POST_API_KEY`). This capability predates the rebuild; stitching and
the basic pass were already implemented there, so Part A was hardening, not
new infrastructure.

Done, by file:
- `app/(creator)/record/[id].tsx`: capture pinning. `recordAsync` now pins
  `codec: 'avc1'` (H.264, iOS) and CameraView pins `videoBitrate` 8 Mbps
  alongside the existing 1080p. **expo-camera 17 (SDK 54) exposes NO
  framerate or audio sample rate control**, so a stream-copy concat is
  unattainable client-side; those two are normalized server-side (below).
  Note: `AGENTS.md` says Expo v57 docs; the installed SDK is 54.
- `lib/submissions.ts`: at submit time each clip's REAL media duration is
  probed with `expo-video` (`createVideoPlayer`, wall clock fallback), and
  one `submission_segments` row per clip is inserted (slot order,
  `duration_ms`, `brief_segment_id` matched by slot order against the
  brief's `brief_segments`, null for legacy/task briefs). Both the task and
  assignment paths do this.
- `supabase/functions/post-approved/index.ts` (DEPLOYED): the old
  stitch-then-edit two-job flow is now ONE FFmpeg job (`stitchAndEditPass`)
  for any clip count: per-input normalize (fps 30, 1080x1920, 48k stereo)
  -> concat -> head trim (`-ss 0.15`, input 0 only) -> tail silenceremove ->
  loudnorm -> h264_nvenc. One re-encode instead of two, one 150s poll
  instead of two against the ~400s wall clock, and mixed-resolution clips
  (front/back camera flip) no longer break concat, which the old
  filter-graph would have. Clips resolve from `submission_segments`
  (latest attempt per slot) with fallback to legacy `segment_paths`.
- Overlay rendering (Part B, DEPLOYED): after the stitch pass, if the
  brief has `brief_segments`, a `RenderTimeline` is built and persisted to
  `submissions.render_timeline`, then texts/screenshots are composited via
  Creatomate and the rendered file is posted. Default rule: overlay text
  shows for the FIRST 3 SECONDS of its clip (`TEXT_HOLD_MS`); screenshots
  composite for the whole clip. Timing is absolute: clip 0 loses 150ms to
  the head trim (`HEAD_TRIM_MS` mirrors the ffmpeg `-ss 0.15`).
- `supabase/functions/_shared/renderTimeline.ts` (new): OUR timeline shape
  — `{ width, height, clips: [{slot_index, duration_ms}], texts: [{text,
  start_ms, duration_ms}], images: [{screenshot_path, start_ms,
  duration_ms, x, y, width}] }` — plus `buildRenderTimeline` and
  `timelineHasOverlays`. Render-service agnostic on purpose.
- `supabase/functions/_shared/renderAdapter.ts` (new): the ONLY file that
  knows Creatomate's request shape (`POST /v1/renders` with an inline
  source, poll, download bytes). Text style consts (`TEXT_STYLE`: Inter
  800, white rounded box, mid-frame at 45%) live at the top of this file —
  the InShot look is tuned here and nowhere else. Swapping render services
  means replacing this file only.
- `app/(creator)/assignment/[id].tsx` + `markMusicAdded` in
  `lib/tasks-api.ts` (Part C, platform-independent half): on a posted
  slideshow with `music_approved_at` null, the creator sees the one-tap
  **Music added** button. It writes `music_marked_by_creator_at` (CAS on
  null, double tap harmless — NOT a status change, so lib/tasks.ts is not
  involved) and fires the `music_pending` notify event to admins. After
  tapping, a waiting state renders.
- Deployed `notify` and `poll-metrics`: both already carried uncommitted
  music-loop source in this worktree (`music_pending` / `music_approved` /
  `post_live` events; the photo_carousel bounty gate requiring
  `music_approved_at` before `bounty_credit`) with no HANDOFF section
  claiming them. Verified the gate logic and deployed both so the live
  functions match the tree.

Schema touched: migration
`supabase/migrations/20260806130000_030_render_timeline.sql` (applied,
recorded, types regenerated) — `submissions.render_timeline jsonb`, the
persisted render manifest. **Numbering note: 029 was taken.** Agent 5's
`029_library_reads` is recorded at version `20260806120000`; anyone adding
migrations must check `supabase_migrations.schema_migrations` on the linked
project first, because parallel agents in separate sessions have already
collided once.

New shared helpers: `_shared/renderTimeline.ts` and
`_shared/renderAdapter.ts` (contracts above); `markMusicAdded` in
`lib/tasks-api.ts`.

Deviations (admin-approved in conversation):
- Stitch and the WP9 basic pass merged into one FFmpeg job (one re-encode,
  approved as Q1).
- "Pin all four at capture" is physically limited to codec, resolution and
  bitrate; fps and audio sample rate are pinned in the server normalize
  step instead, because expo-camera cannot express them.
- New-world slideshows (format photo_carousel AND non-null post_type_id)
  get a 409 from post-approved: the posting path is HELD pending the
  admin's verification of Instagram Replace Audio on the real accounts.
  Legacy carousels (null post_type_id) keep the old video behavior.

Left open:
- **CREATOMATE_API_KEY is not set.** Sign up (free trial, 50 credits, no
  card), then `supabase secrets set CREATOMATE_API_KEY=... --project-ref
  zdcmmzofnrdqbwexuqnm`. Until then, posts WITH overlay content fail
  loudly at approve time with a clear error; posts without overlays flow
  normally. No end-to-end render has run yet for this reason.
- Part C posting path: waiting on the Replace Audio verdict. If it works:
  slideshow assembly through the render adapter (slides are image renders
  of overlay_text), Upload-Post photos endpoint, `auto_add_music` on
  TikTok, silent on Instagram. If not: creators post manually from their
  phone and the Music added loop (already live) covers the rest.
- Per-clip rejection UI (Review queue 1) is Agent 6's; when a redo lands,
  write the new `submission_segments` row with `attempt` incremented —
  post-approved already picks the latest attempt per slot.
- `npx tsc --noEmit`: zero errors in Agent 8 files. The three current
  errors are Agent 6's in-flight screens referencing routes that do not
  exist yet (same class Agents 3 and 5 hit; see their sections).
- `posts` has no `company_id` column (pre-existing; scoped through
  submission/assignment joins). Flagged, not changed.

---

## Agent 7 — notifications and analytics — 2026-08-06

Done, by file:

- **Migration** `supabase/migrations/20260806140000_031_notifications_analytics.sql`
  (applied and recorded, types regenerated). Versions `20260806120000` and
  `20260806130000` were already taken by parallel agents; this is 031 at
  `...140000`. Check `supabase_migrations.schema_migrations` before numbering.
- **`supabase/functions/_shared/push.ts`** (new): `sendExpoPush`,
  `adminPushTokens`, `creatorPushTokens`. Both notify and poll-metrics send
  through it; use it for any future push.
- **`supabase/functions/notify/index.ts`** (rewritten, DEPLOYED): existing
  events unchanged (`submitted`, `approved`, `changes_requested`, `comment`,
  `published`). New events and their contracts:
  - `{ creator_id, event: "message" }` — creator author pushes admins,
    admin author pushes that creator. WIRED in `sendMessage`
    (`lib/messages-api.ts`).
  - `{ creator_id, event: "account_submitted" }` — pushes admins. WIRED in
    `submitCreatorAccount` (`lib/creator-accounts-api.ts`).
  - `{ creator_id, status, event: "account_decided" }` — admin only, pushes
    the creator ("approved" or "needs changes"). WIRED in `decideAccount`.
    Addition beyond the build doc's notification list, requested by Agent 6's
    Left open; without it the resubmit path is invisible to the creator.
  - `{ assignment_id, event: "music_pending" }` — pushes admins. Already
    wired by Agent 8 in `markMusicAdded` (`lib/tasks-api.ts`).
  - `{ assignment_id, event: "music_approved" }` — pushes the creator,
    "Earnings unlocked". WIRED in `approveMusic` (`lib/admin-api.ts`).
  - `{ assignment_id | task_id, event: "post_live" }` — pushes the creator
    with deep links: notify loads the posts rows server-side and puts
    `tiktok_url` / `instagram_url` in the push data. WIRED in
    `lib/admin-api.ts` after `post-approved` resolves on both the assignment
    and legacy task paths (post-approved itself untouched: Upload-Post
    internals are do-not-touch).
- **`supabase/functions/poll-metrics/index.ts`** (DEPLOYED):
  - Milestones: after each successful metrics fetch, best-ever views
    (history max, mirroring the bounty rule) checked against
    5k/10k/50k/100k/1m. Membership in `posts.milestones_fired` is checked
    first, then the `claim_post_milestone` RPC (migration 031) atomically
    appends and reports whether THIS call claimed it; the admin push sends
    only on a true claim, so re-polls and concurrent polls cannot re-notify.
    One push per post per poll naming the highest new threshold. Milestones
    live on the per-platform posts row, so a post crossing on both platforms
    notifies once per platform, platform named.
  - **Music earnings gate — OWNED HERE, Agent 8 do not duplicate**:
    photo_carousel bounties (via `briefs.format` on the assignment's brief)
    additionally require `assignments.music_approved_at` non-null before
    `creditAssignmentBounty`. Video bounties are NEVER gated. The legacy
    task-keyed per-post bounty path is ungated (predates slideshows).
  - `post_metrics.saves` now written when Upload-Post reports it (nullable;
    resolves Agent 6's "shows a dash" trap when platforms return it).
- **`supabase/functions/sync-conversions/index.ts`** (new, DEPLOYED) +
  `[functions.sync-conversions]` in `supabase/config.toml`: pulls conversion
  AGGREGATES from the FieldVision product database over its REST API.
  Daily counts of new accounts (`user_profiles.created_at`, `is_demo`
  excluded), free trials (`trial_started_at`), sales count and cents
  (`user_subscriptions.paid_at/amount_cents`), upserted into
  `conversion_daily`. Per-creator attribution: `attribution_links.code`
  (creator-keyed, already in schema) matched case-insensitively against the
  `referral_code` FieldVision captures in `user_onboarding_intake`; matched
  users' conversions also land on a `creator_id` row. Individual user rows
  are NEVER persisted in Noni; only timestamp/amount/code columns are read
  and discarded after aggregation. Cron `noni-sync-conversions-daily` at
  07:30 UTC (migration 031, same Vault cron-secret pattern as poll-metrics).
- **`conversion_daily`** (migration 031): `(company_id, day, creator_id)`
  unique NULLS NOT DISTINCT; `creator_id null` = company-wide total row.
  RLS: admins read own company; writes are service-role only.
- **Analytics tab rebuilt** `app/(admin)/(tabs)/analytics.tsx`: ONE time
  series (`components/admin/TimeSeriesChart.tsx`, react-native-svg) with the
  selected metric as the line and posts-per-day bars on the same axis.
  Metric chips: Revenue, Views, Likes, Saves, Comments, Sales, New accounts,
  Free trials. Ranges 7/30/90 days. Tapping a day opens
  `components/admin/DayDetailSheet.tsx`: that day's conversions and every
  post that ran, with views and open-on-platform links. Data layer is
  `lib/analytics-api.ts` (`fetchCompanyTimeSeries`): engagement as day
  deltas between post_metrics snapshots, conversions from conversion_daily,
  revenue from conversion_daily once synced with fallback to Noni's own
  `revenue_events` until then. The old briefs/hooks/formats/creators
  sections are gone (they are cuts that live elsewhere);
  `fetchBriefAnalytics` still exists in lib/admin-api.ts.

Schema touched: `claim_post_milestone(p_post_id, p_threshold)` function;
`post_metrics.saves bigint` (nullable); `conversion_daily` table; the
sync-conversions cron job. Nothing else changed.

New shared helpers: `_shared/push.ts`, `lib/analytics-api.ts`,
`components/admin/TimeSeriesChart.tsx`,
`components/admin/DayDetailSheet.tsx`, `scripts/acceptance-agent7.ts`.

Deviations:

- `account_decided` notify event (above) — beyond the build doc's list, per
  Agent 6's handoff request.
- Admin-authored messages also push the creator (mirrors the existing
  `comment` event's role routing; Agent 6 shipped a creator chat screen that
  would otherwise never be opened).
- Attribution (admin-confirmed): per-creator tracked links plus day-level
  correlation; per-post links deferred. Cross-project mechanism
  (admin-confirmed): scheduled aggregate pull, NOT postgres_fdw.

Verification:

- `scripts/acceptance-agent7.ts` (rerunnable, seeds a clone post, cleans up,
  pins the assignment bounty so no money can move): PASS on all three —
  claim RPC claims once and refuses the second call; two DEPLOYED polls run
  clean with no spurious fire (edge logs confirmed `polled=0 skipped=1`, no
  crash); the exact post-fetch milestone sequence replayed over a 6k-view
  post across two polls yields exactly one notification.
- CAVEAT: no post in the database has ever had an Upload-Post
  `provider_post_id`, so the external analytics fetch leg cannot succeed
  end to end yet. Rerun the script once a real post exists; part B then
  covers the full path.
- `npx tsc --noEmit` clean, including Agent 6's screens after regenerating
  expo-router typed routes (their three route errors were stale typegen,
  fixed by a brief `expo start`).

Left open:

- **BLOCKED ON ADMIN — FieldVision secrets.** sync-conversions needs
  `FIELDVISION_URL` and `FIELDVISION_SERVICE_KEY` set via
  `supabase secrets set ... --project-ref zdcmmzofnrdqbwexuqnm`. Use a
  READ-ONLY key scoped as narrowly as FieldVision allows (needs select on
  `user_profiles`, `user_subscriptions`, `user_onboarding_intake` only).
  Optional `FIELDVISION_COMPANY_ID`; with exactly one Noni company it
  resolves automatically. Until set, the function fails loudly and the
  Analytics tab shows a "sync has not run yet" note with tracked-link
  revenue as the fallback.
- Per-creator tracked links: create `attribution_links` rows (code +
  creator_id) whose codes are the referral codes creators paste in DMs.
  FieldVision's intake must keep capturing `referral_code` at signup; no
  FieldVision-side change was made or needed.
- The per-creator rows in `conversion_daily` are written but not yet
  surfaced in the UI (day sheet shows company totals; posts list shows
  per-post views). A per-creator conversion cut belongs on the Creators tab
  when wanted.
- Milestone pushes go to admins only, per the build doc's notification
  lists. If creators should also get their own milestones, add a
  creator push in poll-metrics' milestone block.

## Agent 4 — AI review and publish — 2026-08-06

### What shipped

**Tier 1 restructured** — `supabase/functions/_shared/validateBrief.ts`
now emits structured checks via `runTier1Checks(draft, ctx): ReviewCheck[]`
(stable `check_id`, tier, section, severity, message, optional suggestion).
`validateBrief()` is derived from it with an unchanged API and IDENTICAL
hard-fail set and messages, so generation retry behavior did not move.
Five new soft warnings were added (warnings never trigger a retry):

- `second_person_high` — density above 8 per 100 words (real posts run
  5.2 to 6.2; Agent 2's acceptance run hit 10.1 and passed silently
  because only the lower bound existed)
- `hedges` — really, truly, actually, honestly, simply, just, very
- `double_adjectives` — two adjective-like tokens stacked on one noun
  (lexicon + suffix heuristic, quotes the phrase)
- `search_phrase_missing` and `search_phrase_not_in_caption` — phrase
  present and in the caption's first sentence

This module stays IMPORT-FREE on purpose: the client bundles it
(`lib/briefs-api.ts` re-runs Tier 1 at confirm time). Do not add Deno
imports to it.

**`_shared/reviewBrief.ts` (server only)** — scoring, the Tier 2/3
prompts and parsers, and `parseReviewDraft` (same tolerant draft read as
brief-assist). Scoring: per-section 100 minus deductions (tier1 fail 25,
tier1 warn 10, tier2 15, tier3 20); overall = mean of hook/points/cta
minus caption deductions at half weight minus overall-section deductions.
Scores rank problems; nothing gates on them.

**`brief-review` edge function (deployed)** — admin only. Body
`{ draft, post_type?, hook_index? }`, draft is the editor's CURRENT state,
nothing is saved server-side. Runs Tier 1 deterministically, Tier 2 (one
structural call: dialogue, symmetrical clauses, three-item parallel
lists, search-promise delivery) and Tier 3 (spoken or written, boolean
plus single worst line quoted) in parallel. Returns
`{ checks, scores, tier3 }`. Tier 2/3 checks are severity `warn` with
suggestions where the model offered a swap.

**Review UI** — `components/admin/editor/ReviewSheet.tsx` plus wiring in
`app/(admin)/post/[id].tsx`. Review button next to Save. Score row
(overall + hook/points/plug), Tier 3 verdict card, checks grouped by
section, Apply per suggestion. HARD RULES HELD: review never blocks
(Confirm is one tap at any score, no dialog) and never silently edits
(only Apply mutates the draft).

**Confirm pipeline** (client, in `confirmReview`):

1. Tier 1 RE-RUNS client-side against the post as it stands, so a fixed
   check is not logged as overridden (`runClientTier1` +
   `listApprovedClaimIds` in `lib/briefs-api.ts`).
2. `brief_review_events` rows written: one `edit` per changed field with
   `diff {field, before, after}` (talking points keyed
   `talking_point:<id>`), one `override` per still-fired tier 1 check and
   per unapplied tier 2/3 check, one `confirm`. NOT `review_events`,
   which is the creator-scoped submission thread.
3. Banned phrases: a talking point whose snapshot text was generated
   (`edited_by_admin` false), was NOT changed via an applied suggestion,
   and differs at confirm appends its BEFORE text to
   `brand_profiles.banned_phrases` (dedupe on append). Hook options are
   not banned: the old option stays in `hook_options`, nothing was
   removed. Applied suggestions are the model correcting itself, not her
   rewrite, so they do not feed the ban list.
4. `save()` persists the draft (existing path, derives segments), then
   `reviewed_at` + `review_result` land via `confirmBriefReview`.
   `reviewed_at` is sticky: later edits do not clear it (the editor shows
   a "review again if it changed a lot" nudge instead).

**Publish gate** — `app/(admin)/(tabs)/create.tsx`. Button disabled with
`Publish X/N reviewed` until every row passes: new-model rows need state
`complete` (reviewed_at), legacy rows (null post_type_id) count when
hook or script is present. A legacy brief never deadlocks publish
(settled with the lead). This is a different number from the switcher's
filled count, deliberately.

**Publish scheduling** — migration
`20260806150000_032_publish_scheduling.sql` (applied): `campaigns.notify_at`
/ `notified_at`, `campaign_notify_at(date)` returning 8PM
America/New_York on the drop date (DST-aware via `at time zone`), and an
hourly `noni-notify-scheduled-hourly` cron at :05 with the standard
`x-cron-secret` Vault pattern. `publish-campaign` (redeployed): fan-out
through `buildCreatorWeek` + `publish_campaign_assignments` RPC is
UNCHANGED; after the RPC it compares now to `campaign_notify_at(drop_date)`.
Before the cutoff it stamps `notify_at` and returns
`{ scheduled: true, notify_at }` with no push; after, it pushes
immediately via the existing notify loop and stamps `notified_at`. New
`notify-scheduled` function (deployed, cron or admin auth) sweeps due
campaigns, claims via `update ... where notified_at is null` so a
concurrent run cannot double-send, and pushes only to creators holding
assignments in that campaign, same copy as notify's `published` event.

### Also redeployed

`ingest-brief` and `brief-assist`, so generation bundles the new
validator and its five soft warnings ride along at generation time too.
Hard-fail behavior is byte-identical.

### For later agents

- `PublishResult` now carries `scheduled` and `notify_at`; the grid
  splits the success alert copy on it.
- A check overridden twenty times is a wrong check:
  `select check_id, count(*) from brief_review_events where event = 'override' group by 1 order by 2 desc`
  is the report this table exists for.
- The double-adjective check is a heuristic (lexicon + ous/ful/ive/able/
  ible/less/ish suffixes). If it fires noisily in practice, trim the
  lexicon before touching the suffix list.
- `notify-scheduled` reads `assignments` for the creator set, not all
  company creators: only creators who actually got a week are pushed.

### Not touched

Upload-Post internals, payouts, Stripe, scrape-trends / generate-script /
auto-fill logic (auto-fill untouched; ingest-brief redeploy is validator
only), the ten seeded product_features claims, ingest-codebase,
weekly_batches/content_tasks, lib/tasks.ts transitions.

## Post-handoff cleanup — 2026-08-06

- Library picker mounted in the post editor per Agent 5's contract:
  example picks set exampleUrl, fill picks feed generatePost by query.
  BacklogSheet and QueryBankSheet deleted along with the grid's Backlog
  button (lib's listBacklogBriefs/addBriefToCampaign remain but are
  unused by the UI).
- All temporary `as Href` casts removed (create, settings,
  creator/[id]); typed routes now include every new screen.
- scripts/acceptance-agent4.ts (rerunnable, mutates nothing) passed
  against the deployed backend: all three review tiers fire with correct
  checks/scores/suggestions, campaign_notify_at returns 8PM ET as
  expected, notify-scheduled sweep returns counts.
- Calendar-as-view-toggle shipped: the calendar grid moved to
  `components/admin/CalendarView.tsx` (self-loading on focus,
  horizontal-only scroll, `refreshToken` prop for parent pull-to-refresh)
  and the Briefs header got a List/Calendar icon toggle. The Calendar tab
  is hidden (`href: null`, route stays navigable, same pattern as Trends
  and Settings).
- Still deliberately open: the creator-side from_creator submission UI
  (in progress by the lead).
