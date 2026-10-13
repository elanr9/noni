# Progress

| Job | Name | Owner | Branch | Status |
|---|---|---|---|---|
| 1 | Audit | orchestrator | briefs-redesign | done |
| 2 | Database and API | orchestrator | briefs-redesign | done |
| 3 | Manager week and kind picker | manager agent | briefs-manager | in progress |
| 4 | Manager slideshow editor | manager agent | briefs-manager | pending |
| 5 | Manager reel editor | manager agent | briefs-manager | pending |
| 6 | Creator home and slideshow | creator agent | briefs-creator | in progress |
| 7 | Creator reel record and editor | creator agent | briefs-creator | pending |
| 8 | Full loop test and polish | orchestrator | briefs-redesign | pending |

## Job 1: Audit
Plan: read handoff, map screens, write `AUDIT.md`, copy rules to `.cursor/rules/noni-design.mdc`.
Done. Decisions: keep DB `format` values (`video` = reel, `photo_carousel` = slideshow) and the `campaign_briefs` slot model; new manager editor at `app/(admin)/brief/[id]`; fonts stay System.

## Job 2: Database and API
Plan: migration 117 (additive columns on `briefs` and `product_features`), Inkbound reset with JSON backup, `lib/brief-copy.ts`, `lib/briefs-api.ts` and `lib/library-api.ts` additions, `components/shared/briefs/*`, seed script, unit tests.
Done.
- Migration `20261005120000_117_brief_slides_kind_features.sql` applied; `lib/types.ts` regenerated.
- Inkbound reset (`scripts/reset-inkbound.ts`): 57 briefs, 2 campaigns, 36 assignments, 22 submissions, 36 posts and children deleted; 135 `videos` objects removed; JSON backup in `supabase/backups/inkbound-2026-10-13/` (git ignored). Company, members, library_items, creator accounts kept. 75 `videos` objects not tied to a deleted submission were left in place.
- Seed (`scripts/seed-inkbound-briefs.ts`): 11 post types, 8 library features (General is `is_general`), week 2 campaign `02aef29c-ed8b-43d9-82e9-42546c332b98` with slideshow 01 handheld and reels 01 handheld, 02 story filled.
- API: `lib/briefs-api.ts` section "Briefs redesign" (`WeekBrief`, `WeekSlot`, `listWeekLanes`, `listWeekSlots`, `weekNumber`, `resolvePostTypeId`, `saveWeekBrief`, `addBriefToWeek`, `clearWeekSlot`, `getWeekBrief`, `listCreatorBriefsForDay`, `getCreatorBriefItem`, parsers). `lib/library-api.ts` (`LibraryFeature`, `listLibraryFeatures`, `getGeneralFeature`, `pickFeature`). `lib/brief-copy.ts` holds verbatim kind and post type copy.
- Shared: `components/shared/briefs/` (`BriefChip`, `KindChip`, `FormatChip`, `PostTypeChip`, `FormatCounterCard`, `FilledSlotRow`, `EmptySlotRow`, `StepStrip`, `BriefHeader`, `HeaderIconButton`). `theme/tokens.ts` gained `briefTone`; `components/ui/Icon.tsx` gained layout-grid, timer, grid-3x3, type, maximize-2, move, arrow-left, chevrons-left-right, smartphone.
- Tests: `lib/briefs-api.test.ts`, `lib/library-api.test.ts` pass. The two `supabase/functions/_shared/*.test.ts` Deno files fail under vitest on main too (jsr import), unrelated.
- Could not match: the prototype's Figtree font (fonts stay System); screenshot URLs for seeded features are null until a manager uploads one, so the editor shows the toned placeholder.

## Job 3: Manager week and kind picker

## Job 4: Manager slideshow editor

## Job 5: Manager reel editor

## Job 6: Creator home and slideshow
Plan (branch `briefs-creator`):
- `app/(creator)/(tabs)/index.tsx`: keep the setup checklist, `CreatorQueueProvider`, toast and the tab bar; replace the body with `components/creator/briefs/home/*` (`DayStrip`, `TodayCard`, `AlsoTodayRow`, `AllDoneBanner`). Today's items come from `listCreatorBriefsForDay` (post type join) and refresh whenever the queue provider's today list changes; statuses map assigned and changes_requested to blue, recorded, submitted and approved to amber `In review`, posted to green `Posted`.
- `components/creator/briefs/model.ts`: pure helpers (creator status, left count, `buildSlides` per kind with the per creator shuffle and CTA renumber from `SSCreator.creatorSlides`, role labels, text box layout from `SSShared.layoutOf`).
- `components/creator/briefs/MiniSlide.tsx` (SlideCard), `FeatureShot.tsx` (Shot placeholder keyed by `briefTone.featureTones`), `StartScreen.tsx`, `slides/PickStep.tsx`, `slides/EditStep.tsx` (wraps `SlideStage` with `CropPhoto` crops for TikTok 9:16 and Instagram 4:5), `slides/FreestylePicker.tsx` (system multi select picker plus the numbered strip), `slides/AskAiSheet.tsx` (`assistRegenerateField`), `DetailsStep.tsx` (caption, hashtags, search phrase, Fill with AI), `ReviewStep.tsx` (FYP chrome, swipe, thumbs, Submit for approval), `drafts.ts` (AsyncStorage drafts keyed by assignment id).
- `app/(creator)/make/[id].tsx`: start, select, pick, edit, details, review phases. Submit builds a `SlideshowDocument` (assets, crops, text boxes) and goes through `submitProject` so the render bakes the manager's text and the Instagram cut; status moves inside `lib/submissions.ts`.
- `app/(creator)/make/sent.tsx`: confetti, Sent!, streak (`fetchMyStreak`), on approval (`fetchBountySettings`), left today, Next post or Back home.
- `app/(creator)/_layout.tsx`: register `make/[id]`, `make/record/[id]`, `make/edit/[id]`, `make/sent` as fullScreenModal.

## Job 7: Creator reel record and editor

## Job 8: Full loop test and polish

## Shared change requests
(lanes write requests here and stop that item)
