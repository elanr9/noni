# NONI — Master Build Spec

This file is the single source of truth for building Noni. It is written to be dropped into the repo root as `NONI_SPEC.md` and referenced by Cursor and its agents on every task. Read it fully before writing any code. When in doubt, this file wins.

---

## 0. How to use this file with Cursor agents

Cursor agents work best on scoped, independent tasks with clear interfaces, not one giant "build the app" prompt. This spec is therefore split into numbered work packages (section 12). Rules of engagement for every agent:

1. Read sections 1 to 5 (product, stack, architecture, schema, conventions) before touching code.
2. Only work inside your assigned work package. Do not modify files owned by another package except shared types in `lib/types.ts`, and announce any change there.
3. The database schema in section 6 is law. If a task seems to need a schema change, stop and flag it instead of improvising.
4. Every work package has acceptance criteria. The task is not done until all of them pass and the app builds with `npx expo start` error free.
5. Match the reference designs in `/design`. Where no design exists yet, follow the design system in section 5.

---

## 1. What Noni is

Noni is an iOS app that automates UGC content and campaign generation end to end. The system does the UGC manager's job: it scrapes TikTok and Instagram for high performing UGC, uses Claude plus the brand profile to turn what works into concrete post tasks (hook, script, caption, slide copy), and fills each creator's Today queue automatically. Creators open the app, see exactly what to post, produce it in app (video with teleprompter, or static photo / carousel posts), and submit. Admins are a one tap quality gate. After Approve, no human does anything else: the content gets basic background edits (FFmpeg; richer templates later), posts natively to the creator's own TikTok and Instagram through Upload-Post with the right caption and a tracked link, and is tracked. Two money flows run automatically: (1) **brand revenue** attributed per post through unique codes and Stripe webhooks; (2) **creator payouts** — poll post views, credit a wallet balance when a bounty threshold is hit (e.g. $20 at 5k views), and let creators cash out via Stripe like a betting app wallet.

The pipeline, end to end: **scrape → ideate → fill creator queues → record → approve → auto edit → auto post → track → pay.** Humans appear exactly twice: the creator records, the admin approves.

First tenant: FieldVision AI (football technology). Built multi tenant from day one so it can be sold to other startups later without a rewrite.

North star: someone with zero content skill can post five on brand pieces a day (video or static). Every UX decision bends toward that.

### Content formats (product law)

Noni is **not video only**. Real UGC accounts (e.g. FieldVision creator `@fabri.d1soccer`) ship a mix of:

1. **Video** — talking head / demo clips with teleprompter script.
2. **Static photo / carousel** — TikTok Photo Mode and Instagram carousels: multi slide images with text overlays, hooks, and a caption CTA (comment keyword, link in bio, etc.). URLs look like `tiktok.com/@handle/photo/{id}` and grid thumbnails show the stacked pages icon.

Reference screenshots: `design/screens/ugc-reference/` (`tiktok-ugc-profile-grid.png`, `tiktok-photo-post.png`, `tiktok-photo-carousel-slide.png`).

Implications for every package: tasks, record/create flows, review player, Upload-Post posting, trends scrape, and metrics must support both formats. Do not hardcode "video" in UI copy or types when the entity is generic content.

**Schema flag (do not improvise in app code yet):** migration 001 is video path shaped (`submissions.video_path`, `videos` bucket). A later migration must add task `format` (`video` | `photo_carousel`), slide / image assets (paths + overlay text), and storage rules for images. Until that lands, WP3 may ship video first but must not paint the product into a video only corner (shared task model, neutral copy, format field in UI stubs).

## 2. Stack

