# Agent E: Media lane (screenshots and recordings with titles) and the editor source

Reference: reference_ui/LibraryV2.jsx.txt (media parts: tileMedia, NameSheet, MediaPreview, LaneEmpty media copy, LaneSkeleton media), reference_ui/EditorSheets.jsx.txt (existing media sheet in the post editor).
Touch: components/admin/library/MediaLane.tsx, components/admin/library/NameMediaSheet.tsx, components/admin/library/MediaPreview.tsx, post editor media sheet (add a "Media library" source tab), lib/media-api.ts, Supabase storage bucket for company media.

## Model
Media { id, companyId, kind: 'image' | 'video', title, url, thumbUrl, durationSec?, bytes, mime, createdAt }. Accept jpeg, png, webp, mp4, mov up to 200 MB. Title is required and is the label shown everywhere (library, editor, post slides).

## Lane
Sub-tabs: Screenshots {n} / Recordings {n}. Completely separate grids; the toolbar and empty state follow the sub-tab.
Toolbar: "{n} screenshots" or "{n} recordings" on the left, primary sm button "+ Add screenshot" / "+ Add recording" on the right.
Grid: two columns, 12px gap. Tile = 4:5 rounded 12 thumbnail (media shadow). Recordings show a 36px white play disc centered and a dark duration pill bottom right. Under every tile: kind icon (images or video, 12px slate-400) and the title (700 13px ink, single line ellipsis). The last cell is a dashed add tile (1.5px line-strong, image-plus or video icon in blue-500, "Add screenshot" / "Add recording").
Tap a tile: fullscreen preview on ink-900. Header: x button, title (tap the title to rename inline, pencil icon after it), meta "Screenshot · png" or "Recording · 0:14 · mov". Body: the media, letterboxed in a rounded 18 frame; recordings play with a 62px play disc.
Long press a tile: sheet "Delete this media?" with the note "Posts already using it keep their copy." Keep / Delete. Deleting removes the library file only; posts keep their copied asset.

## Add flow
Tap Add: open the system picker filtered to images or videos for the current sub-tab. After picking, open the NameMediaSheet: title "Name this screenshot" / "Name this recording", subtitle "This is the label you will see when adding it to a post.", a 72x96 thumb of the pick, a text field (placeholder "e.g. Highlight video" for recordings, "e.g. Chapter view, editor" for screenshots; border blue-500 once typed), file meta under it ("mov · 0:12 · 38 MB" or "png · 1170 × 2532"), footer primary "Save to media" disabled until a title exists. Upload starts when the sheet opens so saving is instant; if the upload fails, keep the sheet open with an inline error. Toast "Screenshot added" / "Recording added". The new item lands first in its grid.

## Editor source
In the post editor's media sheet add a source tab "Media library" beside camera roll. It reuses the same two sub-tabs and grid with titles, so the campaign manager picks "Highlight video" by name. Picking copies the asset onto the post (the post keeps its own copy).

## States
Loading: two-column skeleton with 150px tiles and a title line under each. Empty (Screenshots): images icon, "No screenshots yet", "Add screenshots of the product. Give each one a title so it is easy to find in the editor.", action "Add screenshot". Empty (Recordings): video icon, "No recordings yet", "Add screen recordings of the product. Give each one a title so it is easy to find in the editor. Up to 200 MB.", action "Add recording". No search in this lane.

## Acceptance
- Screenshots and recordings never appear in the same grid.
- Every item has a title; renaming in the preview updates the grid and the editor.
- The post editor can pick from the library by title; deleting from the library does not touch posts.
