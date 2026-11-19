# Noni: product understanding for the AI-core rebuild

Research date 2026-11-18. Repo `/Users/elanromo/noni`, branch `briefs-redesign` (HEAD `67e8ec9`). Read-only.
Scope: the product (who, what, which workflows, which data shapes). Prompt internals of `supabase/functions/*` are left to the edge-function audit; `noni-web` is left to its own audit.

How to read claims here:
- **Verified** = I read the code or SQL that does it.
- **Spec** = a design or handoff doc says so; I did not confirm the code matches.
- **Inferred** = my reading of several sources; treat as a lead.

Important context: the repo holds four generations of the product stacked on top of each other. Most documents describe generations that are no longer the live UI. Section 0 sorts them, because an AI designer who reads the older docs first will design for the wrong product.

---

## 0. The four generations (what is live, what is fossil)

| Gen | Dates | Model of work | Status today |
|---|---|---|---|
| G1 "inspiration engine" | Jul 29 to Aug 1 | Scrape trends, Claude writes `content_tasks`, auto-fill creator queues. "Humans appear exactly twice." | Tables and functions remain (`content_tasks`, `trend_items`, `formats`, `claims`, `auto-fill`, `generate-script`, `scrape-trends`). No live screen. `docs/HANDOFF.md`, `files/ugc-bible.md`, `files/build-prompt.md` |
| G2 "admin rebuild" | Aug 3 to Sep | Manager authors a week of 30 posts: `campaigns` (= a week) → `briefs` (8 post types, hook, talking points, plug) → `publish-campaign` fans out `assignments` per creator. AI: `ingest-brief`, `brief-assist`, `brief-review`. | Backend live and still used by publish/render/post paths. Screens unreachable. `noni-build-final.md`, `HANDOFF.md`, `CREATOR_HANDOFF.md`, `instructions-from-claude/*`, `PATENT_DISCLOSURE.md` (written at this point) |
| G3 "briefs redesign" | Oct 4 to Oct 15 | "The post is the form." Week slots, kinds Handheld / Story / Freestyle, slide canvas, `write-deck`, idea chat, Revise with AI, creator studio, `auto-edit`. | Screens still in the tree (`app/(admin)/brief/*`, `ideas/*`, `post/*`, `components/admin/briefs/**`) but nothing navigates to them (verified by grepping router pushes; also stated in user memory `noni-launch-readiness-2026-11-18.md`). `claude_code_handoff/*`, `docs/EDITOR_BUILD.md` |
| **G4 "v2"** | Oct 28 to Nov 18 | **A library of briefs, not a weekly plan.** Manager saves Guided templates and Outlines into `library_briefs`. Creators pull: pick a brief or film freely, edit, send. Manager reviews. | **Live.** Admin tabs Review / Briefs / Create / Messages / Analytics (`app/(admin)/(tabs)/_layout.tsx`). Creator tabs Home / Earnings / Create / Messages / Profile. Specs live outside the repo in `/Users/elanromo/Noni Design System/design_handoff_v3_briefs/` and `design_handoff_v2_review/` |

Consequences worth holding onto:
1. **In the live mobile app the only generative AI call a user can trigger is `brief-fill`** (plus `audio-search`, which is a search API, and `vary-copy`, which fires server-side at publish). Everything else (write-deck, idea chat, revise chat, brief-review, auto-edit, cue-clip, study-reference, ingest-brief) is either reachable only from dead screens or has no caller at all. Details in section 5.
2. **The v2 spec explicitly retires the weekly planner.** `BRIEFS.md`: "`BriefsDayScreen`, `WeekScreen`, `WeekCard`, `IdeasScreen` ... are not part of this build. Do not implement day slots, 'Create Post 1/2/3', week progress bars or Day counters."
3. The data model is a superset. v2 creator posts still write G2 rows (`briefs`, `assignments`, `submissions`) through a shim (`start_creator_post`), which is where several AI hand-offs are currently dropped (section 7).

---

## 1. What Noni is, who buys it, how money moves

### Positioning
- Design system readme (`/Users/elanromo/Noni Design System/readme.md`, G1 wording): "an iOS app ... that automates UGC content creation end to end for a brand's roster of creators. It does the UGC manager's job." **North star: "someone with zero content skill can post five on-brand pieces a day. Every design decision bends toward that."**
- v2 review handoff (`design_handoff_v2_review/README.md`): "Noni is a creator campaign manager. An admin (brand side) reviews what creators submit, briefs them, messages them and reads analytics."
- Patent disclosure section 1: "a multi-tenant system for running a roster of human creators as a paid short-form-video distribution channel for a single brand."
- Landing page (`design_handoff_landing_page/README.md`): headline "noni app", subhead "Automated UGC Content Submissions", waitlist CTA. Domain `usenoni.app`.
- Creator-side pitch (`docs/QA-CREATOR-FLOW.md`): welcome screen reads "Get paid to post."; onboarding shows an earnings estimate ($1,000 to $3,000 a month by hours).

The model is **ambassador accounts, not brand accounts**: creators post from their own (often new, warmed-up) TikTok and Instagram accounts, in first person, as a peer of the buyer. `noni-build-final.md`: "These are ambassador accounts, not brand accounts."

### Who buys
- So far: one real tenant. **FieldVision AI** (college soccer recruiting software: writes and sends emails to college coaches, AI highlight videos, school fit). Creators were real D1 players (`instructions-from-claude/voice-doc-v1.md`).
- **Inkbound** is the in-house test company. It is FieldVision under another name: `claude_code_handoff/reference_ui/briefs/ss-data.js.txt` says "Inkbound: college soccer recruiting"; its features are highlight videos in 6 minutes, coach reply drafts, mass personalized coach emails, school profiles. Company id `59f83fa9-…`, slug `inkbound`, website `https://inkbound.ai`, linked to Noni's own Stripe platform account "Field Vision AI" (memory `noni-sales-attribution.md`). Content was wiped 2026-11-17; brand profile, docs, features, vocabulary and source accounts are currently empty; people, money and 11 media-library items were kept (memory `noni-data-reset-2026-11.md`). **Never rename this company.**
- Intended buyer (inferred from the feature set): software and app companies with self-serve sign-up and Stripe billing. Evidence: `brand_profiles.product_type` is `software | physical`; `ingest-codebase` reads a GitHub repo to build the claim library; `product_features.surface` is a route or screen; attribution connects the customer's **Stripe** (sales) and **Supabase** (`auth.users` sign-ups) by OAuth; the benchmark account in the spec is Bidly, "an account that took a comparable app to $100k ARR".
- Operationally still single-tenant in places: patent disclosure section 12 item 6 lists hardcoded FieldVision assumptions (seeded post types, search queries, hashtag bank, "college soccer and recruiting content" in account checks). `lib/company-copy.ts` was added later to derive niche words per company; I did not audit how complete that is.