- **App:** Expo (React Native), TypeScript, expo-router
- **Backend:** Supabase (auth, Postgres with RLS, storage, edge functions, scheduled functions)
- **Posting:** Upload-Post API (holds Meta and TikTok approvals; we never call platform APIs directly)
- **AI:** Claude API (brand analysis, script and caption generation, trend analysis)
- **Transcription:** Deepgram
- **Trend scraping:** Apify actors for TikTok and Instagram, server side only
- **Video edits:** FFmpeg basic pass on approve (WP9); Creatomate templates later
- **Payments:** Stripe on the FieldVision (company) account — webhooks for brand revenue attribution; Stripe Connect Express for creator wallets and cash outs
- **Push:** Expo Push Notifications
- **Ship:** EAS build and submit to TestFlight

## 3. Architecture rules (non negotiable)

1. **Multi tenant always.** Every table has `company_id`. Every query is scoped by RLS to the caller's company. There is one company row (FieldVision) for now. No code may assume a single tenant.
2. **Two roles:** `admin` and `creator`. Role gates both UI routes and RLS write policies.
3. **All secrets server side.** Upload-Post, Claude, Deepgram, Apify, and Stripe keys live only in Supabase edge function env. The app never holds them.
4. **Posting is an edge function.** The client flips a status; the server posts.
5. **Media:** video uses bucket `videos`, path `company_id/task_id/version.mp4`, compressed to 1080p client side before upload. Static / carousel image assets will use a dedicated path convention once the format migration lands (see Content formats). Never assume every submission is an mp4.
6. **State machine for tasks:** `assigned → recorded → submitted → (changes_requested → recorded → submitted)* → approved → posted`. For static tasks, `recorded` means slides produced / attached. Status transitions only through defined functions in `lib/tasks.ts`, never raw updates scattered through the UI.

## 4. Repo layout

```
noni/
  app/                    # expo-router
    (auth)/               # login, magic link callback
    (onboarding)/         # company + creator onboarding flows
    (creator)/            # today, task/[id], record/[id], my-posts
    (admin)/              # queue, review/[id], calendar, trends, analytics, settings
  components/
  lib/
    supabase.ts
    types.ts              # generated from schema, shared by all packages
    tasks.ts              # status transition functions
    notifications.ts
  supabase/
    migrations/
    functions/            # brand-ingest, generate-script, post-approved,
                          # scrape-trends, poll-metrics, stripe-webhook, notify
  design/                 # Claude Design exports + screenshots
  .cursor/rules/project.mdc
NONI_SPEC.md              # this file
```

## 5. Conventions and design system

- TypeScript strict, no `any`. Small functional components. expo-router file based navigation.
- expo-camera, expo-av, expo-notifications, expo-image-picker only for media; no unmaintained camera libs.
- Visual language comes from the Claude Design exports in `/design`. Until those exist: clean, high contrast, one accent color, oversized tap targets, generous whitespace, SF rounded feel. Creator screens must be operable one handed while holding a phone at arm's length.
- Copy tone: short, direct, zero corporate filler. Buttons say what happens ("Post it", "Send for review"), never "Submit".
- Every list screen has a real empty state that tells the user the next action.

## 6. Database schema (migration 001)

