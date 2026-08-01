# Handoff: Noni — Creator App (Home · Posts · Analytics · Profile)

**Target:** pixel-accurate reproduction of the design as it currently stands in this project. Do not redesign, simplify, or substitute components.

**What is in this bundle**

```
design_handoff_creator_app/
├── README.md                ← this document (the spec)
├── CURSOR_PROMPT.md         ← paste-into-Cursor master prompt
└── screenshots/             ← 22 PNGs, one per screen/state (390×844 phone, rendered at 0.58 scale)
```

**The source files live in the project root** (download the whole project to get them — they are not duplicated into this folder, because a second copy breaks the design-system compiler):

```
styles.css                   single entry point, @imports the 7 token files
tokens/                      colors, typography, spacing, shape, motion, fonts, base
components/                  20 design-system components (.jsx + .d.ts + .prompt.md + card html)
assets/logo.svg              the Noni bubble "N" mark, 1024-ready SVG
assets/icons/                40 Lucide SVGs
_ds_bundle.js                the compiled design system (all components on one global)
ui_kits/shared/              Phone.jsx (device chrome), data.js (base mock data)
ui_kits/creator-app/         the app itself: screens, kit data, index.html, all-screens.html
```

Every `source/...` path referenced later in this document means that project path — e.g. `source/components/content/MediaCard.jsx` = `components/content/MediaCard.jsx` at the project root.

**These files are design references, not production code.** They are React 18 + Babel-in-the-browser prototypes that render at a fixed 390×844 phone frame. The task is to recreate them in the target codebase (the Noni Expo / React Native app) using its existing patterns, or in whatever framework the repo already uses. The measurements, colors, type and behavior below are the contract; the file structure is not.

**Fidelity: high.** Every value below is taken from the running source, not estimated.

---

## 0. Verified facts vs assumptions

**Verified (read directly from source):** every hex value, px size, font weight, radius, shadow, duration, easing, copy string, component prop, and state listed in this document.

**Assumptions, flagged:**
- Fonts are **substitutes**. The product targets iOS and uses SF Pro / SF Pro Rounded. No font binaries exist in the sources, so the web prototype substitutes **Figtree** (UI + display) and **Nunito** (rounded wordmark) from Google Fonts. On device, use SF Pro / SF Pro Rounded.
- Icons are **substitutes**. The Noni codebase ships no icons. 40 **Lucide** glyphs (stroke 2, round caps) stand in, inlined in `components/core/icon-data.js`. **TikTok and Instagram brand marks do not exist in Lucide** — `music-2` and `at-sign` stand in. Replace with official brand SVGs before shipping.
- **No real media exists.** Every post frame is a placeholder: `linear-gradient(160deg,#E7F4FD 0%,#DCE7F0 100%)` with a centered play/images glyph. In production these are real scraped 9:16 frames.
- The **logo** is an original mark drawn to the brief ("puffy 3D baby-blue N"), not a supplied brand asset. It is production-usable as SVG, but a shipping app icon should be re-rendered in 3D at 1024×1024 and exported flat.
- Mock numbers (views, likes, earnings, follower counts) are invented sample data for FieldVision AI, the first tenant.

---

# 1. TECHNICAL CONTEXT

## 1.1 Stack

**Existing stack (from the repo this design was built against):** Expo / React Native + Supabase, TypeScript, file-based routing under `app/(creator)/…`. **Use it.** Do not introduce Next.js, Tailwind, shadcn, styled-components, Framer Motion, a chart library, or a component kit.

If — and only if — you are implementing the **web** prototype rather than the RN app, the design as written needs nothing beyond:

| Need | Use |
|---|---|
| Rendering | React 18 (already used) |
| Styling | Plain CSS custom properties + inline style objects (exactly as the source does) |
| Icons | Lucide (`lucide-react` on web, `lucide-react-native` on device) |
| Charts | **None.** The area chart is ~40 lines of hand-written SVG path math (§6.5). Do not add Recharts/Victory/D3. |
| Animation | CSS transitions only (`transition: <prop> var(--dur-*) var(--ease-out)`). No animation library. |

## 1.2 Routes / screen structure

The app is a 4-tab shell with two full-screen modal-ish pushes.

```
CreatorApp (shell, owns tab + mode state)
├── tab 0  Home            HomeScreen
│          ├── segment 0   Calendar   (default)
│          └── segment 1   Inspiration
│          └── overlay     SwapSheet  (bottom sheet)
├── tab 1  Posts           PostsScreen
│          ├── view        calendar   (default)
│          └── view        list
├── tab 2  Analytics       GrowthScreen
├── tab 3  Profile         ProfileScreen
├── mode   detail          TaskDetailScreen   (pushed, hides tab bar)
└── mode   record          RecordScreen       (pushed, dark, hides tab bar)
```

Suggested RN routes: `app/(creator)/index.tsx` (Home), `posts.tsx`, `analytics.tsx`, `profile.tsx`, `task/[id].tsx`, `record/[id].tsx`.

## 1.3 Fonts

```
Web:    @import url("https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&family=Nunito:ital,wght@0,400..900;1,400..900&display=swap");
--font-ui:       "Figtree","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
--font-display:  "Figtree","SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;
--font-rounded:  "Nunito","SF Pro Rounded",-apple-system,BlinkMacSystemFont,sans-serif;
--font-mono:     ui-monospace,SFMono-Regular,Menlo,monospace;
```
Only weights **600 / 700 / 800** are used. Never 300/400 for headings; body text uses 400.

## 1.4 Icon set (exact names used)

From Lucide, stroke-width 2, round caps/joins, rendered as inline SVG in `currentColor`:

`house · layout-list · chart-column · circle-user-round · bell · play · pause · video · images · mic · clock · calendar-days · rotate-ccw · sparkles · check · chevron-left · chevron-right · x · eye · zap · users · inbox · message-circle · share-2 · trending-up · link · dollar-sign · circle-check-big · circle-alert · trash-2 · log-out · settings · at-sign (Instagram stand-in) · music-2 (TikTok stand-in)`

Sizes in use: 11, 13, 14, 15, 17, 18, 19, 22, 23, 26, 30 (empty-state), 64 (record review).

## 1.5 Assets

| Asset | File | Notes |
|---|---|---|
| App mark | `source/assets/logo.svg` | 512 viewBox, three round-cap strokes + gloss. Full source in §6.2. |
| Mark in code | `components/core/Wordmark.jsx` → `BubbleMark` | Same geometry, React, unique gradient ids per instance |
| Icon data | `components/core/icon-data.js` | All 40 glyph paths inlined |
| Post frames | none | Placeholder gradient; see §0 |

---

# 2. DESIGN TOKENS

Copy `source/tokens/*.css` verbatim. Values reproduced here for reference.

## 2.1 Color

