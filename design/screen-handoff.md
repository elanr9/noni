# Noni — Screen Handoff (as-built)

Source of truth: live code under `app/(creator)/`, `app/(admin)/`, `components/`, `theme/tokens.ts`, `lib/*`.  
Where `design/full.md`, design briefs, or `BUILD_STATE.md` disagree with code, **code wins**. Discrepancies called out in §0.

Frame: iPhone · Expo SDK 57 · expo-router · custom floating `TabBar`.  
Roles: `admin` | `creator`. Formats: `video` (UI: Reel) | `photo_carousel` (UI: Slideshow). Analytics sometimes says "Video" / "Photo carousel".

---

## 0. Doc vs code discrepancies

| Claim elsewhere | As-built |
|---|---|
| Creator Today uses `TaskCard` (`BUILD_STATE.md`) | Home uses `PostCard` + `MediaCard`. `TaskCard` is orphaned. |
| Creator tabs Home · Posts · Profile (brief) | Home · Calendar · Profile |
| Home = Calendar \| Inspiration segment (brief) | Today queue + streak + swap |
| Format labels "Video" / "Slideshow" everywhere | Pills: `"Reel"` / `"Slideshow"`. Analytics: `"Video"` / `"Photo carousel"`. |
| Trends is a tab | Route exists, `href: null`, no in-app link |
| `task/[id]` is the creator detail path | Live nav uses `assignment/[id]`. `task/[id]` has zero `router.push` entry points. |
| Photo carousel create flow | Alert stub only: "coming soon" |
| `design/full.md` tokens are complete | True for `theme/tokens.ts`. Legacy `components/Screen.tsx` `colors` (cream + orange `#E85D04`) still used on Balance + Brand Brain. |

---

## 1. Navigation map

### Creator stack — `app/(creator)/_layout.tsx`
Guards: loading → `LoadingScreen`; no session → `/(auth)/login`; not onboarded → `/(onboarding)`; role ≠ creator → `/(admin)/(tabs)`.

```
Stack (headerShown: false, bg offWhite)
├── (tabs)                          custom TabBar
│   ├── index                       Home
│   ├── calendar                    Calendar
│   └── profile                     Profile
├── balance                         push, native header "Balance"
├── assignment/[id]                 push (file-routed; not listed in Stack.Screen)
├── task/[id]                       push (legacy; no UI entry)
└── record/[id]                     fullScreenModal  (?assignment=1 for brief path)
```

### Admin stack — `app/(admin)/_layout.tsx`
Same auth gates; role ≠ admin → `/(creator)/(tabs)`.

```
Stack (headerShown: true, offWhite headers)
├── (tabs)                          headerShown: false, custom TabBar
│   ├── index                       Review (+ badge = queue length)
│   ├── create                      Create
│   ├── calendar                    Calendar
│   ├── creators                    Creators
│   ├── analytics                   Analytics
│   ├── trends                      href: null (orphan)
│   └── settings                    href: null (from Analytics gear)
├── review/[id]                     title "Review" (screen hides header)
├── creator/[id]                    title "Creator"
├── brain                           title "Brand Brain"
└── kitchen-sink                    file exists; not in Stack.Screen; unreachable
```

No `formSheet` anywhere. Only modal presentation: creator `record` = `fullScreenModal`. Sheets are RN `Modal` via `SheetShell`.

---

## 2. Platform constraints

| Concern | Detail |
|---|---|
| Safe area | Tab screens: `useSafeAreaInsets()` top. `Screen` uses `SafeAreaView`. Record/review use insets for chrome. |
| Tab bar | Floating pill: `left/right: 16`, `bottom: 22`, BlurView intensity 40, radius 999. Screens clear it with `paddingBottom` **96** (Home/Profile), **110** (creator Calendar), **116** (admin tabs). No token for clearance. |
| Keyboard | `KeyboardAvoidingView` only in onboarding `StepShell`. Creator/admin content screens (incl. ReviewThread, BriefEditSheet) have **no** KAV. |
| Camera | `record/[id]`: `CameraView` absolute fill, `mode="video"`, `1080p`, torch rear-only, `onCameraReady` gate, front-flash white glow + brightness. |
| Video review | `PinnedPlayer` heights ~330/250; `expo-video`. |
| Status bar | Review video: light. Review photo_carousel: dark. |
| External | Social connect + Stripe: `expo-web-browser`. |

---

## 3. BRIEF REBUILD — do not redesign as final

In progress. Spec: `instructions-from-claude/noni-final-spec.md`. Migration: `supabase/migrations/20260804000000_022_brief_rebuild.sql`.

| Surface | Status |
|---|---|
| `components/admin/BriefEditSheet.tsx` | **REWRITE IN FLIGHT** — hooks A/B, talking points + FV tag, hashtags 5, search_query; script field only for carousel/legacy |
| `app/(admin)/(tabs)/create.tsx` | **REWRITE IN FLIGHT** — owns sheet/backlog/ingest/publish; still displays `pinned_day` weekday chips on cards |
| `app/(creator)/record/[id].tsx` | **REWRITE IN FLIGHT** — BeatsPrompter vs Teleprompter via `script_mode` / `talking_points` |
| `components/Teleprompter.tsx` | **REWRITE IN FLIGHT** — `Teleprompter` + `BeatsPrompter` |
| `lib/briefs-api.ts`, `lib/types.ts`, `validateBrief` | Backend/types for new brief fields |

New brief fields (nullable on old rows): `hook_options`, `talking_points`, `hashtags`, `search_query`, `point_count`, `target_words`, `generation_id`. Profile: `credential_line`, `script_mode` (`beats`\|`full`). Keep `script` for carousel + legacy video.

---

# CREATOR SCREENS

---

## Home

- **File / Route:** `app/(creator)/(tabs)/index.tsx` · `/(creator)/(tabs)` / `/(creator)/(tabs)/index`
- **Presentation:** tab · TabBar label `"Home"`
- **How reached:** default creator landing; after record send `router.replace('/(creator)/(tabs)')`

### Render order
1. Safe-area top
2. `Wordmark` + bell icon (red accent dot; **no onPress**)
3. `"Welcome back, {firstName}."` — firstName = first word of `profile.full_name`, else `"creator"`
4. Subline:
   - no today posts → `"Nothing queued today."`
   - all today cleared (`approved`/`posted`) → `"All done for today."`
   - else → `"{N} to clear today."`