```sql
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  website text,
  settings jsonb default '{}',        -- onboarding answers: cadence, approval rules, tone slider
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  company_id uuid references companies not null,
  role text not null check (role in ('admin', 'creator')),
  full_name text,
  avatar_path text,
  expo_push_token text,
  onboarded boolean default false,
  created_at timestamptz default now()
);

create table brand_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  tone text,
  audience text,
  content_pillars jsonb,
  products jsonb,
  buying_path text,                    -- link in bio, DMs, website
  source_urls text[],
  updated_at timestamptz default now()
);

create table trend_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  platform text check (platform in ('tiktok', 'instagram')),
  source_url text,
  author_handle text,
  views bigint, likes bigint, comments bigint, shares bigint,
  transcript text,
  hook text,
  why_it_works text,
  scraped_at timestamptz default now()
);

create table content_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  assigned_to uuid references profiles,
  created_by uuid references profiles,
  title text not null,
  script text,
  caption text,
  platforms text[] default '{tiktok,instagram}',
  inspiration_trend_id uuid references trend_items,
  due_date date,
  status text not null default 'assigned'
    check (status in ('assigned','recorded','submitted','changes_requested','approved','posted')),
  created_at timestamptz default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references content_tasks not null,
  creator_id uuid references profiles not null,
  video_path text not null,
  duration_seconds int,
  version int default 1,
  created_at timestamptz default now()
);

create table review_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions not null,
  author_id uuid references profiles not null,  -- admin or creator (was reviewer_id in migration 001)
  action text check (action in ('approved','changes_requested','comment')),
  note text,
  created_at timestamptz default now()
);
-- Thread law: every feedback moment is a review_event on the current submission.
-- approved / changes_requested also flip content_tasks.status (via lib/tasks transitions).
-- comment never flips status — back-and-forth until Request Changes or Approve.
-- Creators may insert action=comment on submissions they own; admins insert any action.

create table posts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references content_tasks not null,
  submission_id uuid references submissions not null,
  platform text,
  provider_post_id text,  -- Upload-Post request/post id
  post_url text,
  status text default 'posted',
  posted_at timestamptz default now()
);

create table post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts not null,
  views bigint, likes bigint, comments bigint, shares bigint,
  fetched_at timestamptz default now()
);

create table attribution_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  task_id uuid references content_tasks,
  creator_id uuid references profiles,
  code text unique not null,
  url text
);

create table revenue_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  attribution_link_id uuid references attribution_links,
  stripe_event_id text unique,
  amount_cents int,
  occurred_at timestamptz default now()
);

-- Creator wallets (WP10). Ledger is source of truth; balance is derived / cached.
create table creator_wallets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  creator_id uuid references profiles not null,
  available_cents int not null default 0 check (available_cents >= 0),
  pending_cents int not null default 0 check (pending_cents >= 0),
  stripe_connect_account_id text,          -- Express account once onboarded
  unique (company_id, creator_id)
);

create table wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  creator_id uuid references profiles not null,
  kind text not null check (kind in ('bounty_credit','payout_hold','payout_paid','payout_failed','adjustment')),
  amount_cents int not null,               -- signed: credits positive, holds/payouts negative
  post_id uuid references posts,           -- set for bounty_credit (idempotency key with kind)
  payout_id uuid,                          -- set for payout_* rows
  note text,
  created_at timestamptz default now(),
  unique (post_id, kind)                   -- one bounty_credit per post
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies not null,
  creator_id uuid references profiles not null,
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending','processing','paid','failed')),
  stripe_transfer_id text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Bounty defaults live in companies.settings jsonb:
--   bounty_amount_cents (default 2000), bounty_view_threshold (default 5000)
-- Optional per-task overrides on content_tasks later; until then use company defaults.
```

RLS pattern, applied to every table:

```sql
alter table content_tasks enable row level security;

create policy "same company read" on content_tasks for select
  using (company_id = (select company_id from profiles where id = auth.uid()));

create policy "admins write" on content_tasks for all
  using (company_id = (select company_id from profiles where id = auth.uid())
     and (select role from profiles where id = auth.uid()) = 'admin');
```

Creators additionally get: update on `content_tasks.status` for tasks assigned to them (only via allowed transitions), insert on `submissions` for their own tasks, update on their own `profiles` row. Storage bucket `videos` mirrors these policies.

## 7. Screens

### Onboarding, company (admin, runs once at signup)
The question heavy flow. One question per screen, progress bar, big tap targets, answers write to `brand_profiles` and `companies.settings`.

1. Welcome. Logo, one line on what Noni does, Get started.
2. Company name + website.
3. Instagram and TikTok handles.
4. **Brand study screen.** "Give us 60 seconds, we're studying your brand." Fires the `brand-ingest` edge function and streams progress states (Reading your site → Watching your posts → Learning your voice). This is the showpiece screen.
5. Who is your customer (free text with AI prefilled suggestion to confirm or edit).
6. What are you selling (same pattern).
7. How do people buy: link in bio / DMs / website.
8. Content pillars: AI suggested chips from the brand study, tap to keep, add your own.
9. Tone slider: professional ↔ unhinged, with a live example caption that rewrites as the slider moves.
10. Cadence: videos per week per creator.
11. Who approves content: just me / me + others.
12. Invite creators: share sheet with invite links.
13. Done → lands on Calendar, pre filled with the first week of AI generated tasks. Never land on an empty app.

