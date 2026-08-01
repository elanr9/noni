# CURSOR_PROMPT — Noni admin app (Queue · Review · Calendar)

Paste this whole file as the first message of a fresh Cursor session, with `design_handoff_admin_app/` open in the workspace.
It is written to be executed by an orchestrator that spawns subagents. Do not skip the preflight. Do not merge stages.

---

## 0. Your role

You are the **orchestrator**. You do not write screen code yourself. You:

1. run the preflight and write `HANDOFF_CONTRACT.md`,
2. spawn subagents one stage at a time, each with its own file ownership,
3. verify each stage against the reference PNGs before the next stage starts,
4. stop and ask when the handoff says STOP AND ASK.

Ground truth, in this order of authority:

1. `design_handoff_admin_app/README.md` — the spec (every hex, px, weight, radius, duration, copy string).
2. `design_handoff_admin_app/screenshots/*.png` — pixel reference, 2× of 390×844.
3. The existing repo — stack, navigation, data layer, naming conventions.

If those three disagree, the README wins on visuals and copy, the repo wins on architecture. **Never a fourth source. Never your own taste.**

---

## 1. Hard rules (violating any of these fails the stage)

1. **Preserve the stack.** Same framework, router, state and data layer already in the repo. No new dependencies without asking — that includes UI kits, icon packs, animation libraries, styling libraries and date libraries.
2. **Tokens verbatim.** Every colour, size, weight, radius, shadow and duration comes from README §1. No new hex values. No "close enough" rounding. No opacity tricks to fake a token.
3. **No invented content.** Every string ships exactly as written in the README, including punctuation and casing. No lorem ipsum, no placeholder names, no emoji, no exclamation marks.
4. **No invented screens.** Trends, Brand Brain, Analytics, Settings, onboarding and auth are **not designed**. Route their tabs to an existing placeholder and stop.
5. **Build only the chosen options.** Queue is 1a **or** 1b; Review is 1e **or** 1f. If the choice is not stated in this session, **stop and ask** before Stage 2.
6. **One stage at a time.** A stage ends with a screenshot comparison and a green typecheck/lint. Do not start the next stage with a failing one behind you.
7. **File ownership is exclusive.** A subagent edits only the files listed in its brief. If it needs something outside that list, it stops and reports to the orchestrator.
8. **No refactors.** Do not rename existing files, reorganise folders, reformat untouched code, upgrade packages, or "improve" anything you were not asked to build.
9. **Reuse before writing.** Search the repo for an existing `Button`, `Icon`, `StatusChip`, `EmptyState`, `TabBar`, `InfoBlock` first. Extend with a variant; never fork a second copy.
10. **Ask, don't guess.** Anything not in the README goes on the questions list. An unanswered question is never resolved with an invention.

---

## 2. Preflight (orchestrator, before any code)

Read and report, in one message, before writing anything:

- the framework, language, router and how screens are registered;
- where components, theme/tokens and mock data live today;
- which of `Button` `Icon` `StatusChip` `EmptyState` `TabBar` `InfoBlock` `Wordmark` already exist, with their real prop signatures;
- the existing task/submission model and its status enum;
- how navigation params are passed and how sheets/modals are presented today;
- whether a tokens/theme file already exists (extend it — do not create a second one).

Then write **`HANDOFF_CONTRACT.md`** at the repo root, and treat it as frozen for the rest of the job:

```
1. Token map      design token → the exact repo symbol (e.g. blue-500 → theme.color.accent)
2. Component map  README component → existing repo component + the props it takes
3. New files      exact paths for every file that will be created, per stage
4. Type contract  the TS interfaces every stage shares (Submission, Task, Creator,
                  TaskStatus, ContentFormat, ReviewThreadEntry)
5. Data contract  mock data module path + shape, seeded from README §8
6. Open questions numbered; nothing gets invented to fill a gap
```

Every subagent below receives `HANDOFF_CONTRACT.md` plus its own brief. Nothing else is shared state.

---

## 3. Stages and subagents

Spawn each subagent with: this file, `HANDOFF_CONTRACT.md`, the README sections named, its screenshots, and its file list. Run one stage at a time; the two subagents *inside* a stage may run in parallel because their file lists are disjoint.

### Stage 1 — Foundations (blocking, do not parallelise)

**Agent F1 · tokens + primitives** — README §1, §2, §3.
Files: the theme/token module, `FormatPill`, `MediaFallback`, `SegmentedTabs`, `SheetShell`, `SkeletonBlock`, plus any missing variant on the existing `Button` / `StatusChip`.
Deliver: every token from §1 as named constants; the five new primitives with typed props; a scratch "kitchen sink" screen rendering all of them side by side.
Done when: the kitchen sink shows every primitive in every state and no literal hex appears in any file except the theme module.

**Agent F2 · shell + data** — README §2, §8.
Files: admin navigator, tab bar wiring, device-frame/safe-area layout, mock data module, shared types.
Deliver: five tabs in order with the badge on Queue, floating bar geometry exactly per §2, `Submission` / `Task` / `Creator` types, mock data verbatim from §8 including both week grids.
Done when: all five tabs mount (three as placeholders) and the mock data typechecks against the contract.

