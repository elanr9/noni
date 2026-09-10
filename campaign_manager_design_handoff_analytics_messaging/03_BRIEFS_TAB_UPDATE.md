# Briefs tab update — implementation handoff

Read `00_START_HERE.md` first for the product, codebase and design language. This document covers the Briefs tab rework and manager messaging, designed August 14, 2026. Every screen described here has a working reference in `reference_ui/` (FirstWeek.jsx.txt is the board with all 13 phones; open `ui_kits/admin-app/first-week.html` in the design project to see them rendered). Values not mentioned here are unchanged from the earlier handoff docs.

## What changed, in one paragraph
The Briefs tab is a list of week cards: Next week always on top, past weeks below it, newest to oldest. New accounts get a first-run screen with one action, Start week 1. Past weeks open into a browsable archive with days and per-post sales. A messages button sits top right on every Briefs surface and opens Slack-style messaging: one group chat per brief plus manager DMs, with voice notes, uploads, replies and forwards. In the post editor, each talking point can carry a screenshot or screen recording (with green screen placement) and story-style overlay text, edited in a full-screen composer.

## 1. Briefs tab (`FirstWeek.jsx.txt` + `BriefsScreen.jsx.txt`)

**First run (no week yet).** Header + one card: layout-list icon in a blue circle, title `Start your first brief!`, primary button `Start week 1` into week setup. Nothing else on the screen.

**Week list.** One card per week:
- Top card is always the next week: label, range, `Next week` chip (blue tint), copy `Not planned yet. Opens Sunday, tap to start it.`
- Past weeks below, most recent first. Status dot before the range: orange = in progress (current week only; a past week is never in progress), green = complete. Complete cards show stat pills instead of lane counts: `52K views/day`, `$1,240 sales`, `30 posts`. Manager avatar stack top right. Whole card opens the week.

**Opened live week** (`BriefsScreen.jsx.txt`, pass `sel`): lane cards (Videos n/20, Slideshows n/10), then type chips, then the 30 rows. Type chips are now FILTER BUTTONS (`SplitHeader`): tap to show only that type, tap again to clear; each chip shows `done/total` in amber while short, green with a check icon at target; active chip gets blue border + blue-50 fill. Filter resets on lane switch.

**Opened past week** (`PastBriefScreen`): stat cards (Views/day, Sales in green, Posts), a horizontally scrolling day-chip row (weekday, date, `N posts` — each opens the day), an All/Videos/Slideshows segmented filter, then every post: thumb, title, creator, format, day, views, sales. Footnote: sales render only when sales tracking is on in Settings.

**Day detail** (`BriefDayScreen`): header `Tuesday, Aug 18` + `Week 1 · 5 posts · $212 in sales`; one row per post with creator avatar, thumb, title, views, sales.

## 2. Messaging (`Chat.jsx.txt` + `MsgButton` in `AdminShared.jsx.txt`)

**Entry.** `MsgButton` (38px white circle, message-circle icon, blue unread badge) sits in the header of EVERY Briefs screen: first run, week list, opened week (push header), empty state, calendar. It opens Messages.

**Messages home.** Two sections: `Brief chats` (one group chat per brief, blue rounded-square layout-list avatar, preview + time + unread pill) and `Direct messages` (one row per manager). No explainer copy between sections.

**Chat screens** (`ChatScreen`): push header with participants, scrolling bubbles, pinned composer (attach button, text pill with mic inside, blue send). Bubble vocabulary, all in `ChatBubble`:
- replies: quoted block (accent bar, sender name, one-line snippet) above the message
- forwards: `share-2` icon + `Forwarded from …` label; can embed a `PostRef` card (video icon, `Post 12 · Numbered list`, chevron) that deep-links to the post
- voice notes: play circle + waveform bars + duration
- uploads: image thumbs with optional caption
- reactions: small white pills under the bubble (heart icon + count)
Own messages are blue, right-aligned; others white, left, with avatar. Group chat = every manager on the account; DMs are one to one. Same components in both.

## 3. Post editor, talking points (`PostEditorSteps.jsx.txt`, `EditorSheets.jsx.txt`)

Each point card stacks:
1. Media row: filled state (thumb + name + clip/slide picker) or dashed `Add screenshot or recording` → camera roll sheet (`ShotPickerSheet`).
2. Green screen row (when the point is a green screen clip and has media): green tint chip `Green screen · fills the background` + placement button (`Top right` etc.) → opens the media composer.
3. Text row: dashed `Add text`, or a black preview strip showing the styled text pill + its position; tap → text composer.

**Full-screen composer** (`OverlayEditor`, one component, two modes) — story-style, like composing a reel; opens on the actual post format (clip for videos, slide for slideshows):
- Chrome: X top left, `Done` pill top right, tool rail down the RIGHT side (42px circles, dark scrim `rgba(16,22,29,0.45)` + blur so they read over light media).
- Text mode: media dimmed behind; a live textbox is ALREADY active in the center (text + caret) the moment it opens; rail = text size (Aa), background-behind-text toggle (A chip), AI rewrite, delete; color swatch row along the bottom (white, ink, blue, green, amber — white ring on the active one). Background on = colored pill with contrasting text; off = colored text with drop shadow.
- Media mode: screenshot/recording rendered at its placement over the creator silhouette; rail = swap media, green screen toggle (green when on), add text, remove; bottom chips `Full / Top left / Top right / Center` (default Top left).

## 4. Week setup (`WeekSetupScreen.jsx.txt`)
Takes a `title` prop (`Week 1 · Aug 17 to 23` on first run). The step-0 subtitle, the stamped-rows info box, and the pool-not-a-lock footnote were removed by design review; do not reintroduce them.

## 5. Collaboration model
All campaign managers on an account see the same weeks and briefs and can fill any row. Manager avatars stack on active week cards. Messaging (section 2) is the coordination surface; presence copy is out of scope for v1.

## 6. Acceptance checklist
- New account: Briefs shows first run; Start week 1 runs week setup titled Week 1 and lands on the empty grid.
- Week list: next week always first; past weeks show green dot + stat pills; only the current week may show orange.
- Type chips filter rows and show amber `n/m` or green `m/m` + check.
- Messages button on every Briefs screen; per-brief group chat + DMs; replies, forwards, voice notes, uploads, reactions all render.
- Talking point: add screenshot or recording; green screen points get placement; add text opens the composer with the textbox already active.
- Sales figures appear only when the account's sales tracking setting is on.
