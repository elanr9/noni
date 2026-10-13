# Audit: briefs redesign (slideshow and reel)

Branch `briefs-redesign`. HANDOFF = `claude_code_handoff/`. No code was changed for this audit.

## 1. Current files per area

| Area | Current file(s) | Notes |
|---|---|---|
| Manager week plan | `app/(admin)/week/[id].tsx` (420), `app/(admin)/(tabs)/calendar.tsx` (565, week list), `app/(admin)/week-setup.tsx` (207), `app/(admin)/week-plan.tsx` (575, day publish), `components/admin/grid/*`, `components/admin/WeekOverview.tsx` | Week = `campaigns` row. Slots = `campaign_briefs(position, pinned_day)`. Lane index derived client side per family. |
| Manager brief editing | `app/(admin)/post/[id].tsx` (2132), `components/admin/editor/*` (`KindOfPostSheet`, `ReviseChatSheet`, `FillSheet`, `AiPill`, `StepDots`), `components/admin/BriefEditSheet.tsx` | Single scroll form. Kind picker today = post type sheet. AI: `generatePost` (fn `ingest-brief`), `assistReviseStream` (fn `brief-assist`, action `revise`). |
| Manager review | `app/(admin)/(tabs)/index.tsx` (302), `app/(admin)/review/[id].tsx` (1065) | Submissions land here through `submissions` rows linked to `assignments`. Reused as is. |
| Creator home | `app/(creator)/(tabs)/index.tsx` (400), `lib/creator-queue.tsx` (`CreatorQueueProvider`, `listMyAssignments`) | WeekStrip + PostPager + PostCard. CTA goes to `studio/[id]`. |
| Creator slideshow making | `app/(creator)/studio/[id].tsx` mode `slides` + `components/creator/studio/slides/*` (`SlideshowEditor`, `Filmstrip`, `SlideCanvas`, `CropSheet`, `slide-edits.ts`); legacy `app/(creator)/upload/[id].tsx` (1528) | Submit: `submitProject` (studio) or `submitAssignmentPhotos` (legacy) in `lib/submissions.ts`. |
| Creator reel recording | `app/(creator)/studio/[id].tsx` mode `capture` + `components/creator/studio/capture/*` (`SideRail` flip, timer, grid; `GridOverlay`); legacy `app/(creator)/record/[id].tsx` (3056) holds the per clip plan (hook, point N, outro) and teleprompter use; `components/Teleprompter.tsx` (190: `Teleprompter`, `BeatPrompter`), `components/creator/TeleprompterOverlay.tsx` | Clip plan logic is in the legacy screen, not in a shared component. |
| Creator reel editing | `components/creator/studio/timeline/*` (`TimelineEditor`, `TimelineStrip`, `BlockStrip`, `TrimHandles`, reorder via `moveBlock`), `components/creator/studio/overlays/*` (timed text and image overlays), `lib/edit-document.ts`, `lib/studio-store.ts` (zustand, undo and redo), `modules/video-editor` (iOS export, preview, thumbnails), `modules/clip-joiner` | Legacy `components/creator/editor/PostEditor.tsx` + `Timeline.tsx` has no reorder; do not reuse. |
| Drafts | `lib/recording-drafts.ts` (server side `recording_drafts`), `lib/projects-api.ts` (`creator_projects`, autosave) | Neither persists local URIs offline; `upload/[id].tsx` used AsyncStorage. |
| Sent confirmation | none | Today a toast "Sent for approval. It posts once approved." |
| Theme | `theme/tokens.ts` (270) | All four brand hexes exist (`color.blue500`, `color.blue300`/`accentTint`, `color.offWhite`, `color.ink`). Fonts are `System`. `radius`, `space`, `shadow`, `motion` exist. |
| Shared primitives | `components/admin/shared/Sheet.tsx` (drag to dismiss), `components/ui/SheetShell.tsx`, `components/ui/Button.tsx`, `components/ui/TabBar.tsx`, `components/ui/Segmented.tsx`, `components/ui/Icon.tsx`, `components/ui/TextField.tsx`, `components/ui/ProgressBar.tsx`, `components/ui/OverlayTextBox.tsx`, `components/states/SoftToast.tsx`, `components/creator/Toast.tsx`, `components/SlideStage.tsx` (single slide, drag, pinch, tap box, inset, crop, TikTok chrome ghost) | `SlideStage` has no swipe between slides and no inline text input. |

