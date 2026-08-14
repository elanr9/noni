# Screens — Noni creator app

Source of truth per screen (project paths). All measurements at 390×844, 24px gutters unless noted. Every screen below exists and runs in `ui_kits/creator-app/index.html`.

---

## 0. First sign in

### Invite modal (`SetupScreen.jsx › InviteModal`)
Scrim `--scrim` over the whole phone; centered white card (radius 24, `--shadow-raised`, padding `30 24 24`, text centered) entering translateY(16)+scale(0.97)→1 over 240ms.
- 64×64 radius-20 `--blue-100` tile with the company initial (`800 26px` `--blue-700`).
- Title `700 24px/1.2 display` −0.5px: `You've been invited to join FieldVision AI's team`.
- Body `400 15px/1.5` `--slate-500`: `You record, FieldVision AI handles editing, posting and payouts.`
- `Button lg block` **Accept invite** (margin-top 22); caption `400 12px` `--slate-400`: `Joining as a creator`.

### Get set up (`SetupScreen.jsx › SetupHome`) — Home tab while onboarding
Header: Wordmark (19, capsule) left, message icon right. Title `700 30px` **Get set up**, sub `Three steps and your queue unlocks.` ProgressBar (bar variant) + `0 of 3`.
Three step cards (white, radius 18, `--shadow-card`, padding 18, 40px `--blue-100` icon circle, "To do" pill `--blue-100`/`--blue-700` with 6px dot), in this order:
1. **Connect your bank** — `Where your payouts land, every Sunday at 8PM Eastern.` (dollar-sign)
2. **Connect accounts** — `Link TikTok and Instagram so we can post for you.` (link)
3. **Warm them up** — `Scroll and like for a few days so your accounts look human.` (zap)
Pinned CTA: `Button lg block icon=dollar-sign` **Connect your bank** at bottom 96 (above tab bar).
While onboarding, Posts and Analytics render their empty states; Profile renders the fresh state.

---

## 1. Home (`HomeScreen.jsx`)

