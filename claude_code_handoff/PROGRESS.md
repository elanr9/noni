# Progress

| Job | Name | Owner | Branch | Status |
|---|---|---|---|---|
| 1 | Audit | orchestrator | briefs-redesign | done |
| 2 | Database and API | orchestrator | briefs-redesign | done |
| 3 | Manager week and kind picker | manager agent | briefs-manager (merged) | done |
| 4 | Manager slideshow editor | manager agent | briefs-manager (merged) | done |
| 5 | Manager reel editor | manager agent | briefs-manager (merged) | done |
| 6 | Creator home and slideshow | creator agent | briefs-creator (merged) | done |
| 7 | Creator reel record and editor | creator agent | briefs-creator (merged) | done |
| 8 | Full loop test and polish | orchestrator | briefs-redesign | done (data level; device pass needs a build) |

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
- Gradients are `GradientFill` (react-native-svg): three stop `briefTone.managerSlide` on manager slides, `briefTone.reviewSlide` on Review, hard stop diagonal `briefTone.creatorStripe` stripes on creator slides.
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
  - Manager `pics` stickers render only when `src` is a URL or local file; storage paths need a signed URL the lane does not resolve. Extras render as locked text boxes and bake with the slide.

Review round (`briefs: jobs 6 and 7 review fixes`): rebased on `briefs-redesign` clean (no conflicts); `LinearGradient` for the manager slide and avatar fallbacks (`briefTone.managerSlide`, `briefTone.reviewSlide`); manager `extras` and `pics` drawn on locked slides (MiniSlide, EditStep, review); Story and Freestyle caption and hashtags now go through `submitProject` (request 1 landed, local only path dropped); last two hex literals replaced with `color.white`; reel text track moved above the clip track.

## Job 7: Creator reel record and editor
Plan:
- `components/creator/briefs/reel/plan.ts` (clip plan per kind, from RLCreator clipPlan and PLUG), `reel/useReelProject.ts` (assignment, brief, features, the studio store document from `creator_projects`, the AsyncStorage plan draft, `useProjectAutosave`, `useStudioUploads`, `saveDraftSegment` once a clip lands in storage), `reel/sync.ts` (plan to document: add a take as a block, text overlays per point, remove, auto cut with `speechBounds`).
- `reel/RecordScreen.tsx`: `Viewfinder`, `useRecorder`, `useCapturePermissions`, `SideRail` (flip, flash, timer, grid), `RecordButton`, `BeatPrompter` in the prompter card with hide and show, progress segments per planned clip, time readout, back, redo last, Next clip or Done, the plug card for Story and Freestyle, Close this post. `reel/ClipPlayback.tsx`: the take plays back right away (expo-video) with Redo this clip, Add extra clip, Next clip.
- `reel/ReelEditor.tsx`: header (back, `Auto cut · N pauses removed`, next), `VideoStage` + `OverlayLayer`, transport (`00:00/00:29`, play, undo, swap), `TimelineStrip` with `OverlayLane` (text track) and the captions bar, clip tools when a block is selected (Split, Trim, Redo clip, Delete), toolbar Text, Image, Captions, AI (`AskAiSheet` reel mode, Cut the dead air).
- `app/(creator)/make/record/[id].tsx`, `app/(creator)/make/edit/[id].tsx` (edit, caption for Story and Freestyle, review with the player in the frame and the Script tab, submit through `submitProject`, then `make/sent`).

Done (commits `briefs: job 7 creator 1/2`, `briefs: job 7 creator reel record and editor`).
- Record: one take per point with the say line in the prompter card (`BeatPrompter`), playback right after each take (`useClipPlayback`, `ClipVideo`, `ScrubBar`) with Redo this clip, Add extra clip and Next clip, the plug card for Story and Freestyle, Close this post keeps the draft. Long text stops at 6 seconds.
- Editor: `VideoStage` + `OverlayLayer`, `TimelineStrip` + `OverlayLane` (trim handles on the selected clip, hold to reorder), Split, Trim stepper, Redo clip, Delete, Text, Image, Captions, AI with Cut the dead air (`speechBounds`, iOS). `Auto cut · N pauses removed` counts the clips the cut shortened.
- Drafts: the plan and local clip URIs live in AsyncStorage per assignment; the document autosaves to `creator_projects` and clips upload in the background; each landed take is written to `recording_drafts` through `saveDraftSegment`. Submit clears all three.
- Could not match (and why):
  - The text track (`OverlayLane`) now sits above the strip, but above its ruler too; the prototype has ruler, text, clips.
  - Prompter card uses `BeatPrompter` type (26pt text, blue uppercase label) instead of the prototype's 15.5pt line; the zap icon on the plug label is dropped.
  - Review `Clip i of n` follows the thumbnail taps, not the player's playhead.
  - Flash on the front camera is the screen brightness wash the studio already uses; zoom pills (0.5x, 1x, 2x) are the viewfinder pinch instead.
  - Captions track: the bar reflects `subtitles.enabled`; there is no on device transcript preview.

## Job 8: Full loop test and polish
Plan: data level loop (publish seeded briefs to Inkbound creators, verify creator day query), `reviewed_at` set by `addBriefToWeek` so publishing accepts redesign briefs, dash grep, typecheck, lint, tests, `DONE.md`.
Done. See `DONE.md`. Device pass runs on the existing install with `npx expo start`; no Xcode or simulator on this machine for an automated pass.

## Shared change requests
(lanes write requests here and stop that item)
Manager lane (jobs 3 to 5):
- landed (1bad266, c51e253) and adopted: `InkToast`, `briefTone.textSwatches`, `briefTone.managerSlide` three stops, `briefTone.reviewSlide`, `SlideTextStyle.bg 'soft'`, `GradientFill` (react-native-svg, replaced expo-linear-gradient), `BriefSlide.extras` and `pics` (lib only; the canvas does not model them yet).
- manager: `brief-assist` action for a CTA line from a feature (`field: 'cta'`, input `feature_id`, `post_type`, `title`, `index`) so Generate with AI stops using the feature's `claim` verbatim.
- manager: `lib/library-api.ts` `LibraryFeature.clipLength: string | null` (prototype `clip: '0:06'` badge on reel screenshots); the Shot badge shows `0:07` meanwhile.

Creator lane (jobs 6 and 7):
1. Landed (`bbb5100`): `submitProject` takes `caption` and `hashtags`; the creator lane passes them for Story and Freestyle. The search phrase from `DetailsStep` still has no home.
2. `lib/edit-document.ts` `Slide`: add `inset?: { url: string; x: number; y: number; width: number } | null` (mirrored in `supabase/functions/_shared/editDocument.ts` and baked by render-submission). The CTA feature screenshot shows on the creator canvas and review but is not in the posted slide today.
3. `lib/briefs-api.ts`: `assistAsk(params: { question: string; draft: RegenDraftPayload }): Promise<string[]>` (brief-assist action `ask`) for the free "Ask for anything" field in `AskAiSheet`. The field is omitted until it exists.
4. `lib/creator-queue.tsx`: expose `todayBriefs: CreatorBriefItem[]` from the provider (the `post_types` join) so Home reads one source instead of refetching `listCreatorBriefsForDay` on focus. Optional.