5. Streak pill: flame + number
6. Body:
   - **loading:** `SkeletonCard` height 420
   - **empty today:** `EmptyState` icon sparkles · title `"Nothing queued today"` · body `"Your next week of posts lands when the campaign drops."`
   - **hero** (first uncleared today): `PostCard` (see inventory)
     - if more uncleared: `"{rest.length} more today"` + chevron; expand → title + optional hook + `StatusChip`
   - **all clear:** check icon · `"Done for today"` · `"All three posts are in. Nice."` · optional `"First up tomorrow"` + tomorrow title
7. `ShowSheet` when open
8. Toast overlay

### Data
| Query | Table / fields |
|---|---|
| `listMyAssignments(profile.id)` | `assignments`: `id`, `scheduled_date`, `status`, `metrics` (nullable JSON → views); nested `briefs`: `title`, `hook` (nullable), `format` |
| `fetchMyStreak(company_id, id)` | streak `current_streak` (catch → 0) |
| `getCompany(company_id)` | `settings` → streak milestones (catch → defaults) |
| `listSwapPool` / `swapAssignmentBrief` | spare briefs this week |

### States
| State | Renders |
|---|---|
| loading | skeleton card |
| empty today | EmptyState above |
| load error | silent; prior data kept; pull-to-refresh |
| swap success toast | `Swapped in "{title}".` |
| swap fail toast | `"Could not swap that in. Try again."` |
| streak toast | e.g. `"$10 bonus in 7 days"` or `"Post daily to build your streak"` |

### Interactions
- Pull-to-refresh
- Streak pill → toast
- PostCard open → `/(creator)/assignment/{id}`
- PostCard Record/Create → format branch
- Swap (status `assigned` only) → `SwapSheet`
- More-today rows / tomorrow peek → assignment detail
- Bell: dead

### video vs photo_carousel
**Diverges.** Video `"Record"` → `/(creator)/record/{id}?assignment=1`. Photo `"Create"` → assignment detail (not record).

### BRIEF REBUILD
Indirect — swap/list briefs; video record path uses new prompter fields.

---

## Calendar (creator)

- **File / Route:** `app/(creator)/(tabs)/calendar.tsx` · tab `"Calendar"`
- **Presentation:** tab

### Render order
1. Safe-area top
2. `"Calendar"` + `Segmented` `["Week", "Month"]`
3. Week: `WeekStrip` (dow `M T W T F S S`, day nums, ≤3 dots)
4. Month: `MonthGrid` — `"{Month} {year}"`, `"Tap a day"`, weekdays `S M T W T F S`
5. Selected day list (max 3 via `.slice(0, 3)`):
   - loading: 2 skeleton cards
   - empty: `EmptyState` `"Nothing this day"` / `"Posts land here when the weekly campaign drops."`
   - card: title, optional hook, `StatusChip`, footer:
     - past + done → Views / Likes / Revenue / Bounty (`"Pending"` if not credited; `"—"` if null)
     - can record (`assigned`\|`changes_requested`) → Button `"Record"`\|`"Create"` + `"Posts today"` or `"Posts on its day"`
     - else → clock + `"Waiting on review"`

### Data
`listMyAssignments` — same as Home; also `metrics.views|likes|revenue_cents` (nullable), `bounty_credited_at`, `bounty_amount_cents` (nullable).

### States
loading skeletons · empty EmptyState · load error silent · pull-to-refresh

### Interactions
Segment toggle · day select · card → assignment · Record/Create format branch · pull-to-refresh

### video vs photo_carousel
**Diverges.** Same label/nav as Home.

### BRIEF REBUILD
No.

---

## Profile

- **File / Route:** `app/(creator)/(tabs)/profile.tsx` · tab `"Profile"`
- **Presentation:** tab

### Render order
1. `"Profile"`
2. Avatar (image or initial) · name (`full_name` or `"Creator"`) · `@{handle} · {companyName}` · `"Edit"`
3. Group `"Balance"` → `"Wallet"` + `"$X.XX available"` \| `"$X.XX pending"` \| `"Empty"` · chevron
4. Group `"Accounts"`:
   - `"Instagram"` / `"TikTok"`
   - sub: `"Not connected"` \| `"Connected"` \| `"@{handle}"` \| `"@{handle} · {followers} followers"`
   - chip `"Connected"` or button `"Connect"`
5. Group `"Settings"`: `"Notifications"` value `"Tasks, review"` · `"Posting windows"` value `"3 a day"` (chevrons, **no onPress**)
6. Group `"Legal and support"`: `"Contact support"`, `"Privacy and terms"` (**no onPress**), `"Sign out"`, `"Delete account"`

### Alerts
- `"Connect failed"` + message
- `"Camera needed"` / `"Noni needs the camera for your avatar selfie."`
- `"Could not save"`
- `"Delete account?"` / `"This signs you out on this device. To fully delete your data, contact support."` · `"Cancel"` / `"Delete"`

### Data
`getSocialConnectStatus` · `getOrCreateWallet` · `getCompany` · avatars storage signed URL · `uploadAvatar` + `saveCreatorBasics` · `getSocialConnectUrl` + WebBrowser

### States
statusLoading → skeleton under IG/TT · walletLabel null hides value · connectBusy/editBusy disable buttons

### Interactions
Edit → front camera selfie · Wallet → `/(creator)/balance` · Connect → OAuth browser · Sign out · Delete confirm → signOut

### video vs photo_carousel
No divergence.

### BRIEF REBUILD
No.

---

## Balance

- **File / Route:** `app/(creator)/balance.tsx` · `/(creator)/balance`
- **Presentation:** push · native header `"Balance"` · from Profile Wallet

### Render order
1. `"Bounties land here when posts hit the view threshold. Cash out to your bank when you are ready."`
2. `"Available"` / `"Pending"` + cents
3. `"Payout account"`:
   - onboarded → `"Ready — cash outs go to your bank"`
   - has account_id → `"Almost done — finish Stripe setup"`
   - else → `"One time setup with Stripe (ID + bank)"`
4. Hint if not onboarded: `"Takes about two minutes. Stripe collects your identity and bank account so we can pay you. Noni never sees your bank login."`
5. CTA: `"Set up payouts"` \| `"Finish payout setup"` \| `"Cash out {amount}"` \| `"Nothing to cash out"`
6. `"History"` · empty `"No ledger entries yet."` · else kind + optional note + date + amount

### Alerts
`"Could not load balance"` · `"Setup failed"` · `"Cash out"` / `Send {amount} to your bank via Stripe?` (`"Cancel"`/`"Cash out"`) · `"Cash out started"` · `"Cash out failed"`

### Data
`getOrCreateWallet` · `listLedger` · `getStripeConnectStatus` · `getStripeConnectUrl` · `requestPayout`  
Ledger kind labels: `"Bounty credit"`, `"Streak bonus"`, `"Cash out hold"`, `"Cash out paid"`, `"Cash out failed"`, `"Adjustment"`

