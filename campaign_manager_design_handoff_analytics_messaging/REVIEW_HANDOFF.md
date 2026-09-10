# REVIEW: complete handoff (queues, post review, music check, account approval)

For Chris. This is everything in the Review tab of the Inkbound campaign manager app, in one file, final. Build it in this order: Part 1 (queues) is small and unblocks the rest; Part 2 (post review) is the big one; Parts 3 and 4 are independent. Read the whole file first.

Ground rules for every part
- Company is Inkbound (inkbound.ai). All briefs and weeks were wiped; one empty draft week exists. A brief week is seven days that start when its first post goes live.
- Reference code is browser React saved as .jsx.txt in reference_ui/. Read it as JSX for layout, spacing, copy and behaviour. Translate to React Native; do not copy DOM.
- Design language: 01_DESIGN_LANGUAGE.md and theme/tokens.ts. Token colors only, no new hex, no new fonts.
- Copy is verbatim. Never use an em dash or an en dash anywhere; rewrite with a period, comma, colon, or "to".
- Hit targets 44px (40px allowed for the small pencil buttons noted below). Text never below 11px.
- Every async surface has a skeleton and an empty state.
- Reference files: reference_ui/ReviewScreen.jsx.txt (queues), reference_ui/ReviewV2.jsx.txt and reference_ui/ReviewDetailScreen.jsx.txt (post review, PlatformPreview with scrubber, ApprovedOverlay), reference_ui/ApprovalScreens.jsx.txt (MusicApproval, AccountApproval). Live design: ui_kits/admin-app/index.html (Review tab) and ui_kits/admin-app/messages-review.html (post review states).

Where posts also show up: Messages (round2-agent-A and B). The review queue is mirrored at the top of the Messages inbox as "Waiting on you", and every approve or send back writes an event that the post thread renders. Post review's "Open thread" button lands in that thread. Coordinate the route name /(admin)/post-thread/[assignmentId] with Agent B; use a no-op until it exists.

---

## Part 1: Review queues (tab root)

Reference: reference_ui/ReviewScreen.jsx.txt. Touch: app/(admin)/(tabs)/index.tsx, components/admin/QueueRow.tsx, MusicApprovalRow.tsx, AccountRow.tsx, SubmissionRow.tsx.

### Spec
- Header: "Review", subtitle varies by total (see reference copy), CountPill right ("All clear" or "N waiting").
- Segmented: Posts / Music / Accounts with counts.
- Posts lane: SubmissionRow cards + footnote "Reject a single clip and only that clip goes back. The rest stay approved."
- Music lane: intro line "Slideshows only. Open the post, check the song is on it, approve. Approval unlocks that post's earnings." Rows: thumb, full title (no truncation), "Creator · N slides · Live Xh ago", blue "Marked added Xm ago" line with music icon. NO Approve button: the whole row navigates to music approval; right side is a chevron (slate-300). Approved state renders the green "Approved" pill instead.
- Accounts lane: AccountRow per pending creator.
- Loading skeletons and per-lane empty states per reference.

### Acceptance
- Counts match data; rows navigate; no truncated music titles; no inline approve.


Additions for round 2:
- Header CountPill stays. Subtitle copy from the reference.
- Posts lane keeps the Reels / Slideshows sub-switch with counts. Rows open Part 2.
- Music lane rows open Part 3. Accounts lane rows open Part 4.
- The Review tab badge in the tab bar = posts + music + pending accounts.

---

## Part 2: Post review, one screen

This is the complete spec for the campaign manager review flow in the Inkbound admin app. It replaces the current three-layer flow (preview, RevisionMode overlay, watch sheet, note mode) with one screen. Read this file top to bottom before touching code. Every value here is final. Where the current code already does something right, keep it; where this file disagrees with the code, this file wins.

