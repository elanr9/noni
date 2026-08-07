# CREATOR_HANDOFF — creator journey rebuild

Five agents run in parallel in the SAME working tree. Each agent owns the
files listed in its section and MUST NOT edit files owned by another agent.
Shared contracts are listed below; follow them exactly so the pieces meet.
Append a short "done" section under your heading before reporting done.
Run `npx tsc --noEmit` before reporting done (expect only errors in files you
do not own; never fix those).

## Operational notes (from HANDOFF.md, still true)

- The Supabase MCP server points at a DIFFERENT project. Never use it.
- Migrations: already applied by the coordinator. Do NOT create or apply
  migrations. The new schema is live and `lib/types.ts` is regenerated.
- Deploy edge functions only if your section says so.

## New schema (applied, live)

- `profiles.birthday date`, `profiles.phone text`,
  `profiles.onboarding_answers jsonb not null default '{}'`
  (keys: `ugc_experience`, `hardest_part`, `hours_per_week`, `heard_from`,
  `warmup_tutorial_seen`, plus anything else your section needs).
- Trigger `on_auth_user_created` on `auth.users`: brand-new signups get a
  `profiles` row automatically (role `creator`, oldest company, onboarded
  false). Existing users unaffected.
- `public.recording_drafts`: `id, company_id, assignment_id (unique, fk
  assignments, cascade), creator_id, segments jsonb default '[]',
  updated_at`. RLS: creator full access to own rows, admins read.
  `segments` = array of `{slot_index: number, kind: 'hook'|'point'|'outro'|'slide',
  storage_path: string, duration_ms: number}`.

## Cross-agent contracts

1. **Route: static-post upload** — `/(creator)/upload/[id]` where id =
   assignment id. Agent C builds the screen; Agent D links to it from
   assignment detail for `photo_carousel` briefs. Nobody else links to it.
2. **Setup gate** — Agent B adds a redirect in `app/(creator)/_layout.tsx`:
   if creator setup is incomplete, all creator routes redirect to
   `/(creator)/setup`. Agent B owns that file. Other agents assume the gate
   exists and never check setup state themselves.
3. **Onboarding → setup handoff** — Agent A finishes onboarding by setting
   `profiles.onboarded = true` (existing `completeOnboarding`) and routing to
   `/(creator)/(tabs)`; the Agent B gate takes over from there. Agent A does
   not build any setup UI.
4. **Design language** — match the existing creator app: `theme/tokens.ts`,
   `components/ui/*` (Button, Icon, PressableScale, Segmented, Skeleton,
   EmptyState, TabBar), `components/creator/*`. Cal-AI onboarding style is
   defined in Agent A's section only.
5. **Status transitions** — only through `lib/tasks.ts` /
   `lib/tasks-api.ts` transition functions. Never raw status updates.
6. **TypeScript strict, no `any`.** Reuse existing libs
   (`lib/creator-accounts-api.ts`, `lib/submissions.ts`, `lib/wallet-api.ts`,
   `lib/admin-api.ts` social connect helpers) before writing new ones.

---

## Agent A — Cal-AI onboarding (pre-auth)

Owns: `app/(onboarding)/**`, `app/(auth)/**`, `app/index.tsx`,
`lib/onboarding.ts`, `lib/auth-session.ts`, `lib/profile.ts`,
`components/OnboardingUI.tsx`.

Goal: new-download flow in the Cal AI style. One question per screen, thin
progress bar at top with back arrow, bold left-aligned question, optional
grey subtext, pill Continue button (black when enabled, grey disabled),
selected options solid black with white text. White background. Use
`theme/tokens.ts` type scale but the visual language for THESE screens is the
grayscale Cal AI look.

Steps (in order):
0. Welcome hero: Noni wordmark, "Get paid to post. We handle everything
   else." Get Started + "Already have an account? Sign in".