### How companies pay (verified in schema, spec for prices)
- **Subscription**, the only plan difference is the creator cap per campaign (`design_handoff_pricing_plans/README.md`): Starter $100/mo ($75 annual, 5 creators), Premium $250/mo ($150 annual, 15 creators), Enterprise contact us. Cap enforced in `invite-campaign-manager` and `publish-campaign` through `_shared/plan.ts` (memory). Columns: `company_billing.subscription_plan`, `subscription_status`, `stripe_subscription_id`.
- **Prepaid creator budget** on top: company tops up credits by Stripe Checkout (`company_billing.credit_balance_cents`, `monthly_budget_cents`, `company_credit_ledger`). `docs/STRIPE_PREPAID_SETUP.md`: on each earn the company is debited `ceil(G × 1.10)` and the creator credited `floor(G × 0.97)`.

### How creators are paid (verified in schema and `poll-metrics`)
- **Per-post view bounty**: `companies.settings.bounty_amount_cents` and `bounty_view_threshold` (seed default $20 at 5,000 views, migration 011). `poll-metrics` credits `assignments.bounty_amount_cents` once when the threshold is crossed. The v3 spec's sample figure is "$40 per live post".
- **Streak bonuses** (`creator_streaks`; migration 041: 3 / 10 / 31 days at $20 / $100 / $300).
- Wallet: `creator_wallets.available_cents`, `wallet_ledger`. Weekly payout on Sunday by Stripe Connect transfer (`weekly-payouts`) or Mercury (`mercury-weekly-payouts`, `mercury_payouts`). `NOTES.md` documents a known Stripe-rail ledger double-debit (cosmetic to balances, wrong for any `sum(wallet_ledger)` report).

---

## 2. Roles and journeys

Roles (verified): `profiles.role` ∈ `creator | admin | campaign_manager | company_admin`; `company_members.role`, `permissions` jsonb, `can_create` (a manager who also films); platform roles from migration 048. One person can belong to several companies and sees one at a time (`profiles.active_company_id`, migrations 091 to 095, `design_handoff_multi_campaign/00_START_HERE.md`).

### 2.1 Noni ops (platform admin, the founders)
Job: stand up and run every company. Web `/ops` console (`design_handoff_ops_console/README.md`, built in `noni-web`): Overview, Companies (New company modal sends the one admin invite, `ops-create-company`), Company detail with tabs Analytics / Team / Posts / **Company Brain** / Billing, Users, Invites. In the app only `app/platform-admin.tsx`.
The Company Brain tab is the spec for knowledge editing: "Product + Audience doc cards (word count, updated, preview → editor modal with AI clean up + Save) + Inspiration accounts (TikTok/IG handles, Reference/Discovered, mute, add)."

### 2.2 Company owner / company admin
Job: pay, connect data, set the brand, invite managers.
- Invited by ops, signs in (Google or Apple only, invite-only sign-up, migrations 054 to 061).
- Web console `usenoni.app/admin`: onboarding, Brain, Billing (plan picker, budget, top-ups), connect Stripe (OAuth, `read_write` scope because Stripe refused read-only; Noni only reads) and connect Supabase (OAuth) for attribution.
- **The mobile app has no brand or knowledge screens.** Verified: nothing in `app/` or `components/` reads `brand_docs`, `brand_profiles`, `company_research` or `product_features` except the dead `app/(admin)/post/[id].tsx`. Admin Settings (`app/(admin)/settings.tsx`) has: managers, creators, invite, account template, post text color, "Open web console", support, terms, sign out, delete account.

### 2.3 Campaign manager (the daily user of the admin app)
Job to be done: keep a roster of non-professional creators producing on-brand, postable short videos every day, without writing every word or editing every video, and know which posts produce sign-ups and sales.
Screens (all verified as live routes):
1. First run: onboarding checklist (`app/(admin)/(tabs)/setup.tsx`, hidden tab), invite creators.
2. **Review** (`(tabs)/index.tsx`): three lanes. Posts (submitted takes), Music (did the creator add the sound on the platform), Accounts (creator warm-up proof). Post detail `review/[id].tsx`: player, time-pinned notes ("Note at 0:12" or whole-video), Script sheet, Approve or Send changes, celebration. Per-creator queue `review/creator/[creatorId].tsx`. An Edit handle opens the reel or slide editor on the submission (`components/admin/review/*`).
3. **Briefs** (`(tabs)/briefs.tsx` → `components/admin/v2/briefs/BriefList.tsx`): library of saved briefs, lanes Guided / Outlines, search, filter by type, sort.
4. **Create** (raised button → `new-brief.tsx` → `components/admin/v2/newbrief/NewBriefScreen.tsx`): step 1 post type (Talking Head, Long Text, Slideshow, Greenscreen), step 2 format (Guided or Outline), step 3 compose. **Fill in with AI** lives here. Clip tiles open the creator's reel editor on the template (`TemplateEditor.tsx`, `SlideTemplateEditor.tsx`). Save shows a celebration and, for Guided, also saves an Outline twin.
5. Brief viewer: Template / Posts tabs, posts made from the brief with views (`BriefViews.tsx`, `posts/BriefPostsPanel.tsx`, `brief-post/[id].tsx`).
6. **Messages** (`(tabs)/messages.tsx`): DMs, channels, review cards in thread, per-post threads (`post-thread/[assignmentId].tsx`).
7. **Analytics** (`(tabs)/analytics.tsx`): Analytics / Creators / Posts, range pills, trend chart, top posts; since Nov 18 sign-ups and sales by post. Creator profile `creator/[id].tsx` with calendar.

### 2.4 Creator
Who: "often young, non-technical, holding a phone at arm's length" (design readme). Paid per performing post. May work for several companies.
Job to be done: get told exactly what to make, make it in a few minutes without editing skill, get it approved first time, get paid.
1. Onboarding before auth (`app/(onboarding)/*`: name, permissions, notifications, practice, connect, done; earlier Cal-AI style questionnaire in `CREATOR_HANDOFF.md`).
2. Setup gate (`app/(creator)/setup/*`, `account-setup.tsx`): create or connect TikTok and Instagram accounts (handles suggested from the account template), **warm-up** (use the niche feed for days, upload screen recordings and screenshots as proof into `creator_accounts`), manager approves in the Accounts lane. Create is blocked until setup is complete (`SetupGateSheet`).
3. **Home** (`(tabs)/index.tsx` → `components/creator/v2/HomeScreen.tsx`): figures and this week.
4. **Create** sheet (`create.tsx`, `CreateSheet.tsx`), three rows: "Upload from library" (pick videos, straight to editor), "Start recording" (free camera), "Briefs" (guided posts and outlines from the team, `briefs.tsx`).
5. Brief detail: `outline/[id].tsx` (`OutlineScreen.tsx`) or open the template; then **Record** (`capture.tsx` → `components/creator/v2/record/RecordScreen.tsx`) or the **slideshow maker** (`slides/[id].tsx` → `components/creator/v2/slides/CreatorSlides.tsx`, text check in `story/StoryEditor.tsx`).
6. **Editor** (`edit/[id].tsx` → `record/EditorScreen.tsx` hosting `components/creator/briefs/reel/ReelEditor.tsx`), then Send sheet (name the post, wait for uploads), Sent moment, TikTok sound card if a sound was used.
7. Post detail (`posts/[id].tsx`), changes requested → resume (`resume/[id].tsx`), Messages, **Earnings** (`(tabs)/earnings.tsx`, `payouts.tsx`), Profile (promo code lives here), Settings.