### States
full-screen `"Loading balance"` · empty history · cash out disabled if available ≤ 0 or busy

### Interactions
pull-to-refresh · setup/cash-out · Stripe WebBrowser

### video vs photo_carousel
No divergence.

### BRIEF REBUILD
No.

### Note
Uses legacy `Screen`/`colors` (cream/orange), not token blue system.

---

## Assignment detail

- **File / Route:** `app/(creator)/assignment/[id].tsx` · `/(creator)/assignment/{id}`
- **Presentation:** push · custom back (no native header) · from Home/Calendar/PostCard

### Render order
1. Back + `StatusChip`
2. Format chip `"Reel"` \| `"Slideshow"`
3. `{brief.title}` · optional `{hook}` · optional `{why_it_works}`
4. if `example_url`: `"Watch the example"`
5. if `script`: `"Script"` + body
6. if `caption`: `"Caption"` + body
7. if done (`approved`\|`posted`): `"Your post"` · `"Open the live post"` or `"Posting is scheduled."` · Views/Likes/Revenue/Bounty (`"Bounty paid"` or `"{amount} bounty"`; progress `"{views} / {threshold}"`)
8. if `changes_requested` + note: `"Changes requested"` + note
9. `ReviewThread` (`"Feedback"`, etc.)
10. Sticky CTA if `assigned`\|`changes_requested`\|`recorded`: `"Record"`\|`"Create"` + `"Your script runs in the teleprompter."` \| `"No script here. Say it your way."`

### Missing
`"Post not found."`

### Alerts
Photo Create: `"Create slides"` / `"Photo carousel posting is coming soon. Open the example above and shoot the slides to match."`

### Data
`getAssignment` · `listAssignmentReviewEvents` · `fetchBountySettings` · `insertComment`  
Nullable on briefs: `hook`, `why_it_works`, `example_url`, `script`, `caption`, `talking_points`, `hook_options` (latter two **not shown** on this screen yet). Assignment: `post_url`, `metrics`, `bounty_*`, `submission_id` (nullable).

### States
spinner loading · missing · composer only if `!done && submission_id !== null`

### Interactions
back · open example/post URLs · Record → `record/{id}?assignment=1` · Create → alert only · comment send

### video vs photo_carousel
**Diverges.** CTA label/icon; video → record; photo → alert stub.

### BRIEF REBUILD
**YES** — displays brief fields; does not yet surface `talking_points` / `hook_options`.

---

## Task detail (legacy)

- **File / Route:** `app/(creator)/task/[id].tsx` · `/(creator)/task/{id}`
- **Presentation:** push · **UNREACHABLE from current UI** (deep link / manual only)

### Render order
1. Back + `StatusChip`
2. Cover or gradient placeholder + play/images (`"Watch inspiration"` / `"Open inspiration"` a11y; disabled if no `source_url`)
3. `{task.title}` · optional `{task.brief}`
4. `"This idea:"` + thumbs up/down
5. Only if `changes_requested`: changes banner + `ReviewThread`; else spacer
6. CTA: status `recorded` → `"Send for review"` (busy `"Updating…"`); if canRecord → `"Record"`\|`"Create"` + `"Your script runs in the teleprompter."` \| `"No script — say it your way."`

### Missing
`"Task not found."`

### Alerts
`"Sent for review"` / `"Admins will take a look."` · `"Could not update"` · photo `"Create slides"` / `"Photo carousel posting is coming soon. For now, open the inspiration above and shoot the slides to match."`

### Data
`getTask` (`content_tasks` + `trend_items`) · `listTaskReviewEvents` · `latestSubmission` · `transitionTask` · `setTaskFeedback` · `insertComment`  
Nullable: `brief`, `script`, `feedback`, `trend_items.cover_url`/`source_url`

### Note
`nextCreatorAction` `"Mark recorded"` is computed but **never shown** (UI only offers transition to `submitted`).

### video vs photo_carousel
**Diverges.** Record → `record/{id}` (no assignment flag). Create → alert.

### BRIEF REBUILD
Partial — teleprompter uses `task.script`, not brief rebuild fields.

---

## Record

- **File / Route:** `app/(creator)/record/[id].tsx` · `/(creator)/record/{id}` · optional `?assignment=1`
- **Presentation:** `fullScreenModal`
- **BRIEF REBUILD: YES — core consumer**

### Phases
`idle` | `countdown` | `recording` | `review` | `uploading` | `sent`

### Render order (by phase)
1. Full-bleed `CameraView` (idle/countdown/recording) or `VideoView` (review)
2. Front-flash white border glow when recording + flash + front
3. Progress segment bar (safe-area top)
4. Prompter (camera phases):
   - **BeatsPrompter** if assignment + video + talking_points nonempty + `profile.script_mode !== 'full'`: credential, hook, numbered points
   - else **Teleprompter** scrolling text; speed chip `"{n}x"`; paused: `"Script paused. Tap to resume."`
   - fallback: `"No script on this task. Speak freely."`
5. Countdown: big number + `"Tap to cancel"`
6. Top: `"Close"` or `"Back"` (review) + title
7. Rail: `"Flash"` · `"Flip"` (hidden while recording)
8. Bottom idle: segment pills `"1 · m:ss"` · `"Delete last"`; next-part `"Part {n} of {m}"` + `"Flip camera"`; speed `0.75x` `1x` `1.25x` `1.5x` (hidden in beats mode); `"{n} parts. Stop between each to cut and continue."`; shutter; `"Camera starting"` \| `"Max length"` \| `"{m:ss} left"`; `"Done"` when segments exist
9. Countdown bottom: `"Get ready"`
10. Recording: timer `"m:ss / 4:00"` · stop · `"Stop saves this clip"`
11. Review: `"One clip"` or `"Clip {i} of {n}. Clips post as one video."` · `"Retake all"` · `"Send for review"`
12. Uploading: `"Uploading your take…"` / `"Uploading {n} clips…"`
13. Sent: `"Sent for review. Approve lands it in your queue."` → after 2600ms replace tabs

### Alerts
`"Camera and mic needed"` / `"Noni needs both to record your take with the teleprompter."` · `"Camera warming up"` · `"Clip not saved"` · `"Recording failed"` · `"Camera stalled"` · `"Upload failed"`

### Missing
`"Task not found."` (used for both task and assignment miss)