1. First name (text field).
2. "When were you born?" (native date wheel; collect only, no age gate).
3. Phone number (text field, US formatting).
4. "What do you know about UGC?" (options: Never heard of it / I've seen it
   around / I've made some content / I do UGC already).
5. "What's been hardest about making money online?" (options: Getting views /
   Knowing what to post / Staying consistent / Getting paid at all).
6. "How many hours a week will you put into Noni?" (options: ~2 / ~5 / ~10 /
   15+).
7. Earnings estimate payoff screen: map hours to monthly estimate — 2h →
   $1,000, 5h → $1,500, 10h → $2,200, 15+ → $3,000. Copy like "Creators
   posting {hours} hours a week average ${X}/month." Get them excited; a big
   animated-feel number is good.
8. "Save your progress" — Sign in with Apple (black), Sign in with Google
   (white bordered), Continue with email (white bordered). Reuse
   `signInWithApple` / `signInWithGoogle` from `lib/auth-session.ts`. Email =
   simple email+password sign-up via `supabase.auth.signUp` (add helper).
   The DB trigger creates the profile row automatically; after auth, write
   the locally-held answers to the profile (`birthday`, `phone`,
   `onboarding_answers`, `full_name` from step 1).
9. "How did you hear about Noni?" (TikTok / Instagram / Friend / Other).
10. Notifications permission: explain why ("We ping you when a post is ready
    to record and when you get paid"), then `expo-notifications`
    `requestPermissionsAsync`. Store the Expo push token on the profile if
    granted (see `expo_push_token` column; look at how the app registers
    tokens today, if it doesn't, `getExpoPushTokenAsync` with the projectId
    from `Constants`).
11. Camera + mic permissions (reuse the pattern in the old
    `app/(onboarding)/creator.tsx`).
12. Done screen: "You're in. Next: set up your accounts." → call
    `completeOnboarding`, route to `/(creator)/(tabs)`.

Key routing change: onboarding must work WITHOUT a session. Today
`app/(onboarding)/_layout.tsx` redirects to login when there is no session
and `app/index.tsx` routes through `destinationForProfile`. Rework:
- No session + never onboarded locally → onboarding welcome (step 0).
- Steps 0–7 store answers in local state (a single context or a module-level
  store is fine; AsyncStorage persistence optional).
- Step 8 creates the session mid-flow, then continues to step 9 (do NOT
  bounce through routeAfterSignIn mid-onboarding).
- Existing users with `onboarded = true` keep working exactly as today
  (login → their app). Admin flow (`company.tsx`) untouched.
- Keep `app/(onboarding)/company.tsx` (admin onboarding) working. The old
  `creator.tsx` / `practice.tsx` flow is replaced; delete what you replace.

## Agent B — Setup gate + to-do list + warm-up

Owns: `app/(creator)/_layout.tsx`, `app/(creator)/setup/**` (new),
`app/(creator)/account-setup.tsx`, `app/(creator)/(tabs)/profile.tsx`,
`lib/creator-accounts-api.ts`, `lib/setup.ts` (new).

Goal: after onboarding, a creator sees ONLY a setup to-do list until setup is
done. Build `app/(creator)/setup/index.tsx`: a clean checklist screen
(match the creator app design language, tokens + ui components) with four
steps, each a card with a status (todo / in review / done):

1. **Create your accounts** → reuses the existing account-template flow
   (`app/(creator)/account-setup.tsx` + `lib/account-template.ts` +
   `lib/creator-accounts-api.ts`): show suggested name, username, bio with
   copy buttons.
2. **Connect your accounts** → existing social connect
   (`getSocialConnectUrl` / `getSocialConnectStatus` in `lib/admin-api.ts`,
   opened via `expo-web-browser`, same as profile.tsx does today).
3. **Warm them up** → a 4–5 screen swipeable tutorial
   (`app/(creator)/setup/warmup.tsx`): what warming up is (15–20 min of
   scrolling/searching/liking college-recruiting + college-soccer content on
   both apps), why it matters (the For You page decides who sees their
   posts), what to do, then proof: upload a 15s screen recording of the For
   You page for TikTok AND Instagram (reuse the verification upload helpers
   in `lib/creator-accounts-api.ts` — `uploadVerificationAsset`,
   `submitCreatorAccount`). Submitting moves the creator_accounts row to the
   existing admin review flow. Store `warmup_tutorial_seen: true` in
   `profiles.onboarding_answers`.
4. **Connect your bank** → existing Stripe Connect
   (`supabase/functions/stripe-connect`, see how `balance.tsx` /
   `lib/wallet-api.ts` use it). Also keep a "Payouts" row in profile.tsx
   settings that opens the same connect flow.

Derive setup state in `lib/setup.ts` from live data (no new tables):
- accounts created/submitted → `creator_accounts` row exists,
- connected → social connect status,
- warm-up → creator_accounts status (`submitted` = in review, `approved` =
  done; the admin approval screen already exists),
- bank → stripe connect status.
Setup is COMPLETE when the account is approved AND socials connected AND
bank connected. Gate in `app/(creator)/_layout.tsx`: incomplete → redirect
everything (except the setup routes, chat, and profile) to
`/(creator)/setup`.

## Agent C — Clip-by-clip recording + static upload

Owns: `app/(creator)/record/[id].tsx`, `components/Teleprompter.tsx`,
`lib/submissions.ts`, `lib/recording-drafts.ts` (new),
`app/(creator)/upload/[id].tsx` (new).

Goal A — rework recording into per-clip capture:
- A brief's clips come from `brief_segments` (see `lib/briefs-api.ts` and
  HANDOFF.md Agent 1 section: kinds `hook | point | outro | slide`; fall
  back to hook/talking_points/outro derivation when a brief has no segments).
- Hook and outro/CTA are SCRIPTED: show full script text (teleprompter).
  Points show the talking point as large on-screen beats, not a script.
- Record one clip at a time: clip list/stepper UI, record → review → retake
  or keep → next clip. Progress saves between clips via `recording_drafts`
  (new `lib/recording-drafts.ts`: load draft, upsert segment after each kept
  clip, clear on submit). Uploading each kept clip immediately to the
  existing submissions storage bucket (see `lib/submissions.ts` for bucket +
  path conventions) so a killed app loses nothing.
- Creator can leave and come back: reopening the record screen for an
  assignment with a draft resumes at the first missing clip.
- Submit when all clips are kept: reuse `submitAssignmentRecording` shape —
  extend `lib/submissions.ts` as needed to accept ordered segment paths
  (`segment_paths` column already exists on submissions).

Goal B — static posts (`photo_carousel`): build
`app/(creator)/upload/[id].tsx`: shows the brief's slides (talking points /
segments), creator picks one photo per slide from their library
(`expo-image-picker`), can swap any before submitting. Submit creates a
submission with the image paths in `segment_paths` and transitions the
assignment the same way video submit does. This replaces the "coming soon"
alert (Agent D wires the entry point).

