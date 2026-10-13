# Progress

| Job | Name | Owner | Branch | Status |
|---|---|---|---|---|
| 1 | Audit | orchestrator | briefs-redesign | done |
| 2 | Database and API | orchestrator | briefs-redesign | in progress |
| 3 | Manager week and kind picker | manager agent | briefs-manager | pending |
| 4 | Manager slideshow editor | manager agent | briefs-manager | pending |
| 5 | Manager reel editor | manager agent | briefs-manager | pending |
| 6 | Creator home and slideshow | creator agent | briefs-creator | pending |
| 7 | Creator reel record and editor | creator agent | briefs-creator | pending |
| 8 | Full loop test and polish | orchestrator | briefs-redesign | pending |

## Job 1: Audit
Plan: read handoff, map screens, write `AUDIT.md`, copy rules to `.cursor/rules/noni-design.mdc`.
Done. Decisions: keep DB `format` values (`video` = reel, `photo_carousel` = slideshow) and the `campaign_briefs` slot model; new manager editor at `app/(admin)/brief/[id]`; fonts stay System.

## Job 2: Database and API
Plan: migration 117 (additive columns on `briefs` and `product_features`), Inkbound reset with JSON backup, `lib/brief-copy.ts`, `lib/briefs-api.ts` and `lib/library-api.ts` additions, `components/shared/briefs/*`, seed script, unit tests.

## Job 3: Manager week and kind picker

## Job 4: Manager slideshow editor

## Job 5: Manager reel editor

## Job 6: Creator home and slideshow

## Job 7: Creator reel record and editor

## Job 8: Full loop test and polish

## Shared change requests
(lanes write requests here and stop that item)