Reference (browser React, read as JSX, do not copy DOM verbatim): `reference_ui/ReviewV2.jsx.txt` (ReviewDetail2, SentOverlay, RV_REASONS). Reuse `PlatformPreview` behaviour and `ApprovedOverlay` from `reference_ui/ReviewDetailScreen.jsx.txt`. Live design: `ui_kits/admin-app/messages-review.html`, sections "Review, one screen" and "Request changes".

Design language: `01_DESIGN_LANGUAGE.md` (tokens in `theme/tokens.ts`). No new hex. No em or en dashes in any copy. Hit targets 44px minimum, text never below 11px.

### Files

Touch:
- `app/(admin)/review/[id].tsx` (rewrite the render tree; keep the data loading, queue, prefetch, render-status polling, `runReview`, `advance` logic as is)
- `components/admin/review/ReelSurface.tsx` (add `seekTo` support)
- `components/admin/review/SlideshowSurface.tsx` (unchanged API: `slides`, `index`, `onIndex`)
- `components/admin/review/ApprovedOverlay.tsx` (unchanged)
- new `components/admin/review/SectionStrip.tsx`
- new `components/admin/review/NotePanel.tsx`
- new `components/admin/review/SentOverlay.tsx` (replaces SentConfirmation.tsx)
- `lib/admin-api.ts` `reviewAssignment` (note contract unchanged, see Data)

Delete after the new screen is wired: `components/admin/review/RevisionMode.tsx`, `components/admin/review/SectionNoteCard.tsx`, `components/admin/review/SentConfirmation.tsx`, `components/admin/review/ReviewTopBar.tsx`, `components/admin/review/ReviewMetaOverlay.tsx`. `components/admin/RequestChangesSheet.tsx` stays only if music or account approval still import it.

Do not touch the creator app. It parses the note format below and already re-records only labelled sections (`app/(creator)/record/flagged.ts`).

### Why the old flow fails
- Three nested layers with their own scroll and keyboard handling; the sheet inside the overlay fights the keyboard and drops taps.
- Watching a clip and writing a note about it happen in different places, so the manager loses the spot they were reacting to.
- "Whole post" is a separate mode with its own textareas; switching modes discards work.
- Approve and Request changes hide behind a full-bleed preview that pushes the buttons off small phones.

### The new screen, top to bottom

Two states. VIEW is the post exactly as TikTok shows it on its own Preview screen, full bleed. NOTING (after Request changes) shrinks the player so the note tools fit. Never show the shrunken player in view state.

### View state: TikTok's own Preview screen, nothing else
This is the screen TikTok shows before you post, and the campaign manager must see the post exactly as it will run. Do not add Inkbound UI on top of it (no eye toggle, no strip, no white bar). Compare pixel for pixel with a real TikTok Preview screen on the same device.

Whole screen black (`ink-900`), status bar light, `headerShown: false`.

Header (44px, black): left 40px hit area with a white chevron-left (24); centered "Preview" (700 17px, white); right 40px hit area with the four-corner fullscreen glyph (white, 2.2 stroke). Fullscreen hides the header and the buttons so the post fills the phone; tapping the post brings them back.

Post: fills the space between header and buttons, centered, 9:16 kept (letterbox black if needed, never crop). Platform chrome rendered at FULL opacity, always on:
- Right rail: creator avatar with the red plus, heart, comment, bookmark, share, spinning disc while playing.
- Bottom block: "@handle" bold with a "Video" or "Photo" tag, caption clamped to 2 lines, hashtags, sound line (reel: "original sound · handle"; slideshow: "Auto-added on TikTok · silent on Instagram").
- Reel: tap toggles play, 64px translucent play disc when paused, 2.5px progress line along the bottom edge, "m:ss / m:ss" bottom right. The bottom 28px of the post is a scrubber, like TikTok: press and drag anywhere along it to seek. While scrubbing the line thickens to 6px, a 14px white knob appears at the position, the time label grows to 15px, playback pauses, and on release playback resumes if it was playing. Seeking must be live (the frame follows the finger), not on release only. This scrubber is present in both view and noting states.
- Slideshow: swipe or drag between slides, slide progress pill at the top, dots row above the handle.
- Only Inkbound overlay allowed: an amber "Take {n}" pill top right when `submission.version > 1`.
- Edit pending or failed: existing overlay inside the post (spinner + "Editing the final video" copy, or "Edit failed" + Retry edit). Approve disabled while pending.

