# Noni admin app — full design handoff

Every admin surface, measured from the running kit in `ui_kits/admin-app/`. Frame 390×844. Tenant in all copy is **FieldVision AI** (college soccer recruiting).

Companion files: `CURSOR_PROMPT.md` (staged build plan — read it before writing code) and `screenshots/`.
Creator app parity: `design_handoff_creator_app/README.md`. Any value not listed here is unchanged from that document.

**Navigation.** Tabs: **Review · Briefs · Library · Creators · Analytics**. Calendar is a view toggle inside Briefs. Settings is the gear on Analytics. Push screens: review detail, revision mode, music approval, account approval, account template, week setup, post editor, creator profile, creator post, chat, Brand Brain, Features.

---

## 1. Foundations

| Token | Value | Used for |
| --- | --- | --- |
| `--blue-500` | `#1BA6EE` | Primary buttons, active lane card, selected radio, step dot, send bubble |
| `--blue-300` | `#8EC9F5` | Tint only — completed dots, progress fill, media glyphs. Never white text on it |
| `--blue-200` | | Chart activity bars |
| `--blue-100` | `#DDEFFB` | AI pills, hashtag chips, avatars, claim chips |
| `--blue-50` | `#F1F8FE` | Selected rows, notes, suggestion blocks |
| `--blue-600` / `--blue-700` | | Text and icons on blue tints |
| `--off-white` | `#F7FAFD` | Screen ground, inner blocks |
| `--white` | | Cards, sheets, chat bar |
| `--ink` / `--ink-900` | `#0F1720` / near-black | Text / review-detail ground |
| `--slate-500 / 400 / 300` | | body grey / meta grey / placeholder grey |
| `--green`, `--green-soft` | | complete, approved, AI score, passing checks |
| `--amber`, `--amber-soft` | | needs review, retakes, split drift, failed checks |
| `--danger`, `--danger-soft` | | rejected claims, sign out |
| Radii | 8 / 12 / 16 / 20 / 24 | `sm` inner blocks, `md` fields, `lg` cards, `xl` media, `2xl` sheets |
| Shadows | `--shadow-card`, `--shadow-accent`, `--shadow-media`, `--shadow-raised` | cards, primary/active, media, sheets |
| Motion | 240ms surfaces · 160ms colour · 90ms `scale(0.97)` press · 420ms chart draw · 1400ms shimmer · `cubic-bezier(0.22,0.61,0.36,1)` | |

**Gutter is 20px** on admin screens (creator app uses 24) — admin surfaces are dense lists.

**Type.** Display font for numbers, titles and headings (`700`, negative tracking); UI font for body, labels and chips. Screen title `700 30px` display. Push title `700 17px`. Card title `700 15–17px`. Body `400 14–15px/1.45`. Label `700 12px` uppercase with `--tracking-label`. Meta `600 12px`.

**Post type colours.** One tint per type so a lane reads by colour before it reads by word. Chip: `padding:5px 10px`, `radius:999`, `700 12px`, nowrap.

| Type | Background | Text |
| --- | --- | --- |
| `numbered_list`, `numbered_tips` | `#E3F2FD` | `#0E6BA8` |
| `talking_head` | `#ECE7FB` | `#5B44B4` |
| `explainer` | `#DFF3EE` | `#0E6E5C` |
| `contrast`, `getting_started` | `#FDEEDC` | `#95560C` |
| `replay_bait` | `#FBE7EF` | `#A03A67` |
| `how_to` | `#E7EAFB` | `#3B4EA0` |

**Media rule (applies everywhere).** Every card that shows a post renders the **real thumbnail** — Reel: first frame; Slideshow: slide 1 — at a fixed box with `object-fit: cover`. Every creator renders the **real profile photo** from the linked account. The blue gradient with a `play` / `images` glyph and the initial-letter circle are loading / missing-asset fallbacks only.

**Fixed heights.** Cards in a scrolling queue are all the same height. Conditional content (retake counts, badges) goes onto the media, never into the body as a fourth chip that wraps.

**Skeletons** shimmer 1400ms; **empty states** always carry a next action or say what will fill them. Both formats — Reel and Slideshow — exist on every media surface.

---

## 2. Review tab — `app/(admin)/(tabs)/index.tsx`

Three queues, one tab. Header `Review` + a count pill (`8 waiting` / `All clear`, green when clear). Subtitle changes with the load: cleared / one left / `Approve and it's live. Editing, posting and tracking are automatic.`

`Segmented` switcher with counts inside it (`Posts 5 · Music 2 · Accounts 1`) so an empty lane never costs a tap. Track `--fill-quiet`, active pill white + `--shadow-card`, count bubble blue when the active lane is non-zero.