## Agent D — Revisions + per-post messaging

Owns: `app/(creator)/assignment/[id].tsx`, `app/(creator)/chat.tsx`,
`components/ReviewThread.tsx` (keep the admin-side API compatible — admin
review screens import it).

Goal: when an admin requests changes, the creator can see exactly what to
fix, per post, and go back and forth easily.
- Assignment detail: a prominent "Changes requested" card when status is
  `changes_requested` — the admin's structured note (`latestChangesNote` in
  `lib/review-events.ts`) + full thread below (already partially built;
  polish it into the primary surface: revision note first, then thread, then
  re-record CTA that routes to `/(creator)/record/[id]?assignment=1` for
  video or `/(creator)/upload/[id]` for `photo_carousel` — replace the
  "coming soon" alert branch).
- Home-level visibility: the DM thread (`app/(creator)/chat.tsx` +
  `components/ChatThread.tsx`) already supports per-post references; make
  sure revision events also land there or link back (check
  `lib/messages-api.ts` notify routing) so a creator never misses a
  revision.

## Agent E — Analytics tab + posts profile

Owns: `app/(creator)/(tabs)/_layout.tsx`, `components/ui/TabBar.tsx`,
`app/(creator)/(tabs)/analytics.tsx` (new), `components/creator/AreaChart.tsx`,
`components/creator/MiniStat.tsx`, `components/creator/SplitBar.tsx`,
`components/creator/PostRow.tsx`.

Goal: one screen where a creator sees how they're doing and everything
they've posted, switchable between TikTok and Instagram.
- Add an Analytics tab (icon `chart-column`) between Calendar and Profile.
- Design reference: `design_handoff_creator_app/README.md` §Analytics
  (AreaChart, MiniStat row, SplitBar) and §Posts list (PostRow with views,
  likes, earnings progress). Components already exist unwired in
  `components/creator/` — wire them.
- Data: `listMyAssignments` + `parseAssignmentMetrics` (`lib/tasks-api.ts`),
  wallet ledger via `lib/wallet-api.ts` for earnings. Platform switch:
  a Segmented control TikTok | Instagram filtering the posts list and stats
  (metrics json may carry per-platform numbers — check
  `parseAssignmentMetrics` and `poll-metrics`; if per-platform split is not
  available, split views TikTok/Instagram by the SplitBar convention and
  show combined numbers with the switch filtering the post list only —
  do not invent data).
- Sections: header "Analytics", MiniStat row (Views, Likes, Earned),
  AreaChart of views over the last 30 days, SplitBar (where it came from),
  posts list (PostRow, newest first) → tapping opens assignment detail.