### Onboarding, creator (under two minutes, ends in action)
1. Invite link → magic link auth.
2. Name + selfie avatar.
3. Camera and mic permissions with honest one line explanations.
4. Connect socials: Upload-Post hosted linking for the creator's own TikTok/Instagram (`profiles.upload_post_profile`). Approved content posts to these accounts.
5. Teleprompter tutorial: record a 15 second throwaway practice clip against sample text.
6. Lands on Today with their first real task waiting.

### Creator side
- **Today.** Tasks due today and this week, filled automatically by the UGC brain (WP8), big status chips, videos owed count at top. The whole product for creators.
- **Task Detail.** Title, hook, script preview, embedded inspiration trend, caption, due date, giant Record button. **Review thread** (chronological `review_events` for the latest submission): admin Request Changes notes, both sides' `comment` replies, Approve. When `changes_requested`, show the latest note prominently and Record / re-record.
- **Record.** Full screen front camera. Teleprompter: semi transparent scrolling script over the top third, adjustable speed, 3 second countdown, pause, retake. The screen to obsess over.
- **Review and Submit.** Playback, retake, submit. Submit flips status and pushes admins.
- **My Posts.** History with per task status and live post links.
- **Balance.** Wallet: available / pending, ledger (bounty credits + payouts), Connect onboarding + Cash out.
- **Settings.** Connect own TikTok/Instagram (Upload-Post). Required before approved content can go live.

### Admin side
- **Queue.** Submissions awaiting review, newest first, badge count.
- **Review.** Player + script side by side, **feedback thread** (same `review_events` list), composer for a plain `comment` (no status change), and Approve or Request Changes (note required). Loop continues across re-records until Approve. Approve triggers the auto-finish pipeline (edit → post → track); nothing after Approve involves a human.
- **Calendar.** Week view across creators showing the AI filled queue. Oversight and override: edit or remove generated tasks, manual creation as fallback, and a Generate button (Claude drafts title, hook, script, caption from brand profile + optional trend).
- **Trends.** Scraped feed cards: thumbnail, views, hook, Claude's one liner on why it works, Turn into task button.
- **Analytics.** Views and revenue per post, per creator totals, best hooks, bounty credits paid.
- **Settings.** Creator social connection status, invite creators, brand profile editor, company settings. Creators connect their own accounts in creator Settings.
- **Creator Balance (wallet).** Available + pending cents, ledger history, Cash out (Stripe Connect Express). Same pattern as a sportsbook wallet: earn into balance, withdraw when ready.

## 8. Edge functions

| Function | Trigger | What it does |
|---|---|---|
| `brand-ingest` | Onboarding step 4, monthly cron | Pulls site text + recent captions, Claude → brand profile JSON → `brand_profiles` |
| `generate-script` | Generate / Turn into task | Brand profile + optional trend transcript → Claude → title, hook, 60s script, caption |
| `scrape-trends` | Weekly cron | Apify actors on pillar derived search terms → filter by views → Deepgram transcripts → Claude hook + why_it_works → `trend_items` |
| `post-approved` | Approval action | Signed media URL(s) → background basic edit (FFmpeg, WP9) → Upload-Post post endpoint (video or photo carousel) → write `posts` |
| `poll-metrics` | Daily cron | Upload-Post analytics per post → `post_metrics`; if views ≥ company bounty threshold and no `bounty_credit` ledger row for that post → credit wallet |
| `stripe-webhook` | Stripe events | (a) Match promo code / UTM → `revenue_events`; (b) Connect / transfer events → update `payouts` + ledger |
| `creator-payout` | Creator Cash out | Hold available balance → Stripe Transfer to Connect Express account → pending until webhook confirms |
| `stripe-connect` | Creator Balance setup | Create / resume Stripe Connect Express onboarding link for the creator |
| `notify` | Status changes | Expo push to the right role (submit → admins, review outcome → creator, bounty credit → creator, new review `comment` → other party) |