```css
/* Brand blue — 200/300 are the tint, 500 is the action colour */
--blue-50:#F2F9FE;  --blue-100:#E7F4FD; --blue-200:#A7D3F7; --blue-300:#8EC9F5;
--blue-400:#4FBAF2; --blue-500:#1BA6EE; --blue-600:#0F8FD1; --blue-700:#0B76AD;

/* Neutrals */
--white:#FFFFFF;      --off-white:#F7FAFD;  --fill-quiet:#F1F3F5;
--line:#E6EEF6;       --line-strong:#D6E3EF;
--slate-300:#B4BFCB;  --slate-400:#8E9AA6;  --slate-500:#6B7A8C;
--ink:#0F1720;        --ink-800:#151D26;    --ink-900:#0B0F14;

/* Status */
--amber:#E08A16;  --amber-soft:#FDF2DF;
--green:#1F8F5F;  --green-soft:#E4F5EC;
--danger:#D93A3A; --danger-soft:#FCEBEB;

/* Semantic aliases */
--surface:#FFFFFF; --surface-sunken:#F7FAFD; --surface-card:#FFFFFF;
--surface-quiet:#F1F3F5; --surface-brand-soft:#E7F4FD; --surface-dark:#0B0F14;
--text-strong:#0F1720; --text-body:#0F1720; --text-muted:#6B7A8C;
--text-subtle:#8E9AA6; --text-on-dark:#FFFFFF; --text-on-accent:#FFFFFF; --text-brand:#0F8FD1;
--accent:#1BA6EE; --accent-hover:#4FBAF2; --accent-press:#0F8FD1; --accent-tint:#8EC9F5;
--border:#E6EEF6; --border-strong:#D6E3EF; --border-accent:#1BA6EE;
--status-todo-fg:#0B76AD;   --status-todo-bg:#E7F4FD;
--status-pending-fg:#E08A16; --status-pending-bg:#FDF2DF;
--status-done-fg:#1F8F5F;    --status-done-bg:#E4F5EC;
--scrim:rgba(0,0,0,0.45); --scrim-strong:rgba(0,0,0,0.6); --glass:rgba(255,255,255,0.82);
```