- Loading skeletons + empty state ("Your numbers show up after your first
  post goes live.").

---

<!-- Agents append their done sections below. -->

---

# ROUND 2 — polish and parity

Round 1 (Agents A–E above) is merged and type-clean. Three more agents run
in parallel in the same tree with strict file ownership. Round 1 sections
above describe what already exists; read the done sections before coding.
Auth note: email/password and phone auth were removed after round 1; the app
is Apple + Google OAuth only.

## Agent F — Home experience

Owns: `app/(creator)/(tabs)/index.tsx`, `components/creator/PostCard.tsx`,
`components/creator/SwapSheet.tsx`, `app/(creator)/assignment/[id].tsx`.

The product intent: the creator opens the app and sees THE next post as a
big hero card (thumbnail, title, format pill). Tapping it opens assignment
detail where they read a short description of the post, can watch the
example, and hit one obvious Record/Create button.

1. Home: keep the hero PostCard queue, streak, swap. REMOVE the account
   status banner block (`accountStatus` state and the banner render) — the
   setup gate in `app/(creator)/_layout.tsx` now guarantees nobody reaches
   Home before approval, so it is dead code.
2. Bell: it is currently a dead icon with a hardcoded dot. Make it open
   `/(creator)/chat` and show the dot only when there is something worth
   seeing (unread admin messages or any assignment in `changes_requested`;
   `lib/messages-api.ts` and the pinned-revisions pattern in chat.tsx show
   how to derive both cheaply).
3. Assignment detail: "Watch the example" currently opens the URL with
   `Linking.openURL` (kicks the user out of the app). Open it in the in-app
   browser (`expo-web-browser` `openBrowserAsync`) like other screens do.
   Make sure the description/hook section reads clean above the fold, with
   the sticky Record/Create CTA (Agent D's revision card behavior must stay
   exactly as is).
4. Home photo_carousel branch: `recordAssignment` routes photo posts to
   assignment detail. Keep that (detail is where they read the brief first),
   just verify the detail CTA for new-world carousels goes to
   `/(creator)/upload/[id]` (Agent D wired this; do not break it).

## Agent G — Posts tab

Owns: `app/(creator)/(tabs)/calendar.tsx` (rename file to `posts.tsx`),
`app/(creator)/(tabs)/_layout.tsx`, `components/ui/TabBar.tsx`,
`components/creator/MonthGrid.tsx`, `components/creator/WeekStrip.tsx`.
May make ADDITIVE-ONLY changes to `components/creator/PostRow.tsx` (the
analytics tab renders it; do not change existing props or visuals there).

Rebuild the Calendar tab as the Posts tab per
`design_handoff_creator_app/README.md` (§Posts sections: PostsScreen,
MonthGrid, PostRow):
1. Rename route `calendar` → `posts`, tab label "Posts", icon `layout-list`
   (update the TabBar creator items map and the tabs layout; Analytics
   stays between Posts and Profile).
2. Two views via Segmented: **calendar** (default; month grid with dots +
   selected-day list, keep the existing week strip if it fits the design)
   and **list** (every assignment newest first as PostRow rows: thumb,
   title, status chip, views/likes, earnings row with progress toward the
   next bounty).
3. Keep all existing behavior: tap → assignment detail, Record/Create
   branching, pull-to-refresh, skeletons, empty states.
4. Data is the same `listMyAssignments` + `parseAssignmentMetrics` +
   bounty fields already used by the current calendar screen.

## Agent H — journey audit + legacy cleanup

Owns: `app/(creator)/task/[id].tsx` (delete if truly unreachable),
`components/TaskCard.tsx` and any other orphaned creator component you
verify has zero imports, `docs/QA-CREATOR-FLOW.md` (new).

1. Walk the ENTIRE creator journey in code, in order: fresh install →
   onboarding screens (welcome → save → done) → setup gate → setup steps →
   home → assignment detail → record (video, per-clip, resume) →
   upload (photo) → submit → changes_requested → resubmit → approved →
   posted → analytics → balance/cash out → chat. For each hop verify the
   routes exist, params match, status transitions go through lib/tasks-api,
   and company_id scoping holds.
2. Fix ONLY within your owned files; for problems in files owned by Agents
   F/G this round (listed above) or any seam you cannot safely fix, write
   them up instead.
3. Delete `app/(creator)/task/[id].tsx` if nothing routes to it (verify:
   no router.push/Href references anywhere), and remove its Stack.Screen
   entry ONLY if `app/(creator)/_layout.tsx` is untouched by that removal
   risk — the layout is owned by nobody this round, so a one-line removal
   of the dead screen entry is allowed as an exception.
4. Produce `docs/QA-CREATOR-FLOW.md`: a device-test checklist covering the
   full journey, every decision point (video vs photo, swap, revision,
   send-back), and the known rough edges from round 1 done sections
   (combined-platform analytics, drafts as needs_changes, OAuth-only auth).


## Agent C — done

Done, by file:

- `lib/recording-drafts.ts` (new): `loadDraftSegments`, `saveDraftSegment`
  (replaces by slot_index so a retake overwrites in place), `clearDraft`.
  All queries scoped by company_id. `DraftSegment` matches the handoff jsonb
  shape exactly.
- `app/(creator)/record/[id].tsx`: per-clip capture. The clip plan comes from
  `brief_segments` (kinds hook | point | outro; slides excluded), falls back
  to hook / talking points / cta derivation, then to script parts for legacy
  script briefs and content_tasks. Hook and outro are scripted (teleprompter,
  script = hook line / `briefs.cta`); points render one large beat per clip
  (new `BeatPrompter`). Flow per clip: record, review the take, retake or
  keep. Keeping a clip on an assignment probes its real duration, uploads it
  immediately to the videos bucket (`draftClipPath`:
  `<company>/<assignment>/draft-<slot>-<ts>.mp4`), and upserts
  `recording_drafts`, so a killed app loses nothing. Reopening resumes at the
  first missing clip (all kept resumes on the submit summary). A chip stepper
  jumps to any clip to re-record it. Submit appears when every clip is kept.
  Capture pinning (avc1, 1080p, 8 Mbps) preserved from Agent 8.
- `components/Teleprompter.tsx`: `Teleprompter` unchanged; `BeatsPrompter`
  (all beats at once) replaced by per-clip `BeatPrompter` (label, one big
  beat, credential line). Only the record screen consumed it.
- `lib/submissions.ts`: added `submitAssignmentClips` (submission from the
  already-uploaded draft paths: segment_paths, submission_segments with real
  duration_ms, assignment link, transitions — nothing re-uploads) and
  `submitAssignmentPhotos` (static posts). `submitAssignmentRecording`
  (local-uri assignment submit) removed; the per-clip flow replaced its only
  caller. `submitRecording` (legacy tasks) untouched. Exported `uploadClip`,
  `probeDurationMs`, `draftClipPath`.
- `app/(creator)/upload/[id].tsx` (new, route `/(creator)/upload/[id]`, id =
  assignment id): slides from `brief_segments` kind slide (overlay_text,
  talking point fallback), one photo per slide via expo-image-picker, swap
  any before submit, submit disabled until all picked. Submit uploads the
  images, creates the submission with image paths in segment_paths
  (duration_ms null on the segment rows), and transitions the assignment
  exactly like video submit.

Deviations / coordinator notes:

- **Slide photos live in the `account-verification` bucket**, not `videos`.
  The videos bucket allows only video mime types and I could not run a
  migration to extend it; account-verification is the only creator-writable
  image bucket (same company-first folder RLS). When you extend the videos
  bucket (or add a slides bucket), move the upload in
  `submitAssignmentPhotos` (`uploadPhoto`). Anything signing URLs for photo
  submissions must sign against account-verification until then.
- Legacy photo_carousel briefs (null post_type_id) do NOT redirect to the
  upload screen; they keep the old record-the-script-as-video path, because
  post-approved only 409-holds new-world carousels and would try to stitch
  images on the legacy path. The record screen redirects only
  format photo_carousel AND post_type_id non-null.
- Retakes orphan the replaced draft file in storage (the draft row is
  updated, the old file is not deleted). Submitted clips are referenced by
  segment_paths, so `clearDraft` deletes only the DB row, never files.
- Empty outro script (no cta) falls back to "Close it out and tell them what
  to do next." as the teleprompter text.
- `npx tsc --noEmit` exits 0 project-wide at hand-off time.

## Agent B — done

Built the setup gate, checklist, and warm-up tutorial.

- `lib/setup.ts` (new): derives `SetupState` (accounts / connect / warmup /
  bank, each todo | in_review | done) from `creator_accounts`, social connect
  status, and Stripe Connect status. Module-level snapshot + `useSetupState`
  hook shared by the gate and the checklist. `markWarmupTutorialSeen` merges
  `warmup_tutorial_seen: true` into `profiles.onboarding_answers`. When setup
  first computes complete, `setup_complete: true` is persisted into
  `onboarding_answers` so later launches skip the three network calls.
- `app/(creator)/_layout.tsx`: gate redirects everything to
  `/(creator)/setup` when setup is incomplete, EXCEPT `/setup*`, `/chat`,
  `/profile`, and `/account-setup` (step 1 lives there, so it must stay
  reachable; treat it as a setup route). Registered `setup/index` and
  `setup/warmup` screens.
- `app/(creator)/setup/index.tsx` (new): four-card checklist with status
  chips; social connect and Stripe connect open inline via
  `expo-web-browser`; refreshes on focus and pull-to-refresh; complete state
  shows a "Go" card into the tabs; help link to chat.
- `app/(creator)/setup/warmup.tsx` (new): 4-page swipeable tutorial (what /
  why / what to do / prove it). Last page uploads the TikTok (15s min) and
  Instagram (20s min) screen recordings and calls `submitCreatorAccount`,
  which flips the row to `pending` for the existing admin review flow.
- Deviation worth knowing: `creator_accounts.status` is check-constrained to
  pending / needs_changes / approved and the admin queue lists `pending`
  only, so step 1 (`account-setup.tsx`, reworked to handles + template + two
  profile screenshots) saves the row via new
  `saveCreatorAccountDraft` with status `needs_changes` and no reason (a
  draft that stays out of the admin queue). The warm-up submit is the only
  thing that sets `pending`. Admin screens are untouched and still receive
  all four assets on one row.
- `app/(creator)/(tabs)/profile.tsx`: added a Payouts row in Settings that
  opens the same Stripe Connect flow.
- `npx tsc --noEmit`: no errors in Agent B files (one pre-existing error in
  `app/(creator)/record/[id].tsx`, Agent C's file, about the not-yet-typed
  `/upload/[id]` route).

## Agent A — done

Built the Cal AI pre-auth onboarding flow. Routes (all in `app/(onboarding)/`,
one question per screen): `welcome` → `name` → `birthday` → `phone-number` →
`experience` → `hardest` → `hours` → `estimate` → `save` (+ `email` for
email/password sign up) → `heard` → `notifications` → `permissions` → `done`.
Old `creator.tsx` and `practice.tsx` deleted. `company.tsx` (admin) untouched
and still uses the legacy `StepShell` components, which were kept alongside
the new Cal components (`CalShell`, `CalOption`, `CalTextField`,
`CalAuthButton`, `DateWheel`) in `components/OnboardingUI.tsx`.

Routing: `app/index.tsx` now sends no-session users to onboarding welcome on
a fresh install, or to `/(auth)/login` once a `noni.onboarding.completed`
AsyncStorage flag exists (set on finishing onboarding and on any sign in that
lands an onboarded profile). `(onboarding)/_layout.tsx` no longer requires a
session; it only bounces `onboarded = true` profiles to their app.
Answers persist locally via AsyncStorage; step 8 writes them to the profile
(`full_name`, `birthday`, `phone` as +1 digits, `onboarding_answers` with
`ugc_experience`, `hardest_part`, `hours_per_week`, `heard_from`, merged so
later keys like `warmup_tutorial_seen` are safe). A signed-in but
not-onboarded creator resumes at `heard`. `done` calls `completeOnboarding`
and replaces to `/(creator)/(tabs)` per contract 3.

New lib helpers: `lib/onboarding.ts` (answer store, local flag,
`saveOnboardingAnswersToProfile`, `finishOnboardingAuth`,
`HOURS_TO_MONTHLY_ESTIMATE`, `formatUsPhone`) and
`signUpWithEmail` in `lib/auth-session.ts`.

Deviations: the birthday wheel is a custom three-column snap wheel in
`OnboardingUI.tsx` instead of a native picker, because adding
`@react-native-community/datetimepicker` would have meant editing
`package.json`, which no agent owns. Notifications step reuses
`registerPushToken` from `lib/notifications.ts` (permission request + Expo
push token upsert) with a "Not now" skip. `npx tsc --noEmit` is clean except
one pre-existing error in Agent C's `app/(creator)/record/[id].tsx`
(references `/(creator)/upload/[id]` before that route file exists).

## Agent E — done

Built `app/(creator)/(tabs)/analytics.tsx` and wired the existing
`components/creator/` AreaChart, MiniStat, SplitBar and PostRow into it.
Added the Analytics tab (icon `chart-column`) between Calendar and Profile in
`app/(creator)/(tabs)/_layout.tsx` and in the TabBar default creator item map;
the TabBar component API is unchanged.

Data: `listMyAssignments` + `parseAssignmentMetrics` for posted assignments,
`listLedger` for earnings (sum of `bounty_credit` and `streak_bonus`).
Sections: MiniStat row (Views, Likes, Earned; tapping one promotes it to the
chart), AreaChart of the selected metric over the last 30 days (views and
likes bucketed by posting day, earnings by ledger day), SplitBar, posts list
newest first opening assignment detail. Loading skeletons and the "Your
numbers show up after your first post goes live." empty state are in.

Deviations, per the degrade-gracefully rule: assignment metrics carry no per
platform numbers (poll-metrics rolls both platforms into one jsonb), so the
TikTok | Instagram switch filters the posts list only and all stats stay
combined. Platform per post is derived from the assignment's `post_url` host;
posts with no derivable platform show under both tabs. The SplitBar uses real
attributable views only and is hidden when nothing is attributable. MiniStat
deltas are blank because there is no historical snapshot to diff against.

`npx tsc --noEmit`: no errors in Agent E files. One pre-existing error in
`app/(creator)/assignment/[id].tsx` (Agent D file, typed route for the new
upload screen).

## Agent D — done

- `app/(creator)/assignment/[id].tsx`: when status is `changes_requested`, a prominent amber card renders directly under the title. It parses the admin's structured note (the `Label: text` blocks RevisionMode sends) into per section rows with bold labels, falls back to a generic line when the note is missing, and ends with a fix and resubmit hint. The full ReviewThread stays below, then the sticky CTA reads "Record again" (video) or "Redo your slides" (photo) with revision aware helper copy. The photo carousel "coming soon" alert is replaced with navigation to `/(creator)/upload/[id]` (cast to `Href` until Agent C's route file lands and typed routes pick it up; the cast stays valid after).
- `components/ReviewThread.tsx`: restyled onto `theme/tokens.ts`, per action tone chips (amber changes, green approved, blue comment). Props API unchanged, so `task/[id].tsx` keeps working. New additive export `parseChangesNote(note)` returning `{ label, text }[]`.
- `app/(creator)/chat.tsx`: assignments with status `changes_requested` (via existing `listMyAssignments`, refreshed on focus) render as pinned amber cards above the DM thread, tapping opens assignment detail. Revision review_events do not write to `messages` (that would need `lib/admin-api.ts` or the notify edge function, both outside my files), so this is the link back path.
- `npx tsc --noEmit`: clean in my files (and repo wide at time of writing).

