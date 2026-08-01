# Noni — Admin app handoff (Queue · Review · Calendar)

Spec for the admin surface designed in `Noni Admin - Queue, Review, Calendar.dc.html`.
Every value below was read off that running source. Anything not measurable there is marked **ASSUMPTION** or **STOP AND ASK**.

Screens: 390×844 iPhone, iOS, portrait only. No desktop layout.

---

## 0. Scope and status

**Designed and specified here (build this):**

| # | Screen / state | Screenshot |
|---|---|---|
| 1a | Queue — row list (Option A) | `screenshots/01-queue-row-list.png` |
| 1b | Queue — triage cards (Option B) | `screenshots/02-queue-triage-cards.png` |
| 1c | Queue — one submission left | `screenshots/03-queue-one-left.png` |
| 1d | Queue — empty · loading | `screenshots/04-queue-empty-and-loading.png` |
| 1e | Review — Reel, script beneath (Option A) | `screenshots/05-review-reel-script-beneath.png` |
| 1f | Review — Reel, pinned player + tabs (Option B) | `screenshots/06-review-reel-pinned-player.png` |
| 1g | Review — Slideshow | `screenshots/07-review-slideshow.png` |
| 1h | Review — changes-requested thread | `screenshots/08-review-changes-thread.png` |
| 1i | Review — note sheet · approved confirmation | `screenshots/09-review-note-sheet-and-approved.png` |
| 1j | Calendar — light week (3 creators) | `screenshots/10-calendar-light-week.png` |
| 1k | Calendar — heavy week (5 creators) | `screenshots/11-calendar-heavy-week.png` |
| 1l | Task edit sheet | `screenshots/12-task-edit-sheet.png` |
| 1m | Generate — setup · running | `screenshots/13-generate-setup-and-running.png` |
| 1n | Clickable loop (behaviour reference) | `screenshots/14-clickable-loop.png` |

**Not designed yet — do NOT invent these:** Trends, Brand Brain, Analytics, Settings, company onboarding (13 steps), creator onboarding, auth. Tab bar entries for Trends / Analytics / Settings exist visually; wire them to a placeholder route and stop.

**Two open decisions the build must not resolve on its own:**

1. **Queue layout** — 1a (row list, open to decide) *or* 1b (triage cards with inline Approve). Build the one the design owner names.
2. **Review layout** — 1e (player then script) *or* 1f (pinned player, script scrolls with the delivered line highlighted, Script / Caption / Thread tabs). 1g / 1h / 1i are shared by both.

**Documented deviation:** Approve is `--blue-500 #1BA6EE` (primary), per the design brief. The earlier creator-app kit used a green `approve` button variant. Blue wins here; the green variant stays in the library unused. Red `--danger #D93A3A` is reserved for *Remove from calendar* and error text only — **Request changes is an outline button, not red.**

---

## 1. Foundations — use verbatim, invent nothing

Tokens come from `tokens/*.css` in the Noni design system. In React Native mirror them in one `theme.ts`; the literal values are:

### Colour

```
blue-50   #F2F9FE    white        #FFFFFF     amber        #E08A16
blue-100  #E7F4FD    off-white    #F7FAFD     amber-soft   #FDF2DF
blue-200  #A7D3F7    fill-quiet   #F1F3F5     green        #1F8F5F
blue-300  #8EC9F5    line         #E6EEF6     green-soft   #E4F5EC
blue-400  #4FBAF2    line-strong  #D6E3EF     danger       #D93A3A
blue-500  #1BA6EE    slate-300    #B4BFCB     danger-soft  #FCEBEB
blue-600  #0F8FD1    slate-400    #8E9AA6     scrim        rgba(0,0,0,0.45)
blue-700  #0B76AD    slate-500    #6B7A8C     scrim-strong rgba(0,0,0,0.60)
                     ink          #0F1720     glass        rgba(255,255,255,0.82)
                     ink-800      #151D26
                     ink-900      #0B0F14
```

Rules: `blue-500` is the only action colour. `blue-100/200/300` are tints and never carry white text. `ink-900` appears **only** behind media (player, slide canvas). Status colour lives only in chips.

### Type

Family: SF Pro / SF Pro Rounded on device (web kit substitutes Figtree + Nunito — **ASSUMPTION**, swap for the licensed files if different).