**Rules:** baby blue (#8EC9F5) never carries white text — that is why `--accent` is #1BA6EE. Red is only for "Delete account" and error text, never a task status.

## 2.2 Typography

```css
--text-hero:44px;      --text-title-xl:34px;  --text-title:30px;   --text-title-sm:26px;
--text-card-lg:20px;   --text-card:18px;      --text-action:17px;  --text-body:16px;
--text-body-sm:15px;   --text-meta:14px;      --text-chip:13px;    --text-label:12px;
--leading-tight:1.05;  --leading-title:1.12;  --leading-snug:1.35; --leading-body:1.5;
--tracking-hero:-1.2px; --tracking-title:-0.5px; --tracking-flat:0; --tracking-label:0.7px;
--weight-regular:400; --weight-medium:500; --weight-semibold:600; --weight-bold:700; --weight-heavy:800;
```

Every text style actually used, exactly as written:

| Where | Font shorthand | Extra |
|---|---|---|
| Screen title (Posts, Analytics, Profile) | `700 30px var(--font-display)` | `letter-spacing:-0.5px`, color `--ink` |
| Home greeting | `700 24px/1.15 var(--font-display)` | `letter-spacing:-0.5px` |
| Home greeting sub | `400 14px var(--font-ui)` | color `--slate-500` |
| Board H1 (all-screens page only) | `700 44px/1.05 var(--font-display)` | `letter-spacing:-1.2px` |
| Section H2 (day label, Growth) | `700 17–20px var(--font-display)` | `letter-spacing:-0.3px` |
| Uppercase micro-label | `700 12px var(--font-ui)` | `letter-spacing:0.7px`, `text-transform:uppercase`, color `--slate-500` |
| Hero card title (over frame) | `700 20px var(--font-display)`, line-height 1.35 | `letter-spacing:-0.3px`, `#FFFFFF`, clamp 2 lines |
| Tile card title | `700 15px var(--font-ui)`, line-height 1.35 | `letter-spacing:-0.2px`, `--text-strong`, clamp 2 lines |
| Tile meta | `400 13px var(--font-ui)` | `--text-muted`, clamp 1 line |
| Task title | `700 26px/1.18 var(--font-display)` | `letter-spacing:-0.5px` |
| Task description | `400 15px/1.5 var(--font-ui)` | `--slate-500` |
| Button lg | 17px / 800 | `letter-spacing:-0.1px` |
| Button md | 15px / 700 |  |
| Button sm | 14px / 700 |  |
| Chip / StatusChip | 13px / 700 | line-height 1 |
| Frame overlay pills | 12px / 700 | |
| Tab bar label | 11px / 700 | |
| Big metric number | `700 34px var(--font-display)` | `letter-spacing:-1px` |
| Mini-stat number | `700 19px var(--font-display)` | `letter-spacing:-0.4px` |
| Calendar day number | `700 13px var(--font-ui)` | |
| Month label | `700 15px var(--font-display)` | `letter-spacing:-0.2px` |
| Earnings amount | `800 13px var(--font-ui)` | `--green` |
| Earnings to-go | `600 11px var(--font-ui)` | `--slate-500`, `white-space:nowrap` |

## 2.3 Spacing

```css
--space-1:4px;  --space-2:8px;  --space-3:12px; --space-4:14px; --space-5:16px;
--space-6:18px; --space-7:20px; --space-8:24px; --space-9:28px; --space-10:32px; --space-11:40px;
--gutter:24px;      /* screen horizontal padding — every screen */
--card-pad:18px;    /* standard card padding */
--stack-gap:12px;   /* gap between cards in a list */
--section-gap:28px;
--tap-min:44px; --tap-primary:60px; --shutter:84px;
```

## 2.4 Shape, elevation, motion

```css
--radius-sm:12px; --radius-md:16px; --radius-lg:18px; --radius-xl:20px; --radius-2xl:24px; --radius-pill:999px;
--border-hair:1px; --border-field:1.5px; --border-select:2px;

--shadow-card:0 1px 2px rgba(15,23,32,0.04),0 6px 16px rgba(15,23,32,0.05);
--shadow-raised:0 2px 6px rgba(15,23,32,0.06),0 12px 28px rgba(15,23,32,0.08);
--shadow-float:0 6px 24px rgba(15,23,32,0.14);
--shadow-media:0 4px 18px rgba(15,23,32,0.10);
--shadow-accent:0 8px 20px rgba(27,166,238,0.28);
--ring-focus:0 0 0 3px rgba(27,166,238,0.30);

--ease-out:cubic-bezier(0.22,0.61,0.36,1);
--ease-in-out:cubic-bezier(0.4,0,0.2,1);
--ease-spring:cubic-bezier(0.34,1.32,0.64,1);
--dur-instant:90ms; --dur-fast:160ms; --dur-base:240ms; --dur-slow:420ms; --dur-stream:1600ms;
--press-scale:0.97;
```

Blur is used in exactly two places: the tab bar (`backdrop-filter: blur(18px)` over `--glass`) and the teleprompter scrim (`--scrim`, 45% black).

## 2.5 Canvas

| Thing | Value |
|---|---|
| Device frame | **390 × 844** (iPhone 14/15 logical) |
| Frame radius / bezel | `border-radius:46px`, `box-shadow:0 0 0 10px #10161d, 0 24px 60px rgba(15,23,32,0.28)` |
| Status bar height | **54px**, absolutely positioned, `padding:16px 30px 0`, time `700 15px` |
| Content area | `position:absolute; inset:0; padding-top:54px` → **390 × 790** usable |
| Screen gutter | **24px** left/right on every screen |
| Home indicator | 134 × 5, radius 999, `bottom:8`, `rgba(15,23,32,0.3)` |
| Tab bar | floats `left:16 right:16 bottom:22`, so **358px wide**, ~66px tall |
| Bottom padding on scrollable columns | **96px** (Home/Posts/Analytics/Profile), **110–120px** on feeds |

---

# 3. COMPONENT SPECIFICATION

## 3.1 Tree

```
Phone (390×844 chrome)
└── CreatorApp
    ├── HomeScreen                       tab 0
    │   ├── Wordmark(size 19, capsule) + bell w/ 9px dot
    │   ├── Segmented [Calendar | Inspiration]
    │   ├── (Calendar)
    │   │   ├── greeting h1 + sub
    │   │   ├── WeekStrip (7 days)
    │   │   ├── PostPager (3 slots)
    │   │   ├── PostCard → MediaCard(variant=hero, fill)
    │   │   │   └── footer: Button(Record) + Button(Swap) | status row
    │   │   └── EmptyState (empty / rest day)
    │   ├── (Inspiration) InspirationFeed
    │   │   ├── Dropdown [Everything|Reels|Slideshows]
    │   │   └── grid 2-up of MediaCard(variant=tile)
    │   └── SwapSheet (overlay)
    ├── PostsScreen                      tab 1
    │   ├── Header: h1 + view toggle [calendar|list]
    │   ├── account pills [Instagram][TikTok]
    │   ├── (calendar) MonthGrid + day label + PostRow list
    │   └── (list) Dropdown(Sort) + PostRow list (showDate)
    ├── GrowthScreen                     tab 2
    │   ├── h1 + range toggle [7D|30D|90D]
    │   ├── Dropdown(metric)
    │   ├── chart card: label, big number, delta chip, AreaChart, axis labels
    │   ├── 3 × MiniStat
    │   └── SplitBar
    ├── ProfileScreen                    tab 3
    │   ├── avatar + name + Edit
    │   └── 4 × Group(Row | ConnectRow)
    ├── TaskDetailScreen                 mode=detail
    ├── RecordScreen                     mode=record
    └── TabBar (4 items)
```

**Reusable (design system, `source/components/`):** `Button`, `Icon`, `ScreenHeader`, `Wordmark`, `BubbleMark`, `MediaCard`, `TaskCard`, `TrendCard`, `StatCard`, `InfoBlock`, `StatusChip`, `ProgressBar`, `EmptyState`, `TabBar`, `TextField`, `OptionCard`, `Chip`, `Stepper`, `ToneSlider`, `TeleprompterOverlay`.

**Kit-level, shared across creator screens (`ui_kits/creator-app/CreatorShared.jsx`):** `Segmented`, `WeekStrip`, `PostPager`, `Dropdown`, `SwapSheet`, `SkeletonCard`, `SkeletonLine`.

**Screen-specific:** `PostCard`, `InspirationFeed`, `MonthGrid`, `PostRow`, `Header`, `AreaChart`, `MiniStat`, `SplitBar`, `Group`, `Row`, `ConnectRow`, `NavBar`, `RailBtn`.

---

## 3.2 Design-system components

### Button
`variant` = primary | secondary | tint | outline | ghost | danger | approve · `size` = lg | md | sm · `block` · `icon` · `iconRight` · `disabled`

| Variant | Background | Color | Border | Shadow |
|---|---|---|---|---|
| primary | `--accent` #1BA6EE | #FFF | none | `--shadow-accent` |
| secondary | `--ink` #0F1720 | #FFF | none | none |
| tint | `--blue-100` #E7F4FD | `--blue-700` #0B76AD | none | none |
| outline | transparent | `--ink` | `1.5px solid #D6E3EF` | none |
| ghost | transparent | `--text-muted` #6B7A8C | none | none |
| danger | `--danger` #D93A3A | #FFF | none | none |
| approve | `--green` #1F8F5F | #FFF | none | none |

| Size | Height | Font | Padding | Icon |
|---|---|---|---|---|
| lg | 60px (`--tap-primary`) | 17px/800 | `0 28px` | 20 |
| md | 48px | 15px/700 | `0 20px` | 18 |
| sm | 40px | 14px/700 | `0 16px` | 18 |

All: `border-radius:999px`, `gap:8px`, `letter-spacing:-0.1px`, centered.
**Pressed:** `transform:scale(0.97)` for `--dur-instant` 90ms `--ease-out` (pointerdown → pointerup/leave).
**Disabled:** `opacity:0.35`, cursor default, no color change.
**Transition:** `transform 90ms var(--ease-out), background 160ms var(--ease-out)`.

### StatusChip
`status` = assigned | recorded | submitted | changes_requested | approved | posted. Optional `label` override.

| status | Label | fg | bg |
|---|---|---|---|
| assigned | To do | #0B76AD | #E7F4FD |
| recorded | Recorded | #6B7A8C | #F1F3F5 |
| submitted | In review | #E08A16 | #FDF2DF |
| changes_requested | Changes needed | #E08A16 | #FDF2DF |
| approved | Approved | #1F8F5F | #E4F5EC |
| posted | Posted | #FFFFFF | #1F8F5F |

Geometry: `padding:7px 12px`, `radius:999`, `font:700 13px`, `line-height:1`, `gap:6`, plus a leading 6×6 dot in `currentColor` at `opacity:0.75` (1.0 when posted).

### EmptyState
`icon` (default `inbox`) · `title` · `body` · `actionLabel` · `onAction`.
Column, centered, `gap:12`, `padding:40px 24px` (overridden to `24–30px 0` on Home).
Circle: 72×72, radius 999, `--blue-100` bg, icon 30 in `--blue-500`.
Title `700 18px var(--font-display)`, `letter-spacing:-0.2px`. Body `15px/1.5`, `--text-muted`, `max-width:300px`. Action = Button size md variant tint, `margin-top:4`.

### TabBar
4 items. Container: `display:flex; justify-content:space-around; gap:4; padding:8; border-radius:999; background:var(--glass); backdrop-filter:blur(18px); border:1px solid #E6EEF6; box-shadow:var(--shadow-float)`. Positioned `left:16 right:16 bottom:22`.
Item: column, `gap:3`, `padding:10px 6px`, `flex:1`, radius 999. Active: bg `--blue-100`, icon 22 `--blue-600`, label `700 11px` `--blue-700`. Inactive: transparent, icon `--slate-400`, label `--text-subtle`. Transition `background 160ms var(--ease-out)`. Optional badge: min 16×16 pill, `--accent`, white `800 10px`, offset `top:-4 right:-7`.

### MediaCard  ← the card everything on Home/Inspiration is built from
Props: `title, meta, format('reel'|'slideshow'|'video'|'photo_carousel'), time, duration, thumbnail, variant('hero'|'tile'), mediaHeight, fill, onPlay, onClick, children`.

Container: `background:#FFF`, `border:1px solid #E6EEF6`, `overflow:hidden`, `display:flex; flex-direction:column`, `min-width:0; min-height:0`.
- hero → `border-radius:24px`, `box-shadow:var(--shadow-raised)`
- tile → `border-radius:18px`, `box-shadow:var(--shadow-card)`
- `fill` → `height:100%`, media block `flex:1 1 auto; min-height:0`; otherwise media block is fixed `mediaHeight` (defaults: hero 200, tile 132).

Frame block: `position:relative`, background = `url(thumbnail) center/cover` **or** `linear-gradient(160deg,#E7F4FD 0%,#DCE7F0 100%)`.
- Format pill: `top:10 left:10`, `padding:6px 10px`, radius 999, `rgba(255,255,255,0.92)`, `--ink`, `700 12px`, `gap:5`, icon 13 (`video` for reel, `images` for slideshow). Label is literally **"Reel"** or **"Slideshow"**.
- Time pill: `top:10 right:10`, `padding:6px 10px`, radius 999, `rgba(15,23,32,0.55)`, white `700 12px`, `white-space:nowrap`.
- Play button: centered, hero **54×54** / tile **40×40**, radius 999, `rgba(255,255,255,0.92)`, `--shadow-media`, icon `play` 23/17 in `--ink` (`images` glyph for slideshows). Stops propagation.
- Duration pill: `bottom:10 right:10`, `padding:5px 9px`, radius 999, `rgba(15,23,32,0.55)`, white `700 11px`.
- hero only — scrim `linear-gradient(180deg,rgba(0,0,0,0) 42%,rgba(0,0,0,0.66) 100%)` over the whole frame, and the title absolutely at `left:16 right:76 bottom:14`, white, clamp 2 lines.

Body block (`flex:0 0 auto`, `padding:12`): tile shows title + meta; hero shows only `children` (the action row).

### TaskCard / TrendCard / StatCard / InfoBlock
Still in the system and used by the **admin** kit and task detail; not used on the creator Home any more. Specs live in their `.d.ts` + `.prompt.md` files in `source/components/content/`.

### TeleprompterOverlay
`height:34%`, `min-height:160`, `padding:12px 20px`, `background:var(--scrim)`. Text `600 26px/38px`, centered, `text-shadow:0 1px 4px rgba(0,0,0,0.8)`. Word states: spoken `rgba(255,255,255,0.45)`, current `--accent-tint` #8EC9F5 at weight 800, upcoming `#FFF`. Speed chip `top:12 right:16`. Paused chip bottom-center: "Script paused. Tap to resume."

---

## 3.3 Kit components

### Segmented (Calendar | Inspiration)
Track: `display:flex; gap:4; padding:4; border-radius:999; background:var(--fill-quiet)`.
Item: `flex:1; padding:11px 8px; border-radius:999; font:700 15px; letter-spacing:-0.1px`.
Active: `background:#FFF`, `box-shadow:var(--shadow-card)`, color `--ink`. Inactive: transparent, `--slate-500`.
Transition `background 160ms var(--ease-out), color 160ms var(--ease-out)`.

### WeekStrip (7 days)
Row, `gap:6`. Each day is `flex:1`, column, `gap:6`, `padding:10px 0 9px`, `border-radius:16px`.
- Selected: `background:var(--accent)`, `border:1px solid transparent`; dow `600 11px rgba(255,255,255,0.8)`, date `700 16px var(--font-display)` white, dots `rgba(255,255,255,0.85)`.
- Unselected: `background:#FFF`, `border:1px solid #E6EEF6`; dow `--slate-400`, date `--ink` (today: `--blue-600`).
- Dots: one 4–5px dot per scheduled post, `gap:3`, height 5. Past/done days `--green`, future `--blue-300`, none → single `--line-strong` dot.

### PostPager (the 1·2·3 strip under the week strip)
Track identical to Segmented (`gap:3; padding:3; radius:999; background:var(--fill-quiet)`).
Item: `flex:1`, row, centered, `gap:6`, `padding:7px 4px`, radius 999, `font:700 13px`. Label = the post's **time** ("08:30"), falling back to "Post N".
Leading 7×7 dot: **`--green` when posted/approved · `--amber` when submitted/recorded · `--blue-300` when assigned.**
Active item: `background:#FFF`, `--shadow-card`, `--ink` text. Inactive: transparent, `--slate-500`.
Always renders exactly the day's posts (3 on a normal day).

### Dropdown (all filters/sorts)
Trigger: `padding:9px 13px`, radius 999, `background:#FFF`, `border:1.5px solid #D6E3EF`, `font:700 14px`, `gap:8`; optional leading icon 15 in `--slate-500`; optional grey `label` prefix ("Sort:"); trailing `chevron-right` 15 rotated **90°** closed / **-90°** open, `transition:transform 160ms var(--ease-out)`.
Menu: `position:absolute; top:44px`, `min-width:176`, `background:#FFF`, `border:1px solid #E6EEF6`, `radius:16`, `box-shadow:var(--shadow-raised)`, `overflow:hidden`, `z-index:30`; full-screen invisible click-catcher behind it at `z-index:25`.
Row: `padding:12px 14px`, `border-bottom:1px solid #E6EEF6`, `font:600 14px`; selected row text `--blue-700` with a trailing `check` 16 in `--blue-600`.

### SwapSheet (bottom sheet)
Backdrop `--scrim` fading `opacity 0→1` over `--dur-base` 240ms.
Panel: `max-height:78%`, `background:#FFF`, `border-radius:24px 24px 0 0`, `box-shadow:var(--shadow-raised)`, `padding-bottom:26`, entering via `translateY(100%) → translateY(0)` over **240ms `--ease-out`**.
Grabber 40×5 radius 999 `--line-strong`, `padding-top:10`, centered.
Header `padding:14px 24px 12px`: title "Swap this post" `700 22px var(--font-display)` `-0.4px`; sub `400 14px/1.5` `--slate-500` reading `Same format, same pillars as the {time} slot.`; close button 34×34 circle `--fill-quiet` with `x` 18 `--slate-500`.
Filter chips row `padding:0 24px 12px`, `gap:7`: one chip per active filter (format label + each tag), `padding:7px 12px`, radius 999, `--blue-100` / `--blue-700`, `700 13px`, leading `check` 13.
Body: 2-up grid of `MediaCard(variant="tile", mediaHeight=150)`, `gap:10`, scrollable, `padding:0 24px`. Tap = pick.
Footer: `Button variant="ghost" size="md" block` — "Keep what I have", `padding:12px 24px 0`.

### SkeletonCard / SkeletonLine
`background:linear-gradient(100deg,var(--fill-quiet) 30%,#FAFCFE 50%,var(--fill-quiet) 70%)`, `background-size:220% 100%`, `animation:noni-shimmer 1400ms linear infinite` where
```css
@keyframes noni-shimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}
```

---

## 3.4 Screen-specific components

### PostCard (Home)
Wraps `MediaCard variant="hero" fill`. `time` = `Posted {t}` when done else `Posts {t}`. Footer by status:
- **assigned** → row `gap:10`: `Button md primary icon=video|images` labelled **"Record"** (reel) or **"Create"** (slideshow), `flex:1`; `Button md tint icon=rotate-ccw` labelled **"Swap"** (today only).
- **submitted/recorded** → amber chip (`padding:8px 12px`, radius 999, `--amber-soft`/`--amber`, `700 13px`, `clock` icon 14) "In review" + grey `600 13px` "Sent for approval" + `Button sm ghost` "See it".
- **posted/approved** → green chip (`--green-soft`/`--green`, `circle-check-big` 14) "Posted" + grey views string + `Button sm ghost` "See it".

### MonthGrid (Posts › calendar)
Card: `#FFF`, `1px solid #E6EEF6`, radius 18, `padding:14`, `--shadow-card`.
Header row: month label `700 15px var(--font-display)` `-0.2px`; right hint `600 12px` `--slate-400` = "Tap a day".
Grid: `repeat(7,1fr)`, `gap:2`. Weekday letters `700 11px` `--slate-400`, `padding-bottom:4`, order **S M T W T F S**.
Day cell: `aspect-ratio:1/1`, column, centered, `gap:2`, radius 10.
- selected → `background:var(--accent)`, number white
- today (unselected) → `background:var(--blue-100)`, number `--blue-700`
- has posts → number `--ink`; none → `--slate-300`
- under the number: up to **3** dots 4×4 `gap:2`, `--blue-300` (white 0.9 when selected)
Leading blanks come from `month.firstWeekday` (July 2026 = 3).

### PostRow (Posts lists)
`#FFF`, `1px solid #E6EEF6`, radius 16, `padding:12`, `display:flex; gap:12; align-items:stretch`, `--shadow-card`.
Thumb: `40px` wide (`flex:0 0 40px`), radius 10, placeholder gradient, centered glyph 15 `--slate-400`.
Right column `gap:4`:
1. meta row `600 12px` `--slate-400`: platform icon 13 · optional `"{d} Jul · "` · time · optional virality chip (`--green-soft`/`--green`, `700 11px`, `trending-up` 11, text `Top {101-virality}%`, only when `virality ≥ 90`).
2. title `700 14px/1.35`, `-0.2px`, clamp **1** line.
3. stats row `600 12px` `--slate-500`, `gap:14`: `eye` 13 + views, `zap` 13 + likes (formatted `12.8k` / `1.2M`).
4. **earnings row** `gap:8`: amount `800 13px` `--green` (`$` + 2dp) · progress track `height:5` radius 999 `--fill-quiet` with `--green` fill at `((earned % 20)/20)*100%` (`transition:width 240ms var(--ease-out)`) · to-go `600 11px` `--slate-500` nowrap: `{n} views to ${next}`.
**Earnings math (exact):** `CPM = 1.5`, `TIER = 20`; `earned = views/1000*CPM`; `next = floor(earned/TIER)*TIER + TIER`; `toGo = round((next-earned)/CPM*1000)`.

### AreaChart (Analytics)
`viewBox="0 0 320 H"` (H = **120** on the Analytics screen), `preserveAspectRatio="none"`, `width:100%`, `overflow:visible`, `pad = 10`.
Point mapping: `x = pad + i/(n-1)*(320-2*pad)`, `y = pad + (1-(v-min)/span)*(H-2*pad)`, `span = max(1, max-min)`.
Path: cubic between each pair with control x at the midpoint (`C mx,y0 mx,y1 x1,y1`) — see §6.5 for the exact code.
Fill: `linear-gradient` #1BA6EE `0.26 → 0` top-to-bottom, area closed to the baseline.
Line: `stroke:var(--accent)`, `stroke-width:3`, round caps/joins, `vector-effect:non-scaling-stroke`.
Gridlines: 3 horizontal `#E6EEF6` 1px at 25/50/75%.
Reveal: a `clipPath` rect whose width animates `0 → 320` over **`--dur-slow` 420ms `--ease-out`** on mount (set via a 20ms timeout).
End dot: 11×11 circle, `--accent`, `2.5px solid #FFF`, `--shadow-accent`, positioned at the last point, fading in `240ms ease-out` with **200ms delay**.

### MiniStat
Button-card: `#FFF`, `1px solid #E6EEF6`, radius 16, `padding:11`, `gap:4`, `--shadow-card`.
Label `600 12px` `--slate-500` + icon 13 `--slate-400`; value `700 19px var(--font-display)` `-0.4px`; sparkline `viewBox="0 0 100 28"`, height 24, `polyline` `--blue-300` width 2 non-scaling; delta `700 11px` `--green`.

### SplitBar
Card `#FFF`, radius 18, `padding:16`, `gap:10`. Caption `600 13px` `--slate-500`: `Where it came from · {range}`. Bar `height:10`, radius 999, `--fill-quiet`; TikTok segment `--accent` at 68%, Instagram `--blue-300` at 32% (`transition:width 240ms var(--ease-out)`). Legend `600 13px` `--ink` with 14px icons.

### Group / Row / ConnectRow (Profile)
Group: `padding-top:18`; H2 uppercase micro-label; body card `#FFF`, `1px solid #E6EEF6`, radius 18, `overflow:hidden`, `--shadow-card`.
Row: `padding:13px 14px`, `gap:12`, `border-bottom:1px solid #E6EEF6`; icon 19 `--slate-400` (or `--danger`); label `600 15px`; optional value `400 13px` `--slate-500`; optional `chevron-right` 17 `--slate-300`.
ConnectRow: `padding:12px 14px`; two-line left block (label `600 15px`, sub `400 12px` `--slate-500` = `@handle · 18.4k followers` or "Not connected"); right = `StatusChip approved label="Connected"` **or** `Button sm primary` "Connect".

---

# 4. RESPONSIVE BEHAVIOR

The design is **phone-first and fixed-canvas**: a 390×844 frame, centered on an `--off-white` page. Nothing in the current design targets tablet or desktop; treat the following as the contract.

| Width | Behavior |
|---|---|
| **< 390** | Screen is fluid: gutters stay 24px, all cards are `width:100%`, the hero card shrinks vertically because its frame is `flex:1`. Nothing has a min-width except the 2-up grids (`1fr 1fr`), which stay 2-up. Text clamps rather than wraps unbounded (hero 2 lines, tile 2 lines, PostRow title 1 line). |
| **390–430 (phones)** | Reference rendering. Everything is fluid width; only the tab bar's 16px insets and the 24px gutter are fixed. |
| **431–834 (tablet)** | Not designed. Recommended: keep the column at `max-width:430px`, centered, on `--off-white`. Do **not** reflow into multi-column. |
| **≥ 835 (desktop)** | Not designed. Same: center a 390–430px column, or present the phone frame as in `ui_kits/creator-app/index.html`. |

**Fixed vs fluid inside a screen**

| Element | Behavior |
|---|---|
| Status bar (54px), tab bar (66px @ bottom 22) | Fixed, always visible |
| Home Calendar column | **Never scrolls.** `flex:1; min-height:0; padding-bottom:96`. The hero card absorbs all leftover height via `flex:1` on its frame. |
| Home Inspiration feed | Scrolls vertically (`overflow-y:auto`, `padding-bottom:110`) — it is a feed |
| Posts calendar view | Month grid fixed; the day list below it scrolls only if the day is busy |
| Posts list view | Sort dropdown fixed; the row list scrolls |
| Analytics | **Never scrolls** |
| Profile | **Never scrolls** |
| Task detail | **Never scrolls**; CTA block pinned at the bottom |
| Record | Full-bleed, no scroll |
| SwapSheet | `max-height:78%`, its grid scrolls |
| Text overflow | `-webkit-line-clamp` (2 for card titles, 1 for meta and PostRow titles), `white-space:nowrap` on time/earnings pills |

---

# 5. INTERACTIONS

| Control | Action |
|---|---|
| Tab bar item | Switches tab (0–3). Background/label/icon color animate 160ms. |
| Segmented Calendar/Inspiration | Swaps the Home body instantly; segment thumb animates 160ms. |
| Week strip day | Selects the day. Home re-derives the day's posts, resets the pager to the first `assigned` post. |
| PostPager item | Selects which of the day's 3 posts is on screen. |
| Hero card frame / play button | Opens Task detail (`mode=detail`). Play stops propagation but does the same thing in the prototype. |
| Record / Create | Goes straight to `mode=record`. |
| Swap | Opens SwapSheet for that slot. |
| SwapSheet card | Replaces that slot in place (title, format, duration, summary, tags, trend) → sheet closes → dark toast `Swapped in "{title}".` for **2400ms** at `left:20 right:20 bottom:104`, `--ink` bg, `#fff 600 14px`, radius 16, `--shadow-float`. |
| SwapSheet backdrop / ✕ / "Keep what I have" | Closes without changing anything. |
| Inspiration filter dropdown | Filters the grid by format. |
| Inspiration card | Opens it as a task detail. |
| Posts view toggle | Switches calendar ↔ list. |
| Account pill (IG / TikTok) | Toggles that account in the filter set. Both = combined; one = that account; none selected falls back to both. `state="unlinked"` disables them at `opacity:0.35`. |
| Month day cell | Selects the day; the list below re-renders. |
| Sort dropdown | `Newest` (source order) · `Virality` · `Likes` · `Views` (all descending numeric). |
| Analytics metric dropdown | Switches the chart; the chart remounts (`key={metric+range}`) and replays the 420ms draw. |
| Analytics range 7D/30D/90D | Switches series length (7/30/90 points) and totals; chart replays. |
| MiniStat tile | Promotes that metric to the big chart. |
| Task detail frame | Toggles a play state: background → `--ink-900`, chips → translucent white, progress fill animates to 38% over 420ms, play glyph → pause. |
| Task detail Record | `mode=record`. |
| NavBar back chevron | Returns to the tab. |
| Record shutter | 3-2-1 countdown at 800ms/step → recording; teleprompter advances one word every `250/speed` ms; elapsed counts in 0.25s steps; total 90s. |
| Record teleprompter tap | Pauses/resumes the script (shows the paused chip). |
| Record speed chips | 0.75× / 1× / 1.25× / 1.5×. |
| Stop | Goes to the review state. |
| Send for review | Returns to Home + toast `Sent for review. Approve lands it in your queue.` (2600ms). |
| Kit state pill (Default/Loading/Empty/No accounts) | **Prototype harness only.** Remounts the app with that state. Do not build this into the product. |

**Motion inventory:** surfaces/sheets **240ms `--ease-out`**; color/background/opacity **160ms**; press **90ms** `scale(0.97)`; chart draw **420ms**; chart dot fade 240ms +200ms delay; skeleton shimmer 1400ms linear infinite. No spring, no bounce, no parallax.

**Mock data** — reproduce exactly from `source/ui_kits/shared/data.js` and `source/ui_kits/creator-app/creator-data.js`:
- Creator: `Fabri`, `@fabri.d1soccer`, returning = true.
- Today (3 posts): `08:30` "The 90-second tripod setup every coach copies" (reel, 0:35, **posted**, 41k views) · `13:00` "3 numbers that decide Sunday" (slideshow, 4 slides, **submitted**) · `18:45` "What a 31% possession drop actually looks like" (reel, 0:42, **assigned**, has script).
- Week strip: Mon 27 (3, done) · Tue 28 (2, done) · **Wed 29 = today** (3) · Thu 30 (3) · Fri 31 (2) · Sat 1 (1) · Sun 2 (0).
- Inspiration: 8 items with `format`, `tags`, `platform`, `handle`, `views`, `hook`, `why`, `summary`, `duration`.
- Posts: 7 recent days + 3 older days; `postsByDate` keyed by day-of-month for the month grid; July 2026, `firstWeekday:3`, today 29.
- Metrics: views/likes/followers/saves/comments/shares × 7D/30D/90D, each `{total, delta, series[]}` built by the `ramp()` helper (keep it — the wobble is deterministic).
- Split: TikTok 68% / Instagram 32%.

---

# 6. IMPLEMENTATION MAP

## 6.1 Proposed structure (RN / Expo — mirror it for web)

```
app/(creator)/
  index.tsx            Home (Calendar | Inspiration)
  posts.tsx            Posts (calendar | list)
  analytics.tsx        Analytics
  profile.tsx          Profile
  task/[id].tsx        Task detail
  record/[id].tsx      Record
components/
  ui/Button.tsx  Icon.tsx  StatusChip.tsx  EmptyState.tsx  TabBar.tsx  MediaCard.tsx
  creator/Segmented.tsx  WeekStrip.tsx  PostPager.tsx  Dropdown.tsx  SwapSheet.tsx  Skeleton.tsx
  creator/PostCard.tsx  MonthGrid.tsx  PostRow.tsx  AreaChart.tsx  MiniStat.tsx  SplitBar.tsx
theme/tokens.ts        ← 1:1 port of tokens/*.css
lib/earnings.ts        ← CPM math (§3.4)
```

## 6.2 Build order for Cursor

1. **Tokens.** Port `source/tokens/*.css` (colors, typography, spacing, shape, motion) into the repo's theme layer. No renaming, no rounding. Verify against §2.
2. **Primitives.** `Button`, `Icon`, `StatusChip`, `EmptyState`, `TabBar`. Screenshot-compare each against `source/components/<group>/*.card.html`.
3. **MediaCard.** Both variants + `fill`. This is the highest-risk component — check the overlay pill positions, the scrim stops, and the 2-line clamp.
4. **Shell.** 4-tab navigation + the two pushed screens; tab bar hidden on task/record.
5. **Home / Calendar.** Greeting → WeekStrip → PostPager → PostCard. Verify the no-scroll rule at 844 and at 667 (iPhone SE) — the frame must shrink, the footer must not clip.
6. **Home / Inspiration + SwapSheet.**
7. **Posts** — MonthGrid, day list, list view + sort dropdown, PostRow with earnings.
8. **Analytics** — Dropdown + AreaChart + MiniStat + SplitBar.
9. **Profile.**
10. **Task detail + Record** (port the teleprompter timing exactly).
11. **States** — loading (skeletons), empty, unlinked for every screen.
12. **Acceptance pass** (§8).

## 6.3 Files to read for exact values

| Need | File in `source/` |
|---|---|
| Tokens | `tokens/*.css` |
| MediaCard | `components/content/MediaCard.jsx` + `.d.ts` |
| Button / TabBar / StatusChip / EmptyState | `components/core/Button.jsx`, `components/navigation/TabBar.jsx`, `components/feedback/*.jsx` |
| Home, pager, cards | `ui_kits/creator-app/HomeScreen.jsx` |
| Segmented / WeekStrip / PostPager / Dropdown / SwapSheet / skeletons | `ui_kits/creator-app/CreatorShared.jsx` |
| Posts + month grid + earnings | `ui_kits/creator-app/PostsScreen.jsx` |
| Analytics + chart math | `ui_kits/creator-app/GrowthScreen.jsx` |
| Profile | `ui_kits/creator-app/ProfileScreen.jsx` |
| Task detail | `ui_kits/creator-app/TaskDetailScreen.jsx` |
| Record + teleprompter | `ui_kits/creator-app/RecordScreen.jsx`, `components/capture/TeleprompterOverlay.jsx` |
| Device chrome | `ui_kits/shared/Phone.jsx` |
| Mock data | `ui_kits/shared/data.js`, `ui_kits/creator-app/creator-data.js` |

## 6.4 Logo SVG (copy verbatim — `assets/logo.svg`)

Three round-cap strokes at `stroke-width:118` on a 512 box, plus gloss layers. **The gradients must use `gradientUnits="userSpaceOnUse"`** — with the default `objectBoundingBox`, the two vertical strokes have a zero-width bounding box and disappear entirely.

```
segments: 'M168 372V140'   (left stem)
          'M344 372V140'   (right stem)
          'M170 156L342 356' (diagonal)
body gradient:  userSpaceOnUse x1=120 y1=70 x2=420 y2=440
                #9AD4F9 0 → #4FB6F2 .36 → #1189CC .72 → #08557F 1
rim gradient:   userSpaceOnUse x1=256 y1=60 x2=256 y2=300
                #FFF .95 → #FFF .2 @.55 → transparent
drop shadow:    same strokes, #07547F, opacity .3, translate(4,18), blur 12
inner shade:    same strokes, #063F60, width 40, translate(8,44), blur 12, opacity .55, masked
top gloss:      same strokes, rim gradient, width 18, translate(-8,-40), blur 5, masked
speculars:      ellipse(152,200,r14×46,#FFF .9,blur3) · ellipse(328,196,r13×40,#FFF .5,blur5)
                ellipse(250,252,r11×42,#FFF .28,blur5,rotate 40) · ellipse(182,378,r42×15,#BFE6FF .28,blur12)
```
Full file: `source/assets/logo.svg`. React version with per-instance gradient ids: `source/components/core/Wordmark.jsx`.

## 6.5 Chart path math (copy verbatim)

```js
const W = 320, H = 120, pad = 10;
const max = Math.max(...series), min = Math.min(...series);
const span = Math.max(1, max - min);
const pts = series.map((v, i) => [
  pad + (i / (series.length - 1)) * (W - pad * 2),
  pad + (1 - (v - min) / span) * (H - pad * 2),
]);
const line = pts.map((p, i) => {
  if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const q = pts[i - 1];
  const cx = (q[0] + p[0]) / 2;
  return `C${cx.toFixed(1)} ${q[1].toFixed(1)} ${cx.toFixed(1)} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
}).join(' ');
const area = `${line} L${W - pad} ${H} L${pad} ${H} Z`;
```

## 6.6 Number formatting (copy verbatim)

```js
// big numbers (Analytics)
v >= 1_000_000 ? `${(v/1e6).toFixed(v >= 1e7 ? 0 : 1)}M`
: v >= 1000    ? `${(v/1000).toFixed(v >= 10000 ? 0 : 1)}k`
:                `${v}`
// row stats (Posts) use the k-branch only
```

---

# 7. VISUAL REFERENCE

`screenshots/` — 22 PNGs, each the full 390×844 frame rendered at 0.58 scale (divide any measured pixel by 0.58 to get design px):

| # | File | What it shows |
|---|---|---|
| 01 | `home-todo` | Home, slot 3 selected (assigned): Record + Swap |
| 02 | `home-posted` | Home, slot 1: green "Posted" footer + 41k views |
| 03 | `home-review` | Home, slot 2: amber "In review" footer |
| 04 | `home-otherday` | Thu 30 selected — that day's plan in the pager |
| 05 | `home-restday` | Sun 2 — "Rest day" empty state |
| 06 | `home-loading` | Pager + card skeletons |
| 07 | `home-empty` | "Nothing queued today" + Open Inspiration |
| 08 | `home-swap` | SwapSheet open over Home, filter chips + 2-up grid |
| 09 | `inspiration` | Inspiration grid + format dropdown |
| 10 | `inspiration-empty` | "No ideas yet" |
| 11 | `posts-calendar` | Month grid + today's row with earnings |
| 12 | `posts-list` | List view + Sort dropdown |
| 13 | `posts-loading` | Skeleton rows |
| 14 | `posts-unlinked` | "Link your accounts to see your posts" |
| 15 | `analytics` | Views 7D chart, 3 mini stats, split bar |
| 16 | `analytics-loading` | Chart skeleton |
| 17 | `analytics-empty` | "No numbers yet" |
| 18 | `profile` | Connected state |
| 19 | `profile-unlinked` | Both accounts "Not connected" + Connect buttons |
| 20 | `task` | Task detail with example player |
| 21 | `task-noscript` | Task detail, "No script — say it your way." |
| 22 | `record` | Dark record screen with teleprompter |

**Key measurements against the 390×844 canvas**

| Screen | Element | Exact |
|---|---|---|
| All | gutter | 24px each side → content width **342px** |
| All | tab bar | `left:16 right:16 bottom:22` → **358 × ~66** |
| Home | wordmark row | `padding:6px 24px 0`; mark **29px** (19 × 1.55), gap `19 × 0.26 ≈ 4.9px`; bell 23 with a 9×9 `--accent` dot, 2px white ring |
| Home | segmented block | `padding:12px 24px 12px`, control height **≈46px** |
| Home | greeting | 24px/1.15, sub 14px with `margin-top:4` |
| Home | week strip → pager → card | column `gap:10` |
| Home | hero card | radius **24**, `--shadow-raised`; frame `flex:1`; footer `padding:12`, buttons 48 tall |
| Home | column bottom padding | **96px** |
| Inspiration | grid | `1fr 1fr`, `gap:10`, tile frame **150px** |
| Posts | month card | `padding:14`, cells `aspect-ratio:1`, `gap:2` |
| Posts | day list gap | 8px, rows ~96px tall with the earnings line |
| Analytics | chart card | `padding:16`, chart height **120**, axis labels `margin-top:8` |
| Analytics | mini stats | `repeat(3,1fr)`, `gap:8`, `padding:11` |
| Profile | avatar | 58×58 circle, `--blue-100`, initial `800 22px` `--blue-700` |
| Task | player | height **292**, radius 24, `--shadow-media`; play 62×62 |
| Task | CTA block | `padding:14px 24px 30px`, Button lg (60px) + 12px caption |
| Record | shutter | 84×84 ring (4px white) with a 64px `--accent` core; stop = 76×76 ring with a 28×28 radius-6 square |

**Things an AI coding tool will get wrong — check these explicitly**

1. **Baby blue is not the button color.** Buttons are `#1BA6EE`; `#8EC9F5` is a tint only.
2. **Only "Reel" and "Slideshow"** appear on creator cards — not "Video"/"Photo carousel" (those strings exist in `TaskCard` for the admin kit).
3. The hero card title is **inside** the frame on the scrim, not below it, and is inset `right:76` so it never runs under the duration pill.
4. The pager dot colors are driven by **post status**, not by position or selection.
5. The tab bar **floats** (16px insets, 22px from the bottom) — it is not flush.
6. Home, Analytics, Profile and Task **must not scroll**. If content overflows, shrink the frame — do not add a scroll view.
7. The chart is hand-drawn SVG with a **clip-path reveal**, not a library.
8. Gradients on straight strokes need `gradientUnits="userSpaceOnUse"` (§6.4).
9. `--shadow-card` is a two-layer shadow; do not collapse it to one.
10. Sentence case everywhere. Buttons name the action ("Record", "Swap", "See it", "Send for review") — never "Submit"/"OK"/"Continue".
11. **No emoji anywhere.**
12. Empty states always name the next action; copy strings in §5/§7 are final.
13. Press feedback is `scale(0.97)` at 90ms — not opacity.
14. Skeletons shimmer at 1400ms linear, gradient angle 100deg.
15. The status bar is 54px of **padding**, not a component with its own layout — content starts under it.

