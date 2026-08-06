# Cursor prompt — Noni admin app

Paste this whole file into Cursor with the repo open. Read it before writing any code.

Design source of truth: `design_handoff_admin_app/README.md` (every value) and `ui_kits/admin-app/` (running kit at 390×844). Preserve the Expo / React Native stack, existing navigation and `theme/tokens.ts`. This is a **visual and flow** task: product rules do not change.

---

## HOW TO BUILD THIS — read this section twice

**Do not one-shot this handoff.** Do not attempt "implement the admin redesign" as a single task. Every previous attempt at that produced a broken app. The work is deliberately cut into ten stages below. Each stage is small enough to review in one sitting.

Rules that are not optional:

1. **One stage per session.** Implement exactly one numbered stage, then stop. Report what changed, list the files you touched, and wait. Do not start the next stage in the same run, even if the stage was small.
2. **Gate every stage.** A stage is finished only when: the app builds, the screens in that stage render on a device or simulator, and nothing outside the stage's file list changed. If you cannot meet all three, revert the stage rather than patching forward.
3. **Commit per stage** with the stage number in the message (`admin stage 3: briefs grid`). One commit, one revert path.
4. **Use parallel agents only where the stage table says the lanes are independent**, and give each agent its own file list. Two agents must never hold the same file. Shared primitives (Stage 1) land first and are frozen before any lane starts.
5. **Never refactor outside the stage.** No renaming, no "while I was here", no reorganising folders, no upgrading dependencies. If something adjacent looks wrong, write it down and ask.
6. **Do not invent values.** Every hex, px, radius, duration, and copy string is in the README. If a value is missing, stop and ask — do not approximate.
7. **Do not delete or rewrite working screens** to make a new one fit. Extend.
8. **Ask before changing data shape.** If a screen seems to need a new API field, stop and list what you need.

If a stage turns out bigger than it looked, split it further and tell me. Smaller is always right.

---

## Ground rules for the code

- Tokens from `theme/tokens.ts` only. Primary `#1BA6EE` (`blue500`), tint `#8EC9F5` (`blue300`, never white text on it), off-white `#F7FAFD`, ink `#0F1720`.
- Reuse `Button`, `Icon`, `StatusChip`, `EmptyState`, `SheetShell`, skeletons, chart components. New component only when nothing fits.
- Motion: 240ms surfaces, 160ms colour, 90ms `scale(0.97)` press, 420ms chart draw, 1400ms skeleton shimmer, easing `cubic-bezier(0.22,0.61,0.36,1)`.
- Copy is sentence case, no emoji, real FieldVision strings from the kit — never lorem.
- Both formats everywhere: video (Reel) and photo_carousel (Slideshow). No video-only assumptions.
- Every list card in a queue is a fixed height. Conditional content goes on the media, not into a wrapping chip row.
- Do not add: a type picker in the post editor, a Calendar tab, a Trends tab, "why this works" copy, purple gradients, or generic dashboard chrome.

---

## Stages

| # | Stage | Files it owns | Parallel? |
| --- | --- | --- | --- |
| 1 | Shared primitives | `theme/tokens.ts`, `components/admin/shared/*` | No — must land alone, first |
| 2 | Review tab | `app/(admin)/(tabs)/index.tsx`, `components/admin/SubmissionRow.tsx`, `MusicApprovalRow.tsx`, `AccountRow.tsx` | Lane A |
| 3 | Review detail + revision mode | `app/(admin)/review/[id].tsx`, `components/admin/review/*` | Lane A |
| 4 | Music + account approval + account template | `app/(admin)/music/*`, `account-approval/*`, `account-template.tsx` | Lane A |
| 5 | Briefs grid + calendar view | `app/(admin)/(tabs)/create.tsx`, `components/admin/grid/*` | Lane B |
| 6 | Week setup | `app/(admin)/week-setup.tsx` | Lane B |
| 7 | Post editor wizard | `app/(admin)/post/[id].tsx`, `components/admin/editor/*` | Lane B — biggest stage, split it |
| 8 | Library + picker sheet | `app/(admin)/(tabs)/library.tsx`, `components/admin/library/*` | Lane C |
| 9 | Creators, profile, post, chat | `app/(admin)/(tabs)/creators.tsx`, `creator/*`, `chat/*` | Lane C |
| 10 | Analytics, settings, Brand Brain, Features | `app/(admin)/(tabs)/analytics.tsx`, `settings.tsx`, `brain.tsx`, `features.tsx` | Lane C |