**Submission row — fixed 96px.** 54×72 thumbnail (badge bottom-left: duration for Reels, slide count for Slideshows; badge top-left amber `Take 2` when `attempt > 1`), then a column set to `space-between`: creator row (20px profile photo, short name, time), title clamped to 2 lines, one non-wrapping chip row (format · type · clips/slides). Footer note: *Reject a single clip and only that clip goes back.*

**Music row.** 44×58 thumb, title, `creator · N slides · posted`, blue `music-2` line with when it was marked, and an `Approve` button (`variant="approve"`) on the right. One tap after a glance.

**Account row.** 40px avatar, name + Pending/Needs changes chip, both handles, submitted time or the rejection reason. Sent-back accounts appear under a `Sent back` section label.

Empties: `Nothing to review` / `No songs waiting` / `No accounts to approve`, each with the sentence that says what fills it.

---

## 3. Review detail — `app/(admin)/review/[id].tsx`

The most important triage screen. It shows **the post as it will appear on the platform** and nothing about the render manifest.

- Full-width 9:16 frame, `--ink-900` ground. Reel: player surface with a 3px scrubber at `bottom:148` and `0:13 / 0:52`. Slideshow: real slides in the same box, overlay text centred `800 25px/1.26` display, dot pager at `top:62` (active dot 18px wide), glass 34px arrows, `Screenshot` chip when a slide has one.
- Top scrim bar: 36px glass back button, `Take 2` amber pill when applicable, `1 of 5`, glass chat button.
- Bottom scrim: creator photo, `@handle`, `type · age`, format chip, caption, hashtags — the platform layout, not a form.
- White action strip: **Request changes** (outline, 46%) + **Approve** (primary, `check`). Two actions, no more.
- **Approved overlay:** green check, `Approved`, `{title} is out of your hands. Noni takes it from here.`, then the three automatic steps (Reel: stitch → post at slot time → track. Slideshow: assemble → post with auto-add music on TikTok, silent on Instagram → creator adds the song, then one tap back here). Primary `Next in queue`.

**Revision mode** (Request changes) — `Segmented`: *Section by section* | *Whole post*.
- Section by section: one card per spoken segment plus the caption. Tap a card → a `--blue-50` note box opens under it with a textarea and Cancel / Save note. Saved notes render as a blue block with the note and an `x`; the card border turns `--blue-500` and the label reads `Note added`. Only noted sections go back.
- Whole post: one textarea, one re-record.
- Footer: Cancel + `Send back · N notes` (disabled at zero).
- Sent confirmation: `Sent back` + *{creator} gets this post back with your notes on the sections you marked. Nothing else has to be re-recorded.*

---

## 4. Music approval — `app/(admin)/music/[id].tsx`

Slideshows only. Slide frame, then a `--blue-50` card: *{creator} says the song is added* + when. Two link rows (Open on TikTok / Open on Instagram with the handles). Footer: `Not on it yet` (outline) + `Song is on it` (approve). Note: *Approving unlocks this post's earnings. Videos never enter this queue.* Confirmation: `Song approved`.

---

## 5. Account approval — `app/(admin)/account-approval/[accountId].tsx`

Once per creator, and the same moment as handle linking. States: pending → needs_changes → approved.

Creator card (46px photo, name, credential, status chip). If sent back, an amber card with the structured reason and note. **Warm-up proof**: Instagram scroll and TikTok For You rows with the required length and the recorded length as a media badge, plus a profile-screenshots row (two 38×50 thumbs). **The feed test** card: *For You has to be college soccer and recruiting. A cold or off-topic feed throttles every post this creator will ever make.* with `Feed checks out` / `Wrong content`. Approving reveals **Handles to link** (TikTok + Instagram, captured on approval — Upload-Post cannot post to an unlinked account). Rejecting reveals four structured reasons (feed / age / bio / proof) plus a free-text box. Footer: `Send back` + `Approve and link`.

**Account template** (from Settings) — company-scoped, and the creator sees the same values during setup: bio with one-tap Copy, profile picture 1080×1080 with Download, link in bio with copy, and one example account card (`This is the bar. Same bio shape, same grid, no gym content.`).

---

## 6. Briefs grid — `app/(admin)/(tabs)/create.tsx`

Header `Briefs` + `Week 14 · Aug 10–16`, trailing grid/calendar toggle (36×32 pills, active white + `--shadow-card`).

**Lane switcher.** Two cards, `gap:10`, `radius-lg`, `padding:14`. Active `--blue-500` + `--shadow-accent`, inactive white. Icon 15 + label `700 13px`; count `700 26px` display with `/ target` at `700 17px`, 60% opacity; 5px progress rail.

**Split header.** Chip row from the week pool. A type that drifts from plan gets an amber border and shows `actual/planned`. This is the only place drift is reported.

