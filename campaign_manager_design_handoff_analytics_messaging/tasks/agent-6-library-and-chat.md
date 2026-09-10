# Agent 6: Library + chat attachments

Reference: reference_ui/LibraryScreen.jsx.txt, reference_ui/CreatorsScreens.jsx.txt (ChatScreen). Touch: app/(admin)/(tabs)/library.tsx, app/(admin)/chat/[creatorId].tsx, components/ChatThread.tsx, components/admin/chat/, lib/messages-api.ts.

## Library spec
- Ideas composer: textarea placeholder "Type a post idea", focus ring blue; format chips Video / Slideshow: selected = blue-500 fill, WHITE text, scale 1.04 with fast ease-out transition on background/color/transform; unselected fill-quiet/slate-500. Save button disabled until text.
- Idea rows: zap/sparkles icon, body, format chip, "Cleaned with AI · draft ready" when drafted.

## Chat spec
- Composer row: plus button (44px, fill-quiet; active blue-100 with blue-700 icon) + input pill + blue send button.
- Plus toggles an attach row above the composer: three equal tiles (blue-50, blue-700 text): Photos, Camera, Video. Wire to expo-image-picker / camera; picking sends a media message.
- Media bubbles: 168px wide rounded media block (118 tall image, 224 tall video), light blue gradient placeholder behind the real thumbnail, play disc + duration badge for video, optional caption text, timestamp. Mine = blue-500 bubble, theirs = fill-quiet.
- Post-reference bubbles (m.ref) unchanged.
- messages-api: add media message type { media: 'image' | 'video', url, len? }.

## Acceptance
- Attach flow sends and renders both media types; chips animate; copy verbatim.
