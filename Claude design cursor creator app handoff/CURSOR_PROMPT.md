# Cursor master prompt — Noni creator app

Paste everything below the line into Cursor (or a Claude Code / agent runner) at the repo root, with this handoff folder and the design project files available.

---

You are building the **creator side of Noni**, an Expo / React Native + Supabase app, to pixel- and behavior-accuracy against a finished design. The contract is in this folder:

- `README.md` — tokens, color coding, motion, acceptance
- `SCREENS.md` — every screen, state, and measurement
- `FLOWS.md` — the task state machine and every flow
- `screenshots/` — rendered references (390×844)
- Design source (ground truth when docs are ambiguous): `ui_kits/creator-app/*.jsx`, `components/`, `tokens/*.css` in the design project

**Rules**
1. Do not redesign. Every color, radius, copy string, chip, duration and easing is specified — copy it.
2. Use the repo's existing stack and patterns (Expo Router under `app/(creator)/…`, TypeScript, Supabase). No Tailwind, no UI kits, no chart/animation libraries. Charts and waveforms are hand-drawn SVG.
3. All UI state derives from one task-queue store implementing the status machine in FLOWS.md. No screen keeps its own copy of a task's status.
4. Sentence case, no emoji, no exclamation marks. Buttons name the action.
5. After each screen, render it side by side with the matching screenshot and fix drift before moving on.

**Plan — run as parallel agents with a shared foundation**

- **Agent 0 · Foundation (blocks everyone — do first, alone).** Theme layer from `tokens/*.css`; primitives: Button, Icon (Lucide), StatusChip, FormatTag, TypeTag, EmptyState, TabBar, MediaCard (with the on-media `chips` prop), Skeletons, SlideNav (the slideshow scroller), TeleprompterOverlay, chat bubble kit (bubble, quote, post-ref, voice note, divider). Plus the queue store + status machine + mock data ported from `creator-data.js`. Deliver with a component gallery screen for review.
- **Agent A · Home + Record.** Home (welcome, week strip, pager, hero card, all four card states, auto-advance, toasts), Swap sheet + preview modal, Task detail, the full record flow (clips, talking points, between-clips panel, slideshow upload, processing, review, send for approval).
- **Agent B · Posts.** Calendar / briefs / list views, week detail, PostRow + earnings math, post detail (platform switcher, saves, dual open-on links), changes banner + per-post changes detail.
- **Agent C · Messages + Profile + Onboarding.** Messages thread (rich bubbles, record-changes bar), Profile (role switcher, avatar upload, earnings card, groups), invite modal, Get set up gating, Analytics port (unchanged from source).
- **Integrator (after A–C).** Wire everything to the shared store, verify the cross-surface flows in FLOWS.md end to end (especially F5: a changes_requested task must update Home, Posts and Messages simultaneously, and resubmitting must clear all three), run the acceptance checklist in README.md, and screenshot-diff every screen.

Agents A–C only consume Agent 0's primitives — if a primitive is missing or wrong, fix it in the foundation, never fork a local copy.

**Definition of done:** every box in README.md's acceptance checklist checked, every flow in FLOWS.md demonstrable on device, zero screens visually drifting from `screenshots/` beyond antialiasing.