**Row states** (all 30 rows exist from week creation):

- `empty` — dashed `1.5px --line-strong`, transparent. Stamped type chip + the suggested search phrase in quotes with a `search` icon, trailing `plus`. This is what kills the blank page.
- `partial` — white card, title + type chip + grey `600 12px` progress (`Hook and 3 of 5 points`).
- `filled` — amber `700 12px` **Needs review**.
- `complete` — green `700 12px` **AI score 88** + green `circle-check-big` 19.
- `killed` — `--fill-quiet` block, `Left empty on purpose` + reason. Killing beats padding.

Card `padding:14`, `radius-lg`, index `700 12px --slate-300` in a 20px column, title `700 16px/1.3` display. Format is **not** repeated on the row — the lane states it.

**Footer state machine — the admin works one week at a time:**

1. **In progress** → no buttons. White status strip: blue count bubble + `N posts left this week. Publish opens when all thirty are complete.` **New week is not offered.**
2. **All thirty complete** → primary `Publish to creators` + `Before Sunday 8:00 PM EST, so creators are notified on schedule.` (after the cutoff: `Creators are notified immediately.`)
3. **Published** → outline `Start week 15` + `Week 14 is with the creators. Next week opens now.`

No week yet → `EmptyState` `layout-list`, `No week yet`, action `Start week`.

**Calendar view** (toggle, not a tab) — one card per day: weekday + date column, then compact task cells (status dot, title, format glyph, creator). Rest days say `Rest day`. Tapping a day opens a sheet with the day's posts, format chip, status label and creator avatar.

---

## 7. Week setup — `app/(admin)/week-setup.tsx`

Three screens, once a week — the only stepped ceremony besides the editor. Dots progress, `Step N of 3`.

1. **This week's mix** — two ratio cards with 34px round steppers. Defaults **20 videos / 10 slideshows**. Blue note `30 rows will be stamped and ready to fill`.
2. **Video types** — must sum to the video count. Defaults `numbered_list 8 · talking_head 5 · explainer 3 · contrast 2 · replay_bait 2`.
3. **Slideshow types** — defaults `numbered_tips 5 · how_to 3 · getting_started 2`.

Sum banner green when matched (`8 of 8 videos assigned`), amber when not (`2 over. Take 2 off a type.`). Next disabled until it matches. Standing footer line: *This is a pool, not a lock.*

---

## 8. Post editor — seven steps — `app/(admin)/post/[id].tsx`

**Not a long form.** One decision group per screen. The post type is **locked** (stamped at week setup), shown as header meta `Numbered list · Week 14`. No type picker. No "why this works".

Shell on every step: back chevron, `Post 04`, type meta, trailing **Save progress** (`700 13px --blue-600`, exits leaving the row `partial`); step dots (7 bars 6px tall, current stretches to 26px `--blue-500`, past `--blue-300`, future `--line-strong`) with `Step 3 of 7 · Hook`; `h1 700 28px` display + one line of intent; footer **Back** (ghost 30%) + **Next** (primary), replaced by **Save post** on step 7.

| Step | Content | AI |
| --- | --- | --- |
| 1 Title | Optional, `700 20px/1.3` display, grey `Untitled post` when unwritten | `Fill with AI` → fill sheet (whole post, claim → phrase → points → hook order) |
| 2 Search phrase | The TikTok search this post answers, `600 17px` + `search` icon; `Also searched` alternates below as tappable rows | `Regenerate` |
| 3 Hook | 8–10 options best first, each with a word count (red over 9). Radio rows, selected `--blue-50` + `--blue-500` border. Last row **Other** expands an inline write field with a live count. `Library` pill opens the picker filtered to this type | per option |
| 4 CTA | One plug sentence + `Traces to: <approved claim>` chip. Blue note: *On the next step this sentence lands inside one talking point. It never gets its own card or clip.* | `Rewrite` |
| 5 Talking points | N cards, count derived from type (`Hook + 5 points + outro = 7 clips`). Card: numbered badge, text, screenshot slot, Move control. Plug card starred — `zap` icon, `Plug rides here`, `--blue-300` border, blue badge | per card |
| 6 Caption + hashtags | Caption (`x of 200`), 3–5 hashtag chips with `Add`, then **Merged preview**: avatar, `fieldvision.ai`, caption and tags as one string (Instagram reads tags inside the caption) | per field |
| 7 AI review | Score dial + one card per section (bar + score + note), `Apply` / `Ignore` per suggestion, checks list | — |