### Data
| Path | Query / fields |
|---|---|
| assignment | `getAssignment` → briefs `script`, `hook`, `hook_options`, `talking_points`, `format`, `title` via `parseTalkingPoints` / `parseHookOptions` |
| task | `getTask` → `script`, `title` |
| submit | `submitAssignmentRecording` \| `submitRecording` |
| profile | `script_mode`, `credential_line`, `company_id` |

Nullable: talking_points/hook_options empty on pre-rebuild rows → falls back to script Teleprompter.

### States
loading spinner on ink900 · permissions/camera-ready gates · max 240s · shutter disabled if `!cameraReady \|\| maxReached`

### Interactions
close/back · flash/flip · speed · shutter → countdown → record · tap prompter pause · stop · delete last · done → review · retake · send

### video vs photo_carousel
**Diverges.** Structured beats prompter only if `format !== 'photo_carousel'`. Photo path typically never reaches this screen (Create alerts / routes to detail).

---

# ADMIN SCREENS

---

## Queue (Review tab)

- **File / Route:** `app/(admin)/(tabs)/index.tsx` · tab `"Review"`
- **Presentation:** tab · badge = `listAssignmentQueue().length` when > 0

### Render order
1. Wordmark text `"noni"` + count pill: loading skeleton \| `"All clear"` \| `"{n} waiting"`
2. H1 `"Queue"`
3. Subtitle (when not loading):
   - `n >= 2`: `"Approve and it's live. Editing, posting and tracking are automatic."`
   - `n === 1`: `"One to clear, then you're done for today."`
   - `n === 0`: none
4. Filter chips (only `!loading && n >= 2`): `"All {n}"` + creator names + brief titles
5. Body:
   - loading: 4× `QueueSkeletonRow`
   - empty: `EmptyState` icon `circle-check-big` · `"Nothing to review"` · body `"Everything submitted is approved and scheduled. {inFlight} posts are with creators."` or without inFlight clause · CTA `"Open Calendar"`
   - one left: one `QueueRow` + `NextUpCard` `"NEXT UP"` · `"{n} task(s) still with creators."` or `"The next batch lands when creators submit."`
   - many: filtered `QueueRow` list
6. **QueueRow:** MediaFallback glyph play/images + lengthLabel (`"m:ss"` / `"Reel"` / `"Slideshow"`); creator initial + name · age (`"just now"`, `"Nm ago"`, `"Nh ago"`, `"Yesterday"`, `"Nd ago"`, or date); title; FormatPill; StatusChip (`"In review"` or `"Resubmitted"`); chevron

### Data
`listAssignmentQueue()` → `assignments` status `submitted` + `briefs(*)`, `profiles(id, full_name)` · `latestSubmissionsByAssignment` · `countAssignmentsInFlight`  
Nullable: `profiles.full_name` → `"Creator"`; submission null OK.

### States
loading · empty · 1-item NextUp · ≥2 chips+list · filter can zero rows with **no** filter-empty copy

### Interactions
chip filter · row → `/(admin)/review/{id}` optional `?creator=` / `?brief=` · EmptyState → Calendar tab

### video vs photo_carousel
**Diverges** on glyph + lengthLabel + FormatPill only.

### BRIEF REBUILD
No.

---

## Create

- **File / Route:** `app/(admin)/(tabs)/create.tsx` · tab `"Create"`
- **Presentation:** tab
- **BRIEF REBUILD: YES**

### Render order
1. `"Create"`
2. Subtitle: `"{campaign.name} · drops {Mon D}"` or `"Author the week, publish once, done."`
3. **Start card** when `!loading && (!campaign \|\| campaign.status === 'published')`:
   - published: `"Last campaign published with {items.length} briefs. Creators have their week."`
   - none: `"A campaign is one week of briefs shared by the whole roster."`
   - Button `"Start next week"` / `"Starting…"`
4. **Draft only** (`status === 'draft'`):
   - Paste card: `"Paste a TikTok or Instagram link"` · placeholder `"https://www.tiktok.com/@…"` · `"Angle or context (optional)"` · placeholder `"e.g. fifth D1 offer, AI did all my recruiting…"` · `"Draft brief"` / `"Watching the post…"` · `"Write from scratch"` · `"Backlog ({n})"`
   - Grid header: `"{n} of 30 briefs"` + `"Publish"` / `"Publishing…"` (Publish if `items.length > 0`)
5. Brief grid: FormatPill, optional pin weekday (`Sun`–`Sat`), title, optional hook. Empty: `"No briefs yet. Paste a link above or pull from the backlog."`

### Sheets

#### BriefEditSheet — REBUILD TARGET
- Header: `"New brief"` \| `"Edit brief"`; chip `"From link"` if exampleUrl
- Warnings list
- `"Title"`; non-legacy placeholder `"Search query this answers"`
- `"Format"` Segmented `"Reel"` \| `"Slideshow"`
- Legacy (no talking points + has script): single `"Hook"`
- Non-legacy: `"Hook"` radios `"A"` / `"B"`; `"Talking points"` (index, `"FV"` tag, ↑↓✕); placeholders `"Product point. Write it from an approved claim."` / `"Beat, not a line. Under 25 words."`; `"Add point"`; `"Hashtags ({n} of 5)"`
- Body if legacy OR photo_carousel: `"Slide copy"` (carousel) or `"Script"` (legacy video). **Non-legacy video: no script field.**
- `"Caption"`; helper `"{n} of 200 characters"` (non-legacy)
- `"Why this works"`
- Footer: `"Save to campaign"` / `"Save brief"` / `"Saving…"`; edit+remove: `"Remove from campaign"`
- Validation `"Not quite"`: `"Give the brief a title."` · `"A brief needs at least 2 talking points."` · `"Exactly one talking point must be the product point. Tap FV on the right one."` · `"Pick exactly 5 hashtags."` · `"Caption is {n} characters. Max 200."`
- Remove confirm: `"Remove from this campaign?"` / `"The brief stays in your backlog with its history."` · `"Cancel"` / `"Remove"`

#### BacklogSheet
`"From the backlog"` / `"Every brief you have written, free to run again this week."`  
Empty: `"Nothing here yet. Briefs land in the backlog the moment you save them."`

### Other alerts
`"Failed"` / `"Try again"` · `"Could not draft"` · `"Save failed"` · `"Remove failed"` · `"Add failed"` · `"Publish this campaign?"` / `"Every creator gets their week from these {n} briefs, dropping {date}."` · `"Campaign is live"` · `"Publish failed"`

### Data
`getLatestCampaign` · `listCampaignBriefs` · `listBacklogBriefs` · `brand_profiles.hashtag_bank` (nullable → `[]`) · `ingestBrief` · `createBrief` · `updateBrief` · `addBriefToCampaign` · `removeBriefFromCampaign` · `createCampaign` · `publishCampaign`  
Campaign: `id`, `name`, `drop_date`, `status`. Brief: title, format, hook, hook_options, talking_points, hashtags, search_query, script, caption, why_it_works, target_words, example_url; join `pinned_day` (nullable; still displayed).

