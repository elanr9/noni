# Progress

| Job | Name | Owner | Branch | Status |
|---|---|---|---|---|
| 1 | Audit | orchestrator | briefs-redesign | done |
| 2 | Database and API | orchestrator | briefs-redesign | done |
| 3 | Manager week and kind picker | manager agent | briefs-manager | in progress |
| 4 | Manager slideshow editor | manager agent | briefs-manager | pending |
| 5 | Manager reel editor | manager agent | briefs-manager | pending |
| 6 | Creator home and slideshow | creator agent | briefs-creator | done |
| 7 | Creator reel record and editor | creator agent | briefs-creator | in progress |
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

Done (commits `briefs: job 6 creator 1/3`, `2/3`, `briefs: job 6 creator home and slideshow`).
- Home: `TodayCard`, `AlsoTodayRow` (fixed 78pt), `DayStrip`, `AllDoneBanner`; 1 left and All done states come from the live statuses. Tapping an Also today row moves it into the main card, as in the prototype.
- Slideshow: start, pick, edit (TikTok 9:16 and Instagram 4:5 crops through `SlideStage` + `CropPhoto`, text and inset move by hold and drag), Story beats typed on own slides, Freestyle select and Ask AI, caption step, review, submit through `submitProject` (text boxes and both crops ride in the `SlideshowDocument` so the render bakes them). Draft in AsyncStorage per assignment.
- Sent screen with confetti, streak, bounty amount and left today; Next post returns to Home, which selects the next assigned post.
- Could not match (and why):
  - Camera roll grid: the system picker (`expo-image-picker`, multi select up to 10) replaces the in-app grid. `FreestylePicker` keeps the title, the numbered strip and `Next (n)`.
  - Canvas letterbox bands (`TT_SS`): the repo's `TikTokChrome` ghost (rail and caption guides) and its 9:16 plus 4:5 crop model are reused instead of black bands.
  - Text style sheet (fonts, swatches, backgrounds, align): the slide text is the one white `OverlayBox` the render bakes; `tstyle.size` is honored, font, color, bg and align are not. Own slide text is typed in a bottom box with Done, not in place.
  - Ask AI free question field: no endpoint (see Shared change requests), so only the quick asks render.
  - Home drops `ElsewhereStrip`, week navigation, swap and the overdue catch up lock, none of which are in the prototype. Overdue posts stay reachable from Posts.
  - FYP handle is `@firstname`; the profile has no TikTok handle. Fonts stay System.
  - The CTA feature inset shows on the canvas and in review but is not baked (see Shared change requests).

## Job 7: Creator reel record and editor

## Job 8: Full loop test and polish

## Shared change requests
(lanes write requests here and stop that item)

Creator lane (jobs 6 and 7):
1. `lib/submissions.ts` `submitProject(params)`: add `caption?: string; hashtags?: string[]; searchPhrase?: string` written to new columns `submissions.caption text`, `submissions.hashtags text[]`, `submissions.search_phrase text` (migration 118), read by the review screen and post-approved. Story and Freestyle creators write their own caption in `DetailsStep`; until then it stays in the local draft and the brief caption posts.
2. `lib/edit-document.ts` `Slide`: add `inset?: { url: string; x: number; y: number; width: number } | null` (mirrored in `supabase/functions/_shared/editDocument.ts` and baked by render-submission). The CTA feature screenshot shows on the creator canvas and review but is not in the posted slide today.
3. `lib/briefs-api.ts`: `assistAsk(params: { question: string; draft: RegenDraftPayload }): Promise<string[]>` (brief-assist action `ask`) for the free "Ask for anything" field in `AskAiSheet`. The field is omitted until it exists.
4. `lib/creator-queue.tsx`: expose `todayBriefs: CreatorBriefItem[]` from the provider (the `post_types` join) so Home reads one source instead of refetching `listCreatorBriefsForDay` on focus. Optional.