**Screenshot + Move (step 5).** Empty is a dashed `Add screenshot` button; filled shows a 30×40 thumb and the shot name. Camera roll sheet: 3-up grid of 124px tiles with date badges, selection = 2.5px `--blue-500` outline + blue check. Move is a `--fill-quiet` pill showing the slot (`Clip 3` / `Slide 3`) and opens the slot list derived from the type (`Hook, Clip 1…Clip 5, Outro`). Clip and slide counts are never a human field.

**AI review never blocks and never silently edits.** Applying turns the block green (`Applied. The section will rescore on save.`). Save is enabled at any score; overrides log the check that fired.

**Slideshow variant**: same seven steps, slide slots (`Cover, Slide 1…Slide 4, Close`), slideshow copy.

---

## 9. Library — `app/(admin)/(tabs)/library.tsx`

One tab. Quick capture pinned to the top: single field with a `plus` icon, focus ring `0 0 0 3px rgba(27,166,238,0.30)`, Save appears with text, multiline paste shows `3 ideas will be saved`. No sheet, no form, no category picker.

Chips: **Ideas · Our posts · References · From creator** (active solid `--blue-500`). Our posts adds a search row plus Top/creator/type filters and sorts by performance. References show a thumb and `@handle · views`. From creator rows carry the avatar and a `Use` button.

**Library picker sheet** opens from the editor, filtered to the post's type (`Filtered to numbered list videos.`), References / Our posts segmented, primary `Attach to post`. Using an item marks it used; it is never removed.

---

## 10. Creators — `app/(admin)/(tabs)/creators.tsx`

List: sort chips (Earnings / Views / Posts), then a card per creator — 44px profile photo, name, `@handle`, and three stat blocks (earned / posts / views) on `--off-white`.

**Profile** — Instagram-shaped: 64px photo + three stats, credential, both handles, grid/calendar toggle. Grid is 3-up 9:16 tiles with the format glyph and view count. Chat button top-right.

**Post detail** — 300px media, five stat tiles (views, payout, saves, likes, comments), caption card.

**Chat** — one thread per creator, shared with Review's per-post entry. Admin bubbles `--blue-500` with `16px 16px 4px 16px`, creator bubbles `--fill-quiet`. A message can carry a post reference: a nested translucent block with a 34×46 thumb, title and meta. Composer is a pill field + 44px blue send button.

---

## 11. Analytics and settings — `app/(admin)/(tabs)/analytics.tsx`

`Segmented` Views / Revenue / Sales. Headline `700 34px` display + range label + green delta pill. One chart: posting activity as `--blue-200` bars and the metric as a `#1BA6EE` 2.5px line with a 22%→0 area gradient, one axis, last point dotted. Range control 7 / 30 / 90 days. Legend names both series. Then **Per creator** rows (photo, posts · views, revenue) and **Best hooks** (rank bubble, hook, views). Gear opens Settings. No dashboard bloat.

**Settings** — Roster list with Invite, then Company rows: Account template, Brand Brain (`4 docs`), Features (`3 approved`), Publish time (`Sun 8PM EST`). Sign out is a danger row.

**Brand Brain** — the doctrine the generator writes against: four docs (Product / Audience / Voice / Learnings) with word counts and last-updated, editing state with a `Clean up` AI action, source accounts as chips, saved search terms with use counts.

**Features** — approved claims the plug must trace to. Approved cards with a green check and an edit pencil; rejected cards quiet with a red `x` and a "do not claim" line. `Add a claim` opens a sheet with name, body and an Approved / Rejected toggle.

---

## 12. Rules the UI enforces

1. Nothing generates when the post editor opens. Every AI action is a tap.
2. Order of truth: type (stamped) → claim → search phrase → talking points → hook last → caption and hashtags.
3. Kill rather than pad — an empty slot with a reason is a valid row.
4. Clip and slide count is derived from the type, never entered.
5. Every post plugs FieldVision inside exactly one talking point.
6. AI review never blocks and never silently edits.
7. Approve is the last human touch: editing, posting and tracking are automatic afterwards.
8. Reject a single clip and only that clip comes back.
9. One week at a time — a new week cannot start until the current one is published.

---

## 13. Files in the kit

`ui_kits/admin-app/` — `AdminShared.jsx` (scaffold, chips, sheet, score dial, media) · `ReviewScreen.jsx` · `ReviewDetailScreen.jsx` · `ApprovalScreens.jsx` · `BriefsScreen.jsx` · `WeekSetupScreen.jsx` · `PostEditorScreen.jsx` (shell + steps 1–4) · `PostEditorSteps.jsx` (steps 5–7) · `EditorSheets.jsx` · `LibraryScreen.jsx` · `CreatorsScreens.jsx` · `AnalyticsScreens.jsx` · `admin-data.js` (all FieldVision copy).

`index.html` is the clickable app. `all-screens.html` is every screen and state. `shots.html` is the handoff sheet the screenshots come from.
