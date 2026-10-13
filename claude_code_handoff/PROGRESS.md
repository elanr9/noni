# Progress

| Job | Name | Owner | Branch | Status |
|---|---|---|---|---|
| 1 | Audit | orchestrator | briefs-redesign | done |
| 2 | Database and API | orchestrator | briefs-redesign | done |
| 3 | Manager week and kind picker | manager agent | briefs-manager | done |
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
Plan: rewrite `app/(admin)/week/[id].tsx` on `listWeekLanes` + `weekNumber` (BriefHeader, two FormatCounterCards that switch format, FilledSlotRow / EmptySlotRow); new `app/(admin)/brief/kind.tsx` (kind rows with MiniDeck, post type grid, peek sheet); new `components/admin/briefs/` MiniDeck, Shot, SlideCard, PostTypePeekSheet, GradientFill; register `brief/kind` and `brief/[id]` in `app/(admin)/_layout.tsx`.
Done.
- Week screen replaced wholesale: the lane switcher, type filter, "posts made" tag, publish footer (`WeekFooter`, day planner) and done-week `PostsMadeList` are gone, as the prototype has none of them. The "Not planned yet" state still points to `week-setup` because a week with no stamped rows has no slots to tap. Needs a decision on where publishing lives now.
- Freestyle saves from the kind picker with title `Freestyle` and `open` defaults (`prompt ''`, `defaultMustHaves(company)`, min 4, max 10 from ss-data) and returns to the week with the `Added to slot 02` toast through `router.dismissTo`.
- Toast uses the shared `SoftToast` (green success tone); the prototype's toast is ink with white text (request below).
- No gradient dependency in the app: manager slide gradients are drawn by `GradientFill` (banded interpolation of `briefTone.managerSlide`); creator stripes are rotated bands of `briefTone.creatorStripe`.
- Post type tile icons follow KindScreen verbatim; the peek sheet "Link in bio" example uses the `sent` feature tone placeholder since seeded features have no screenshot.

## Job 4: Manager slideshow editor
Plan: `components/admin/briefs/editor/useBriefEditor.ts` (HandheldEditor state: steps, slides, count, AI actions, save mapping), `editor/BriefEditor.tsx` (step switch, sheets), `canvas/CanvasEditor.tsx` + `PlatformGhost.tsx` + `TextBoxView.tsx` + `InsetSticker.tsx` + `TextToolbar.tsx` + `CanvasFooter.tsx` (Reanimated and gesture handler), `editor/DetailsStep.tsx` + `TagField.tsx`, `editor/ReviewScreen.tsx` + `FypChrome.tsx`, `sheets/MediaSheet.tsx`, `CountSheet.tsx`, `FeatureSheet.tsx`, `CtaIntro.tsx`, `ReviseSheet.tsx`; wire `app/(admin)/brief/[id].tsx` to it. Commits per sub step.

## Job 5: Manager reel editor

## Job 6: Creator home and slideshow

## Job 7: Creator reel record and editor

## Job 8: Full loop test and polish

## Shared change requests
(lanes write requests here and stop that item)
- manager: `components/states/SoftToast.tsx` or a new `components/shared/InkToast.tsx`: `InkToast({ visible, message, onHide })`, ink background, white 600 14px text, check icon, radius 16, bottom 40 (prototype toast). Week screen uses `SoftToast` tone `success` meanwhile.
- manager: `theme/tokens.ts` `briefTone.textSwatches: string[]` with the prototype's nine swatches `#FFFFFF #0F1720 #1BA6EE #3DBE5B #F6C445 #F58B1F #E5484D #D6246E #8E24AA`. Canvas uses white, ink, blue500, amber and `briefTone.confetti` meanwhile (pink `#D6246E` and purple `#8E24AA` missing).
- manager: `theme/tokens.ts` `briefTone.managerSlide` mid stop `#8FA3B6` (prototype gradient is three stops) and `briefTone.canvas.chrome` already covers `#2A3038`.
- manager: `lib/briefs-api.ts` `SlideTextStyle.bg` add `'soft'` (prototype has outline, solid, soft, none; `'box'` maps to solid). The text background toggle cycles outline, box, none meanwhile.
- manager: `package.json` `expo-linear-gradient` so slide gradients are real gradients instead of `GradientFill` bands.