Buttons (black bar, padding 12 16 and bottom = max(safe inset, 30), gap 10), styled like TikTok's Edit cover / Post pair:
- "Request changes": 46% width, 52px tall pill, `rgba(255,255,255,0.14)` fill, white 700 16px text, pencil icon 17.
- "Approve": fills the rest, 52px pill, `blue-500` fill, white 700 16px, check icon 18 (stroke 2.5). Busy label "Approving", 60% opacity.
Message the creator from the thread, not from here.

### Noting state
Entering noting animates (240ms ease-out) into this layout:

##### 1. Dark band (background `ink-900`)
Header row, padding 6 16 8, gap 8, items centered:
- Back: same 36px glass button.
- Title block, flex 1: post title (700 14px display, white, one line ellipsis) over meta (600 11.5px, white 60%): `{creator full name} · {type label} · {index+1} of {queue}` plus ` · Take {n}` when version > 1. Omit a null type label and its separator.
- Message button (glass). No eye button here; ghost chrome is off while noting.

Player under the header takes ALL remaining height (the band is flex 1): centered, 9:16 kept, radius 12, 10px bottom padding. The strip, panel and actions below size to their content, so the video stays as large as the phone allows. Same ReelSurface or SlideshowSurface instance (do not remount; keep playback position and slide index).

##### 2. Section strip (noting state only)
One segmented row, margin 8 16 0, `fill-quiet` track, padding 3, radius pill, gap 2. Every section is a flex 1 segment so the whole post always fits on ONE row with no horizontal scroll. Segments 30px tall, 700 12px, single line ellipsis.
Labels are short on the segments and spelled out in the panel: first segment "All" (whole post), then for reels "Hook", "P1", "P2", … "Outro"; for slideshows "1", "2", "3", …. The panel's label line shows the full name and length ("POINT 2 · 0:07").
Sections come from `brief_segments` for this brief, ordered by `slot_index`:
- Reel: hook → Hook; point → Point {n} numbering only point segments from 1; outro → Outro. Clip length from the segment duration if stored, else from the submission's per-clip durations.
- Slideshow: Slide {slot_index + 1} for every slide segment.
- If `brief_segments` is empty fall back to script lines exactly as the current `sections` array does. Never use "Clip n", "Cover", "Close" or "CTA" as section names in the note; the creator side maps Hook, Point n, Outro, Slide n.
Segment states:
- Selected: `ink` fill, white text.
- Noted (has a saved note): `blue-100` fill, `blue-700` text, plus a 6px `blue-500` dot at top right (blue-300 when also selected).
- Default: transparent, `slate-500` text.
- Transitions: background and color 160ms ease-out.
Tapping a pill selects it and moves the player:
- Reel: `seekTo(startSec)` where startSec is the sum of durations of earlier clips in the manifest (store per-segment start times when the render manifest has them; else compute from clip durations). After the seek the clip PLAYS from its start so the manager hears the part they are about to note; tapping the video pauses as usual.
- Slideshow: set slide index. Swiping the player also updates the selected pill (two-way binding on `slideIndex`).
Auto-scroll the strip so the selected pill is visible.