## Agent H — done

Audited the full creator journey (entry routing → onboarding → setup gate →
setup steps → home → assignment detail → record → upload → submit → review
round trip → analytics → balance → chat). All hops verified: routes exist,
params match, every status write goes through `transitionAssignment` /
`transitionTask`, queries are company-scoped directly or via RLS joins
(`submissions` has no company_id column by design; scoping is via the
assignment/task join policies).

Deleted (verified zero inbound references before each):
- `app/(creator)/task/[id].tsx` (nothing routed to it) + its Stack.Screen
  line in `app/(creator)/_layout.tsx`.
- `components/TaskCard.tsx`, `components/creator/PostPager.tsx` (zero
  imports).
- `nextCreatorAction` in `lib/tasks.ts` (only caller was task/[id]).

Fixed: `swapAssignmentBrief` (`lib/tasks-api.ts`) now clears the
assignment's recording draft after a successful swap — previously a draft
recorded against the old brief resumed as kept clips for the swapped-in
brief.

New: `docs/QA-CREATOR-FLOW.md` — full device-test checklist with all
branches and a Known limitations section.

Issues found, NOT fixed (owned by F/G this round or uncertain):
1. `app/(creator)/assignment/[id].tsx` `onRecord` (~line 143): routes ALL
   `photo_carousel` briefs to `/upload/[id]`, but the record screen only
   sends carousels there when `post_type_id` is non-null (legacy carousels
   must record as video for post-approved). Detail needs the same
   post_type_id guard. Agent F owns the file. Also the `as Href` cast there
   can be dropped now that the upload route file exists.