## 2. Designed screens: reuse, rewrite or new

Prototype source in `reference_ui/briefs/`. Screenshots in `screenshots/`.

### Manager (lane: briefs-manager)

| Designed screen | Prototype | Decision | File |
|---|---|---|---|
| Week (counters, numbered slots, empty dashed slots) | `SSManager.jsx` `WeekScreen` | Rewrite | `app/(admin)/week/[id].tsx` |
| Kind picker (Handheld, Story, Freestyle rows with `MiniDeck`) and post type grid + peek sheet | `SSManager.jsx` `KindScreen`, `MiniDeck` | New | `app/(admin)/brief/kind.tsx`, `components/admin/briefs/MiniDeck.tsx`, `components/admin/briefs/PostTypePeekSheet.tsx` |
| Editor shell (steps, dark canvas, footer, Add to week) | `SSManager.jsx` `HandheldEditor`, `BottomBar` | New | `app/(admin)/brief/[id].tsx`, `components/admin/briefs/BriefEditorShell.tsx` |
| Full screen post canvas (For you header, swipe, side rail, dots, solid vs dashed slides) | `SSCanvas.jsx` `CanvasEditor`, `SSShared.jsx` `SlideCard`, `PlatformGhost` | New (wrap `SlideStage` for boxes) | `components/admin/briefs/canvas/*` |
| Tap to edit text, text style sheet (swatches, fonts, size), safe zone overlay | `SSCanvas.jsx` | New | `components/admin/briefs/canvas/TextStyleSheet.tsx`, `SafeZoneOverlay.tsx` |
| Step strip + canvas footer | `SSFlow.jsx` `StepStrip`, `CanvasFooter` | New shared | `components/shared/briefs/StepStrip.tsx` |
| Media and shot direction sheet | `SSFlow.jsx` `MediaSheet` | New | `components/admin/briefs/sheets/MediaSheet.tsx` |
| Slide count sheet | `SSFlow.jsx` `CountSheet` | New | `components/admin/briefs/sheets/CountSheet.tsx` |
| CTA feature sheet + CTA intro | `SSFlow.jsx` `FeatureSheet`, `LibrarySheet`, `CtaIntro` | New | `components/admin/briefs/sheets/FeatureSheet.tsx`, `CtaIntroSheet.tsx` |
| Revise with AI sheet | `SSManager.jsx` `ReviseSheet` | New (calls `assistRevise`) | `components/admin/briefs/sheets/ReviseSheet.tsx` |
| Story settings (theme, beats deck, min to max, CTA card) | `SSManager.jsx` `StoryEditor`, `CtaCard`, `SSShared.jsx` `Deck`, `Stepper` | New | `components/admin/briefs/StoryEditor.tsx` |
| Freestyle (prompt, must-haves, AI sheet) | `SSManager.jsx` `OpenEditor`, `SSFreestyle.jsx` | New | `components/admin/briefs/FreestyleEditor.tsx` |
| Details (caption, hashtags chips, search phrase) | `SSManager.jsx` details step, `TagField` | New | `components/admin/briefs/DetailsStep.tsx` |
| Review (FYP preview, tabs) | `SSFlow.jsx` `ReviewScreen` | New | `components/admin/briefs/ReviewStep.tsx` |
| Reel: Watch and Script toggle, hook and points with say lines, CTA clip, Long text | `SSManager.jsx` reel branches, `SSFlow.jsx` reel paths | New (same shell) | `components/admin/briefs/reel/*` |
| Creator preview sheet | `SSManager.jsx` `PreviewSheet` | New | `components/admin/briefs/sheets/PreviewSheet.tsx` |