```
hero      44 / 1.05 / -1.2px / 800      body        16 / 1.5  / 400
title-xl  34 / 1.12 / -0.5px / 800      body-sm     15 / 1.4  / 400-600
title-sm  26 / 1.20 / -0.5px / 700      meta        14 / —    / 400-700
card-lg   20 / 1.35 / -0.3px / 700      chip        13 / 1    / 700
card      18 / 1.35 / -0.2px / 700      label       12 / 1    / 800 / +0.7px UPPERCASE
action    17 / —    / -0.1px / 700-800  micro       10-11     / 700 (in-cell meta only)
```

Weights used: 400, 500, 600, 700, 800. Never lighter than 400.

### Spacing / shape / elevation

```
gutter 24 · card padding 18 (12 on compact rows) · stack gap 12 · section gap 28
radius: field 12 · cell 14 · card 18 · media 20 · sheet 24 · pill 999
border: hairline 1px #E6EEF6 · field 1.5px #D6E3EF · selected 2px #1BA6EE
shadow-card    0 1px 2px rgba(15,23,32,.04), 0 6px 16px rgba(15,23,32,.05)
shadow-raised  0 2px 6px rgba(15,23,32,.06), 0 12px 28px rgba(15,23,32,.08)
shadow-media   0 4px 18px rgba(15,23,32,.10)
shadow-float   0 6px 24px rgba(15,23,32,.14)
shadow-accent  0 8px 20px rgba(27,166,238,.28)
ring-focus     0 0 0 3px rgba(27,166,238,.30)
tap targets: 44 minimum · primary pill 60 tall
```

### Motion

```
surfaces / sheets / progress  240ms   cubic-bezier(0.22,0.61,0.36,1)
colour / opacity              160ms   same easing
press feedback                 90ms   scale 0.97 + one step darker fill
chart draw                    420ms
skeleton shimmer             1400ms   linear, infinite
```

---

## 2. Device frame (every screen)

```
canvas 390 × 844, corner radius 46
status bar        54 tall, 16 top / 30 side padding, time 15/700, non-interactive
content           inset 0, padding-top 54
screen gutter     24 left/right
tab bar           floating: left 16, right 16, bottom 24, height 72, radius 999
                  fill rgba(255,255,255,0.82) + 18px backdrop blur, 1px #E6EEF6, shadow-float
list bottom pad   116 (so content clears the floating bar)
home indicator    134 × 5, radius 999, rgba(15,23,32,0.3), bottom 8
```

Tab bar items, in order: **Queue** (`inbox`, badge = pending count) · **Calendar** (`calendar-days`) · **Trends** (`trending-up`) · **Analytics** (`chart-column`) · **Settings** (`settings`).
Active item: `blue-100` pill behind the icon, icon `blue-600`, label `blue-700` 11/700. Inactive: icon `slate-400`, label `slate-400`. Badge: min-width 16, height 16, `blue-500`, white 10/800, offset top −4 right −7.
Review, the sheets and the confirmation are **pushed screens — no tab bar.**

---

## 3. Components

Reuse from the design system; do not re-draw.

| Component | Used for | Notes / new variants |
|---|---|---|
| `Button` | every action | sizes lg 60 / md 48 / sm 40; variants primary, outline, ghost, tint, danger. Paired footer buttons: `block` + flex 1 (Request changes) and flex 1.35 (Approve). |
| `Icon` | Lucide set, stroke 2 | used: play, pause, images, chevron-left, chevron-right, check, inbox, calendar-days, trending-up, chart-column, settings, sparkles, plus, arrow-right, circle-check-big, rotate-ccw |
| `StatusChip` | task lifecycle | needs `white-space: nowrap`; label override used for "Resubmitted" |
| `InfoBlock` | HOOK / SCRIPT / CAPTION / SLIDE COPY | 12/800/+0.7 uppercase label, 16/1.5 body |
| `EmptyState` | queue empty | 72 circle `blue-100`, 30 glyph `blue-500` |
| `TabBar` | admin nav | items above |
| `Wordmark` | Queue header only | `size=20 capsule` |

**New in this handoff** (add to the library, small and reusable):

