# Noni Campaign Manager App: Build Handoff

This folder is the complete, self-contained handoff for the campaign manager (admin) side of Noni. It is written for an orchestrator agent (Cursor) that will delegate work to parallel sub-agents.

## What Noni is
Noni runs UGC programs for companies. A campaign manager plans weekly briefs, creators record the posts, the manager reviews and approves, Noni publishes to TikTok and Instagram, and creator earnings unlock on approval (money data comes from the company's Stripe).

## Target codebase
The real app is an Expo (React Native) project with expo-router and Supabase:
- Admin routes live in `app/(admin)/` with tabs in `app/(admin)/(tabs)/` (index = Review, library, creators, analytics, calendar, settings, etc.)
- Admin components live in `components/admin/`
- Data layers live in `lib/*-api.ts` (admin-api, briefs-api, analytics-api, messages-api, wallet-api...)
- Design tokens live in `theme/tokens.ts`

Everything in this handoff describes WHAT to build and exactly how it should look and behave. Translate the reference React (DOM) code into React Native primitives; do not copy DOM markup verbatim.

## Folder map
- `00_START_HERE.md` - this file, orchestrator instructions
- `01_DESIGN_LANGUAGE.md` - tokens, type, spacing, and the reusable UI patterns every agent must follow
- `02_SCREEN_MAP.md` - every screen, its reference file, its route in the codebase, and what changed in this design round
- `QA_CHECKLIST.md` - flow-by-flow acceptance checks for the final review pass
- `tasks/` - one work package per sub-agent, with scope, spec, and acceptance criteria
- `reference_ui/` - the hi-fi reference implementation (browser React, saved as .jsx.txt so it stays inert in this design project; read it as JSX). This is the source of truth for layout, spacing, copy, and behavior. `admin-data.js` holds all demo data shapes.
- `tokens/` - the design tokens as CSS custom properties (mirror them into `theme/tokens.ts`)
- `assets/` - the new logo (`noni-logo.svg`) and the App Store icon (`app-icon-1024.png`)

## How to orchestrate
1. Read `01_DESIGN_LANGUAGE.md` and `02_SCREEN_MAP.md` fully before delegating.
2. Dispatch the task files in `tasks/`. The dependency graph is in `tasks/00_TASK_GRAPH.md`; tasks in the same wave are safe to run in parallel because they touch disjoint files.
3. Give every sub-agent: its task file, `01_DESIGN_LANGUAGE.md`, and the reference_ui file(s) named in the task.
4. Sub-agents implement against the real data layers in `lib/`. Where the reference uses demo data (`admin-data.js`), the shapes show which fields the UI needs; wire them to the matching `lib/*-api.ts` functions and extend those APIs when a field is missing.
5. After all waves land, run `QA_CHECKLIST.md` end to end on an iPhone-size simulator.

## Non-negotiable rules for every agent
- Follow the design language file exactly: token colors only, no new hex values, no new fonts.
- Copy text verbatim from the reference files, including button labels and empty states. Never use em dashes or en dashes in any copy: rewrite with a period, comma, colon, or "to".
- Hit targets at least 44px. Text in the app never below 11px.
- Every async surface needs its loading (skeleton) and empty state; the reference files include both.
- Confirmation overlays (Approved, Sent back, Signed out) are full-screen takeovers with an icon disc, title, one short paragraph, and a single primary button.
- Do not invent features, sections, or stats that are not in the reference.
