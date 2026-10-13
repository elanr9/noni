# Progress

| Job | Name | Owner | Branch | Status |
|---|---|---|---|---|
| 1 | Audit | orchestrator | briefs-redesign | done |
| 2 | Database and API | orchestrator | briefs-redesign | done |
| 3 | Manager week and kind picker | manager agent | briefs-manager | done |
| 4 | Manager slideshow editor | manager agent | briefs-manager | done |
| 5 | Manager reel editor | manager agent | briefs-manager | done |
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
Plan: rewrite `app/(admin)/week/[id].tsx` on `listWeekLanes` + `weekNumber` (BriefHeader, two FormatCounterCards that switch format, FilledSlotRow / EmptySlotRow); new `app/(admin)/brief/kind.tsx` (kind rows with MiniDeck, post type grid, peek sheet); new `components/admin/briefs/` MiniDeck, Shot, SlideCard, PostTypePeekSheet; register `brief/kind` and `brief/[id]` in `app/(admin)/_layout.tsx`.
Done.
- Week screen replaced wholesale: the lane switcher, type filter, "posts made" tag and done-week `PostsMadeList` are gone, as the prototype has none of them. The existing `WeekFooter` (publish, day planner, start next week) sits below the slot list when the week is published or has ready slots, with readyCount = slots across both lanes whose brief is `ready`. The "Not planned yet" state still points to `week-setup` because a week with no stamped rows has no slots to tap.
- Freestyle saves from the kind picker with title `Freestyle` and `open = { prompt: '', must: defaultMustHaves(company) }`, then returns to the week with the `Added to slot 02` `InkToast` through `router.dismissTo`.
- Gradients are `expo-linear-gradient`: three stop `briefTone.managerSlide` on manager slides, `briefTone.reviewSlide` on Review, hard stop diagonal `briefTone.creatorStripe` stripes on creator slides.
- Post type tile icons follow KindScreen verbatim; the peek sheet "Link in bio" example uses the `sent` feature tone placeholder since seeded features have no screenshot.

## Job 4: Manager slideshow editor
Plan: `components/admin/briefs/editor/useBriefEditor.ts` (HandheldEditor state: steps, slides, count, AI actions, save mapping), `editor/BriefEditor.tsx` (step switch, sheets), `canvas/CanvasEditor.tsx` + `PlatformGhost.tsx` + `TextBoxView.tsx` + `InsetSticker.tsx` + `TextToolbar.tsx` + `CanvasFooter.tsx` (Reanimated and gesture handler), `editor/DetailsStep.tsx` + `TagField.tsx`, `editor/ReviewScreen.tsx` + `FypChrome.tsx`, `sheets/MediaSheet.tsx`, `CountSheet.tsx`, `FeatureSheet.tsx`, `CtaIntro.tsx`, `ReviseSheet.tsx`; wire `app/(admin)/brief/[id].tsx` to it. Commits per sub step.
Done.
- Story follows the live prototype path (`HandheldEditor kind="story"`: Cover, CTA, Details, Review on the canvas), not the unused `StoryEditor` form. Theme = the cover text, beats are not editable (none in the live path, stored as `[]`), min and max come from the "Creator's slides" sheet (prototype `gapOpen`, which had no trigger; it opens from the "Creator picks the count" pill) or from the Numbered tips count. Freestyle has no prompt or must-have UI in the prototype source, so `OpenEditor` matches `SSManager.OpenEditor` and `open` keeps the defaults.
- `SlideStage` did not fit (TikTok metric `OverlayBox` model, no inline input, no swipe); the canvas is `components/admin/briefs/canvas/*` on gesture handler and Reanimated with the prototype durations (160 slide in, 180 to 320 tools, 520 place, 1400 busy ring).
- Extra text boxes and photo stickers (`extras`, `pics`) are not in `BriefSlide`, so the canvas edits one text box and one inset per slide; the media sheet shows the Library tab only (no camera roll tab, nothing to store a roll pick in). Requests below.
- AI: Fill with AI and Write points call `assistRegenerateField` (`talking_points`, `hook`, `caption`, `search_phrase`); Revise chips call `assistRevise`. Generate with AI for the CTA has no endpoint: the CTA is filled from the matched Library feature's `cta` shaped by post type (`matchFeature`, port of the prototype's). Revise opens from a sparkles tool on slides that already have text (the prototype defines `ReviseSheet` without a trigger).
- Text style: outline, box, soft and none from `briefTone.textSwatches`; fonts map to System, Courier New and Snell Roundhand.
- `BriefSlide.extras` and `pics` exist in lib, but the canvas still models one text box and one inset per slide (no extra text boxes or photo stickers). Loaded values round trip through save untouched; the canvas does not draw or edit them yet.
- Story saves `story = { theme: cover text, beats: [], min, max }` from the Creator's slides sheet (or count - 1 for Numbered tips).
- Note tool and shot pill are on for Handheld slideshows too (prototype passed `notes={story || reel}`), otherwise a slideshow shot direction could never be written.

## Job 5: Manager reel editor
Plan: same shell as job 4 with `format: 'reel'`; verify the reel branches in `useBriefEditor` (Hook and Points steps, say line in `BriefSlide.shot`, Long text steps and seed), `CanvasEditor` (reel ghost, "Creator's clip", hook script and creator says pills, Write the hook, Draft with AI), `ReviewScreen` (Watch and Script, play, clip counter, script list) and the reel kind picker; fill the hook line from Write points.
Done.
- Reel paths run through the job 4 shell; Write points also fills an empty hook line from the first sentence of the returned script (prototype `D.hookSay`).
- Freestyle reels title the editor `Reel 03` (prototype `OpenEditor` always says `Slideshow`, a prototype bug; `FORMAT_LABEL` is used instead).
- Story reels reuse the Creator's clips sheet and the `Creator records N` chip; Long text uses the Text, CTA line, Details, Review steps with the small left aligned text box.
- The reel screenshot badge shows `0:07` for every feature (no clip length on `LibraryFeature`, request above).

## Job 6: Creator home and slideshow

## Job 7: Creator reel record and editor

## Job 8: Full loop test and polish

## Shared change requests
(lanes write requests here and stop that item)
- landed (1bad266, c51e253) and adopted: `InkToast`, `briefTone.textSwatches`, `briefTone.managerSlide` three stops, `briefTone.reviewSlide`, `SlideTextStyle.bg 'soft'`, `expo-linear-gradient`, `BriefSlide.extras` and `pics` (lib only; the canvas does not model them yet).
- manager: `brief-assist` action for a CTA line from a feature (`field: 'cta'`, input `feature_id`, `post_type`, `title`, `index`) so Generate with AI stops using the feature's `claim` verbatim.
- manager: `lib/library-api.ts` `LibraryFeature.clipLength: string | null` (prototype `clip: '0:06'` badge on reel screenshots); the Shot badge shows `0:07` meanwhile.