### States
loading hides start card · draft vs published vs none · empty grid · sheets busy/disabled

### Interactions
Start disabled while starting · Draft disabled if `ingesting \|\| !url.trim()` · Publish confirm · cards press only if editable · sheet save disabled if `busy \|\| !title.trim()`

### video vs photo_carousel
**Diverges** in FormatPill + BriefEditSheet body field (Slide copy vs no script for non-legacy video).

---

## Calendar (admin)

- **File / Route:** `app/(admin)/(tabs)/calendar.tsx` · tab
- **Presentation:** tab

### Render order
1. `"Calendar"` + optional pill `"{n} posts"`
2. `"Week of {D} {Mon}"` + optional `" · {n} creators"`; prev/next
3. loading: `"Loading calendar…"`
4. no creators: `"No creators yet. Invite someone from Settings."`
5. creators but no assignments: `"No posts scheduled this week. Publish a campaign from Create."`
6. else grid: day headers `"Mon"`…`"Sun"` + date; per creator avatar + name; `CalendarCell`: FormatPill, title (fallback `"Brief"`), status pill `"To do"`\|`"Recorded"`\|`"In review"`\|`"Changes"`\|`"Approved"`\|`"Posted"`; empty cells dashed

### Data
`listWeekAssignments` · `listCreators`  
Name null → `"Creator"`. Title null → `"Brief"`.

### States
loading / no creators / no posts / grid · RefreshControl

### Interactions
week nav · cell press **only if** `status === 'submitted'` → Review; other statuses disabled

### video vs photo_carousel
FormatPill only.

### BRIEF REBUILD
No.

### Note
Calendar status label `"Changes"` ≠ StatusChip `"Changes needed"`.

---

## Creators

- **File / Route:** `app/(admin)/(tabs)/creators.tsx` · tab
- **Presentation:** tab

### Render order
1. `"Creators"`
2. `"Tap a column to sort. Tap a creator for posts, chat, earnings."`
3. Sort chips: `"Views"` `"Followers"` `"Posts"` `"Approval"` `"Revenue"` `"Paid"`
4. loading `"Loading creators…"` · empty `"No creators on the roster yet."`
5. Cards: rank · name · cells Views/Followers/Posts/Approval/Revenue/Paid (followers/approval `"—"` when null; approval `"N%"`)

### Data
`fetchCreatorLeaderboard(company_id)` — profiles, assignments, wallet_ledger, social followers  
Nullable: `followers`, `approvalRate`

### States
loading / empty / list · Alert `"Could not load"`

### Interactions
sort · card → `/(admin)/creator/{id}`

### video vs photo_carousel
No divergence.

### BRIEF REBUILD
No.

---

## Analytics

- **File / Route:** `app/(admin)/(tabs)/analytics.tsx` · tab
- **Presentation:** tab · gear → Settings

### Render order
1. `"Analytics"` + gear (a11y `"Settings"`)
2. `"Performance per brief across creators. Best hooks, formats, creators."`
3. `"Poll metrics now"` / `"Polling…"`
4. loading: `"Loading analytics…"`
5. Totals: `"Views"` `"Revenue"` `"Bounties"`
6. `"Briefs"` — empty `"No assignments yet."` else title; `"{Video|Photo carousel} · {n} creators · {n} posted"`; views/likes/revenue
7. `"Best hooks"` — empty `"Hooks rank once briefs have views."`
8. `"Best formats"` — empty `"No format data yet."` else `"Video"` / `"Photo carousel"`
9. `"Best creators"` — empty `"Creators rank once posts have views."`

### Alerts
`"Could not load"` · `"Metrics updated"` / `"Fresh numbers from Upload-Post."` · `"Poll failed"`

### Data
`fetchBriefAnalytics` · `startMetricsPoll`

### States
loading · section empties · poll disabled while polling

### Interactions
gear → `/(admin)/(tabs)/settings` · Poll · pull-to-refresh

### video vs photo_carousel
Format label strings only (`"Video"` / `"Photo carousel"` — not Reel/Slideshow).

### BRIEF REBUILD
No.

---

## Trends (hidden)

- **File / Route:** `app/(admin)/(tabs)/trends.tsx` · `href: null`
- **Presentation:** hidden tab · **no in-app entry** (orphaned; MVP v2 cut)
- **Reachable only** by manual route navigation

### Render order
1. `"Trends"` / `"Scraped posts with hooks worth turning into tasks."`
2. `"Scrape now"` / `"Starting…"`
3. loading `"Loading trends…"` · empty `"No trends yet. Tap Scrape now, then pull to refresh in a few minutes."`
4. Cards: cover; `"Instagram"`\|`"TikTok"` · optional `@handle` · views (`"views unknown"` / `"N views"` / `"Nk views"` / `"N.NM views"`); optional hook/why; `"Watch"`; `"Turn into task"` / `"Close"`
5. Expanded: `"Assign to"`; creator chips (`full_name` or `"Unnamed"`); `"Create task"` / `"Writing the brief…"`

### Alerts
`"Scraping started"` / `"New trends land here in a few minutes. Pull to refresh."` · `"Task created"` · `"Failed"`

### Data
`listTrends` → `trend_items` · `listCreators` · `startTrendScrape` · `generateTaskDraft` + `createTask` (legacy `content_tasks`)  
Nullable: `cover_url`, `hook`, `why_it_works`, `source_url`, `author_handle`, `views`

### States
loading/empty/list · Create disabled without assignee

### video vs photo_carousel
No UI divergence (draft format unused in UI).

### BRIEF REBUILD
No.

---

## Settings (hidden)

- **File / Route:** `app/(admin)/(tabs)/settings.tsx` · `href: null`
- **Presentation:** hidden · from Analytics gear → `/(admin)/(tabs)/settings`

### Render order
1. `"Settings"` / `"Creators, brand brain, and account."`
2. `"Creator socials"` / `"Creators connect their own TikTok and Instagram. Approved content posts to those accounts."`
3. loading `"Loading…"` · empty `"No creators yet."` · else name + `"TikTok"` · `"Instagram"` joined or `"Not connected"`
4. `"Brand"` → `"Brand Brain"` / `"Product truth, voice, audience, and source accounts."` → brain
5. `"Account"`: name or `"Admin"`; `"Signed in as admin"`
6. `"Sign out"`

### Data
`listCreatorSocialStatus` · `useAuth`

