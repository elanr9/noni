# Agent 4: Account approval (round 2 redesign)

Reference: reference_ui/ApprovalScreens.jsx.txt (AccountApproval). Touch: app/(admin)/account-approval/[accountId].tsx, components/admin/account/.

## What it is
Four things to check, nothing else: the TikTok profile, the Instagram profile, and the two scroll recordings. No profile screenshot grid, no feed test text card, no separate handles card. Handles live on the profile rows.

## Layout
- PushHeader "Account approval", meta = submitted or sent back time.
- Creator row (no card): 48px avatar, name (700 18px), credential (600 13px slate-500), TypeChip "Pending" (quiet) or "Needs changes" (warn).
- If sent back before: amber-soft block with circle-alert, reason (700 13px) and note (400 13px), text color #8A5A0E.
- Section "PROFILES": one white card, two rows separated by a 1px line. Row: 40px rounded square (radius 12, fill-quiet) with the platform icon (music-2 for TikTok, at-sign for Instagram), label (700 15px) with a green circle-check-big (18) or, once noted, a blue-100/blue-700 "Changes" pill with pencil, handle "@..." (600 13px slate-500) under it. Right: sm tint button "Open" with arrow-right that opens the live profile in the browser (https://tiktok.com/@handle, https://instagram.com/handle), then a 40px round pencil button (fill-quiet; blue-100 with blue-700 icon once a note exists).
- Section "SCREEN RECORDINGS": two equal cards in a grid, gap 10. Card: 9:12 video thumbnail with a 40px white play disc, duration pill bottom right, the green check or "Changes" pill top left; under it the label (700 13.5px: "TikTok For You scroll", "Instagram scroll") and the requirement (600 11.5px slate-500, e.g. "15s minimum, continuous"); a 40px pencil button bottom right. Tapping the thumbnail opens the sheet with the video playing.
- Footer ActionBar: "Send back · N" (outline, disabled at 0) + "Approve and link" (primary, check icon).
- Helper line under the grid: "Tap the pencil to request changes on a part. Approve links both handles; anything with a note goes back."

## Note sheet
Title = part label. For recordings: subtitle "{len} · {requirement}", a 200px 9:16 player with play/pause and duration, then the note box. For profiles: subtitle "What should {first name} change". Note box: blue-50 block with a white textarea (1.5px blue-300 border), placeholder "What should {first name} change here". Footer: Cancel (ghost, 28%) + Save note (primary, disabled until text). Saving marks the part with the Changes pill; the note shows under the row as a blue-50 block with an x to remove.

## Confirmations
Approve and link: green disc, "{first name} is approved", "@tiktok and @instagram are linked. Their first brief lands tomorrow morning.", Back to Review.
Send back: amber disc, "Sent back to {first name}", "They see your notes on their setup screen and resubmit. It lands back in this queue.", Back to Review.

## Acceptance
- Open buttons deep-link to the real profiles.
- Each of the four parts can carry one note; the footer count matches; parts without notes count as approved.
- No em or en dashes; hit targets 40px+ for the pencil buttons, 44px for footer buttons.
