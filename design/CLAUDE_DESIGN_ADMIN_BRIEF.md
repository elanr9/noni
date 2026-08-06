# Noni — Admin rebuild redesign brief for Claude Design

You already designed the Noni creator app (`ui_kits/creator-app`, `design_handoff_creator_app`). That design shipped. The admin app has been **functionally rebuilt** in code (see `noni-build-final.md`, `HANDOFF.md`, `app/(admin)/`). Your job now: **redesign every admin surface so it is beautiful, fast, and on-system** — same product, same design system, higher craft.

This brief overrides `design/CLAUDE_DESIGN_ADMIN_BRIEF.md` history and the older Queue/Trends tab model. **Code + `noni-build-final.md` win** when docs disagree.

---

## 1. The one rule

**The creator app design system is law. Extend it, never reinvent it.**

- Reuse tokens from `theme/tokens.ts` and the creator handoff: colors, type, spacing, radius, shadow, motion. No new hex without a one-sentence defense.
- Primary buttons / CTAs: `#1BA6EE` (`blue500` / `accent`). Baby blue `#8EC9F5` (`blue300` / `accentTint`) is tint only — never white text on it.
- Backgrounds: white + off-white `#F7FAFD`. Ink `#0F1720`. Soft status chips only.
- Reuse / extend existing components (Button, Icon, StatusChip, EmptyState, TabBar, MediaCard, charts, skeletons, SheetShell). New components only when nothing fits.
- Motion: 240ms surfaces, 160ms color, 90ms `scale(0.97)` press, 420ms chart draw, 1400ms skeleton shimmer, easing `cubic-bezier(0.22,0.61,0.36,1)`.
- Frame: 390×844 iPhone, safe areas, primary actions in thumb reach. Floating pill TabBar (BlurView), same treatment as creator.
- Copy: short, direct, sentence case, no emoji. Buttons say what happens. Real FieldVision / college soccer copy — never lorem.
- Formats everywhere: **video (Reel)** and **photo_carousel (Slideshow)**. Never video-only.

---

## 2. Who the admin is

A founder/marketer who opens the app a few times a day to clear queues and author ~30 briefs a week. Not living in the app. Optimize for:

1. **Triage speed** on Review (approve submissions, music, account gates).
2. **Authoring flow** on Briefs (week setup → grid → post editor → AI review → publish).
3. **Glanceable oversight** on Creators, Library, Analytics.

After Approve on a submission, edit/post/track is automatic. Design should feel like “Approve and it’s live.”

---

## 3. Product context (as built)

Pipeline: **author week → publish to creators → creators record → admin approves → auto edit → Upload-Post → track.**

Admin tabs (live): **Review · Briefs · Library · Creators · Analytics**

Hidden but reachable: Calendar (view toggle inside Briefs), Settings (gear from Analytics), Trends (orphaned — do not prioritize).

Push screens: Review detail, Creator detail, Creator post, Chat, Account approval, Account template, Brand Brain, Features, Week setup, Week grid, Post editor.

Tenant mock world: **FieldVision AI** (college soccer recruiting tech). Every example post plugs the product inside one talking point (never a standalone ad beat).

---

## 4. Screens to redesign (full inventory)

Design every state: default, loading (skeleton), empty (real copy + next action), error where relevant. Both Reel and Slideshow variants wherever media appears.

### 4.1 Review tab — `app/(admin)/(tabs)/index.tsx`

Three queues in one tab (segmented or stacked — make it beautiful and scannable):

1. **Post submissions** — newest first; badge on tab = queue length. Row: avatar, name, 9:16 thumb, format chip (Reel / Slideshow), title, time, status. Tap → review detail.
2. **Music approvals** — slideshows only; one-tap confirm after glance. Fast lane (~10/week).
3. **Creator account approval** — once per creator; pending / needs_changes / approved.

Empty: “Nothing to review” + what happens next.

### 4.2 Review detail — `app/(admin)/review/[id].tsx`