##### 3. Panel (sized to content, max 38% of the screen, scrolls inside when the notes list grows; padding 8 16 0)
Row: label "{SECTION} · {length}" (700 11px ui, uppercase, letter spacing 0.7, `slate-400`, e.g. "POINT 2 · 0:07") then the selected section's text (500 13.5px/1.45 ui, ink, clamp 2 lines). Slide text = overlay text joined by newline, else script line.
Whole post selected: "One note for the whole post. {creator first name} re-records everything." (500 13.5px, `slate-500`).
Under the script, with a 200ms fade in:
- Quick reasons: wrap row, gap 6. Pills 30px tall, padding 0 11, white fill, 1px `line-strong` border, 600 12px ink.
  - Reel sections: Audio clips, Off script, Too long, Framing, Reshoot outside, Say the plug clearer
  - Slide sections: Wrong screenshot, Text unreadable, Off script, Crop tighter, Swap the order
  - Whole post: Energy is low, Wrong location, Lighting, Start over, same script
  Tap appends to the draft: if draft is empty → `"{reason}."`; else trim trailing whitespace and period, then `". {reason}."`. Never duplicates the trailing period.
- Note box: `blue-50` fill, 1.5px `blue-300` border, radius md, padding 8 8 8 12, row aligned to the bottom. TextInput multiline, 2 rows min, grows to 4, 500 14px/1.4 ink, placeholder `What should {first name} change in {section label}` (Whole post: `What should {first name} change`). Right: 36px round check button, `blue-500` with white check (stroke 2.5) when the draft has text, otherwise white fill with `slate-300` icon and disabled.
  Check = save note for the selected key, clear the draft, then auto-select the next section in order that has no note (wrapping; if every section has a note stay put). Whole post does not auto-advance.
- Saved notes list (when count > 0), gap 4: one row per note in save order. Row: `fill-quiet` (selected row `blue-100`), radius 10, padding 8 10, gap 8. Left: section label (700 11px, `blue-700`, min width 52; "Whole post" for the whole key). Middle: note text (500 13px/1.4 ink). Right: x icon 14px `slate-400`, hit area 32px, removes the note (and clears the draft if it was the selected key). Tapping the row selects that section (player moves) and loads the note into the box for editing; saving overwrites.
Keyboard: the panel and actions row rise with the keyboard (`useKeyboardPadding`); the dark band does not move. The note box must stay visible above the keyboard on an iPhone SE.

##### 4. Actions row (noting state)
White, padding 10 16 and bottom = max(safe inset, 26), top shadow `0 -8px 16px -12px rgba(15,23,32,0.18)`, gap 10.
Cancel (ghost, md, 30%) + Send back (primary, md, send icon, fills the rest). Label: "Send back" at 0 notes (disabled), "Send back · 1 note", "Send back · {n} notes". While sending: "Sending", disabled.
Cancel returns to the TikTok view state, keeps saved notes in memory (dots stay on the strip) until the screen unmounts or the item advances. Re-entering Request changes loads the selected section's saved note into the box.

### Behaviour that must be exact
- Entering noting: the full-bleed post animates into the dark-band layout (video fills whatever the panel leaves), platform chrome turns off, strip gains Whole post at the front, box opens for the currently selected section with its saved note if any, focus the TextInput after the 240ms animation (not before, or the keyboard fights the layout).
- Selecting a section while the box has an unsaved draft: keep the draft (do not discard), the placeholder and reasons switch to the new section. If the manager then taps check the note saves to the newly selected section. This is intentional: people pick a reason first, then a clip.
- A note is one string per section. Saving again replaces.
- Long notes: the box grows to 4 rows then scrolls internally.
- Approve with unsaved noting state is impossible because the Approve button is not shown while noting. Cancel first.
- Approve → `runReview('approved', null)` → ApprovedOverlay (unchanged copy and steps) → "Next in queue" calls `advance()`.
- Send back → `runReview('changes_requested', note)` with the note string built as in Data → SentOverlay → "Next in queue" calls `advance()`; "Open thread" pushes the post thread route (`/(admin)/post-thread/[assignmentId]` when Agent B has landed; until then push the creator chat with the assignment param).
- Advancing to the next item resets: selected section = first, noting = false, notes = {}, draft = '', view state, slide index 0, position 0.
- Nothing left → existing "Nothing left to review." fallback.
- Errors from `runReview` keep all state (notes, draft, selection) so the manager can retry.

