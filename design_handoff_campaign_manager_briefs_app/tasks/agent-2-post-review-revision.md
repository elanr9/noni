# Agent 2: Post review + revision mode

Reference: reference_ui/ReviewDetailScreen.jsx.txt. Touch: app/(admin)/review/[id].tsx, components/admin/review/, components/admin/RequestChangesSheet.tsx.

## Spec
- Default: platform-true 9:16 frame (reel player or slideshow pager), top scrim with back, Take N pill when attempt > 1, "1 of 5" pill, message button; bottom scrim with avatar, handle, type/age, format chip, caption, hashtags. Footer: Request changes (outline, 46%) / Approve (primary).
- Approve → Approved takeover with the 3 automation steps (different steps for reel vs slideshow, see reference).
- Revision mode ("What should X fix?"):
  - Segmented: Section by section / Whole post.
  - Section list: one card PER SPOKEN SECTION ONLY. There is NO caption card: the campaign manager writes captions in the brief and they are placed automatically. Never add a caption row here.
  - Tapping a section opens the watch sheet (clip preview, play/pause, duration) with Back / Request changes → inline note editor → Save note.
  - Cards with notes: blue border, "Note added", blue-50 note block with remove x.
  - Whole post: stacked textareas with "Add another note".
  - Footer: Cancel + "Send back · N notes" (disabled at 0) → Sent back takeover ("...Nothing else has to be re-recorded.").

## Acceptance
- No caption anywhere in revision mode; notes count drives the footer; sheet flow matches reference.