## 9. Claude Design workflow

Design in Claude Design before building, in this order: Record screen, company onboarding flow, Today, Review. Export code to `design/` and screenshots to `design/screens/`. Every UI work package must reference its design files.

## 10. `.cursor/rules/project.mdc`

```
This is Noni, an Expo (React Native, TypeScript) app. Spec: NONI_SPEC.md, read it first.
Backend is Supabase: auth, Postgres with RLS, storage, edge functions.
Posting goes through Upload-Post only, never platform APIs directly.
The loop: scrape trends + Claude fill creator queues automatically; creators record; admins only approve; after Approve everything (edit, post, track) is automatic. Humans appear exactly twice.
Every table and query is scoped by company_id. No exceptions.
Two roles, admin and creator, gating both routes and RLS.
Task status changes only through lib/tasks.ts transition functions.
Schema lives in supabase/migrations, read before writing queries.
All third party keys live in edge function env, never in the app.
Match designs in /design. TypeScript strict, no any, small components.
```

## 11. Environment checklist (do once, before agents run)

Apple Developer account, Supabase project (run migration 001, create `videos` bucket), Expo + EAS account, Anthropic API key, Upload-Post account, Deepgram key, Apify account, FieldVision Stripe account (`STRIPE_SECRET_KEY`, webhook secret, Connect enabled). Put Supabase URL and anon key in the app env; everything else in edge function secrets.

Auth redirect URLs (Supabase → Authentication → URL configuration): add `noni://auth/callback` and your Expo dev URL from `npx expo start` (scheme `noni`). Site URL can be `noni://`. Until WP7 invite flow exists, attach test roles with `scripts/attach-profile.sql`.

## 12. Work packages (assign one per agent)

Interfaces between packages are the schema (section 6) and `lib/types.ts`. Packages within the same phase can run in parallel; phases are sequential.

**Phase A, foundation (sequential, one agent):**
- **WP0 Scaffold.** Expo app with expo-router, strict TS, Supabase client, env wiring, migration 001 applied, generated types in `lib/types.ts`, `.cursor/rules` in place. *Accepts when:* app boots to a placeholder screen, types compile.
- **WP1 Auth + roles.** Magic link auth, profile lookup, route guards: admins → `(admin)`, creators → `(creator)`, un-onboarded users → `(onboarding)`. *Accepts when:* both roles route correctly on fresh login.