### Data contract
`reviewAssignment({ assignment, submissionId, reviewerId, action, note })` is unchanged.
Build `note` exactly like the current RevisionMode does so the creator app keeps parsing it:
- Section notes, in manifest order (not save order): `"{Label}: {text}"` blocks joined by `"\n\n"`. Labels must be exactly Hook, Point 1, Point 2, …, Outro, or Slide 1, Slide 2, … (the creator side regexes `^Point\s+(\d+)$`, `hook`, `outro`; slides are matched by the slideshow re-upload flow).
- Whole post note: the raw text with no label. If a whole note exists together with section notes, put the whole note first as its own block with no label, then the section blocks.
- Count for the button = number of saved notes including the whole note.
Also write a `review_events` row (already done inside `reviewAssignment`) so Messages (Agent B) can render a sent_back card with these notes.

### Sent back overlay (`SentOverlay`)
Full screen white takeover, z above everything, padding 0 20, content vertically centered, gap 20. Back button 36px `fill-quiet` at top left (returns to the screen in view state with notes cleared; nothing is resent).
- 68px `blue-100` disc with a 28px send icon in `blue-600`.
- "Sent back to {first name}" (700 26px display, tight -0.6, ink, centered).
- "Your notes are in the post thread. {first name} re-records only what you marked and take {n+1} lands back in Review." (400 15px/1.5, `slate-500`, max width 290, centered).
- The notes, one row each: `off-white` fill, radius md, padding 11 13, label (700 11px `blue-700`, min width 52, "Whole post" for the whole key) + text (500 13.5px/1.4 ink).
- Buttons row, gap 10: "Open thread" (outline, lg, 44%) + "Next in queue" (primary, lg, fills).

### Approved overlay
Unchanged from the current build: green disc, "Approved", "{title} is out of your hands. Noni takes it from here.", three steps (reel: Clips stitched and overlays burned in / Posted to TikTok and Instagram at the slot time / Views and revenue tracked from the first hour; slideshow: Slides assembled with their overlay text / Posted with auto-add music on TikTok, silent on Instagram / {first name} adds the song, then it comes back for one tap), "Next in queue". Replace "Noni" with "Inkbound" if the company copy has been rebranded elsewhere; otherwise leave.

### Loading and edge states
- Loading: full-bleed 9:16 skeleton + two 44px button skeletons (as today). No spinner.
- Reel with no finished edit yet: player shows the pending overlay; strip and panel still work (script only); Approve disabled with the existing "Still editing" alert if forced.
- Missing submission: existing "Missing submission" alert path.
- Very long titles ellipsize; meta never wraps.
- Slideshow with more slides than script lines: label every slide, text falls back to ''.

### Acceptance (QA runs every line on an iPhone SE and an iPhone 15)
- [ ] The whole flow happens on one screen. No RevisionMode overlay, no watch sheet, no note mode.
- [ ] View state matches a real TikTok Preview screen: black, "Preview" header with back and fullscreen, full-bleed post with full-opacity platform chrome (rail, handle, caption, tags, sound), two pill buttons. No Inkbound chrome except the Take pill.
- [ ] Tapping a segment seeks the reel to that clip and plays it from its start; tapping a slide segment jumps the slideshow; swiping the slideshow updates the segment.
- [ ] Dragging along the bottom of the video scrubs live in both states; the line thickens, a knob appears, playback resumes on release if it was playing.
- [ ] Request changes keeps the video as large as possible (panel hugs its content, no empty white space) and adds Whole post; Cancel restores the TikTok view and keeps the notes and dots.
- [ ] Quick reasons append with correct punctuation, never a double period.
- [ ] Check saves the note, clears the box, and advances to the next un-noted section.
- [ ] Notes list rows select their section, load for editing, and remove with x.
- [ ] Send back label counts notes correctly and is disabled at zero.
- [ ] The note string sent matches `Label: text` blocks joined by blank lines, manifest order, whole note first and unlabelled.
- [ ] The creator app opens the changes screen and marks only the labelled clips for re-record.
- [ ] Sent back overlay lists the notes and both buttons work; Next in queue advances; Nothing left fallback appears at the end.
- [ ] Approve works exactly as before, including the edit pending guard.
- [ ] Keyboard never covers the note box; the dark band stays put.
- [ ] Every string above is verbatim; no em or en dashes anywhere.
- [ ] Old files deleted; no dead imports; lint clean.


