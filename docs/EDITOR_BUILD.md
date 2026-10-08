# EDITOR_BUILD — UGC Studio

The creator studio replaces the brief-locked record flow with freeform
creation: record or import clips like TikTok, cut them on a timeline, put
two clips on screen at once (do's and don'ts), drop text and picture pop-ups
anywhere in time, and build personal slideshows from any number of photos.
The brief becomes guidance (a notes drawer), not structure. Admin review,
approval and auto posting are unchanged.

Read `.cursor/rules/project.mdc` and this file before touching anything.

## Architecture decisions (settled)

- **One document.** `lib/edit-document.ts` is the contract. The studio edits
  it, the phone previews it, `render-submission` renders it. Mirrored on the
  server in `supabase/functions/_shared/editDocument.ts`. Change both together.
- **Server renders, phone previews.** The final MP4 and slide PNGs come from
  the existing Upload-Post ffmpeg job pipeline in `render-submission`, driven
  by `submissions.edit_document`. No on-device export in this build. The iOS
  native composition in `modules/video-editor` is preview only.
- **State.** `lib/studio-store.ts` (zustand). All document writes go through
  `commit()` or `gestureBegin/gestureUpdate/gestureEnd`. Never set the
  document directly. Undo/redo and autosave hang off this.
- **Persistence.** `creator_projects` (migration 116), one row per
  assignment, `document jsonb`. `lib/projects-api.ts`. Autosave via
  `useProjectAutosave`. At submit the document is frozen onto
  `submissions.edit_document` with `submissions.project_id`.
- **Media.** Assets are files in the `videos` bucket at
  `${companyId}/${assignmentId}/asset-${assetId}.${ext}`. The studio uploads
  every asset with a `localUri` and no `storagePath` in the background
  (`lib/studio-uploads.ts`); submit waits for `allAssetsUploaded`.
  Image pop-ups from the brand media library keep their `brief-assets` path
  as `storagePath` with `localUri` null; the server signs either bucket.
- **Gestures and animation.** `react-native-gesture-handler` and
  `react-native-reanimated` (installed, root wrapped in
  `GestureHandlerRootView`). No new PanResponder code in the studio.
- **Text rendering parity.** Text overlays and slide boxes use `OverlayBox`
  unchanged: `lib/overlay-boxes.ts`, `lib/overlay-text-metrics.ts`,
  `lib/overlay-bubble-path.ts` and their server mirrors. Do not invent a
  second text model.
- **iOS first.** Android gets capture and a plain `expo-video` preview of the
  current block; the editor is gated on `isVideoEditorAvailable()`.
- **Legacy stays.** `app/(creator)/record/[id].tsx` and `upload/[id].tsx`
  remain for `content_tasks` and briefs with `post_type_id` null until the
  studio is the entry point for every assignment. Do not refactor them.

## Document in one paragraph

A `VideoDocument` is `assets[]` (source files), `blocks[]` in timeline
order, `overlays[]` with absolute `startMs/endMs`, `gain`, `subtitles`.
A block has a `layout` (`single`, `split_v` top/bottom, `split_h`
left/right) and one clip per cell. A clip is an asset range (`inMs`,
`outMs`, source ms) at a `speed`, `muted`, with an optional `crop`. Block
duration is the shortest cell. A `SlideshowDocument` is `assets[]` and
`slides[]`, each a photo with crops and `OverlayBox[]`. All positions and
sizes are frame fractions. Helpers for every edit live in
`lib/edit-document.ts`; add new helpers there, never inline document
surgery in components.

## Route and composition

`app/(creator)/studio/[id].tsx` (id = assignment id) owns loading the
assignment, brief notes, project load/create, autosave, uploads, mode
switching and submit. It mounts the workstream components below with the
props listed. It is the only file that knows about all of them.

Modes: `capture` → `edit` (video) or `slides` (photo_carousel). The creator
can go back to capture from edit to add more clips.

## Workstreams and file ownership