**Phase B, parallel:**
- **WP2 Creator core.** Today, Task Detail, My Posts, `lib/tasks.ts` transitions. *Accepts when:* a seeded task renders, status chips reflect state.
- **WP3 Record screen.** Camera, teleprompter overlay (speed control, countdown, pause), retakes, 1080p compression, upload to storage, submit flow. *Accepts when:* a real video lands in the bucket at the right path and status flips to submitted.
- **WP4 Admin core.** Queue, Review, Calendar with manual task creation. *Accepts when:* full manual loop works: create → assign → (WP3 submit) → approve/request changes with review_events written. (Manual creation is scaffolding: once WP8 lands, the calendar's job flips to overseeing the AI filled queue.)
- **WP4.5 Review thread.** Shared feedback convo on admin Review + creator Task Detail until the task is approved/posted. Migration: rename `review_events.reviewer_id` → `author_id`; RLS so creators can insert `action=comment` on their own submissions (admins keep all actions). UI: chronological thread, comment composer on both sides, Request Changes still requires a note and flips status, creator sees latest change note + can re-record. Extend `notify` for `comment`. *Accepts when:* admin requests changes with a note → creator sees it on Task Detail, both can exchange comments without status flips, creator re-records and re-submits → admin sees prior thread on the new submission version (or task-scoped history — prefer all events for the task's submissions in one thread), then Approve ends the loop.
- **WP5 Notifications.** `notify` edge function + client registration. *Accepts when:* submit pushes admins, review outcome pushes the creator.

**Phase C, parallel:**
- **WP6 Posting.** Creator Upload-Post linking in Settings, `post-approved` posts to the assigned creator's accounts, posts written and links shown in app. *Accepts when:* an approved test video appears live on the creator's linked account.
- **WP7 Onboarding flows.** Both flows from section 7, writing to `brand_profiles`, `companies.settings`, `profiles.onboarded`. Brand study screen may stub the ingest call until WP8 lands. *Accepts when:* a fresh admin and a fresh creator each complete their flow and land in the right home screen.

**Phase D — the product, parallel:**
- **WP8 UGC brain.** The core of Noni, merging brand ingest, trends, and generation into one pipeline: `brand-ingest` (site + captions → Claude → brand profile), `scrape-trends` (Apify actors on pillar derived search terms → filter by views → Deepgram transcripts → Claude hook + why_it_works → `trend_items`), `generate-script` (brand profile + trend → task draft), plus a scheduled auto-fill step that turns top trends into assigned tasks in each creator's Today with no admin action. Calendar shows the result for oversight/override; the Generate button and manual creation are fallbacks. Trends screen renders the scraped feed with Turn into task. *Accepts when:* a creator opens Today and finds real AI generated tasks derived from scraped trends that no admin touched, and the scripts sound like the brand profile.
- **WP9 Auto-finish.** After Approve, humans are done. `post-approved` grows a background edit step: FFmpeg basic pass (trim dead air head/tail, normalize audio, 1080x1920 conform) before the Upload-Post call, then posting and `posts` rows as in WP6. Richer template edits (Creatomate) stay in section 13. *Accepts when:* tapping Approve alone results in an edited video live on the creator's linked account with a `posts` row, zero further human steps.

**Phase E, parallel:**
- **WP10 Money: attribution + creator wallets.** Three pieces on the FieldVision Stripe account: (1) `attribution_links` per task + `stripe-webhook` matching promo/UTM → `revenue_events` (brand sales); (2) wallet schema (`creator_wallets`, `wallet_ledger`, `payouts`) with company bounty defaults in `companies.settings`; (3) `stripe-connect` + `creator-payout` so a creator can onboard Express and cash out available balance. Bounty *credits* are written by WP11's `poll-metrics` (not by this package) so credit stays idempotent with metrics. UI: creator Balance screen (available / pending / history / Cash out / Connect setup); wire `lib/bounty.ts` to company settings. *Accepts when:* (a) a test Stripe checkout with a code writes a `revenue_event` tied to the right post; (b) with a seeded ledger credit, Cash out moves funds to pending, creates a Stripe Transfer, and webhook flips the payout to `paid` with balance updated.
- **WP11 Metrics + Analytics + auto bounty.** `poll-metrics` daily cron pulls Upload-Post analytics into `post_metrics`. After each write, if max views for a post ≥ `bounty_view_threshold` and no `wallet_ledger` row with `kind=bounty_credit` for that `post_id`, insert the credit and bump `creator_wallets.available_cents` (service role, company scoped). Admin Analytics screen: views + revenue per post, per creator totals, best hooks, bounty credits. *Accepts when:* real Upload-Post metrics render per post and per creator, and a post crossing the view threshold auto-credits the creator wallet once (re-poll does not double pay).

**Phase F:** EAS build, TestFlight submit, honest permission strings, app icon and splash. Ship after Phase B lands and again after every phase.

## 13. Later (do not build yet)

Creatomate template edits (WP9 ships the basic FFmpeg pass; captions, b-roll, and branded templates come later), auto approve rules, company self serve signup and billing for external customers, Android.

**Format migration (before or with static create / post packages):** `content_tasks.format`, slide rows or jsonb for carousel assets + overlay copy, image storage bucket or prefix, Upload-Post photo post payload. Blocked on product decision only for column shape — not on whether static exists (it does).