### States
loading/empty/list · Alert `"Could not load"`

### Interactions
Brand Brain push · Sign out

### video vs photo_carousel
No divergence.

### BRIEF REBUILD
No.

---

## Review

- **File / Route:** `app/(admin)/review/[id].tsx` · stack push
- **Presentation:** push · **hides** stack header (`headerShown: false`). Params: `id`, optional `creator`, `brief`

### Shared states
- loading: centered spinner
- missing: `"Nothing left to review."` + `"Back"`

### video (`format === 'video'`)
- light StatusBar
- `PinnedPlayer`: back, counter `"{i} of {n}"` or `"Take {version}"`, play/pause, scrub
- meta: avatar · name · `"·"` · `"{title} · {ageLabel}"`
- Segmented `"Script"` `"Caption"` `"Thread"`
- Script lines / Caption InfoBlock `"CAPTION"` or `"No caption."` / Thread or `"No notes yet on this post."`
- Footer `"Request changes"` `"Approve"`
- Resubmitted opens Thread by default

### photo_carousel
- dark StatusBar
- header back + centered `"Review"` + counter pill
- `SlideshowViewer`
- same meta; H1 title
- InfoBlock `"SLIDE {n} COPY"`; InfoBlock `"CAPTION"`
- same footer
- **No** Script/Caption/Thread segmented

### RequestChangesSheet
`"What should {creatorName} fix?"`  
Chips: `"Hook lands late"` `"Audio"` `"Off script"` `"Framing"`  
Note field · `"Send note to {creatorName}"` (disabled if empty)  
`"The task goes back to {creatorName}'s queue with your note attached."`

### Alerts
`"Could not load"` · `"Missing submission"` / `"This post has no video to review yet."` (**says video even for slideshow**) · `"Couldn't approve"` / `"Couldn't send note"` / `"Check your connection and try again."`

### Data
`listAssignmentQueue` + filter · `latestSubmissionsByAssignment` · `signedVideoUrl` (video) · `listAssignmentReviewEvents` · `reviewAssignment`  
Nullable: submission, `video_path`, caption, script, duration

### States
loading/empty/busy footer · thread empty · autoplay when URL · advance or back after action

### Interactions
Approve (`note: null`) · Request changes → sheet · seek script lines (video) · slide select · back

### video vs photo_carousel
**Major divergence** (player vs slideshow; tabs vs slide copy; StatusBar).

### BRIEF REBUILD
No (RequestChangesSheet only).

---

## Creator detail (admin)

- **File / Route:** `app/(admin)/creator/[id].tsx` · from Creators
- **Presentation:** stack push · header title `data?.name ?? "Creator"`

### Render order
1. loading: `"Loading creator…"`
2. Stats `"Earned"` `"Paid out"` `"Posts"`
3. `"Posts"` — empty `"No assignments yet."` else title + StatusChip + date · optional views · optional `" · open post"`
4. `"Chat history"` — empty `"No review activity yet."` else `"{name}"` + `" approved"` / `" requested changes"` / `" commented"` (name `"Someone"`); optional note; date
5. `"Earnings"` — empty `"No ledger entries yet."` else kind label + amount + date · note

### Data
`fetchCreatorDetail` — profiles, assignments+briefs, submissions→review_events, wallet_ledger (limit 50)

### States
loading · section empties · post row disabled without `post_url` · Alert `"Could not load"`

### Interactions
post with URL → Linking · pull-to-refresh

### video vs photo_carousel
No divergence.

### BRIEF REBUILD
No.

---

## Brand Brain

- **File / Route:** `app/(admin)/brain.tsx` · from Settings
- **Presentation:** push · stack title `"Brand Brain"` · **legacy Screen/colors styling**

### Render order
1. loading: `LoadingScreen` `"Loading Brand Brain"`
2. Intro: `"This is the engine's knowledge of your brand. Anything you write here changes what gets scraped, what passes the gate, and how drafts are written."`
3. Tabs `"Product"` `"Audience"` `"Voice"` `"Learnings"` + hints:
   - Product: `"What the product does, who pays, killer features, natural plug angles, banned claims."`
   - Audience: `"Who the audience is, their pains and dreams, niche boundaries, accounts they follow, their language."`
   - Voice: `"How the brand sounds, with real example lines, and what the voice never does."`
   - Learnings: `"Machine-written, append only. What the engine has learned from performance and refreshes."`
4. Multiline editor; placeholders `"Nothing learned yet. The engine writes here as campaigns run."` / `"Write it yourself (best) or draft it with AI below."` — learnings not editable
5. Non-learnings: `"Draft with AI"` / `"Drafting…"`; `"Save"` / `"Saving…"` (disabled if clean or saving)
6. `"Source accounts"` / `"The scraper pulls from these accounts first. Search terms are the fallback. Mute anything that pollutes the feed."`
7. Platform `"TikTok"`\|`"IG"`; placeholder `"@handle"`; `"Add"`
8. Empty accounts: `"No accounts yet. Add the creators your audience already follows. The scraper also discovers accounts on its own as posts pass the gate."` else `@{handle}` + platform + optional `" · discovered"` + optional `" · {keeper}/{scraped} kept"`; `"Mute"`/`"Unmute"`
9. `"Saved search terms"` — empty `"No saved terms yet. The scraper remembers terms whose results pass the gate and reuses the best ones."` else term + keepers; `"Remove"`

### Alerts
`"Saved"` / `"Every future scrape and draft reads this."` · `"Failed"`

### Data
`listBrandDocs` · `saveBrandDoc` · `draftBrandDocs` · `listSourceAccounts` · `addSourceAccount` · `setSourceAccountStatus` · `getSourcingTerms` · `removeSourcingTerm`  
Tables: `brand_docs`, `source_accounts`, sourcing terms

### States
loading · dirty save · drafting · empty lists

### video vs photo_carousel
No divergence.

### BRIEF REBUILD
No.

---

## Kitchen sink

- **File / Route:** `app/(admin)/kitchen-sink.tsx` · `/(admin)/kitchen-sink`
- **Presentation:** **UNREACHABLE** — not in Stack.Screen, not linked. Comment: scratch for Stage F1; delete at end of project.
- **Data:** none (static demos)
- **BRIEF REBUILD:** No

Demo sections: FormatPill, MediaFallback (`"0:52"`, `"4 slides"`), InfoBlock, StatusChip, SegmentedTabs, Skeleton, Button, SheetShell sample `"What should Mara fix?"` / `"Send note to Mara"`.

---

# SHARED COPY