2. `app/(creator)/(tabs)/analytics.tsx`: Earned stat sums `listLedger`
   default limit 50 rows; undercounts once a creator has more than 50
   ledger entries. Nobody owns the file this round; left alone (fix: pass a
   higher limit or sum server-side).
3. `lib/submissions.ts` `insertSubmissionSegments`: maps brief_segment_ids
   to clips by array index over ALL brief_segments ordered by slot_index.
   Correct while a brief's segments are single-family (video kinds or
   slides, never both) — would mis-link if kinds ever mix on one brief.
   Noted, not changed.

`npx tsc --noEmit` exits 0 project-wide at hand-off time.

## Agent G — done

Rebuilt the Calendar tab as the Posts tab.

- Route renamed: `app/(creator)/(tabs)/calendar.tsx` deleted,
  `app/(creator)/(tabs)/posts.tsx` created. `_layout.tsx` screen entry is now
  `posts` (title "Posts") and the TabBar creator item map key is `posts` with
  icon `layout-list`. Analytics stays between Posts and Profile. No stale
  references to the creator calendar route remain; the only `calendar` route
  hits left in app/ are the admin group's own
  `/(admin)/(tabs)/calendar`, which is a different route and untouched.
- `posts.tsx`: Segmented [Calendar | List], calendar default. Calendar view =
  MonthGrid (current month, dots per day, today tinted, selected filled) +
  a day header ("Today" or "29 July" with a right aligned post count) + the
  selected day's assignments as PostRow rows. List view = every assignment
  newest first (scheduled_date desc, slot_index desc) as PostRow rows with
  the day short form ("29 Jul") in the meta row. Existing behavior kept:
  tap opens assignment detail, Record/Create branching (photo_carousel goes
  to detail, video to `/(creator)/record/[id]?assignment=1`), pull to
  refresh, focus reload, skeletons, empty states. Data unchanged:
  `listMyAssignments` + `parseAssignmentMetrics`; platform per row derived
  from `post_url` host like analytics does.