---

# 8. ACCEPTANCE CHECKLIST

Run at **390×844**, side by side with the matching `screenshots/*.png`, then overlay at 50% opacity and correct any drift in spacing, size, type, color, radius, shadow, or alignment before declaring a screen done.

**Global**
- [ ] Tokens match §2 exactly (spot-check 10 values in DevTools).
- [ ] Figtree/Nunito (or SF Pro/SF Pro Rounded on device) loading; no fallback sans rendering.
- [ ] Gutter 24px on every screen; tab bar 16/16/22 floating with blur.
- [ ] Press feedback 0.97 @90ms on every button.
- [ ] No emoji, no invented copy.

**Home — Calendar** (01–07)
- [ ] Wordmark + bubble N mark render; bell dot present.
- [ ] Segmented control, Calendar active.
- [ ] Greeting reads `Welcome back, Fabri.` with `1 left to shoot today.`
- [ ] Week strip: 7 cells, Wed 29 selected in `--accent`, dot counts 3/2/3/3/2/1/0, past days green.
- [ ] Pager shows `08:30` green, `13:00` amber, `18:45` blue; selected pill white.
- [ ] Hero card fills remaining height; footer never clips; Record + Swap visible in full.
- [ ] Slot 1 shows the green Posted footer; slot 2 the amber In review footer.
- [ ] **Nothing scrolls.**
- [ ] Loading = pager skeleton + full-height card skeleton; Empty = "Nothing queued today"; Sunday = "Rest day".