### StatusChip labels
`"To do"` · `"Recorded"` · `"In review"` · `"Changes needed"` · `"Approved"` · `"Posted"` (+ override `"Connected"` / `"Resubmitted"`)

### ReviewThread
`"Feedback"` · empty `"No feedback yet."` · `"{name} · Admin|Creator"` · actions `"Approved"` / `"Requested changes"` / `"Comment"` · placeholder `"Write a comment"` · `"Send"` · alert `"Could not send"`

### SwapSheet
`"Swap this post"` / `"Trade it for one of your spare briefs from this week."` / loading `"Finding your spares"` / `"One second."` / empty `"No spare briefs"` / `"Every brief in this week is already on your calendar."` / `"Keep what I have"`

### PostCard
Format via MediaCard: Reel/Slideshow · buttons `"Record"`\|`"Create"`, `"Swap"` · pending `"In review"` + `"Sent for approval"` + `"See it"` · done `"Posted"` + optional views + `"See it"`

---

# 8. Component inventory

`SYSTEM` = used on 3+ screens in creator/admin.

| File | Export | Props (summary) | Screens | |
|---|---|---|---|---|
| `components/Screen.tsx` | `Screen`, `LoadingScreen`, `BrandTitle`, `colors` | Screen: children, style?; LoadingScreen: label? | creator `_layout`, balance; admin `_layout`, brain | **SYSTEM** (LoadingScreen) |
| `components/StatusChip.tsx` | `StatusChip` | status, label? | creator index/calendar/profile/task/assignment; admin creator/kitchen-sink | **SYSTEM** |
| `components/ReviewThread.tsx` | `ReviewThread` | events, onSendComment, composerEnabled? | assignment, task | |
| `components/TaskCard.tsx` | `TaskCard` | task, onPress, bountyText? | **none (orphan)** | |
| `components/Teleprompter.tsx` | `Teleprompter`, `BeatsPrompter` | text/running/paused/speed…; credential/hook/points/activeIndex | record (**REBUILD**) | |
| `components/OnboardingUI.tsx` | ProgressBar, StepShell, OptionCard, Chip | — | not in creator/admin | |
| `components/ui/Button.tsx` | `Button` | children, variant?, size?, block?, icon?, disabled?, onPress? | many | **SYSTEM** |
| `components/ui/Icon.tsx` | `Icon` | name, size, color, strokeWidth? | nearly all | **SYSTEM** |
| `components/ui/PressableScale.tsx` | `PressableScale` | PressableProps | nearly all | **SYSTEM** |
| `components/ui/TabBar.tsx` | `TabBar` | BottomTabBarProps + items? | both tab layouts | |
| `components/ui/Wordmark.tsx` | `BubbleMark`, `Wordmark` | size? | creator+admin index | |
| `components/ui/EmptyState.tsx` | `EmptyState` | icon?, title, body, actionLabel?, onAction?, compact? | creator index/calendar; admin index; SwapSheet | **SYSTEM** |
| `components/ui/Skeleton.tsx` | `SkeletonLine`, `SkeletonCard` | height/width/radius/style | creator index/calendar/profile; admin index | **SYSTEM** |
| `components/ui/Segmented.tsx` | `Segmented` | options, value, onChange | creator calendar; admin review, BriefEditSheet, kitchen-sink | **SYSTEM** |
| `components/ui/SheetShell.tsx` | `SheetShell` | visible, onClose, children, pinnedTop?, footer? | BriefEdit/Backlog/RequestChanges/Swap/kitchen-sink | |
| `components/ui/FormatPill.tsx` | `FormatPill` | format, compact?, overlay? | create, QueueRow, CalendarCell, SlideshowViewer, kitchen-sink | |
| `components/ui/InfoBlock.tsx` | `InfoBlock` | label, children | review, kitchen-sink | |
| `components/ui/MediaFallback.tsx` | `MediaFallback` | glyph, label?, width?, radius?… | QueueRow, kitchen-sink | |
| `components/ui/MediaCard.tsx` | `MediaCard` | title, meta?, format, variant, onPress?… | PostCard, SwapSheet | |
| `components/ui/Dropdown.tsx` | `Dropdown` | options, value, onChange… | **none (orphan)** | |
| `components/creator/PostCard.tsx` | `PostCard`, `formatViews` | assignment, viewsLabel?, showSwap, onOpen, onRecord, onSwap | Home (+ formatViews on calendar/assignment) | |
| `components/creator/SwapSheet.tsx` | `SwapSheet` | visible, briefs, loading, onPick, onClose | Home | |
| `components/creator/MonthGrid.tsx` | `MonthGrid` | year, month, postCounts, selectedDay, todayDay, onSelectDay | calendar | |
| `components/creator/WeekStrip.tsx` | `WeekStrip` | days, selectedKey, onSelect | calendar | |
| `components/creator/PostRow.tsx` | `PostRow` | — | **none (orphan)** | |
| `components/creator/PostPager.tsx` | `PostPager` | — | **none** | |
| `components/creator/MiniStat.tsx` | `MiniStat` | — | **none** | |
| `components/creator/AreaChart.tsx` | `AreaChart` | — | **none** | |
| `components/creator/SplitBar.tsx` | `SplitBar` | — | **none** | |
| `components/admin/BriefEditSheet.tsx` | `BriefEditSheet` | visible, mode, initial, hashtagBank, exampleUrl?, warnings?, busy?, onClose, onSave, onRemove? | create (**REBUILD**) | |
| `components/admin/BacklogSheet.tsx` | `BacklogSheet` | visible, briefs, addingId, onAdd, onClose | create | |
| `components/admin/QueueRow.tsx` | `QueueRow` | item, onPress | admin index | |
| `components/admin/QueueSkeletonRow.tsx` | `QueueSkeletonRow` | — | admin index | |
| `components/admin/NextUpCard.tsx` | `NextUpCard` | inFlight? | admin index | |
| `components/admin/CalendarCell.tsx` | `CalendarCell` | items | admin calendar | |
| `components/admin/PinnedPlayer.tsx` | `PinnedPlayer` | heightPx, playing, videoUri?, … | review | |
| `components/admin/SlideshowViewer.tsx` | `SlideshowViewer` | slides, index, onSelect | review | |
| `components/admin/ScriptLineList.tsx` | `ScriptLineList` | lines, positionSec, hasTimings, onSeek | review | |
| `components/admin/ThreadTab.tsx` | `ThreadTab` | entries | review | |
| `components/admin/RequestChangesSheet.tsx` | `RequestChangesSheet` | visible, creatorName, onClose, onSend | review | |

---

# 9. Tokens vs drift

## Defined in `theme/tokens.ts`