**Lane rule:** Stage 1 lands and is frozen. After that, Lane A (2→3→4), Lane B (5→6→7) and Lane C (8→9→10) may run as three parallel agents, because they share no files. **Within a lane the order is strict** — stage 3 depends on stage 2's row component, stage 7 depends on stage 5's row states. Never run two stages of the same lane at once.

---

### Stage 1 — shared primitives (must land alone, first)

1. `postTypeTone` map in the theme (README §1 table) and a `PostTypeChip`.
2. Media components: `PostThumb` (fixed box, real thumbnail, `object-fit: cover`, bottom-left badge, optional top-left amber badge, gradient fallback) and `CreatorAvatar` (real profile photo, initial-letter fallback).
3. `AdminScreen` scaffold (20px gutter, scrolling column, pinned action bar the content scrolls behind), `AdminHeader`, `PushHeader`, `Segmented`, `SectionLabel`, `Sheet`, `ScoreDial`, `ScoreBar`, skeleton shimmer.

Nothing else. Freeze this before opening lanes.

### Stage 2 — Review tab
Three queues in one tab with counts inside the switcher. Submission rows **exactly 96px** (72px media + 12px padding): thumbnail with duration or slide-count badge, `Take N` as an amber badge on the media, profile photo + short name + time, 2-line clamped title, one non-wrapping chip row. Music and account rows per README §2. Three empty states.

### Stage 3 — Review detail + revision mode
Platform-accurate 9:16 frame (Reel player / Slideshow pager), scrim bars, two actions, approved overlay with the automation steps. Revision mode: section-by-section notes with inline editors, whole-post alternative, `Send back · N notes`, sent confirmation. Only noted sections return.

### Stage 4 — Music, account approval, account template
One-tap music confirm, the warm-up proof list, the feed test, structured rejection reasons, handle capture on approval, and the company account template with copy/download.

### Stage 5 — Briefs grid + calendar
Lane switcher with counts, split header with amber drift, five row states, and the three-state footer: in progress = **no buttons** (status strip only, New week not offered), complete = Publish + schedule line, published = Start next week. Calendar as a view toggle, never a tab.

### Stage 6 — Week setup
Three steps with the defaults in README §7, sum validation banner, Next disabled until the split matches, pool-not-lock footer line.

### Stage 7 — Post editor wizard (split this into three commits)
- 7a: shell — locked type, step dots, Save progress, Back/Next, step routing.
- 7b: steps 1–4 (title, search phrase, hook with Other, CTA with claim trace).
- 7c: steps 5–7 (talking points with screenshot + Move sheets, caption + merged preview, AI review with Apply/Ignore) and the slideshow variant.

Generation stays on demand: nothing fires on mount, every AI action is a tap, order of truth is type → claim → phrase → points → hook → caption, clip count is derived.

### Stage 8 — Library + picker
Pinned quick capture (multiline paste = many ideas), four chips, performance-sorted Our posts, type-filtered picker sheet used by the editor.

### Stage 9 — Creators, profile, post, chat
Roster cards with money/posts/views, Instagram-shaped profile with grid/calendar, post detail stats, one chat thread per creator with inline post references (same thread as Review's chat entry).

### Stage 10 — Analytics, settings, Brand Brain, Features
One chart with activity bars and the metric on one axis, per-creator and best-hook lists, gear into Settings, doctrine docs, and the approved/rejected claims list.

---

## Stop and ask before you build

1. **Publish timing** — is the Sunday 8PM EST cutoff tenant-configurable or global?
2. **Week rollover** — does publishing week 14 create week 15's empty rows, or does the admin run week setup again?
3. **Kill reasons** — free text or a fixed list? The kit shows free text.
4. **Hook count** — spec says 8–10 options; confirm what the generator actually returns.
5. **Screenshot storage** — camera roll picks uploaded per point, or referenced from an existing asset table?
6. **Move semantics** — can two points share a clip slot, or is it one-to-one?
7. **AI score persistence** — is the row's AI score the last review's overall, or recomputed on save?
8. **Thumbnails** — where does the Reel first frame come from: the render pipeline, or generated client-side?
9. **Profile photos** — synced from the linked TikTok/Instagram account, or uploaded during onboarding?
10. **Attempt counter** — is `attempt` on the submission or the assignment?

Answer these with me before Stage 2. Do not guess and build around a guess.
