# Master plan

Two repos: `noni` (Expo app: creator + campaign manager) and `noni-web` (admin web console, ops console, pricing, landing).

## Phase order

| # | Phase | Repo | Bundle | Depends on |
|---|---|---|---|---|
| P0 | Audit and plan | both | this folder | none |
| P1 | Tokens and shared primitives | noni | design_handoff_admin_app (stage 1) | P0 |
| P2 | Multi-campaign: backend, switcher pill, sheet, strip, tab dot | noni | design_handoff_multi_campaign | P1 |
| P3 | Creator app: today, task detail, record, posts, growth, profile | noni | design_handoff_creator_app | P1, P2 |
| P4 | Manager: Review, Library, Messages, Analytics, Creators, week setup | noni | design_handoff_campaign_manager, design_handoff_admin_app | P1, P2 |
| P5 | Briefs, manager side: week, kind, post type, slideshow canvas, reel script, story, freestyle, review | noni | 03_BRIEFS_SLIDESHOW_REEL.md | P4 |
| P6 | Briefs, creator side: slideshow photos, reel record, reel editor, sent | noni | 03_BRIEFS_SLIDESHOW_REEL.md | P5 (data), P3 |
| P7 | Settings redesign: switch accounts, managers, Brand Brain | noni | redesigns/admin (screen map) | P2 |
| P8 | Admin web console: onboarding, setup tabs, analytics, review | noni-web | design_handoff_admin_app_web | P1 tokens copied |
| P9 | Ops console | noni-web | design_handoff_ops_console | P8 shell |
| P10 | Pricing, landing, logo and app icon | noni-web, noni | pricing_plans, landing_page, logo | none |
| P11 | Full QA and polish | both | QA_CHECKLIST.md | all |

## Parallel lanes
After P2 lands, three sessions can run at once in separate git worktrees (`git worktree add ../noni-p3 -b design/p3-creator`):
- Lane A: P3 then P6
- Lane B: P4 then P5
- Lane C: P7
`noni-web` (P8, P9, P10) is independent of the app and can start any time after P0.

## Done criteria per phase
- Every screen in the phase's rows of 02_SCREEN_MAP.md matches its screenshot side by side.
- Typecheck, lint and tests pass.
- QA_CHECKLIST.md passes for the touched screens.
- No hardcoded colors or fonts outside the theme module.
- Old screens replaced, not duplicated. Dead components deleted.