- `FormatPill` — 5/9 padding, radius 999, `fill-quiet` bg, `slate-500` 11/700, text "Reel" | "Slideshow". Compact variant 3/7 with 10/700 for calendar cells.
- `MediaFallback` — 9:16 quiet fill `#F1F3F5` + centred Lucide glyph `slate-400` + duration/length label bottom-centre 10/700. Used until real 9:16 frames exist. Real frames replace the fill and keep the 3px white border + `shadow-media` rule from the system.
- `SegmentedTabs` — 4 padding on `fill-quiet` radius 999; active segment white + `shadow-card`; labels 13/700 (`ink` active, `slate-500` idle).
- `SheetShell` — bottom sheet: scrim `rgba(11,15,20,0.5)`, panel white, radius 24 top only, `shadow-raised`, 40×4 `line-strong` grabber centred, padding 14 / 24 / 30.
- `CalendarCell` — spec in §7.
- `SkeletonBlock` — shimmer gradient `#EEF3F8 → #F7FAFD → #EEF3F8`, background-size 320px, 1400ms linear infinite.

---

## 4. Queue

### 4.1 Header (all queue states)

```
Wordmark size 20 capsule            count pill: 6/12, radius 999, blue-100 bg, blue-700 13/700
                                    text "5 waiting" | "1 waiting" | "All clear" (green-soft / green)
H1        "Queue"                   34/1.12, 800, -0.5px, ink
Subtitle  "Approve and it's live. Editing, posting and tracking are automatic."
          15/1.4, 400, slate-500, margin-bottom 16-20
```
1c subtitle instead: "One to clear, then you're done for today."

Filter chips (1a only, below the subtitle, gap 8, 14 bottom margin, nowrap):
`All 5` (ink bg, white) · `Reels 3` · `Slideshows 2` (fill-quiet, slate-500) — 8/14 padding, 13/700.

### 4.2 Row — Option A (1a)

```
card      display flex, gap 14, align center, padding 12, radius 18,
          white, 1px #E6EEF6, shadow-card; whole row is the tap target → Review
thumb     56 wide, aspect 9/16, radius 12, fill-quiet, centred glyph (play | images) 18 slate-400,
          length label bottom 6, centred, 10/700 slate-400  ("0:52" | "4 slides")
column    gap 6, min-width 0
  line 1  avatar 20 circle blue-100 / blue-700 10/800 initial · creator 13/700 slate-500 ·
          "·" slate-300 · relative time 13/400 slate-400, nowrap
  line 2  title 15/1.3, 700, -0.2px, ink, clamp 2 lines
  line 3  gap 7 — FormatPill + StatusChip (nowrap)
chevron   chevron-right 20 slate-300
```

### 4.3 Card — Option B (1b)

Same header. Card padding 12, gap 12, radius 18.
Thumb 82 wide, aspect 9/16, radius 14, FormatPill overlaid top-left (4/7, `rgba(255,255,255,0.92)`, ink 10/700), glyph 24, length label bottom 7 (11/700).
Right column gap 8: creator line, title (15/1.3/700, clamp 2), then a button row gap 8 — `Approve` (sm, primary, icon `check`, block, flex 1) and `Open` (sm, outline, block, flex 1).
Below the list, centred: "Approve is the last human touch." 12/500 slate-400.
Inline approve is optimistic: row animates out over 240ms, badge decrements, undo is **STOP AND ASK** (not designed).

### 4.4 Empty (1d left)

Header count pill becomes `All clear` (green-soft bg, green text). `EmptyState`:
icon `circle-check-big` · title "Nothing to review" · body "Everything submitted is approved and scheduled. Six tasks are with creators for this week." · action `Open Calendar` (tint, md). Block starts 56 below the H1.

### 4.5 Loading (1d right)

Count pill → 82×28 skeleton. Four skeleton rows, same 12/18/1px card shell: thumb 56×(9:16); lines 52% × 12, 92% × 14, 64% × 14, 34% × 22 (radius 6/7/7/999), gap 9. Shimmer 1400ms.

### 4.6 One left (1c)

Single row, then a note card 20 below: `off-white`, radius 18, padding 16/18 — label "NEXT UP" 12/800/+0.7 slate-400, body "Four tasks are recording now. The next batch lands Thursday." 15/1.4/600 slate-500.

---

## 5. Review — shared rules

