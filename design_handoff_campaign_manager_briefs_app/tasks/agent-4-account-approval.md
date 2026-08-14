# Agent 4: Account approval

Reference: reference_ui/ApprovalScreens.jsx.txt (AccountApproval). Touch: app/(admin)/account-approval/[accountId].tsx, components/admin/approval/.

## Spec
One short screen, no long scroll. It reads like post review: even cards, tap to inspect, request changes per part.
- Creator card: 46px avatar, name, credential, Pending / Needs changes chip. If sent back: amber reason card.
- Hint: "Tap a part to check it. Request changes on anything that is wrong, the rest counts as approved."
- 2-column grid, 5 even cards (minHeight 122): Instagram scroll (clip, duration), TikTok For You scroll (clip, duration), Profile screenshots, Feed test, Handles to link. Each: thumb top-left, green check top-right (or blue "Changes" tag when noted), 700 14px label, 12px meta.
- Card sheet: clip preview / two labeled screenshot frames / feed test paragraph / handle rows + capture note. Footer: Back / Request changes → note editor → Save note. Existing note shows as removable note block.
- Screen footer: "Send back · N" (outline, disabled at 0) / "Approve and link".
- Takeovers: approved ("@handles are linked. Their first brief lands tomorrow morning.") and sent back ("They see your notes on their setup screen and resubmit. It lands back in this queue.").

## Acceptance
- All five parts inspectable; notes drive count and card states; approval links handles.