Not touched by the manager lane: `app/(admin)/post/[id].tsx`, `components/admin/editor/*`, review screens. Filled slots on the new week screen open `app/(admin)/brief/[id]`.

### Creator (lane: briefs-creator)

| Designed screen | Prototype | Decision | File |
|---|---|---|---|
| Home (company pill, welcome, day strip, main card, Also today, 1 left, All done) | `SSCreator.jsx` `CreatorHome` | Rewrite | `app/(creator)/(tabs)/index.tsx`, `components/creator/briefs/home/*` |
| Start screen per kind (fan of slides, head line, note card) | `SSCreator.jsx` `CreatorHandheld` phase `start` | New | `app/(creator)/make/[id].tsx`, `components/creator/briefs/StartScreen.tsx` |
| Pick photo (dots, ghost frame, Choose a photo, Take a photo) | `CreatorHandheld` phase `pick`, `SSFlow.jsx` `MediaSheet` | New | `components/creator/briefs/slides/PickStep.tsx` |
| Edit slide (canvas, crop, text, Change photo, Add slide, Next) | `CreatorHandheld` phase `edit`, `SSCanvas.jsx` | New (reuse `SlideStage`, `components/creator/slides/CropPhoto`, `photo-crop.ts`) | `components/creator/briefs/slides/EditStep.tsx` |
| Freestyle picker + Ask AI sheet | `SSFreestyle.jsx` `FreestylePicker`, `AiSheet` | New | `components/creator/briefs/slides/FreestylePicker.tsx`, `AskAiSheet.tsx` |
| Caption step (Story and Freestyle only) | `CreatorHandheld` phase `details` | New (shares `TagField` idea with manager; creator owns its copy) | `components/creator/briefs/DetailsStep.tsx` |
| Review + Submit for approval | `SSFlow.jsx` `ReviewScreen` creator mode | New | `components/creator/briefs/ReviewStep.tsx` |
| Sent (confetti, Sent!, streak, on approval, left today, Next post) | `SSCreator.jsx` `SentScreen` | New | `app/(creator)/make/sent.tsx` |
| Reel record (teleprompter hook and points, one clip per point, plug clip, flip, timer, grid, retake) | `RLCreator.jsx` | New (reuse `components/Teleprompter.tsx`, `studio/capture/SideRail`, `GridOverlay`, `CaptureChrome`) | `app/(creator)/make/record/[id].tsx`, `components/creator/briefs/reel/*` |
| Reel editor (preview with text, play and time, undo and swap, text and clip tracks, trim, reorder, text toolbar) | `RLEditor.jsx` | New screen over existing engine (reuse `studio/timeline/*`, `studio/overlays/*`, `lib/edit-document.ts`, `lib/studio-store.ts`, `modules/video-editor`) | `app/(creator)/make/edit/[id].tsx`, `components/creator/briefs/reel/ReelEditor.tsx` |

Submission goes through `lib/submissions.ts`: `submitAssignmentPhotos` (slideshow) and `submitProject` (reel), so it lands in manager Review. Status moves only via `transitionAssignment` in `lib/tasks-api.ts`.

### Shared (owner: orchestrator)

`components/shared/briefs/`: `KindChip`, `FormatChip`, `PostTypeChip`, `FormatCounterCard`, `StepStrip`, `SlotRow`, `TagField`. `lib/briefs-api.ts` and `lib/library-api.ts` additions. `lib/brief-copy.ts` holds the verbatim strings from `ss-data.js.txt` (kinds, post types, labels).

## 3. Database changes (smallest migration)

Live schema (project `zdcmmzofnrdqbwexuqnm`, migrations through 116). Mapping to the spec model, keeping existing names:

| Spec field | Where it lives | Change |
|---|---|---|
| `week_id` | `campaign_briefs.campaign_id` | none |
| `slot_index` | `campaign_briefs.position` | none |
| `format 'slideshow' or 'reel'` | `briefs.format` (`photo_carousel`, `video`) | none in DB; map in TS |
| `kind` | missing | add `briefs.kind text check in (handheld, story, open)` |
| `post_type` | `briefs.post_type_id` -> `post_types` | none |
| `title`, `caption` | exist | none |
| `search_term` | `briefs.search_phrase` | none; alias in TS |
| hashtags | `briefs.hashtags text[]` | none |
| `slides[]` | `brief_segments` is close but lacks shot, say, inset_feature_id, box, tstyle and is tied to the render pipeline | add `briefs.slides jsonb not null default '[]'` |
| `story {theme, beats, min, max}` | missing | add `briefs.story jsonb` |
| `open {prompt, must[]}` | missing | add `briefs.open jsonb` |
| `cta.text` | `briefs.cta text` | none |
| `cta.feature_id` | missing | add `briefs.cta_feature_id uuid references product_features on delete set null` |
| `status` | missing (`archived_at`, `reviewed_at`) | add `briefs.status text not null default 'draft' check in (draft, ready, archived)` |
| creator note ("Note from Inkbound") | missing | add `briefs.creator_note text` |
| `library_feature.title` | `product_features.name` | alias |
| `library_feature.description` | `product_features.what_it_does` | alias |
| `library_feature.cta` | `product_features.claim` | alias |
| `clip_url`, `screenshot_url`, `is_general` | missing | add to `product_features` |

Migration file: `supabase/migrations/20261005120000_117_brief_slides_kind_features.sql`. RLS: existing policies on `briefs` (same company read, manager write) and `product_features` (approved read, `manage_features` write) cover the new columns. No edge function inserts into `briefs`, `campaigns` or `campaign_briefs`; `ingest-features` inserts `product_features` with explicit columns, so defaulted columns are safe.

## 4. What the backend does not have yet

- Library feature screenshots as URLs: `feature_screenshots.path` exists as a child table; the new `product_features.screenshot_url` is filled by the seed and by the manager when a screenshot is uploaded. Inkbound has 0 `product_features` today; the seed creates the 8 from `ss-data.js.txt`.
- AI "Write points", "Generate CTA", "Fill with AI" in the prototype: `brief-assist` has `regenerate_field` (hook, title, caption, search_phrase, talking_point, points) and `revise`. CTA generation per feature is not an action; the editor fills the CTA from the feature's `claim` (the prototype does the same with `matchFeature`).
- Creator "Ask AI" sheet (Freestyle): no endpoint for slide line suggestions; the lane uses `assistRegenerateField` for `points` and notes the gap in PROGRESS.md.
- Streak and "on approval" amount on the Sent screen: `lib/streaks.ts` and `lib/bounty.ts` exist; the lane reads them, with 0 and the assignment bounty as fallback.
- Offline drafts: `recording_drafts` and `creator_projects` are server side. Local clip URIs persist in `creator_projects.document` via `projects-api`; the record screen keeps that path.
- Instagram crop per slide: `submissions.instagram_segment_paths` exists; the creator slide editor keeps a single TikTok crop plus the existing Instagram crop path from `slide-edits.ts`.

## 5. File ownership

Manager lane may edit only: `app/(admin)/week/[id].tsx`, `app/(admin)/brief/**`, `components/admin/briefs/**`, `app/(admin)/_layout.tsx` (route registration only).

Creator lane may edit only: `app/(creator)/(tabs)/index.tsx`, `app/(creator)/make/**`, `components/creator/briefs/**`, `app/(creator)/_layout.tsx` (route registration only).

Everything else (`lib/**`, `theme/**`, `components/shared/**`, `components/ui/**`, `supabase/**`, `scripts/**`) belongs to the orchestrator. A lane that needs a change there writes the request under its job in `PROGRESS.md` and stops that item.
