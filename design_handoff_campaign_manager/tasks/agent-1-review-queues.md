# Agent 1: Review queues

Reference: reference_ui/ReviewScreen.jsx.txt. Touch: app/(admin)/(tabs)/index.tsx, components/admin/QueueRow.tsx, MusicApprovalRow.tsx, AccountRow.tsx, SubmissionRow.tsx.

## Spec
- Header: "Review", subtitle varies by total (see reference copy), CountPill right ("All clear" or "N waiting").
- Segmented: Posts / Music / Accounts with counts.
- Posts lane: SubmissionRow cards + footnote "Reject a single clip and only that clip goes back. The rest stay approved."
- Music lane: intro line "Slideshows only. Open the post, check the song is on it, approve. Approval unlocks that post's earnings." Rows: thumb, full title (no truncation), "Creator · N slides · Live Xh ago", blue "Marked added Xm ago" line with music icon. NO Approve button: the whole row navigates to music approval; right side is a chevron (slate-300). Approved state renders the green "Approved" pill instead.
- Accounts lane: AccountRow per pending creator.
- Loading skeletons and per-lane empty states per reference.

## Acceptance
- Counts match data; rows navigate; no truncated music titles; no inline approve.