No segmented control. Column, gap 14, padding `14 24 108`:
1. **Header row**: Wordmark(19, capsule); right cluster gap 16 = messages icon (23, `--ink`, 9px `--accent` unread dot, 2px white ring — tap → Messages) + bell (23).
2. **Welcome**: `700 28px/1.12 display` `Welcome back, Fabri.`; sub `400 15px` `--slate-500` = `1 to fix, 1 left to shoot.` / `{n} left to shoot today.` / `All shot for today.` / `{n} planned.` (other days) / `Building your day…` (loading).
3. **WeekStrip**: 7 cells (flex1, radius 16, white/`--accent` selected). Dots under each date are **status-colored for today** (from the live queue): assigned `--blue-300`, submitted/recorded/changes `--amber`, posted/approved `--green`; done past days all green.
4. **PostPager**: pill track (`--fill-quiet`, padding 3) with one pill per slot, label = post time, leading 7px status dot (same colors). Selected pill white + `--shadow-card`.
5. **PostCard** — `MediaCard variant=hero fill` filling all remaining height (screen never scrolls). On-media, top-left: **FormatTag + TypeTag** (color-coded chips, see README) — these REPLACE MediaCard's default white chip via its `chips` prop. Duration pill bottom-right. Title on the scrim, 2-line clamp. No time pill.
   Footer (padding 12) by status:
   - **assigned** → `Button lg primary icon=video|images` **Record**/**Create** (flex 1) + `Button lg tint icon=rotate-ccw` **Swap** (today only).
   - **submitted/recorded** → amber chip `In review` + `Sent for approval` + ghost `See it`.
   - **posted/approved** → green chip `Posted` + views + ghost `See it`.
   - **changes_requested** → amber chip-button **Changes requested** (tap → Messages) alone on its row, then one row: `Button md` **Fix it** (flex1, nowrap) + `Button md tint icon=message-circle` **See feedback** (flex1). No note text on the card.
6. **Auto-advance**: when the queue changes and the visible slot is no longer open (open = assigned | changes_requested), the pager jumps to the first open slot; dots recolor live.
7. Toasts (dark `--ink` pill, bottom 104, 2400–2600ms, `noni-toast-in`): `Swapped in "{title}".` · `Sent for approval. It posts once approved.`

### Swap sheet (`CreatorShared.jsx › SwapSheet`)
Bottom sheet, **height 88%**, radius 24 top, grabber, slides up 240ms. Title `Swap this reel|slideshow` `700 22px`; sub `The rest of this brief's post library.`; 34px ✕ circle. Body: scrolling **full-width rows** (white card, radius 18, padding 12): 52×70 thumb, title `700 14.5px` , FormatTag + `@handle · views`, chevron. Footer ghost `Keep what I have`.
**Preview modal** (tap a row): scrim inside the sheet; white card radius 24, padding 14: `PreviewMedia` 280px dark frame — playable for reels (54px play/pause), **scrollable for slideshows** (SlideNav: arrows + dots + per-slide tint), FormatTag top-left, duration pill top-right, hook/title lower third; then title, `@handle · views`, the "why it works" line; buttons: `Button md block icon=check` **Use this post** + ghost **Back**. Picking replaces the slot in place (title, format, type, duration, trend) and closes everything.

---

## 2. Task detail (`TaskDetailScreen.jsx`) — mode=detail, tab bar hidden, slides in from right

NavBar (back chevron, centered `Task`). Then, top to bottom (gap 12, no scroll):
1. Chip row: `StatusChip` + FormatTag + TypeTag + `Posts {time}`.
2. Title `700 24px/1.18 display` −0.5px. **No summary sentence.**
3. Example player, centered, **true post dimensions**: `aspect-ratio 9/16` for reels, `4/5` for slideshows, height = all remaining space, radius 24, `--shadow-media`. Source pill top-left (`@handle · views`). Tap toggles play (bg → `--ink-900`). Reels: bottom progress bar + duration. Slideshows: **SlideNav** (arrows, dots, per-slide tint, slide text from the script blocks) and no progress bar.
4. Pinned CTA block: `Button lg block` **Record** / **Create slides**. (No caption line below it.)

---

## 3. Record — reels (`RecordScreen.jsx › ReelCapture`) — dark, slides up

One clip per script block (`script.split('\n\n')`). Phases: idle → countdown → recording → between → (…repeat) → processing → review.
- **Top**: per-clip segmented progress (3px gaps): done clips white, current fills `--accent` by elapsed/20s. Header: `Close` left; `Clip {n} of {N}` pill right. **No title.**
- **Prompt area** (top 46): hook and CTA clips → `TeleprompterOverlay` — transparent (NO scrim band), micro-label `TELEPROMPTER` + `(This won't show on the video)`, text `600 26px/38px` centered, spoken words 45% white, current word `--accent-tint` 800; tap pauses. Middle clips → **Talking point** header instead: label `TALKING POINT` + `(Say it your way, this won't show on the video)` + the point `700 24px/1.35 display` white. Clip kinds come from `task.clips[]` (`hook | point | cta`); fallback: first=hook, last=cta, middles=point.
- **Pre-placed assets** (visible in idle + recording): 86px picture-in-picture card right side (gradient, play glyph, dark caption strip naming the asset, e.g. `SCREEN RECORDING`) — only when `task.asset` exists; and the campaign manager's **per-clip on-screen line** (`task.onScreen[clip]`) lower third, `800 19px display`, white, text-shadow.
- **Idle bottom**: one row = round **Flip** icon button (switch-camera) · speed pills 0.75×/1×/1.25×/1.5× (active `--accent`) · round **Flash** icon button (zap). Under it: `Finish with {n}` translucent pill (left, only when takes exist) · 84px shutter · `{n} clips left`.
- **Recording bottom**: elapsed `800 18px` · 76px stop (28px radius-6 `--accent` square) · `Stop saves this clip`.
- **Between clips** (after stop): bottom panel slides up over a dark gradient: 46×62 clip thumb (white border, play glyph), `Clip {n} saved · 0:12` + `{n} clips to go.` / `That was the last one.`, clip-progress dots, then **Redo clip** (translucent) + **Next clip** / **Process post** (accent).
- **Processing**: dark, 54px spinner ring (`noni-spin` 900ms), `Processing your post…`, sub `Stitching {n} clips, adding your assets and captions.` Auto → review after ~2s.
- **Review** (`ReviewPost`): dark; header `Retake` / `Review`. 9:16 preview card centered (clip progress segments, big play toggle, on-screen line). Bottom white sheet (radius 24 top, slides up): label `AUTOFILLED FROM THE BRIEF`, title `700 19px`, FormatTag + TypeTag, `CAPTION` label + caption text, then `Button lg block icon=send` **Send for approval** → status becomes submitted, back Home, toast.

## 3b. Record — slideshows (`SlideshowCreate`) — light screen

Header: `Close` + FormatTag. Title = task title; sub `Add a photo for each slide. The text is already on them.` One row per slide (white card): 62×82 upload tile (dashed `image-plus` → filled gradient + check) + `SLIDE {n}` label + the slide's text (pre-filled from the script). Pinned CTA: `Add photos · {x} of {y}` (fills the next tile) → `Process slideshow` when complete → processing → review. Review preview is **slide-scrollable** (arrows + dots), `Edit photos` instead of Retake.

---

## 4. Posts (`PostsScreen.jsx`)

Header `Posts` `700 30px` + 3-way view toggle: **calendar / briefs / list** (calendar-days · layout-grid · layout-list). Account pills Instagram/TikTok (multi-toggle filter). 
**Changes banner** (any queue item in changes_requested): full-width `--amber-soft` row under the pills — `Changes requested` `700 13.5px --amber` + post title + chevron → Changes detail.

### Calendar view
MonthGrid card (July 2026, firstWeekday 3, ≤3 dots/day, selected `--accent`, today tinted) + day list of PostRows.

### Briefs view (`BriefsList`)
One card per week (white, radius 18): `WEEK {n} · {range}` micro-label + status pill (`This week` blue / `Paid` green, 6px dot), brief name `700 17px display`, stat row: `{n} posts · 👁 views · ⚡ likes · $earned` (green, right) + chevron. Tap → **Week detail** (`WeekDetail`, slides right): back + `Week 3 · Jul 27 to Aug 2` + brief name + status pill; 3 stat cards (Views / Likes / Earned-or-Paid, green money); `Posts, best first` list of PostRows sorted by views.

### List view
Sort dropdown (Newest / Virality / Likes / Views) + PostRow list with dates.

### PostRow (every list)
White card, 40px thumb, meta row (platform icon · date · time · `Top {n}%` green chip when virality ≥ 90), 1-line title, views + likes, earnings line: `$61.80` green + progress bar + `12k views to $80` (CPM 1.5, $20 tiers). **Tappable → Post detail.**

### Post detail (`PostDetail`, slides right)
Back + `Post`. Scrolling column: 330px dark media card (FormatTag top-left, Top% chip top-right, play toggle for reels, **SlideNav slide scrolling for slideshows**, title lower third) · title + `Posted 29 Jul at 08:30 · @handle` · **platform switcher** (segmented TikTok | Instagram — every post lives on both; numbers re-derive per platform, 68/32 split) · 2×2 stat grid **Views / Likes / Saves / Earned** (earned green) · tier progress card (`{n} views to ${next}`) · two link rows: **Open on TikTok** and **Open on Instagram**, each with its @handle and arrow.

### Changes detail (`ChangesDetail`, slides right)
Back + `Changes requested`. Post summary card (thumb, title, FormatTag + TypeTag). Divider pill `Revisions for this post`. The revision thread for THIS post only (chat bubbles: manager note, voice note, creator reply — same bubble vocabulary as Messages). Pinned accent CTA **Record changes** (video/images icon) → straight into re-record; resubmit via the normal review → Send for approval.

---

## 5. Analytics (`GrowthScreen.jsx`)

Unchanged from the running source: metric dropdown, 7D/30D/90D range, hand-drawn SVG area chart (420ms clip-path reveal), 3 mini stats, TikTok/Instagram split bar. Never scrolls.

---

## 6. Messages (`MessagesScreen.jsx`) — mode=messages, slides right, tab bar hidden

Header: back circle, 40px company avatar, `FieldVision AI` + `Campaign manager · Sasha`. Thread (scrolls, gap 14) using the campaign-manager-app chat vocabulary:
- Day divider pills (`Monday`, `Today`).
- Bubbles: manager left with 28px avatar + `Sasha · 10:12` label, white card radius `18/18/18/6`; creator right, `--accent`, white text, radius `18/18/6/18`, `--shadow-accent`.
- Rich content inside bubbles: **post reference card** (icon + `3 numbers that decide Sunday · Slideshow` + chevron), **voice note** (30px play circle + 16-bar waveform + duration), **quoted reply** (3px bar + author + one-line excerpt).
- **Record changes bar** (only while a post is in changes_requested): pinned above the composer — post title + `Fix it and it goes back for approval.` + accent pill **Record changes** → re-record flow.
- Composer: rounded input `Message Sasha`, mic circle, accent send circle. Sending appends a bubble.

---

## 7. Profile (`ProfileScreen.jsx`) — scrolls

1. **Role switcher** pill top-left: 24px company tile + `FieldVision AI Creator` + chevrons-up-down; popover (pop 160ms) listing `FieldVision AI Creator` ✓ and `FieldVision AI Campaign Manager`.
2. Identity row: 68px avatar **button** with a 26px `--accent` camera badge (upload profile picture); name `700 21px`; sub `@handle` (or `Tap the photo to add one` when fresh); outline `Edit`.
3. **Current earnings** card: `--blue-100`, radius 20: `CURRENT EARNINGS` micro-label `--blue-700`, amount `800 32px` ink, sub `Pays out Sunday at 8PM Eastern` (fresh: `$0.00` / `Connect your bank to get paid`), white chevron circle.
4. Groups (white cards, hairline rows): **Your accounts** (Instagram/TikTok ConnectRows — `Connected` chip or `Connect` button) · **Inbox and setup** (Messages w/ unread badge → Messages; Account setup, sub `Name, bio and verification`) · **Settings** (Switch to campaign manager, Notifications, Contact support) · **Legal** (Privacy and terms, Delete account in `--danger`).
5. Ghost **Sign out** + footer `Signed in as creator · FieldVision AI · Noni 1.4.0`.

---

## 8. Shared: SlideNav (`CreatorShared.jsx`)

The slideshow scroller used EVERYWHERE a post is viewed (task example, swap preview, post detail, record review; the campaign manager app mirrors it on its review/approval/creator-post screens): round arrow buttons (34px, only within bounds), tappable dots bottom-center (active 16×6), per-slide background tint crossfading 240ms, optional per-slide text. Dark and light variants.