- Header bar (light variants): padding 4/16/8 — back `chevron-left` 26 ink · centred "Review" 15/700 · counter pill `fill-quiet` 12/700 slate-500 ("1 of 5").
- Content scrolls; the action footer is pinned.
- Footer: 1px `#E6EEF6` top border, white, padding 12 / 24 / 30, row gap 10 —
  `Request changes` (md, **outline**, block, flex 1) · `Approve` (md, **primary**, icon `check`, block, flex 1.35).
  Under it, centred 12/500 slate-400: "Approving posts it Thursday 6:40pm. No further steps." (Slideshow: "…Sunday 11:00am…"; thread variant: "Second round. Approving closes the loop for Tolu.")
- Media is the only dark surface: `ink-900`.

### 5.1 Option A — script beneath (1e)

Media: width 100%, aspect **9/11**, radius 20, `shadow-media`. Centred play circle 64, `rgba(255,255,255,0.92)`, glyph `play` 26 ink. FormatPill top 12 / left 12 (white 92%).
Scrub row bottom 14, sides 14: `0:12` 12/700 white90 · track 3px `rgba(255,255,255,0.28)` with white fill at 23% · `0:52` 12/700 white60.
Then: meta row (avatar 24 · "Mara" 14/700 ink · "·" · "submitted 4m ago" 14/400 slate-400, nowrap) → H1 title 26/1.2/700/-0.5 → `InfoBlock` HOOK, SCRIPT, CAPTION (gap 12).

### 5.2 Option B — pinned player (1f)

Player is fixed at the top, **330 tall**, full-bleed `ink-900`, status bar text switches to white.
Back chevron white at top 60 / left 16; counter chip top 64 / right 20 on `rgba(255,255,255,0.16)`.
Centre control `pause` 24 in a 64 white-92% circle. Scrub row bottom 16 with a 10px white knob at 37%.
Below: meta row, then `SegmentedTabs` **Script | Caption | Thread**.
Script list (gap 10, scrolls): each line is a row — padding 10/12, radius 14; timestamp 12/700 min-width 30; body 15/1.5.
Current line: row bg `blue-100`, timestamp `blue-600`, body 700 `ink`. Other lines: transparent, timestamp `slate-300`, body 400 `slate-500`.
Reference script (Mara, 0:52): `0:00` "Your winger isn't unfit. He's sprinting the wrong yards." · `0:08` "We tracked 60 wide players across a full season." · **`0:19` "The ones who faded after 70 covered the same distance as the ones who didn't."** · `0:31` "They just did it recovering, not attacking." · `0:44` "FieldVision splits the two on one chart. Link in bio."
The highlight follows playback position; tapping a line seeks to it.

### 5.3 Slideshow (1g)

No video chrome anywhere. Media aspect 9/11, `ink-900`: FormatPill "Slideshow" top-left; "Slide 2 of 4" chip top-right on `rgba(255,255,255,0.16)`; slide copy centred, 30/1.15, 800, -0.5px, white, sides 24; dots bottom 16 — 7×7 `rgba(255,255,255,0.45)`, active 22×7 white.
Below the media, a thumb strip: 4 cells, flex 1, height 52, radius 10, gap 8 — idle `fill-quiet` + `slate-400` 13/700; selected `blue-100`, 2px `blue-500` border, `blue-700`.
Then meta row, H1, `InfoBlock` "Slide 2 copy" (follows the selected slide) and "Caption".

### 5.4 Changes-requested thread (1h)

Player 250 tall; "Take 2" chip top-right, `amber-soft` bg / `amber` text 12/700; caption bottom-left 12/700 `rgba(255,255,255,0.75)` — "Tolu · 0:41 · resubmitted 3h ago". `SegmentedTabs` with **Thread** active.
Thread, chronological, oldest first, gap 14:

| Author | Header | Bubble |
|---|---|---|
| Creator | avatar 22 · "Tolu" 13/700 · "Take 1 · Monday" 13/400 slate-400 | `off-white`, radius 16, padding 14/16, 15/1.5 400 slate-500 |
| Admin (right-aligned) | "You · Monday" 13/400 slate-400 · "Changes requested" 13/700 ink | `amber-soft`, 15/1.5 500 ink |
| Creator (latest) | "Tolu" · "Take 2 · 3h ago" | `blue-100`, 15/1.5 500 ink |

Copy in the reference: note = "Hook lands late. Start on the 31% number, and reshoot indoors — the wind eats the first line."; take 2 = "Reshot in the analysis room. Opens on 31% now."