---

## 3. Content lifecycle with tables and columns

Legend: (L) = live in v2, (G2/G3) = legacy path whose backend still exists.

### 3.1 Company knowledge
- `companies`: `name`, `slug`, `website`, `logo_path`, `settings` jsonb (handles, vertical, `ugc_reference_handles[]`, bounty settings, `account_template`).
- `brand_profiles`: `tone`, `audience`, `products` jsonb, `content_pillars` jsonb, `buying_path`, `source_urls[]`, `sourcing` jsonb (search-term memory), `hashtag_bank text[]`, `banned_phrases text[]`, `product_type`.
- `brand_docs` (unique `company_id, kind`): `kind` ∈ `product_truth | audience_niche | voice | learnings | industry_research | reference_playbook`, `content` markdown, `human_edited` (a human-edited doc is never overwritten by the drafter).
- `product_features` (the approved claim library): `name`, `what_it_does` (mechanism), `claim` (spoken line), `surface`, `source` (`repo | manual | site | screenshot`), `source_ref`, `approved`, `rejected`, `is_general`, `clip_url`, `screenshot_url`.
- `brain_features` (`name`, `sentence`, `reason`, `score`, `rank`, `idea_title`, `idea_action`, `idea_example`, `screenshot_path`) and `feature_screenshots`: owned by the web Brain page; no migration in this repo creates them (patent disclosure section 12).
- `media_library`: `kind`, `path`, `thumb_path`, `title`, `description`, `duration_ms`, `width`, `height`. Product screenshots and screen recordings used as green-screen backgrounds and overlays. 11 items exist for Inkbound, de-framed.
- `company_research`: `status`, `stage`, `profile` jsonb, `playbook` jsonb, `sources` jsonb.
- `reference_studies`: see 4.4. `library_items`: `source` ∈ `idea | our_post | reference | from_creator`, `text`, `url`, `thumbnail_url`, `notes`.
- Learning: `ai_feedback` (see 4.7), `ai_learnings` (`category`, `insight`, `confidence`, `evidence_count`, `examples`, `active`; `company_id` null = global rule), `brief_ai_snapshots`, `brief_edit_diffs` (`edit_ratio`, `changed_fields`, `diff`).
- G1 corpora, largely write-only: `source_accounts`, `trend_items`, `claims`, `vocabulary`, `formats`, `format_examples`, `hook_bank`, `search_queries`; newer `source_posts` (migration 128: `handle`, `hook`, `why`, `score`, engagement counts).

### 3.2 Campaign
- G2/G3: `campaigns` **is a week** (`drop_date`, `status draft|published`, `video_target`, `slideshow_target`, `type_split`), joined to briefs by `campaign_briefs`. Fan-out by `publish-campaign`.
- (L) v2 has no week UI. Posts carry `assignments.campaign_id` null when creator-started. The "campaign switcher" in the UI switches **company** context. Analytics uses the first campaign day only as the start date for counting sign-ups and sales.

### 3.3 Brief
- (L) `library_briefs` (migration 121), full shape in 4.1. Text primary key generated on the client, offline first (`lib/brief-library-api.ts`). Trigger `notify_brief_published` (migration 129) notifies members and `notify-brief` sends the push.
- (G2/G3) `briefs`: `format` (`video | photo_carousel`), `kind` (`handheld | story | open`), `post_type_id`, `title`, `hook`, `hook_options`, `talking_points`, `cta`, `cta_feature_id`, `caption`, `hashtags`, `search_phrase`, `slides` jsonb, `story`, `open`, `script`, `subtitles`, `text_overlay`, `review_result`, `status`. Render manifest `brief_segments` (`slot_index`, `kind hook|point|outro|slide`, `overlay_text`, `show_on_screen`, `text_y`, `screenshot_*`, `layout standard|green_screen`, `overlay_style`).

### 3.4 Task / assignment
- `assignments`: `brief_id` (required, points at `briefs`), `library_brief_id` (text, nullable), `creator_id`, `campaign_id`, `scheduled_date`, `slot_index`, `status`, `caption`, `slides_variant` jsonb, `submission_id`, `publish_at`, `publish_error`, `post_url`, `metrics`, `bounty_*`, `music_marked_by_creator_at`, `music_approved_at`.
- Status machine (`lib/tasks.ts`, the only legal writer): `assigned → recorded → submitted → (changes_requested → recorded → submitted)* → approved → posted`.
- (L) Creation: RPC `start_creator_post(p_company_id, p_title, p_format, p_library_brief_id)` (migration 123) inserts a stub `briefs` row **with only title and format** and an `assignments` row for the caller with status `assigned`. Called from `lib/creator-posts-api.ts`. So in v2 the creator assigns themself; the manager does not assign.

### 3.5 Record
- Camera modes (`components/creator/v2/record/model.ts`): `RecordMode = 'free' | 'outline' | 'guided'`.
  - guided: one clip per template clip, a "Say this" card that lights words at 2.6 words per second, auto-advance, retake.
  - Long Text ("seven"): one timed 7 second clip, the on-screen text is the post, submits straight from the camera.
  - Greenscreen: a picture or video behind the creator per clip (`GsMedia`); a video background times the clip to its length.
  - outline and free: any number of clips, script in a sheet.