**Gate:** orchestrator screenshots the kitchen sink and the empty shell, confirms the tab bar geometry against `screenshots/01`, and only then continues.

### Stage 2 — Queue (README §4, screenshots 01–04)

**Agent Q1** — Queue screen, the chosen row/card component, filter chips, header.
**Agent Q2** — Queue empty, loading (skeleton, 1400ms shimmer) and one-left states.
Done when: all four states render from mock data, rows are 44+ tall, the badge equals the pending count, and every string matches §4.

### Stage 3 — Review (README §5, screenshots 05–09) — the most important stage

**Agent R1** — the chosen Reel layout (1e or 1f) plus the shared header/footer, and the Slideshow variant (1g). Both formats share one layout language; the slideshow must contain **no** video chrome.
**Agent R2** — thread variant (1h), request-changes sheet (1i left), approved + note-sent confirmations (1i right).
Done when: Approve is `#1BA6EE` primary and Request changes is an outline button (never red); the footer helper line states the scheduled slot; for option 1f the highlighted script line follows playback and tapping a line seeks.

### Stage 4 — Calendar (README §6, screenshots 10–13)

**Agent C1** — week grid, creator rows, day columns, `CalendarCell` (filled + empty), synced horizontal scroll.
**Agent C2** — task edit sheet and both Generate sheets, including the progress checklist.
Done when: the light week (3 creators) and heavy week (5 creators) both render without clipping or overlap, empty cells open New task prefilled, and generation runs non-blocking.

### Stage 5 — Behaviour (README §7)

**Agent B1** — navigation and state: row → Review → Approve / Request changes → confirmation → next; optimistic removal; badge sync; 240ms transitions; 90ms 0.97 press feedback everywhere.
Done when: a user can clear five submissions end to end without a dead end, and the empty state appears at the end.

### Stage 6 — Verification

**Agent V1 · adversarial reviewer.** Owns no files; may only report.
For each screenshot: render the built screen at 390×844, capture, and compare side by side. Report every difference in spacing, weight, colour, radius, order or copy — no matter how small. Re-check hardcoded hexes, string drift, tap targets under 44, text under 12, and any dark surface that is not media.
Output: a numbered defect list. The orchestrator assigns fixes back to the owning agent. Repeat until the list is empty.

---

## 4. Translation table (CSS in the handoff → native)

The design source is HTML/CSS. If the repo is React Native, translate — do not paste CSS.

| Handoff | Native |
|---|---|
| `px` | dp, 1:1 |
| `font: 700 15px/1.3` | `fontWeight:'700', fontSize:15, lineHeight:20` (round line-height to the nearest dp) |
| `box-shadow` | iOS `shadowColor/Opacity/Radius/Offset` + Android `elevation`; keep the blue-black cast |
| `backdrop-filter: blur(18px)` | `BlurView intensity≈18` (or the repo's existing blur) — tab bar only |
| `aspect-ratio: 9/16` | `aspectRatio: 9/16` |
| `-webkit-line-clamp: 2` | `numberOfLines={2}` |
| `white-space: nowrap` | `numberOfLines={1}` + `flexShrink: 0` |
| `gap` | `gap` if supported, else explicit margins — never rely on whitespace |
| `position: sticky` footer | absolutely positioned footer + list `contentContainerStyle.paddingBottom` |
| `transition` | `Animated`/Reanimated with the exact durations and `Easing.bezier(0.22,0.61,0.36,1)` |
| shimmer keyframes | looped Animated translate over the gradient, 1400ms linear |

---

## 5. What goes wrong with this handoff (check yourself against this list)

- Hardcoding `#1BA6EE` in a screen instead of using the token symbol.
- Making Request changes red. It is an outline button; red is only for *Remove from calendar* and errors.
- Rewriting copy "for clarity". Every string is final.
- Building both Queue layouts, or both Review layouts, "so the user can choose".
- Designing Trends / Analytics / Settings / onboarding because the tab exists.
- Dropping the format distinction — every list row, cell and review screen states Reel or Slideshow.
- Putting a tab bar on Review or on a sheet.
- A dark background on anything that is not media.
- Flattening the floating tab bar against the screen edge, or forgetting the 116 bottom padding so the last row hides behind it.
- Skipping loading, empty and error states because "the happy path works".
- Silent scope creep: a new dependency, a renamed folder, a reformatted file.

---

## 6. Definition of done

- Every screenshot in `screenshots/` has a matching screen that survives V1's side-by-side review.
- Zero literal colours outside the theme module; zero strings that differ from the README.
- Typecheck, lint and existing tests pass.
- `HANDOFF_CONTRACT.md` open questions are all answered by a human — none silently resolved.
- A short `IMPLEMENTATION_NOTES.md`: what was built, deliberate deviations with reasons, and what is still stubbed.
