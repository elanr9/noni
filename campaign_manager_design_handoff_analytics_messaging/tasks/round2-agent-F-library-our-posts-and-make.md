# Agent F: Our posts lane and the Make post flow (shared by every lane)

Reference: reference_ui/LibraryV2.jsx.txt (rowOurs, FilterSheet, TypeSheet, make(), pickType, KillNote, LIB2.types).
Touch: components/admin/library/OurPostsLane.tsx, components/admin/library/FilterPostsSheet.tsx, components/admin/library/MakePostSheet.tsx, lib/library-api.ts (ours), lib/briefs-api.ts (next empty slot, generate from source).

## Our posts lane
Toolbar: search "Search posts", a text toggle "Top 60d" / "Recent" with chevrons-up-down (600 13px slate-500, tap flips), and a 38px round filter button (layout-list icon; blue-100 with a blue-500 count badge when filters are active).
List: ONE white card of dense rows separated by 1px lines (no per-post cards): 34x45 first-frame thumb (radius 8), title (700 13.5px, single line), meta line "{creator} · {type} · Reel|Slideshow · {date}" (600 11.5px slate-400, creator in ink), views on the right in green (700 13.5px) over "views" (600 10px), then a "Remake" MakeButton. Tap the row opens the live post on TikTok or Instagram.
Sort: Top 60d = views in the last 60 days descending; Recent = publish date descending.
Filter sheet: title "Filter posts". Section "Creator": checkbox reason rows per creator. Section "Post type": checkbox rows per type with a Reel/Slideshow FormatChip on the right. Multi-select across both. Footer: Clear (outline, 38%) + "Show {n} posts" (primary). Creator and type filters combine with AND across groups, OR within a group.
Empty: play icon, "No posts yet", "Every post Inkbound publishes lands here the day it goes live." No match: "No posts match these filters". Skeleton: seven thumb-and-two-lines rows in one card. Infinite scroll with a "Loading more" row.

## Make post (one flow, three sources)
Sources: an idea (text), a reference (URL), one of our posts (port of an existing post).
- Ideas and references open the MakePostSheet: title "Make a post", subtitle "From “{idea text}” | @handle · TikTok. Goes into Week 1, slot {k} of 7." Rows: PostTypeChip with the type name on the left, Reel/Slideshow FormatChip on the right, one row per post type in the company's active set. Picking a row shows a spinner on that row, dims the others, and blocks closing until done.
- Our posts skip the sheet (type is known) and go straight to generation; the row's Remake button shows "Making".
- Generation fills the NEXT EMPTY SLOT in the current week from the source, then opens the post editor on it. If there is no empty slot: toast "This week is full. Add a slot in Briefs." and do nothing.
- Refused generation (the kill path): close the sheet, keep the item, and show KillNote under it: amber-soft row, circle-alert, "Not made. {kill reason}", x to dismiss. Never increment the count.
- Success: increment the source's made count, set madeOn and the slot label, move ideas and references to their Used sub-tab (Agent D lists), and record the link so MadeMeta opens that post.

## Acceptance
- Our posts render as one dense card; sort and filters work with the count badge.
- Make from every lane lands in the next empty slot and opens the editor; refused generations show the reason inline.
- A remade post shows "Used 1x" meta on its row and links to the new post.