- Persistence: local AsyncStorage `noni.record.<key>`; server `recording_drafts` (`segments` jsonb `[{slot_index, kind, storage_path, duration_ms}]`, `edits`); clips upload to the `videos` bucket as they land.
- On Next, `recordToDoc()` builds a `VideoDocument` (one block per clip, the template's on-screen texts as overlays spanning their clip, a green-screen image as an image overlay, a required sound pre-applied; **subtitles off by default**) and saves it to `creator_projects.document`.

### 3.6 Edit
- `creator_projects` (one per assignment): `document` jsonb = the edit document (4.5). Autosave through `lib/studio-store.ts`.
- Tools in the live reel editor (verified in `ReelEditor.tsx`): Split, Trim, Redo clip, Delete, Script (teleprompter text per clip, template editing), Text, Image, Sound, Captions toggle ("Captions · auto from your audio"), reorder, undo. There is an optional AI tool slot (`onAi`, `aiLabel`) that **no caller passes** in v2.

### 3.7 Submission
- `submissions`: `assignment_id`, `creator_id`, `version`, `video_path`, `segment_paths[]`, `duration_seconds`, **`edit_document` jsonb** (frozen copy), `project_id`, `audio` jsonb (PostAudio), `audio_gain`, `slide_aspect`, `instagram_segment_paths`, `transcript` jsonb, `cues` jsonb, `render_status` (`queued | rendering | ready | failed`), `render_error`, `render_timeline` jsonb.
- `submission_segments`: per clip `slot_index`, `storage_path`, `duration_ms`, `status`.
- `submitProject()` / `submitSlideshow()` in `lib/submissions.ts` insert the submission, hop the status, then kick `render-submission`. **The server renders the final file** (ffmpeg through Upload-Post); the phone only previews (`docs/EDITOR_BUILD.md`).

### 3.8 Review
- `review_events`: `submission_id`, `author_id`, `action` (`approved | changes_requested | comment`), `note`, `notes` jsonb (time-pinned), `segment_id`.
- Also `creator_accounts` (warm-up approval: `status pending|needs_changes|approved`, `decision` jsonb) and the music lane (`assignments.music_*`).

### 3.9 Publish
- Approve → `post-approved` → Upload-Post to TikTok and Instagram; `publish-due` and `notify-scheduled` handle slots (`assignments.publish_at`, jitter and spacing from migrations 112 to 115). `posts`: one row per platform (`platform`, `provider_post_id`, `post_url`, `posted_at`, `milestones_fired`).
- Caption at publish (verified in `post-approved/index.ts`): uses `assignments.caption`; when null it calls `vary-copy`, which rewrites from `briefs.caption ?? briefs.title`.
- Sound: Instagram gets `audio_id` when the track came from the Audio API; TikTok cannot take a sound by API, so the creator adds it by hand after posting (TikTok sound card) and the manager confirms in the Music lane.

### 3.10 Metrics, attribution, payout
- `post_metrics` (append-only snapshots: `views`, `likes`, `comments`, `shares`, `saves`; `completion_rate`, `keyword_comment_count`, `profile_clicks`, `link_clicks` exist but are never filled), polled daily by `poll-metrics`.
- Attribution (built 2026-11-18, memory `noni-sales-attribution.md`, `lib/analytics-api.ts`): each creator has a promo code (`attribution_links` with `creator_id`, unique per company). `sync-conversions` reads the company's connected Stripe and Supabase into `conversion_daily` (`day`, `creator_id`, `new_accounts`, `free_trials`, `sales_count`, `sales_cents`). `creditPosts()` splits a creator's daily credit across their posts by views gained over the prior 7 days. Un-coded sales are deliberately not attributed to posts. Not yet run end to end by a second company.
- Payout: section 1.

---

## 4. Exact data shapes

### 4.1 Brief (live, `lib/brief-library.ts`; stored in `library_briefs`)
```ts
export type BriefKind = 'Guided' | 'Outline';
export type BriefType = 'Talking Head' | 'Long Text' | 'Slideshow' | 'Greenscreen';

export type Brief = {
  id: string; type: BriefType; kind: BriefKind;
  title: string; notes: string; link: string;
  by: string; ts: number;
  audio: BriefAudio | null;
  clips: BriefClip[] | null;
  g: GuidedState | null;
  lt: LongTextState | null;
  from: string | null;          // the guided brief this outline twin was saved with
  caption: string; tags: string[];
  uses?: number;
};
```
```sql
create table public.library_briefs (
  id text primary key, company_id uuid not null,
  kind text check (kind in ('Guided','Outline')),
  type text check (type in ('Talking Head','Long Text','Slideshow','Greenscreen')),
  title text not null, notes text not null default '', link text,
  created_by uuid, from_id text,
  audio jsonb, clips jsonb, g jsonb, lt jsonb,
  caption text, tags text[] not null default '{}',
  created_at timestamptz, updated_at timestamptz);
```
Rules: an Outline is title + notes (+ optional link, music on or off). Saving a Guided brief also saves an Outline twin with id `<id>-o` "so creators who prefer freedom get the same idea"; Long Text has no twin. Validation: Guided needs a title and at least one clip with script text; Long Text needs title and on-screen text; Outline needs a title.

### 4.2 Template (= a Guided brief's form state and clips)
```ts
export type GuidedState = {
  title: string; link: string; linkNotes: string;
  phrase: string;               // search phrase
  notes: string;
  fullGreen: boolean; gs: GsMedia | null;   // "Same for whole video" green screen
  caption: string; tags: string[];
  clips: BriefClip[];
  audio: BriefAudio;
  filled?: boolean;
};
export type BriefClip = {
  id: string;
  text: string;                 // teleprompter: what the creator says
  onScreen: string;
  cta: boolean;                 // exactly one clip may be the CTA
  green: boolean;
  gs: GsMedia | null;
  doc: ClipDoc | null;          // positioned on-screen layout for this clip
};
export type ClipDoc = { texts: StText[]; overlays: StOverlay[] };
export type StText = {
  id: string; text: string;
  x: number; y: number; w: number;   // percent of the 9:16 frame
  size: number;                      // px at a 300 wide frame
  font: number; color: string; align: 'left'|'center'|'right';
  style: 'none'|'outline'|'inv-outline'|'bg'|'inv-bg';
  spans: { start: number; end: number; color?: string; style?: StTextStyle }[];
};
export type StOverlay = { id: string; src: string; label: string; x: number; y: number; w: number };
export type GsMedia = { src: string; label?: string; kind: 'image'|'video'; dur: number };
export type LongTextState = { title: string; onScreen: string; notes: string; doc: ClipDoc | null };
```
Derived rules in code: clip seconds = words / 2.6, minimum 2 (Slideshow 3, Long Text 7); labels "Hook", "Clip 1" …, "Slide n"; default text is TikTok classic (white, black outline, centred, x 46, y 17, w 60, size 26); `shortLabel()` makes an on-screen label from the first clause of the spoken line, at most six words.
`lib/brief-template-doc.ts` maps a template to a `VideoDocument` and back so the manager edits the template in the creator's reel editor.

### 4.3 Script / outline
There is no separate script object in v2. The script is `BriefClip.text` per clip, carried into the editor as `scripts: Record<blockId, string>`. An outline is `Brief.notes` (free text). The AI contract for a guided fill (`lib/brief-ai.ts`):
```ts
type FillClip = { say: string; onScreen: string; cta: boolean };
type FillResponse = { title?; phrase?; clips?: FillClip[]; caption?; tags?: string[]; notes?; titles?: string[]; error? };
export type GuidedPlan = { title: string; phrase: string; clips: BriefClip[]; caption: string; tags: string[] };
```
Request body to `brief-fill`: `{ mode: 'guided' | 'outline' | 'long_text' | 'titles', type, title, link, linkNotes, typed }`.
Client post-processing worth knowing: for Slideshow and Long Text the spoken `say` is discarded (only `onScreen` kept); a Slideshow CTA clip gets a text doc at y 22, size 20; Greenscreen in per-clip mode marks every middle clip `green: true` with `gs: null`.

Older shapes still in the DB and in dead screens, useful as prior art:
- G2 `briefs.talking_points`: `{ id, text, is_product, edited_by_admin, claim_id }`, `hook_options` (8 to 10 scored), one plug sentence inside one point.
- G3 `BriefSlide` (`lib/briefs-api.ts:2314`): `{ role: 'cover'|'point'|'cta', text, shot /* shot direction, or the say line for reels */, inset_feature_id, box?, inset_box?, box_ig?, inset_box_ig?, spans?, tstyle?, extras?, pics?, place?: 'after_hook'|'end'|'any' }`, plus `story { theme, beats[], min, max }` and `open { prompt, must[] }`.
- G1 post object (`files/ugc-bible.md` Part 7): `format_id, claim_id, search_phrase, hook, hook_variants, slot_fills, script, slides, caption, hashtags, pinned_comment, audio_direction, shot_list, image_direction, plug, cta_keyword, target_length_sec, kill_reason`.

### 4.4 Reference post
Three places hold a reference, none of them the same shape:
- On a v2 brief: just `Brief.link` (a URL string) and `GuidedState.linkNotes` ("What changes from the reference").
- `reference_studies` (migration 108): `url`, `library_item_id`, `status pending|done|failed`, `phase`, `platform`, `format`, `caption`, **`transcript` text**, **`slide_texts` jsonb**, **`pattern` jsonb**, `error`, `studied_at`. Unique `(company_id, url)`.
- `PatternCard` (`supabase/functions/_shared/referenceStudy.ts:12`):
```ts
export type PatternCard = {
  topic: string;
  hook_spoken: string | null; hook_on_screen: string | null; hook_type: string;
  structure: string[]; on_screen_text: string[];
  insider_details: string[]; phrases: string[];
  product_mention: string | null; cta: string | null;
  why_it_works: string; quality: number;
};
```
Cards are distilled into `brand_docs` kind `reference_playbook`.
- G1 `trend_items` (`transcript`, `slide_texts`, `hook`, `why_it_works`, `format_id`, `slot_fills`, `remake_mode beat_for_beat|structure_only`, engagement counts) and `source_posts`.
Note what no reference shape holds: **cut timings, per-cut on-screen text with timestamps, or word-level transcript timing**, which is what the v2 script spec asks the generator to rebuild from (section 5.3).

### 4.5 Edit / edit decision
**The edit document** (`lib/edit-document.ts`, mirrored in `supabase/functions/_shared/editDocument.ts`; "change both together"). All times ms; positions and sizes are fractions of the frame.
```ts
export type MediaAsset = { id; kind: 'video'|'image'; localUri: string|null; storagePath: string|null; durationMs: number|null; width; height };
export type Clip = { id; assetId; inMs; outMs; speed: EditSpeed; muted: boolean; crop: EditCrop|null };
export type BlockLayout = 'single' | 'split_v' | 'split_h';
export type Block = { id; layout: BlockLayout; cells: Clip[] };       // duration = shortest cell
export type TextOverlay = OverlayBox & { kind: 'text'; startMs; endMs; enter?: 'pop'|'slide' };
export type ImageOverlay = { kind: 'image'; id; assetId; x; y; width; startMs; endMs; enter?: 'pop'|'slide' };
export type VideoDocument = {
  version: 1; format: 'video'; aspect: '9:16';
  assets: MediaAsset[]; blocks: Block[]; overlays: Overlay[];
  gain: number; subtitles: { enabled: boolean; y: number };
  reelPlan?: Json; autoEdit?: Json; audio?: PostAudio | null;
};
export type Slide = { id; assetId; crop; instagramCrop; boxes: OverlayBox[]; instagramBoxes?; inset?: SlideImage; pics?: SlideImage[] };
export type SlideshowDocument = { version: 1; format: 'slideshow'; aspect: '9:16'|'4:5'|'1:1'; assets; slides: Slide[] };
// lib/overlay-boxes.ts
export type OverlayBox = { id; text; color; bg: boolean; size; x; y; width?; spans?: ColorSpan[] };
// lib/brief-library.ts
export type PostAudio = { track: AudioTrack; start: number; vol: number; voice: number };
```
Limits: `MAX_BLOCKS 60`, `MAX_OVERLAYS 40`, `MAX_SLIDES 20`, `MAX_SLIDE_PICS 6`, `MIN_CLIP_MS 300`, default subtitle y 0.78, default gain 2.

**What the renderer can actually do** (verified from the document types and `docs/EDITOR_BUILD.md` workstream E; behaviour inside ffmpeg not re-verified):
- Cuts: any number of trimmed ranges from any take, in any order; speed per clip; mute per cell; crop.
- Layouts: full frame, top/bottom split, left/right split (two clips at once).
- Text overlays with absolute start and end, position, size, wrap width, colour, two looks only ("classic" white with black outline, or "theme" company-colour pill), per-word colour spans on slides, enter animation `pop` or `slide`.
- Image overlays (screenshots, product media, green-screen picture as an overlay), timed and placed.
- Captions: on or off plus vertical position; generated server-side from the transcript (`submissions.transcript`, `cues`). No per-word caption styling in the document.
- Sound: one track, start offset, track volume, voice volume; loudness normalisation and gain.
- Slideshows: photo, crop per platform (TikTok 9:16, Instagram 4:5), text boxes, one feature inset, up to 6 picture stickers.
- Green screen: `brief_segments.layout = 'green_screen'` with Replicate matting or a Creatomate fallback exists on the G2 segment path (patent disclosure 7.3). In the v2 document path a green-screen **image** becomes a 40% wide image overlay (`recordToDoc`), not a keyed background. I did not verify what the camera composites live for a green-screen **video**.
- Not representable today: transitions, zooms or punch-ins, B-roll as a block from the media library without an asset upload, word-level caption emphasis, multiple audio tracks, sound effects, per-overlay fonts beyond the two looks (StText has 5 fonts and 5 styles in the brief, which collapse when mapped to `OverlayBox`).

**What auto-edit returns** (`lib/auto-edit.ts`, `AutoEditReply`), i.e. the existing edit-decision contract:
```ts
export type AutoEditReply = {
  takes:  { asset_id: string; duration_ms: number; words: { w: string; s: number; e: number }[] }[];
  blocks: { asset_id: string; in_ms: number; out_ms: number }[];                 // kept ranges, in output order
  texts:  { role: 'hook' | 'header'; text: string; start_ms: number; end_ms: number }[];
  media:  { feature_id: string; start_ms: number; end_ms: number }[];            // product feature pop-ups
  cut_ms: number; ai: boolean;
};
```
Request: `{ assignment_id, takes: [{ asset_id, storage_path, duration_ms, words? }], features: [{ id, title, description, kind: 'clip'|'still' }], mode?: 'words' }`, at most 12 features, 90 s client timeout.
`applyAutoEdit()` turns it into single-layout blocks, text overlays at y 0.2, size 0.052, width 0.86, `bg: true`, enter `pop`; feature media as image overlays (clip width 0.42, still 0.62, enter `slide`); captions switched on; the creator's earlier manual text dropped. State kept in `VideoDocument.autoEdit` (`takes`, `words` per take, `ranFor`, `cutMs`, `ai`) so undo returns to the raw takes and adding a take reruns the edit.

### 4.6 Company brain / knowledge
See 3.1 for columns. In prompt terms the G2 spec defines the context object (`instructions-from-claude/noni-final-spec.md`):
```ts
{ ...existing, approved_claims: ProductFeature[] /* approved only */, hashtag_bank: string[],
  voice_exemplars: string[] /* raw creator transcripts */, format_library: FormatSpec[] }
```
Creator-level knowledge exists on `profiles`: `credential_line`, `bio_facts` jsonb, `script_mode` (`beats | full`), six capability booleans (never read or written by live code).

### 4.7 Feedback signals
```ts
export type AiFeedback = {
  companyId: string; kind: 'edit' | 'dismiss' | 'revise' | 'approve';
  surface: 'editor' | 'ideas' | 'library' | 'check';
  format?; postType?; role?; before?; after?; note?; briefId?;
};
```
`lib/ai-edit-signals.ts` decides what counts: an AI line is "edited" only when the words changed (not spacing, case, punctuation or slide number), and each version is logged once. **Only the dead G3 editor and ideas screen call `logAiFeedback`.** The v2 forms log nothing, and `ai_feedback.brief_id` references `briefs`, not `library_briefs`.

---

## 5. Where AI touches the product

### 5.1 Live client calls (verified by grepping every `functions.invoke`)
| Surface | lib function | Edge function | Notes |
|---|---|---|---|
| Manager, Create, Guided form "Fill in with AI" | `planGuided()` `lib/brief-ai.ts` | `brief-fill` mode `guided` | title, phrase, clips (say, onScreen, cta), caption, tags |
| Manager, Outline form "Fill in with AI" | `planOutline()` | `brief-fill` mode `outline` | title + notes from a title or link |
| Manager, Long Text form | `longTextPlan()` | `brief-fill` mode `long_text` | the 7 second on-screen story |
| Manager, title field suggestions | `fetchTitleIdeas()` | `brief-fill` mode `titles` | up to 5 ideas while typing |
| Creator and manager, sound search | `searchAudio()` `lib/audio-api.ts` | `audio-search` | Instagram Audio API; falls back to a local sample library when `IG_GRAPH_ACCESS_TOKEN` is unset (owner TODO) |
| Submit | `startRender()` `lib/submissions.ts` | `render-submission` | transcription for captions happens here |
| Approve (server side) | `post-approved` | `vary-copy` | per-creator caption when `assignments.caption` is null |
| Web only | (noni-web) | `brand-ingest`, `research-company`, `ingest-features` | the Brain page; not callable from the app |

`brief-fill` was deployed on 2026-11-18 as "new, real Claude brief writer" (memory). Before that the v2 forms used canned copy; the comment in `lib/brief-ai.ts` now says "Nothing here is canned copy: when the call fails the caller shows an error and the form stays as typed."

### 5.2 Built, but no live caller
| Capability | Client code | Edge function | Why it is dark |
|---|---|---|---|
| **Auto-edit ("Edit my video")** | `runAutoEdit`, `applyAutoEdit` in `lib/auto-edit.ts` | `auto-edit` | The screens that called it (`app/(creator)/make/raw/[id].tsx`, `components/creator/briefs/raw/useRawProject.ts`, `AutoEditProgress.tsx`, `ReelStartScreen.tsx`) were deleted in commit `67e8ec9` on 2026-11-18. Only `CaptionPreview.tsx` still imports the caption helpers. Shipped Oct 15 as "Story and Freestyle reels record raw and Noni edits them" |
| Editor AI tool ("Cut the dead air") | `onAi` prop on `ReelEditor`, `speechBounds()` in `modules/video-editor` | none (on device) | No caller passes `onAi` |
| Per-clip cue placement | none left | `cue-clip` | No client caller |
| Deck writer, cover ideas, strict review | `lib/deck-ai.ts` (`writeDeck`, `deckIdeas`, `reviewDeck`, `creatorDeck`, `makePost`) | `write-deck` | Only imported by dead G3 screens |
| Idea chat | `lib/idea-chat.ts`, `ideaChat`, `ideaChatTurn`, `makeFromIdea` | `write-deck` | `app/(admin)/ideas/[campaignId].tsx`, unreachable |
| Revise with AI (chat, SSE, undo, locked parts) | `assistRevise`, `assistReviseStream` in `lib/briefs-api.ts`, `lib/revise-chat.ts` | `brief-assist` | Dead G3 editor |
| Draft from URL / query / feature / media | `generatePost` | `ingest-brief` | Dead |
| Per-field regenerate, port video ↔ slideshow, derive segments | `assistRegenerateField`, `portPost`, `assistDeriveSegments` | `brief-assist` | Dead |
| Three-tier AI review of a brief | none in v2 | `brief-review` | Dead |
| Study a reference link | `studyLink` in `lib/library-make.ts` | `study-reference` | `lib/library-make.ts` is imported by nothing |
| Link thumbnail | `enrichReference` | `library-link` | Library tab removed |
| Learning loop | `logAiFeedback` | `learn-from-edits` | Triggered by `publish-campaign` and cron; v2 never publishes a campaign and never logs feedback |
| Trends | `startTrendScrape`, `generateTaskDraft` in `lib/admin-api.ts` | `scrape-trends`, `generate-script`, `auto-fill` | Trends tab removed |

### 5.3 Promised in the v2 specs, missing or thinner in the build
Source for the promises: `/Users/elanromo/Noni Design System/design_handoff_v2_review/SCRIPTS.md`, `AUDIO.md`, `design_handoff_v3_briefs/BRIEFS.md`.
1. **Reference link is not read.** Spec: "Fetch the post: transcript (audio to text), on-screen text per cut, cut timings, caption, hashtags, view and like counts" and "Rebuild the reference beat for beat: same number of cuts, same hook type, same pacing, same CTA placement." Build: `brief-fill/index.ts` lines 66 to 76 and 124 put the bare URL string and the manager's note into the prompt. The scrape and transcribe machinery exists (`study-reference`, `ingest-brief`) and is not connected. (The edge-function audit should confirm; I only grepped.)
2. **"Randomize every use" is mostly absent.** Spec: author text with `{a|b|c}` spins, resolve again when the manager fills, when each creator opens the clip and on every retake; synonym pass at 45%; vary paragraph count; before publish compare against every string already posted in the campaign and regenerate above 0.85 trigram Jaccard. Build: `varyLongText()` resolves spins only if the stored text contains `{`; nothing asks the model to write spins; only Long Text is varied; captions are varied by `vary-copy` at publish; on-screen labels for Talking Head are not varied.
3. **Quality bar is not enforced in the client** ("reject and regenerate if any fail": hook under 15 words, each clip under 8 seconds aloud, product named once in the close and never in the hook, no two clips start with the same word, every word of the screen text appears in the say line, every claim checks against the product sheet). Whether `brief-fill` enforces any of it server-side is for the other audit; the client accepts whatever comes back.
4. **Greenscreen frame suggestions.** Spec: "Greenscreen: each clip also gets a reference frame suggestion (screenshot, stat, map) in the overlay slot" and "Slideshows get ... a CTA slide with a product overlay." Build: `greenify()` sets `gs: null`; the Slideshow CTA gets text only.
5. **Auto-edit has no v2 design at all.** The v2 creator flow is record → manual timeline editor. Captions default off in `recordToDoc`. The editor's caption bar says "auto from your audio" but nothing cuts, writes headers or places product media.
6. **Sound.** "For this post (tag match on the campaign)" suggestions and trend data depend on the Instagram token; without it the sheet shows a local sample library.
7. **Review.** v2 Review screens from part 1 "were never built; the real Review tab is still v1 inside the v2 shell" as of Oct 29 (memory `v2-admin-redesign-handoff.md`); the Nov 18 commit touched v2 review, so partially superseded. No AI assists review in any generation: no pre-check of a submission against its brief, no drafted notes.
8. **Ops Brain "AI clean up"** for brand docs is specified for the web console; the old `cleanupBrandDoc` in `lib/admin-api.ts` has no app caller.
9. **Creator-facing AI.** The G3 creator flow had "Ask AI" for Freestyle hooks and lines (`creatorDeck`). v2 creators get no AI help: free recording has no script help, outlines are static notes.
10. Stage E note in memory: "the CTA flag is only set by Fill in with AI (as in the prototype, confirmed by the user)", so a manager cannot mark a CTA clip by hand.

---

## 6. Product principles, voice and hard rules

### Owner decisions and rejections (from memory files and specs)
- **Builds only on explicit request** (commit "Rule: builds only on explicit request"). Edge function deploys need explicit approval.
- **Never rename the Inkbound company.** Clearing content was wanted, renaming was not.
- **Setup for customers must be click-to-authorize.** The owner rejected a paste-SQL setup outright: "it should literally be like an OAuth thing."
- **Plain Expo Go, not dev builds.** (This constrains anything needing new native modules; `modules/video-editor` is a custom native module, so check what Expo Go can load before designing on-device AI.)
- **Money in the admin app**: first "no money anywhere in the app", then on Nov 18 reversed for sales and sign-ups only ("the goal is for company and campaign managers to know which sales and sign-ups came from which posts"). Creator payouts and earned amounts still do not show in admin analytics.
- **Do not overclaim attribution**: un-coded Stripe sales are not attributed to posts.
- **No week planner in v2**: no day slots, "Day 3" counters, "3 of 6 posted" progress, "Live / Recording" labels, or "Online now" presence.
- Owner was upset at being billed by Supabase with no users: cost sensitivity is real.
- Goal stated Nov 18: "Noni usable by another company today, 10/10 UX."

### UI copy rules (`Noni Design System/CLAUDE.md`, `claude_code_handoff/CLAUDE.md`, readme)
- Never use em or en dashes in user-facing copy. Use a period, comma, colon or "to".
- No helper sentences, footnotes or hints. Labels, counts and one-line states only. "If a screen needs explaining, fix the screen."
- Sentence case. No emoji, ever. No exclamation marks, no hype ("seamlessly / effortlessly / unlock").
- Buttons say what happens ("Send for review", "Approve", "Request changes"); never "Submit", "OK", "Continue" when a specific verb exists.
- Say "to make", never "to shoot".
- Empty states name the next action. Progress states are conversational ("Writing the brief…").
- Real media everywhere; both formats (Reel and Slideshow) on every media surface.

### Content doctrine for generated scripts (consistent across `SCRIPTS.md`, `noni-final-spec.md`, `voice-doc-v1.md`, `ugc-bible.md`)
- "The script is the feature. A guided post is only as good as the words the creator reads."
- **Single speaker, first person. Never dialogue, never a second voice, never "Wait what?".**
- Spoken, not written: "Write like the creator talks to a teammate." "Read it aloud; if it sounds like a caption, rewrite it." No sentence that could appear on a landing page.
- **Exemplars over tone descriptions**: "Descriptions of tone do not produce speech that sounds real. Exemplars do." Voice exemplars come only from people who will actually perform; format donors never go in the voice doc ("Mixing them contaminates the voice with someone else's cadence").
- **Product by mechanism, not benefit** ("It wrote the emails and sent them and followed up", not "streamlines your outreach"). **Never invent features, prices or numbers**; every product claim must trace to an approved claim. "Nothing generated on camera without a human approving it."
- Value before pitch; the viewer gets something usable without the product.
- Banned: "Let's dive in", "game changer", "unlock", "elevate", "here's the thing", "at the end of the day", "seamless", "powerful", "revolutionary", three-item parallel lists inside a sentence, balanced symmetrical clauses, hedges (really, truly, actually, honestly, simply, just, very), colons in hooks, manufactured antagonists, conspiracy framing, stacked adjectives, emoji, hashtags inside spoken text, "Hey guys" or "In this video" openers.
- Numbers and concrete nouns over adjectives ("behind the goal, 88th minute, bottom third of the frame").
- On-screen text must be the spoken line compressed, never a different idea: generate say first, derive screen, check every screen word appears in say.
- Search layer: each post targets a phrase a real person types; say it in the first three seconds, show it on screen, put it in the first sentence of the caption. 3 to 5 hashtags.
- **Kill rather than pad**: if a required part cannot be filled with something concrete, return a reason instead of content.
- AI review **never blocks and never silently edits**; suggestions are offered. Overrides are logged because "a check overridden twenty times is a wrong check."
- **No two accounts may post the same string** (bot-network risk on TikTok).
- Measure by sign-ups per post, not views: "Views will mislead you."
- Do not build rules around filler-word rate, named-entity density or sentence length; those were measured and are not signals.

### Rules that contradict each other across generations (must be decided, not assumed)
| Topic | G1 bible | G2 final spec | v2 SCRIPTS.md |
|---|---|---|---|
| Plug frequency | one in four or five posts | every post plugs | product in the close of every guided post |
| Plug placement | inside a body item, never its own beat | inside one talking point, position 3, never first or last | "Product named once in the close", last clip carries the CTA |
| Hook length | 9 words or fewer | 9 (was 12) | under 15 words |
| Length | 9 to 15 s primary cut | 300 to 450 words, about two minutes | 12 to 40 words per clip, each under 8 s |
| Script form | slot fills | beats, not lines ("a creator reads a point and starts talking; they do not recite it"), `script_mode beats|full` per creator | full word-for-word script per clip on a teleprompter |
| CTA | comment a keyword, follow | "comment a single word, creator sends a free trial. Not click the link" | "link in bio, save this, try it this week, comment a word" |
| Credential | format gate | rendered at teleprompter time from `profiles.credential_line`, never in the brief | not mentioned |
| Sound | mandatory on every post | n/a | manager chooses none / pick / creator picks; talking head default 25% |

---

## 7. Open problems and pain points for AI quality

Documented by the team:
1. **"Generated briefs read as ad copy instead of speech."** The root diagnosis in `noni-build-final.md` and `noni-final-spec.md`, measured against 11 real transcripts: too short (166 vs 340 words average), product at 82%, no credential, "you" at 3.0 per 100 words vs 5.2 to 6.2, two speakers. A later pass overshot to about 10 "you" per 100 words ("a listicle lecturing the viewer").
2. **Voice exemplars are thin**: "Three exemplars per creator is thin. Target 15 to 20 each ... Once the voice samples table exists, retrieve by creator and matching format." No voice samples table exists. After the Nov 17 reset Inkbound has no brand docs at all.
3. **Mined knowledge never reaches generation** (patent disclosure section 12): `claims` and `vocabulary` are write-only; the twelve-format library "classifies the corpus but does not steer generation"; `hook_bank`, `content_templates`, `format_stats` are unused; the learning loop on performance (winner detection, format weights) "is not implemented".
4. **The signals the doctrine ranks on are not collected**: `completion_rate`, `keyword_comment_count`, `profile_clicks`, `link_clicks` are never populated. Only views, likes, comments, shares, saves exist. Attribution by promo code is one day old and untested with a second company.
5. **Silent degradation on references**: Apify sometimes returns no media, the transcript is null, and prompts "silently fall back to the caption", so a video gets classified from a one-line caption (`docs/HANDOFF.md` failure mode 1).
6. **No prompt tests or evals**: "There are no tests for `validateBrief`, the timeline builder, the credit math, or any prompt." The trend golden set had 0 of 60 to 80 labels. No measured quality numbers anywhere in the repo.
7. **Model unknown**: default `ANTHROPIC_MODEL` was `claude-sonnet-4-5` at the time of the disclosure; production value not recorded in the repo.
8. `brief_segments.overlay_style` (per-segment colour) does not reach the burned-in output (disclosure section 12 item 10).
9. G3 gaps recorded in `claude_code_handoff/DONE.md`: no CTA generation endpoint (the feature's claim was used verbatim), no free "Ask AI" endpoint, CTA feature screenshot not baked into the posted slide, manager Story beats not editable.
10. Auto-edit known limits (`docs/EDITOR_BUILD.md`): imported videos without an audio track fail the server stitch; Android has capture and plain preview only; no transitions or music at that point.

Found in this pass (verified in code unless marked):
11. **v2 drops the brief's caption, hashtags and search phrase on the way to publish.** `start_creator_post` creates the `briefs` stub with title and format only; no edge function reads `library_brief_id` (grep over `supabase/functions` returns nothing); the creator Send sheet has no caption field (grep for `caption` in `SendSheet.tsx`, `EditorScreen.tsx`, `CreatorSlides.tsx` returns nothing). At approve, `post-approved` asks `vary-copy`, whose source is `brief.caption ?? brief.title`. So the posted caption is a rewrite of the post title, with no search phrase and no hashtag bank from the brief. The AI-written `library_briefs.caption` and `tags` are shown to the manager and then go nowhere. (Inferred end result; each step verified separately, not run end to end.)
12. **v2 has no feedback capture.** No `logAiFeedback` call in any v2 form; `learn-from-edits` is triggered by a publish step v2 does not have. Manager edits to AI fills and manager review notes on submissions are the two richest quality signals and neither is recorded for learning.
13. **Posts are matched to library briefs by title** "until the creator flows write `briefId`" (`lib/brief-library.ts`, `lib/analytics-api.ts`). `assignments.library_brief_id` is now written by `start_creator_post`, but analytics still documents title matching. Any per-brief performance learning needs this join to be solid.
14. **Two text models.** Briefs use `StText` (5 styles, 5 fonts, spans, percent coordinates, size in px at 300 wide); the editor and renderer use `OverlayBox` (two looks, fractions). `toTextOverlay` converts. An AI that writes on-screen text must target what survives the conversion.
15. **The edit-decision vocabulary is narrow** (4.5): cuts, hook and header text, feature pop-ups, captions on or off. No zoom, B-roll block, transition, caption style or sound choice in the auto-edit contract, although the document can already hold splits, image overlays and a sound.
16. **Company knowledge can only be edited on the web**, and Inkbound's is empty today. Any AI rebuild will be tested against an empty brain unless it is reseeded (website `https://inkbound.ai`, 11 media-library items remain).
17. Brief library is local-first with an offline queue; a brief may exist only on the manager's phone. `startCreatorPost` already retries without the library id for that case, which silently breaks the brief → post link.

---

## 8. File index

Product and doctrine
- `/Users/elanromo/Noni Design System/readme.md`, `CLAUDE.md`, `HANDOFF.md`
- `/Users/elanromo/Noni Design System/design_handoff_v3_briefs/README.md`, `BRIEFS.md`, `ANALYTICS.md`, `CLAUDE_CODE_PROMPT.md`
- `/Users/elanromo/Noni Design System/design_handoff_v2_review/README.md`, `SCRIPTS.md`, `AUDIO.md` (copy of README at `/Users/elanromo/noni/design_handoff_v2_review/README.md`)
- `/Users/elanromo/Noni Design System/design_handoff_pricing_plans/README.md`, `design_handoff_ops_console/README.md`, `design_handoff_landing_page/README.md`, `design_handoff_multi_campaign/00_START_HERE.md`
- `/Users/elanromo/noni/instructions-from-claude/noni-final-spec.md`, `/Users/elanromo/noni/instructions-from-claude/voice-doc-v1.md`
- `/Users/elanromo/noni/files/ugc-bible.md`, `/Users/elanromo/noni/noni-build-final.md`, `/Users/elanromo/noni/PATENT_DISCLOSURE.md` (sections 3, 5, 6, 12)
- `/Users/elanromo/noni/docs/EDITOR_BUILD.md`, `/Users/elanromo/noni/docs/HANDOFF.md`, `/Users/elanromo/noni/docs/QA-CREATOR-FLOW.md`, `/Users/elanromo/noni/docs/STRIPE_PREPAID_SETUP.md`, `/Users/elanromo/noni/NOTES.md`
- `/Users/elanromo/noni/claude_code_handoff/03_BRIEFS_SLIDESHOW_REEL.md`, `DONE.md`, `PROGRESS.md`
- Memory: `/Users/elanromo/.claude/projects/-Users-elanromo-noni/memory/*.md`

Live code
- Briefs and AI fill: `/Users/elanromo/noni/lib/brief-library.ts`, `lib/brief-library-api.ts`, `lib/brief-ai.ts`, `lib/brief-template-doc.ts`, `components/admin/v2/newbrief/*`
- Creator flow: `/Users/elanromo/noni/app/(creator)/create.tsx`, `capture.tsx`, `edit/[id].tsx`, `slides/[id].tsx`, `components/creator/v2/record/*`, `components/creator/briefs/reel/ReelEditor.tsx`, `lib/creator-posts-api.ts`
- Edit document and submit: `/Users/elanromo/noni/lib/edit-document.ts`, `lib/overlay-boxes.ts`, `lib/studio-store.ts`, `lib/submissions.ts`, `modules/video-editor/index.ts`
- Auto-edit (dark): `/Users/elanromo/noni/lib/auto-edit.ts`, `supabase/functions/auto-edit/index.ts`, `supabase/functions/_shared/autoEdit.ts`
- Sound: `/Users/elanromo/noni/lib/audio-api.ts`, `components/admin/v2/audio/*`
- Review, analytics: `/Users/elanromo/noni/lib/admin-review-api.ts`, `lib/review-events.ts`, `lib/analytics-api.ts`
- Feedback: `/Users/elanromo/noni/lib/ai-feedback.ts`, `lib/ai-edit-signals.ts`
- Schema: `/Users/elanromo/noni/lib/types.ts`; migrations `108` (research, reference studies), `116` (creator projects), `117` (brief slides, kinds), `120` (ai feedback), `121` (library briefs), `123` (start_creator_post), `124` (submission audio), `129` (brief published), `131` to `133` (codes, sign-ups, Supabase connect) under `/Users/elanromo/noni/supabase/migrations/`

Dead but instructive
- `/Users/elanromo/noni/lib/deck-ai.ts`, `lib/idea-chat.ts`, `lib/revise-chat.ts`, `lib/library-make.ts`, `lib/post-fill.ts`, the AI section of `lib/briefs-api.ts` (lines 247 to 780), `components/admin/briefs/**`, `app/(admin)/brief/*`, `app/(admin)/ideas/*`, `app/(admin)/post/[id].tsx`
