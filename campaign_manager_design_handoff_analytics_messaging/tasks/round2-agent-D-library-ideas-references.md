# Agent D: Library shell, Ideas lane, References lane

Reference: reference_ui/LibraryV2.jsx.txt (LibraryScreen2, SubTabs, LibSearch, MadeMeta, MakeButton, KillNote, Toast, LaneEmpty, LaneSkeleton).
Touch: app/(admin)/(tabs)/library.tsx (shell), components/admin/library/IdeasLane.tsx, components/admin/library/ReferencesLane.tsx, components/admin/library/shared.tsx, lib/library-api.ts (ideas, references).

## Shell (you own it; Agents E and F hand you MediaLane and OurPostsLane)
Pinned header, never scrolls: title "Library" (700 30px), lane switcher pill row with four equal segments in this order: Ideas, References, Media, Our posts (selected white with card shadow, 700 13px). Under the switcher: the selected lane's entry point, its sub-tabs, its toolbar. The list scrolls under a soft bottom shadow. Switching lanes clears search and resets the sub-tab (Unused, or Screenshots for Media).
Mount: <IdeasLane/>, <ReferencesLane/>, <MediaLane/>, <OurPostsLane/>. Each lane exports { header: ReactNode, list: ReactNode } or renders both via a render prop so the pinned area can hold the lane's controls.
Shared parts: SubTabs (two equal segments with count pills), LibSearch (fill-quiet pill, 38 tall), MakeButton (34 tall fill-quiet pill "Make" / "Again" / "Remake"; busy = blue-100 with spinner and "Making"), MadeMeta ("Unused" in slate-400, or blue-700 "Used {n}x · {date} · Week 1 · slot 3" with chevron that opens the post), KillNote (amber-soft row "Not made. {reason}" with x), Toast (ink pill above the tab bar, check icon, 1.8s), pull to refresh ("Refreshing" with spinner next to the title), infinite scroll ("Loading more" row).

## Ideas lane
Entry point: white card, 1.5px border (line-strong; blue-500 with a 3px 18% blue ring when typing), textarea placeholder "Type an idea" growing to 4 rows, 36px round arrow-right button (blue-500 when there is text). Multiple lines save one idea per line; a hint "Saves as {n} ideas, one per line" appears in blue-700 when there is more than one. Toast: "Idea saved" or "{n} ideas saved". New ideas land in Unused.
Sub-tabs: Unused {n} / Used {n}. Completely separate lists. An idea moves from Unused to Used the moment a post is made from it.
Toolbar: search "Search unused ideas" / "Search used ideas".
List: one white card, rows separated by 1px lines: body (500 15px, tap to edit inline in a blue-50 textarea, save on blur), MadeMeta line on Used rows only, Make button ("Again" on Used). Long press opens the delete sheet: "Delete this idea?" / "Posts made from it are not affected." Keep / Delete.
Empty: Unused: zap icon, "No ideas yet", "Type one line above and save. Paste a whole doc to save one idea per line." Used: "Nothing used yet", "Ideas move here the moment you make a post from them." Skeleton: six two-line rows in one card.

## References lane
Entry point: white card with link icon, "Paste a link" (600 15px) over "TikTok or Instagram, copied from the app" (600 12px slate-400), and ONE primary sm button "Paste" (copy icon, min width 92). There is no text field. Tap reads the clipboard (expo-clipboard). If it is a TikTok or Instagram URL: save immediately with resolving = true, toast "Reference saved", switch to Unused, button shows "Pasting" while it works. Resolve thumbnail, title, handle in the background and update the row (the row shows a spinner in the thumb slot and "Fetching title" in slate-400 until then). If the clipboard is not a supported link: toast "Copy a TikTok or Instagram link first".
Sub-tabs: Unused {n} / Used {n}, separate lists. Toolbar: search "Search unused references" / "Search used references".
Cards: 46x62 thumb (radius 9), title (700 14px), "@handle · TikTok|Instagram", MadeMeta on Used only, Make button. Tap opens the link. Long press: "Delete this reference?" same note.
Empty: Unused: link icon, "No references yet", "Copy a TikTok or Instagram link, come back, tap Paste. It saves with a thumbnail and title." Used: "Nothing used yet", "References move here the moment you make a post from them."

## Acceptance
- Lane order Ideas, References, Media, Our posts. Header stays pinned while lists scroll.
- Unused and Used never show the same item. Making a post moves the item and increments its count.
- Paste works with one tap from the clipboard, including the invalid-link toast.