Most important triage screen.

- **Video:** player + script / segments / talking points for delivery check. Per-segment approve or reject with comment (rejected clip returns to creator; others untouched). Show `attempt` on redos.
- **Slideshow:** swipeable slides + caption; no fake video chrome.
- Actions: **Approve** (primary `#1BA6EE`), **Request changes** / reject clip with note. Post-approve confirmation: automation takes over (edit + post at schedule).
- Entry to chat thread for that creator/post.

### 4.3 Account approval — `app/(admin)/account-approval/[accountId].tsx`

Review Instagram/TikTok screen recordings + profile screenshots. Status machine: pending → needs_changes → approved. Structured reason on needs_changes. Capture handles at approval (linking moment). College soccer feed requirement visible in UI.

### 4.4 Account template — `app/(admin)/account-template.tsx` (from Settings)

Company-scoped: bio (one-tap copy), profile picture (one-tap download), example account screenshot. Creators see this on account setup — design both ends consistently.

### 4.5 Briefs tab — `app/(admin)/(tabs)/create.tsx`

Week authoring home. View toggle: **Grid | Calendar** (Calendar is not a separate tab).

- Progress switcher: `Videos 7/20` · `Slideshows 3/10`
- Rows: one per post (all 30 exist from week creation). States readable while scrolling, no legend: **empty · partial · filled-unreviewed · complete**
- Empty row shows pre-stamped type + suggested search phrase (kills blank page)
- Actions: New week, Publish (disabled with count until all complete), open post editor
- Publish rules: before Sunday 8PM EST → scheduled notify; after → immediate

### 4.6 Week setup — `app/(admin)/week-setup.tsx`

Only stepped ceremony in the product (once a week). Three steps:

1. Ratio — video count / slideshow count (defaults 20 / 10)
2. Video type split — must sum to video count (defaults: numbered_list 8, talking_head 5, explainer 3, contrast 2, replay_bait 2)
3. Slideshow type split (defaults: numbered_tips 5, how_to 3, getting_started 2)

Pool not lock — types remain editable later; grid header shows drift.

### 4.7 Week / grid — `app/(admin)/week/[id].tsx` + `components/admin/grid/`

Full week grid polish: type chips, kill_reason empty slots, live split header, publish CTA.

### 4.8 Post editor — `app/(admin)/post/[id].tsx` + `components/admin/editor/`

Authoring workhorse. Fields:

- Hook (≤9 words) from 8–10 generated options, best first
- Talking points (count from post type) — spoken only; plug inside one point
- CTA / plug (traceable to approved product feature)
- Caption (<200 chars excl. hashtags), hashtags 3–5
- Example URL from Library
- **Segments** (render manifest): hook / point / outro / slide — overlay_text, show_on_screen, screenshot_url

AI assist per field + fill-whole-post. Nothing auto-generates on open.

**AI Review step** (in editor, not background): overall + per-section scores (hook, points, CTA), accept/edit/ignore suggestions, confirm → complete. Never blocks; never silently edits.

Type picker, Fill sheet, Review sheet, Segments section, Hook options, Points editor — all need visual polish as one coherent editor, not a form dump.

### 4.9 Calendar view — `app/(admin)/(tabs)/calendar.tsx` + `CalendarView` / `DayDetailSheet`

Week oversight across creators; opened as toggle from Briefs. Compact task cells, format chip, status, day detail sheet.

### 4.10 Library — `app/(admin)/(tabs)/library.tsx`

One tab, four chips: **Ideas · Our posts · References · From creator**

- Ideas: quick capture text field pinned top (enter to save; multiline paste = multiple ideas). No sheet/form.
- References: paste link → thumbnail
- Our posts: performance-first (top last 60 days), search/filter by creator, type, date
- Library picker sheet from post editor (filtered by type)

### 4.11 Creators — `app/(admin)/(tabs)/creators.tsx` + `creator/[id].tsx` + `creator/post/[assignmentId].tsx`