Each workstream owns only its paths. Shared files (`lib/edit-document.ts`,
`lib/studio-store.ts`) are owned by the coordinator; propose additions in
your report instead of editing them.

### A — Capture: `components/creator/studio/capture/**`

TikTok camera producing assets. Export `CaptureScreen` with props:

```ts
{
  notes: { title: string; lines: string[] } | null; // brief guidance drawer
  clipCount: number;
  totalMs: number;
  onAsset(asset: MediaAsset): void;      // one recorded clip or one imported file
  onDeleteLast(): void;
  onDone(): void;                         // go to edit
  onClose(): void;
}
```

Must have: tap to start/stop and hold to record, pause/resume producing
separate assets, 3s/10s countdown, flip, torch (screen-brightness flash on
front, see `record/[id].tsx:894`), pinch zoom, grid toggle, segmented
progress bar with per-clip ticks, delete last clip with confirm, import from
library (multi-select, videos and photos, `expo-image-picker`), notes drawer
(slides up over the viewfinder, scrollable, optional teleprompter scroll for
long text, reuse `TeleprompterOverlay` if it fits). Capture pinning: avc1,
1080p, 8 Mbps as in `record/[id].tsx` today. Probe duration with
`probeDurationMs` from `lib/submissions.ts`; fill `width/height` from the
picker or `expo-video-thumbnails`. Mirror front camera.

### B — Timeline, layouts, preview: `components/creator/studio/timeline/**`, `modules/video-editor/**`

Export `VideoStage` (preview) and `TimelineEditor`.

`VideoStage` props: `{ doc: VideoDocument; children?: ReactNode }` plus
imperative `seekTo(ms)`. Drives `playheadMs`/`playing` in the store at
~30Hz. iOS: extend `CompositionBuilder.swift` and `VideoEditorPreviewView`
so the native timeline is `{ blocks: [{ layout, cells: [{ uri, inMs, outMs,
speed, muted, crop }] }] }` with two video tracks and per-track layer
transforms for splits (cell rect fill crop). Image cells are drawn in RN
over the native view for their block window (image assets are not inserted
in the AV composition). Keep `exportTimeline` compiling for the legacy
editor. `children` renders above the video (overlay layer from C).