| Group | Contents |
|---|---|
| `color` | blue50–700, white, offWhite, fillQuiet, line, lineStrong, slate300–500, ink/ink800/ink900, amber/green/danger (+ soft), semantic aliases, scrims, whiteA92–16, glass |
| `type.size` | hero 44 → micro 10 |
| `type.leading` / `tracking` / `weight` | multipliers + weights |
| `space` | 1–11 (4–40), gutter 24, cardPad 18, stackGap 12, sectionGap 28, tapMin 44, tapPrimary 60, shutter 84 |
| `radius` | sm 12 → pill 999 |
| `borderWidth` | hair 1, field 1.5, select 2 |
| `shadow` | shadowCard/Raised/Float/Media/Accent |
| `motion` | instant…shimmer, pressScale, easeOut |
| `ringFocus` | 3px `rgba(27,166,238,0.30)` |

## Parallel legacy palette — `components/Screen.tsx` `colors`
`#F7F5F2` bg · `#0B0B0F` ink · `#5C5C66` muted · `#E85D04` accent — used by Balance + Brand Brain + ReviewThread + TaskCard.

## Hardcoded colors (bypass tokens)

**Count:** ~123 hex/rgba literals in `app/(creator|admin)` + `components/` (excluding token file shadow defs).

| File | Lines / values |
|---|---|
| `components/Screen.tsx` | 12–15: `#F7F5F2`, `#0B0B0F`, `#5C5C66`, `#E85D04` |
| `app/(creator)/balance.tsx` | 177,194 `#fff`; 250,259 `#fff`; 254,264,292 `#E6E2DC`; 277 `#fff`; 299 `#1B7F4E` |
| `app/(admin)/brain.tsx` | 213,263 `#9A9AA3`; 351–419 warm borders `#D9D6D0`/`#E6E2DA`/`#fff`; 428 `#C1121F`; 429 `#2D6A4F` |
| `app/(creator)/record/[id].tsx` | 662–885: many `#fff`/`#FFFFFF`/`#000`/`rgba(...)` camera chrome |
| `app/(creator)/task/[id].tsx` | 39–40 `#E7F4FD`/`#DCE7F0`; 374 `rgba(255,255,255,0.92)` |
| `components/Teleprompter.tsx` | 168–231: white/black rgba + `#FFFFFF` |
| `components/ReviewThread.tsx` | 101 `#9A9AA3`; 113,136,155,173 `#fff`; 140 `#E6E2DA`; 157 `#D9D6D0` |
| `components/TaskCard.tsx` | 77–111: `#FFFFFF`, `#E6E2DA`, `#0B0B0F`, `#8A8A93`, rgba overlays |
| `components/OnboardingUI.tsx` | 134–177: `#E6E2DA`, `#FFFFFF` |
| `components/ui/MediaCard.tsx` | 39–40,54–56 gradients; 228,242,256,267 rgba |
| `components/ui/Wordmark.tsx` | 26–29 `#9AD4F9`…`#08557F`; 39–41 white stops |
| `components/ui/Skeleton.tsx` | 58–60 `#FAFCFE` |
| `components/creator/WeekStrip.tsx` | 32,51 white rgba |
| `components/creator/MonthGrid.tsx` | 190 `rgba(255,255,255,0.9)` |
| `components/creator/PostRow.tsx` | 47–48 gradient |

Admin redesign screens (create, review, calendar, queue, etc.) mostly use `color.*`. Drift concentrated in: record chrome, legacy Screen surfaces (balance/brain), ReviewThread, Teleprompter, orphan TaskCard.

## Hardcoded fontSize (bypass `type.size`)

**Count:** ~161 `fontSize: N` literals in same scope.

High-signal:
- Creator tabs: index 24/22/15/14/13/12; calendar 24/16/15/13/11; profile 30/22/17/15/13/12
- assignment: 26/16/15/14/12; task: 26/15/13/12; record: **96** countdown + 18/16/15/14/13/12
- balance: 28/24/18/16/15/14/13/12
- brain: 17/15/14/13
- TabBar: 10, 11
- Button sizes: 17/15/14 (local SIZE map, not `type.size`)
- EmptyState: 18/15; StatusChip: 13; Teleprompter: 26/22/17/14/13/12

## Magic spacing (no `space.*`)

| Pattern | Where |
|---|---|
| Tab clearance 96 / 110 / 116 | creator Home/Profile 96; creator Calendar 110; admin tabs 116 |
| TabBar `left/right: 16`, `bottom: 22` | TabBar.tsx 84–86 |
| Screen pad 24/16/24 | Screen.tsx 66–68 |
| Bare gap 8/10/12/14, padding 14/16 | most StyleSheets |

---

# 10–13. Cross-cutting

## Unreachable / dead UI

| Item | Status |
|---|---|
| `app/(creator)/task/[id].tsx` | No `router.push` from creator UI |
| `app/(admin)/kitchen-sink.tsx` | Not linked; not in Stack options |
| Admin Trends tab | `href: null`; no in-app link |
| Home bell | Rendered, no onPress |
| Profile Notifications / Posting windows / Contact support / Privacy | Chevrons, no handlers |
| Photo carousel Create | Alert stub only |
| Orphan components | TaskCard, Dropdown, PostRow, PostPager, MiniStat, AreaChart, SplitBar |
| `nextCreatorAction` "Mark recorded" | Never shown on task screen |

## Known unfinished / broken UX

| Issue | Where |
|---|---|
| Photo carousel posting | assignment + task Create alerts |
| Review missing-submission copy says "video" for slideshow | `review/[id].tsx` |
| Filter-empty queue has no empty state | admin index |
| Dual format naming | Reel/Slideshow vs Video/Photo carousel |
| Dual status wording | `"Changes needed"` vs Calendar `"Changes"` |
| Legacy warm palette on Balance / Brain / ReviewThread | vs token blue system |
| `pinned_day` still shown on Create cards | rebuild is stopping writes |
| Invite creators | Settings copy points to Settings; no invite UI beyond social status list |
| No KeyboardAvoidingView on comment/brief editors | ReviewThread, BriefEditSheet |

## Format divergence summary

| Screen | Diverges? |
|---|---|
| Home, Calendar (creator), Assignment, Task, Record | YES |
| Review (admin) | YES (major) |
| Create + BriefEditSheet | YES |
| Queue, Calendar (admin) | pill/glyph only |
| Profile, Balance, Creators, Analytics*, Settings, Brain, Trends | NO (*label strings only) |

---

*Generated from code inventory. Prefer this file over `design/full.md` for as-built UI; prefer brief-rebuild flags over redesigning Create/Record/Teleprompter/BriefEditSheet as final.*