**Home — Inspiration + Swap** (08–10)
- [ ] 2-up grid, tile frames 150px, meta `@handle · views`.
- [ ] Dropdown filters by format.
- [ ] Sheet slides 240ms, chips list format + tags, tap replaces the slot, toast for 2400ms.

**Posts** (11–14)
- [ ] Calendar/list toggle top-right; month grid July 2026 starting Wednesday.
- [ ] Day dots ≤3, today tinted, selected filled.
- [ ] PostRow earnings line: `$61.80` + bar + `12k views to $80` math per §3.4.
- [ ] List view sort dropdown with the check mark on the active option.
- [ ] Unlinked state disables the pills and centers the empty state.

**Analytics** (15–17)
- [ ] Metric dropdown, range 7D/30D/90D.
- [ ] Chart redraws left→right in 420ms on every switch; end dot fades in after 200ms.
- [ ] 3 mini stats promote on tap; split bar 68/32.
- [ ] **Nothing scrolls.**

**Profile** (18–19)
- [ ] Four groups in the exact order: Balance, Accounts, Settings, Legal and support.
- [ ] Delete account is `--danger`, icon and label.
- [ ] Connected shows `StatusChip` "Connected"; unlinked shows a Connect button.
- [ ] **Nothing scrolls.**

**Task + Record** (20–22)
- [ ] No hook / script / caption blocks anywhere on task detail.
- [ ] Player 292px, tap toggles the dark playing state.
- [ ] Caption line switches between "Your script runs in the teleprompter." and "No script — say it your way."
- [ ] Record: 3-2-1 at 800ms, teleprompter word at 250/speed ms, 90s total, stop → review → Send for review returns Home with the toast.

---

# 9. What Cursor cannot reproduce without more from you

1. **Real post frames.** Every thumbnail is a placeholder gradient. Supply scraped 9:16 stills (or the API that returns them) before this looks like the intended product.
2. **Brand icons.** TikTok and Instagram marks are stand-ins (`music-2`, `at-sign`). Supply the official SVGs.
3. **Fonts.** Confirm SF Pro / SF Pro Rounded on device, or licensed files for the web.
4. **App icon.** The SVG mark is production-quality as a vector, but the shipping iOS icon should be a 3D render at 1024×1024, exported flat with an opaque ground.
5. **Earnings model.** $1.50 CPM and $20 tiers are placeholders for the visual. Supply the real payout rules (per-platform rates, minimums, payout cadence) — the copy and the progress bar depend on them.
6. **Analytics source.** Series are generated locally. Supply the real endpoints and the exact metric definitions (are "views" plays or reach? is "following" net or gross?).
7. **Backend states not designed yet:** error/offline, token expiry on a connected account, a day with more or fewer than 3 posts, changes-requested returning to the creator, and payout/wallet detail screens.
8. **Tablet/desktop.** Not designed (§4). Ask before inventing a layout.