---

## Part 3: Music check

Reference: reference_ui/ApprovalScreens.jsx.txt (MusicApproval). Touch: app/(admin)/music/[id].tsx, components/admin/music/, lib/admin-api.ts (music approval), notify function (song link to creator).

### How music works (build the whole loop)
1. A slideshow is approved and posted by Noni. Videos never enter this flow.
2. The creator gets a notification "Add the song". Opening it in the creator app lands on that post with the song we want: the TikTok sound link and the Instagram audio link, each with a Copy button, plus "Mark as added". (Creator side is owned by the creator app agent; the links come from the brief's song fields: song_title, tiktok_sound_url, instagram_audio_url.)
3. When the creator marks it added, the post lands in Review > Music for the campaign manager.
4. The campaign manager checks and taps Approve. Approve unlocks the creator's earnings for that post. Fix song sends it back to the creator with the links again.

### Screen
PushHeader "Music check", meta "{Live 3h ago} · {Marked added 12m ago}".
- Post row (no card): 54x72 first-frame thumb, title (700 17px), "{creator} · {n} slides" (600 13px slate-500).
- Song block: blue-50 rounded block, 40px blue-100 square with music-2 icon, label "SOUND" (700 11px uppercase blue-700), song title (700 15px ink, one line).
- Two platform cards (white, 1px line, card shadow, radius lg, gap 10), TikTok then Instagram. Card header (padding 12 14 10): 30px ink rounded square with the platform icon in white (music-2 / at-sign), platform name (700 15px), handle right-aligned (600 12.5px slate-400). Then two rows separated by hairlines, 54px min height, padding 0 14: an 18px slate-500 icon (eye for the post, music-2 for the sound), label (600 15px ink) over a sub line (600 12px slate-400, ellipsis), and a 30px blue-100 circle with a blue-700 arrow-right on the right.
  - Row 1 "View post" / "The live post": opens the live post URL on that platform (from the publish record; fall back to the profile).
  - Row 2 "Open sound" / {song title}: opens tiktok_sound_url or instagram_audio_url.
  Rows with no URL are hidden.
- Helper: "Check the song is on both posts. Approve unlocks {first name}'s earnings for this post." (400 13px slate-400).
- Footer ActionBar: "Fix song" (outline, 40%) + "Approve" (green approve variant, check icon).
No slide pager on this screen. The post is checked on the platform, not in Noni.

### Fix song sheet
Title "Fix the song", subtitle "{first name} gets this and re-adds it on the live post". Three multi-select checkbox reason rows: "Song is missing on TikTok", "Song is missing on Instagram", "Wrong song". Textarea placeholder "Anything else, in your words" (2 rows). Footer: Cancel (ghost, 28%) + Send (primary, send icon, disabled until a reason or text). Send writes a music review event with the reasons and note, re-sends the song notification with both links, and moves the post out of the queue until the creator marks it added again.

### Confirmations
Sent: blue disc, "Sent to {first name}", "They get the song link again and fix it on the live post. It lands back here when they mark it added.", Back to Review.
Approved: green disc, "Song approved", "{first name} starts earning on this post now.", Back to Review. Approving unlocks earnings for the post (existing wallet gating).

### Acceptance
- All four rows deep-link correctly; a missing URL hides its row rather than opening nothing.
- Approve unlocks earnings; Fix song re-notifies with links and returns the post to the queue on the next mark.
- No em or en dashes; copy verbatim.


---

## Part 4: Account approval

Reference: reference_ui/ApprovalScreens.jsx.txt (AccountApproval). Touch: app/(admin)/account-approval/[accountId].tsx, components/admin/account/.

### What it is
Four things to check, nothing else: the TikTok profile, the Instagram profile, and the two scroll recordings. No profile screenshot grid, no feed test text card, no separate handles card. Handles live on the profile rows.

### Layout
- PushHeader "Account approval", meta = submitted or sent back time.
- Creator row (no card): 48px avatar, name (700 18px), credential (600 13px slate-500), TypeChip "Pending" (quiet) or "Needs changes" (warn).
- If sent back before: amber-soft block with circle-alert, reason (700 13px) and note (400 13px), text color #8A5A0E.
- Section "PROFILES": one white card, two rows separated by a 1px line. Row: 40px rounded square (radius 12, fill-quiet) with the platform icon (music-2 for TikTok, at-sign for Instagram), label (700 15px) with a green circle-check-big (18) or, once noted, a blue-100/blue-700 "Changes" pill with pencil, handle "@..." (600 13px slate-500) under it. Right: sm tint button "Open" with arrow-right that opens the live profile in the browser (https://tiktok.com/@handle, https://instagram.com/handle), then a 40px round pencil button (fill-quiet; blue-100 with blue-700 icon once a note exists).
- Section "SCREEN RECORDINGS": two equal cards in a grid, gap 10. Card: 9:12 video thumbnail with a 40px white play disc, duration pill bottom right, the green check or "Changes" pill top left; under it the label (700 13.5px: "TikTok For You scroll", "Instagram scroll") and the requirement (600 11.5px slate-500, e.g. "15s minimum, continuous"); a 40px pencil button bottom right. Tapping the thumbnail opens the sheet with the video playing.
- Footer ActionBar: "Send back · N" (outline, disabled at 0) + "Approve and link" (primary, check icon).
- Helper line under the grid: "Tap the pencil to request changes on a part. Approve links both handles; anything with a note goes back."

### Note sheet
Title = part label. For recordings: subtitle "{len} · {requirement}", a 200px 9:16 player with play/pause and duration, then the note box. For profiles: subtitle "What should {first name} change". Note box: blue-50 block with a white textarea (1.5px blue-300 border), placeholder "What should {first name} change here". Footer: Cancel (ghost, 28%) + Save note (primary, disabled until text). Saving marks the part with the Changes pill; the note shows under the row as a blue-50 block with an x to remove.

### Confirmations
Approve and link: green disc, "{first name} is approved", "@tiktok and @instagram are linked. Their first brief lands tomorrow morning.", Back to Review.
Send back: amber disc, "Sent back to {first name}", "They see your notes on their setup screen and resubmit. It lands back in this queue.", Back to Review.

### Acceptance
- Open buttons deep-link to the real profiles.
- Each of the four parts can carry one note; the footer count matches; parts without notes count as approved.
- No em or en dashes; hit targets 40px+ for the pencil buttons, 44px for footer buttons.


---

## Final QA for the whole Review tab
Run on an iPhone SE and an iPhone 15, light and dark status bar contexts.
- [ ] Queues: three segments with live counts; skeletons and empty states per lane; every row opens the right screen; badge math matches.
- [ ] Post review: every line in the Part 2 acceptance list.
- [ ] Music: four deep links work; Approve unlocks earnings; Fix song re-notifies with sound links and returns the post to the queue after the creator marks it added.
- [ ] Account: Open buttons deep-link to both profiles; recordings play in the sheet; notes per part; Approve and link stores both handles.
- [ ] Every confirmation is a full white takeover with disc, title, one paragraph, one primary button (two for Sent back in post review).
- [ ] grep the diff for "—" and "–": zero hits.
- [ ] Deleted files removed, no dead imports, lint and typecheck clean.