- List: card per creator — money, posts, views + sort
- Detail: Instagram-style profile — stats, calendar/grid toggle of posts
- Post detail: media, caption, views/payout/saves/likes/comments
- Chat entry top-right → `chat/[creatorId]` (one thread per creator; post refs inline). Same thread as Review chat.

### 4.12 Chat — `app/(admin)/chat/[creatorId].tsx` + `components/ChatThread.tsx`

Clean messaging UI; post reference bubbles; scroll-to-post from Review.

### 4.13 Analytics — `app/(admin)/(tabs)/analytics.tsx` + `TimeSeriesChart`

Views/revenue, per-creator totals, best hooks. Reuse creator chart language. Gear → Settings. No dashboard bloat.

### 4.14 Settings — `app/(admin)/(tabs)/settings.tsx`

Roster, invites, company basics, account template link, sign out. Reachable from Analytics gear.

### 4.15 Brand Brain — `app/(admin)/brain.tsx`

Doctrine docs (Product / Audience / Voice / Learnings), source accounts, search terms. Editable long text + AI draft. Fix any legacy cream/orange leftovers to the blue system.

### 4.16 Features — `app/(admin)/features.tsx` + `FeatureEditSheet`

Approved product claims/features the plug must trace to. Admin CRUD, clear approved vs rejected.

### 4.17 Music approval row — `components/admin/MusicApprovalRow.tsx`

Compact, one-tap, beautiful in the Review queue.

---

## 5. Post types (must appear in UI)

| type | family | notes |
|---|---|---|
| numbered_list | video | hook + N + outro |
| talking_head | video | hook + N + outro |
| explainer | video | hook + N + outro |
| contrast | video | single speaker, two sides |
| replay_bait | video | one short loop clip; no plug/credential |
| numbered_tips | photo_carousel | one slide per point |
| how_to | photo_carousel | one slide per point |
| getting_started | photo_carousel | one slide per point |

Clip/slide count is **derived** — never a human field.

---

## 6. Priority order

1. Review tab + Review detail (both formats) + music + account approval — daily loop
2. Briefs grid + Week setup + Post editor + AI Review sheet — weekly authoring loop
3. Library + Library picker
4. Creators profile + Chat + Creator post
5. Analytics + Settings + Account template
6. Brand Brain + Features
7. Calendar view polish (inside Briefs)

---

## 7. Deliverables

Match the creator handoff format:

- Running kit `ui_kits/admin-app/` with `index.html` and `all-screens.html` at 390×844, shared tokens/components.
- Extended components in `components/` alongside existing ones.
- Handoff bundle `design_handoff_admin_app/`:
  - `README.md` — every hex, px, weight, radius, shadow, duration, copy string, state (verified from source)
  - `CURSOR_PROMPT.md` — paste-into-Cursor implementation prompt (preserve Expo stack, tokens verbatim, stage-by-stage, stop-and-ask list)
  - `screenshots/` — numbered PNGs per screen/state

Also update any screen that currently looks like a scaffold so the handoff can be implemented without inventing layout.

---

## 8. What NOT to do

- Do not redesign the creator Today / Record / Profile flows unless a shared component must change (call that out).
- Do not invent a Trends tab as primary nav.
- Do not make Calendar a fifth tab.
- Do not introduce purple gradients, cream+terracotta, newspaper layouts, emoji, or generic AI dashboard chrome.
- Do not hardcode video-only assumptions.
- Do not change product rules in §4–5 — beauty only; behavior stays.

---

## 9. Read in repo before designing

1. `theme/tokens.ts`
2. `noni-build-final.md` (product truth)
3. `HANDOFF.md` (as-built agent notes)
4. `design/screen-handoff.md` (navigation + discrepancies; code wins)
5. Live screens under `app/(admin)/` and `components/admin/`
6. Existing creator kit / handoff if available in the design folder for token parity