### 5.5 Request-changes sheet (1i left)

`SheetShell` over a 55% `ink-900` scrim on the dimmed Review screen.
H2 "What should Mara fix?" 22/1.2/700/-0.4 · reason chips (9/14, 13/700; selected `blue-100`/`blue-700`, idle `fill-quiet`/`slate-500`): **Hook lands late · Audio · Off script · Framing** — tapping one prefills the note, still editable.
Note field: radius 12, 1.5px `blue-500` border + `ring-focus` when focused, min-height 104, padding 14, 16/1.5.
CTA `Send note to {creator}` (lg, primary, block). Helper 12/500 slate-400: "The task goes back to Mara's queue with your note attached."

### 5.6 Approved confirmation (1i right)

Centred: 88 circle `green-soft` + `check` 40 `green` → H1 "Approved" 34/1.12/800 → body 16/1.5 slate-500 "Noni is editing it now. It posts to @fieldvision.ai on Thursday at 6:40pm and starts tracking itself."
Automation card: full width, `off-white`, radius 18, padding 16/18, rows gap 10, left dot 8px —
`green` "Edit and captions" + right meta "~4 min" · `blue-300` "Posts Thursday 6:40pm" + "Reel" · `line-strong` "Views land in Analytics" (slate-500).
Bottom: `Next in queue` (lg, primary, block, icon-right `arrow-right`) and `Back to Queue` (md, ghost, block). When the queue is empty the primary label becomes "Back to Queue".
Note-sent variant of the same screen: circle `amber-soft`, glyph `rotate-ccw` `amber`, title "Note sent", body "The task is back in {creator}'s queue with your note attached."

---

## 6. Calendar

Rows per creator × day columns; days scroll horizontally, creators scroll vertically. Header and grid scroll together.

```
H1 "Calendar" 34/1.12/800/-0.5
week label "Week of 3 Aug" 15/600 slate-500   (heavy week also shows a right-aligned
                                               "21 tasks" pill: amber-soft / amber 13/700)
week nav      two 32 circles, fill-quiet, chevron-left / chevron-right 18 slate-500
actions row   gap 8 — Generate (sm, primary, icon sparkles, block, flex 1)
                      New task (sm, outline, icon plus, block, flex 1)
day header    108 wide per column, 12/700, today ink / others slate-400 ("Mon 3" … "Sun 9")
creator col   72 wide, left pad 16 — avatar 30 blue-100/blue-700 12/800, name 12/700 slate-500
row gap 10 · column gap 8 · list bottom pad 116
```

### CalendarCell

```
filled  108 wide, min-height 96, padding 9, radius 14, white, 1px #E6EEF6, shadow-card, gap 5
        FormatPill compact (3/7, fill-quiet, 10/700)
        title 12/1.3, 700, ink, clamp 3
        status pill (3/7, 10/700):  To do  blue-100/blue-700 · Recorded fill-quiet/slate-500
                                    In review amber-soft/amber · Approved green-soft/green
                                    Posted green/white
empty   same box, 1.5px dashed #D6E3EF, transparent, centred "+" 18/700 slate-300 → New task
        prefilled with that creator and day
tap filled cell → Task edit sheet
```

### Task edit sheet (1l)

`SheetShell` pinned 92 from the top (tall sheet, content scrolls, footer pinned).
Header row: H2 "Edit task" (nowrap) + right chip "Wed 5 · Fabri" (`blue-100`/`blue-700` 12/700).
Sections, gap 16, each with a 12/800/+0.7 uppercase `slate-400` label:

| Label | Control |
|---|---|
| TITLE | text field — 1.5px `line-strong`, radius 12, padding 13/14, 16/600 |
| FORMAT | `SegmentedTabs` Reel / Slideshow (padding 10 per segment, 14/700) |
| CREATOR | pill row, flex 1 each, padding 10, radius 999, selected `blue-100`/`blue-700` |
| DAY | pill row Mon–Fri, same treatment |
| HOOK | field + right-aligned "Rewrite" chip (`blue-100`, sparkles 13, 12/700) that regenerates just that field |
| SCRIPT / SLIDE COPY | multiline field, 16/1.5 slate-500; label follows the format toggle |

Footer: `Save task` (lg, primary, block) then `Remove from calendar` (md, ghost, block, label in `--danger`). Removing asks for confirmation — **STOP AND ASK** for that dialog's copy.