- `components/creator/PostRow.tsx`, ADDITIVE only (analytics untouched and
  renders identically): new optional props `status` (StatusChip on the
  trailing edge of the meta row), `showMetrics` (default true; posts.tsx
  passes false for anything not posted/approved so unposted rows do not show
  zero stats and $0.00 earnings), and `actionLabel`/`actionIcon`/`onAction`
  (small primary button under the body, used for Record/Create). All existing
  props and default rendering are byte for byte unchanged when the new props
  are omitted.
- `components/creator/WeekStrip.tsx` deleted. The Posts design has no week
  strip (the MonthGrid owns day selection) and the old calendar screen was
  its only importer, so it would have been a zero import orphan. Flagging for
  Agent H so it does not double count it.
- Coordinator notes: the design's per screen account pills
  (Instagram/TikTok filter) and Sort dropdown in list view were NOT built;
  the round 2 spec scopes the list to "newest first" and the platform switch
  already lives in Analytics. Bounty display: PostRow keeps the design's CPM
  tier earnings row (`lib/earnings.ts`); the old calendar card's
  credited bounty figure is no longer shown on this screen (still visible in
  assignment detail and the wallet).
- `npx tsc --noEmit`: exit 0 project wide at hand off time.

## Agent F — done

- `app/(creator)/(tabs)/index.tsx`: removed the account status banner (state,
  `getCreatorAccount` query, render, styles); the Agent B setup gate made it
  dead code. The bell is now a pressable that opens `/(creator)/chat`. Its dot
  shows only when there is something worth seeing: any assignment in
  `changes_requested` (from the already loaded `listMyAssignments` result,
  same signal as the chat pinned strip) OR an unread admin message. Messages
  carry no read state in the schema, so unread = the newest company scoped
  admin authored `messages` row is newer than a local
  `noni.chat.seenAt.<creatorId>` AsyncStorage timestamp written when the bell
  is tapped. The revision half of the dot persists until the revision is
  resolved, by design.
- `app/(creator)/assignment/[id].tsx`: "Watch the example" now opens in the
  in app browser via `expo-web-browser` `openBrowserAsync` instead of
  `Linking.openURL`. The live post link still uses `Linking` on purpose (it
  should deep link into TikTok/Instagram). Agent D's revision UX (changes
  requested card, `parseChangesNote` sections, thread, Record again / Redo
  your slides CTAs and their routes) is byte for byte untouched, as is the
  photo carousel CTA to `/(creator)/upload/[id]`.
- `components/creator/PostCard.tsx`, `components/creator/SwapSheet.tsx`:
  unchanged; the hero queue, streak pill, and swap flow already matched the
  round 2 spec.

Coordinator notes:

- The unread dot clears only when chat is entered through the Home bell
  (chat.tsx is Agent D's file, so I could not stamp seen on chat focus). If
  someone later adds the same `noni.chat.seenAt.<creatorId>` stamp inside
  chat.tsx on focus, the dot becomes accurate for every entry path.
- `npx tsc --noEmit` exits 0 repo wide at hand off time.
