# Agent 3: Music approval

Reference: reference_ui/ApprovalScreens.jsx.txt (MusicApproval). Touch: app/(admin)/music/[id].tsx.

## Spec
- Header "Music approval", meta "Creator · Live Xh ago".
- Slideshow pager: 330px 9:16-ish frame, overlay text, dots on top, glass arrows. Format chip bottom-left.
- NO song player card (removed by design).
- "Check the live post": Open on TikTok / Open on Instagram rows with handles.
- Footnote: "Approving unlocks this post's earnings. Videos never enter this queue."
- Footer: "Request Changes" (outline, 42%) / "Accept Song" (approve green, check icon).
- Accept Song → "Song approved" takeover: "Earnings for this post are unlocked. X sees it in their wallet tonight."
- Request Changes → sheet "Request changes" / "Goes to X": multi-select reasons "Song is not on the post", "Different song than the brief", "Only added on one platform", plus textarea "Anything specific, in your words". Send back disabled until a reason or note exists. → "Sent back" takeover: "X sees your notes and fixes the song on the live post. It lands back in this queue when they mark it added again."

## Acceptance
- Flow works end to end; disabled logic correct; copy verbatim.