`TimelineEditor` props: `{ doc: VideoDocument; overlayLane?: ReactNode }`.
Thumbnail strip per block (`thumbnails()` from the native module, `useClipFrames`
as reference), pinch to zoom time scale, playhead scrub, trim handles on the
selected block (both edges, per cell for splits), split at playhead, delete,
duplicate, long-press drag reorder, speed picker (`EDIT_SPEEDS`), mute per
cell, layout picker (single / top-bottom / left-right; picking a split
prompts for the second clip: another block's cell or the library), swap
cells, "add clip" button that calls `onAddClip()` (back to capture). Undo and
redo buttons wired to the store. Renders `overlayLane` directly under the
clip strip with the same scale; expose `msPerPx` and `scrollOffsetMs` to it
through `components/creator/studio/timeline/scale.ts` (`useTimelineScale`
store or context) so C can place bars.

### C — Text and pop-ups: `components/creator/studio/overlays/**`

Export `OverlayLayer`, `OverlayLane`, `AddOverlayBar`.

`OverlayLayer` props `{ doc: VideoDocument; stageWidth: number; stageHeight: number }`:
renders every overlay active at `playheadMs` on the stage. Text overlays
draw with the existing box renderer (`StageTextBox`, `TextBoxLayer`
patterns, `OVERLAY_TEXT_SPEC`), image overlays as rounded images. Gestures
(gesture-handler + reanimated): drag to move, pinch to resize (`size` for
text, `width` for images), width handles on selected text, tap selects, tap
again edits text (`TextEditSheet`: words, color palette from
`overlay-boxes.ts`, bg toggle), long press deletes with confirm. Selection in
the store. Center and edge snapping from `slides/frame.ts`.

`OverlayLane` props `{ doc: VideoDocument }`: one bar per overlay on the
timeline using `useTimelineScale` from B; drag the bar to move in time, drag
its ends to change start/end, tap selects and seeks the playhead into it.

`AddOverlayBar`: "Text" (adds a text overlay at the playhead with
`defaultOverlayWindow`, opens the edit sheet) and "Picture" (camera roll via
`expo-image-picker`, or brand media library via `listMediaLibrary`; creates an
image asset and overlay). Max `MAX_OVERLAYS`.

### D — Slideshows: `components/creator/studio/slides/**`

Export `SlideshowEditor` props `{ doc: SlideshowDocument; notes: ... }`.
Pick any number of photos (multi-select), reorder by drag, add and remove,
per-slide text boxes with the same tools as C (reuse `GestureItem`,
`TextEditPanel`, `segment-boxes.ts` as references), per-platform crops via
`photo-crop.ts` and `CropPanel` (TikTok 9:16 and Instagram 4:5 as today),
page through slides (`SlidePager`). Writes `doc.slides` through
`appendSlide/updateSlide/removeSlide/moveSlide`.

### E — Server renderer: `supabase/functions/_shared/editDocument.ts`, `supabase/functions/_shared/documentAssembly.ts`, `supabase/functions/render-submission/**`

When `submissions.edit_document` is present, `render-submission` takes the
document path instead of `brief_segments`:

- Video: one stitch job built from blocks. Per cell `trim`/`atrim`,
  `setpts`/`atempo` for speed, scale+crop to the cell rect (full frame,
  1080x960 for `split_v`, 540x1920 for `split_h`), `vstack`/`hstack` for
  splits, image cells via `-loop 1` inputs for the block duration, muted
  cells dropped from audio, two unmuted cells `amix`ed, blocks `concat`ed,
  then the existing `fps=30`, `loudnorm`, gain, limiter. No silence trimming
  (the creator cut it). Still transcribe for subtitles when
  `doc.subtitles.enabled`.
- Overlays become `RenderTimeline.texts` and `images` with the document's
  absolute `startMs/endMs` (text timing must be honored in the drawtext
  chain via `enable=between(t,...)`; today text shows for the whole clip).
  Image overlay paths may be in `videos` or `brief-assets`; sign accordingly.
- Slideshow: map `doc.slides` onto `runSlideshowAssembly` inputs (photo
  path, crops, boxes, aspect) so the existing conform, bubbles, drawtext and
  Instagram copy run unchanged.
- Legacy path untouched when `edit_document` is null.

### Coordinator (this file's owner)

`app/(creator)/studio/[id].tsx`, `lib/edit-document.ts`, `lib/studio-store.ts`,
`lib/projects-api.ts`, `lib/studio-uploads.ts`, `submitProject` in
`lib/submissions.ts`, entry-point switch from the assignment screen, review
screen playback check.

## Status (2026-10-04)

Shipped in code: migration 116 (applied), document + store + uploads +
`submitProject`, studio route and entry points (assignment screen and home
"Fix it" now open the studio), workstreams A to E, `render-submission`
deployed with the document path. Admin review hides the placement editor
for studio submissions (request changes only).

Needs a new dev client / TestFlight build before anyone can use it: new
native deps (Reanimated, Gesture Handler) and the Swift block composition.

Known gaps to pick up next: Android editor parity (capture + plain preview
only), imported videos without an audio track fail the server stitch,
brand-library images cannot preview inside split cells without a signed
URL, admin edits on studio submissions, transitions and music.

## Rules for every workstream

- TypeScript strict, no `any`, no new deps without asking. Components small.
- Every query scoped by `company_id`. Status changes only through the
  existing transition functions.
- Match `/design` and the existing creator app look (`theme/tokens.ts`).
- Read the Expo SDK 57 docs page for any Expo module you use before coding.
- `npx tsc --noEmit` must exit 0 at hand-off. `npm test` for anything in `lib/`.
- Report back findings and diffs only: files created, exports, props,
  anything you need added to shared files, known gaps.