### Generate (1m)

**Setup sheet:** H2 "Fill the week" · body "Noni writes the title, hook, script and caption for each task from Brand Brain and this week's trends."
POSTS PER CREATOR — stepper on a `fill-quiet` radius 14 bar: two 40 white circles (`shadow-card`) with − / +, value 800/26 centred.
PILLARS — chips, selected `blue-100`/`blue-700`, idle `fill-quiet`/`slate-500` (reference: Coach education, Match data, Gear, Player stories).
Summary row: `off-white`, radius 16, padding 14/16 — "5 creators × 4 posts. Existing tasks stay as they are." 15/1.4/600 slate-500 + count 22/800 ink.
CTA `Generate 20 tasks` (lg, primary, icon sparkles, block, nowrap) — the number tracks creators × posts.

**Running sheet:** H2 "Writing the briefs…" · body "This takes about a minute. You can leave the screen."
Progress: 6px track `fill-quiet`, fill `blue-500`, 240ms width transitions; caption "13 of 20 written" 13/700 slate-400.
Checklist rows gap 10: done = `check` 18 `green` + 15/600 slate-500; active = 18 ring (2px `blue-300`, top `blue-500`, 900ms linear spin) + 15/700 ink; pending = 18 `fill-quiet` dot + 15/600 slate-300.
Phases, in order: "Read this week's 40 trends" → "Matched pillars to creators" → "Writing hooks and scripts" → "Scheduling to the calendar".
CTA `Run in background` (lg, outline, block). Generation never blocks the UI; new tasks fade into the grid as they land.

---

## 7. Behaviour (from the clickable reference, 1n)

```
Queue row tap                 → Review (push, 240ms)
Review · Approve              → Approved confirmation; task leaves the queue; badge −1
Review · Request changes      → note sheet (240ms up); Send → "Note sent"; task leaves the queue
Confirmation · Next in queue  → next submission, or Queue when empty
Queue empty                   → EmptyState (§4.4)
Every press                   → scale 0.97 over 90ms
```

Approve is optimistic: update locally, reconcile with the server, and on failure restore the row plus an error toast — **STOP AND ASK** for that toast (not designed).

---

## 8. Mock content (FieldVision AI — keep it, do not paraphrase)

Creators: Fabri (F), Mara (M), Deniz (D), Tolu (T), Rhea (R). Handle: `@fieldvision.ai`.

Queue, newest first:

| Creator | Title | Format | Length | Age | Status |
|---|---|---|---|---|---|
| Mara | Why your winger fades after 70 minutes | Reel | 0:52 | 4m ago | In review |
| Fabri | The tripod setup that took 90 seconds | Reel | 0:38 | 22m ago | In review |
| Deniz | 3 stats that win Sunday | Slideshow | 4 slides | 1h ago | In review |
| Tolu | What a 31% possession drop looks like | Reel | 0:41 | 3h ago | Resubmitted |
| Rhea | Reading a pass map in 20 seconds | Slideshow | 6 slides | Yesterday | In review |

Hooks / captions per task, and the light and heavy week grids, are in the design source (`QUEUE`, `COPY`, `WEEK_LIGHT`, `WEEK_HEAVY`). Copy them across verbatim.

---

## 9. Copy rules

Sentence case. No emoji. No exclamation marks. Buttons name the outcome: Approve · Request changes · Send note to Mara · Save task · Generate 20 tasks · New task · Open Calendar · Next in queue · Run in background · Remove from calendar. Empty states name the next action. Numbers rounded in prose, exact in data.

---

## 10. Assumptions and gaps

- **ASSUMPTION** Fonts: SF Pro on device; Figtree/Nunito is the web substitute only.
- **ASSUMPTION** Thumbnails use the quiet-fill + glyph fallback because no real 9:16 frames were supplied. Drop real frames in and keep the 3px white border + `shadow-media`.
- **ASSUMPTION** Relative times ("4m ago") are client-formatted from `submitted_at`.
- **ASSUMPTION** Scheduled-post strings ("Thursday 6:40pm") come from the task's scheduled slot.
- **STOP AND ASK**: undo after inline approve · error/offline states · delete-task confirmation · push-notification copy · Trends / Brand Brain / Analytics / Settings / onboarding / auth · pagination beyond ~20 queue items · multi-week calendar range.
