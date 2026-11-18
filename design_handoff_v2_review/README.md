# Handoff: Noni v2 admin app, part 1 (design system, navigation, Review tab)

## Overview
Noni is a creator campaign manager. An admin (brand side) reviews what creators submit, briefs them, messages them and reads analytics. This handoff covers the first slice of the v2 redesign:

1. The v2 visual system (tokens, type, cards, buttons, chips).
2. The app shell: 5-tab bottom bar with a raised Create button, per-tab navigation stacks, push/pop/modal transitions.
3. The Review tab end to end: Posts, Music and Accounts lanes, post player with notes and editor entry, music approval, account approval, and the approval celebration.

Briefs, Messages, Analytics and the Editor are included in the reference files for context but are out of scope for this pass (their handoffs follow).

## About the design files
Everything in `reference/` is a **design reference built in HTML and React (Babel in the browser)**. It is a prototype that shows the intended look and behaviour. Do not ship it. Recreate the screens in the existing Noni codebase (React Native / Expo in `~/noni`), using its routing, components and data layer. Where this document and the prototype disagree, the prototype wins for visuals and this document wins for behaviour.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, shadows and motion are final. Match them exactly. Sample content (creator names, titles, counts, avatars from pravatar, frame PNGs) is placeholder and should come from real data.

---

## 1. Design tokens (`reference/tokens.css`, `reference/theme/tokens.ts.txt`)

Colours
- bg `#F2F3F5` (screen ground), card `#FFFFFF`
- ink `#111114`, grey-4 `#6B6B76`, grey-3 `#AEAEB7`, grey-2 `#E4E4E9`, grey-1 `#F2F3F5`
- blue `#1BA6EE`, blue-deep `#0A7FC2`, blue-tint `#E3F4FD`
- green `#1F9D5B`, green-tint `#E2F5EA`
- amber `#D97E0B`, amber-tint `#FDF1DC`
- purple `#7C5CE6`, purple-tint `#EEE9FB`
- pink `#E0457B`, pink-tint `#FCE7EF`
- scrim `rgba(17,17,20,0.4)`
- Tab bar active `#0A4DA3`, inactive `#1BA6EE`

Colour meaning: blue is the brand and primary action; green is live and earning; amber is waiting or changes requested; purple is slideshows; grey is open or neutral.

Type (system font: SF Pro Text on iOS, system sans elsewhere)
- t-h: 700 32/38, letter-spacing -0.6 (tab root titles)
- t-card: 700 20/24, letter-spacing -0.2
- t-row: 600 17/22
- t-body: 400 15/20
- t-meta: 400 13/18, grey-4
- t-num: 700 28/34, -0.5, tabular numerals
- t-num-s: 700 17/22, tabular numerals

Spacing: 4, 8, 12, 16, 24, 32. Screen horizontal padding 20. Card bottom margin 12.

Radii: card 16, thumb 10, pill 999, option 14, sheet top 20 or 24.

Shadows
- card: `0 1px 2px rgba(16,24,40,0.04), 0 6px 16px rgba(16,24,40,0.06)`
- float: `0 8px 24px rgba(16,24,40,0.14)`
- blue glow (selected pill or chip): `0 2px 6px rgba(27,166,238,0.35)`

Motion
- ease `cubic-bezier(0.22,0.61,0.36,1)`
- press 90ms (scale 0.97 on any pressable), push 240ms
- sheets: `cubic-bezier(.2,.8,.2,1)` 320ms
- Light haptic on every tap.

Icons: Material Symbols Rounded, filled (FILL 1, wght 500 default, 700 for emphasis). Platform marks for TikTok and Instagram are inline SVGs in `reference/V2Review.jsx.txt` (`TikTokMark`, `InstagramMark`).

### Kit components (`reference/V2Kit.jsx.txt`)
- **Card**: white, r16, card shadow, padding 16, margin-bottom 12. Pressable when it has onPress.
- **Button**: height 52, r999, 700 17, flex 1 in a footer row. Variants: primary (blue bg, white), ink, secondary (blue-tint bg, blue-deep text), quiet (grey-1), amber (amber-tint bg, amber text). Disabled 0.4 opacity. `pill` variant is 36 high, 700 15, padding 0 16.
- **Seg**: segmented pill group. Track `#E6E7EB`, r999, padding 4. Sliding blue indicator (r999, blue glow) animates with the push timing. Items 36 high, 600 15 ink, 700 15 white when selected. Optional count badge: 20 high, r999, 700 12; tint bg with deep text when unselected, `rgba(255,255,255,0.25)` white text when selected. Badge tone per lane: Posts blue, Music purple, Accounts amber.
- **Chip**: 26 high, r999, padding 0 10, 700 13, tint bg and deep text, optional 14px icon.
- **Avatar**: circle, photo cover, tone ring 3px (2px under 40). Initial fallback on tint. Optional online dot 14px green with 2.5px white border.
- **Row**: flex row, gap 12, padding 12 0, 1px grey-1 divider except last, min height 56, optional grey-3 chevron.
- **Thumb**: 8:11 frame image, r10.
- **Sheet**: bottom sheet, white, r20 top, float shadow, padding 12 20 34, 36x4 grey-2 grabber, scrim behind.
- **Empty**: centred card with grey-4 body text.
- **Skeleton**: card-shaped block shimmering (opacity 1 to 0.45) 1.2s.

---

## 2. App shell and navigation (`reference/V2Kit.jsx.txt`: Phone, Shell, TabBar, Screen)

### Tab bar
- Height 84, pinned to the bottom, white, with a notch cut into the top centre for the raised Create button. Top corners r24. Drop shadow `0 -2px 12px rgba(0,0,0,0.06)`. Notch: 72 wide, 32 deep, 12px eased shoulders. SVG path in `TabBar`.
- 5 equal columns: Review (icon `inbox`), Briefs (`list_alt`), Create (raised action), Messages (`chat_bubble`), Analytics (`bar_chart`).
- Item: icon 26 filled, label 600 12/14 below with gap 4, padding-top 10. Active colour `#0A4DA3` with a 64x60 blue-tint pill behind icon and label. Inactive `#1BA6EE`.
- Count badge on icon: min 18, 18 high, r999, blue bg, 2px white border, 700 11 white. Review shows waiting count, Messages shows unread.
- Create: 64px blue disc, 5px white border, shadow `0 4px 12px rgba(16,24,40,0.14)`, raised 40px above the bar, `add` icon 30 weight 700 white, label "Create" 30px below the icon row. Scales to 0.94 on press. Tapping it pushes NewBrief as a modal (bottom sheet transition) on the current tab stack.
- Tapping the active tab pops its stack to root. The bar is visible only when the stack is at its root.

### Stacks and transitions
- One navigation stack per tab; switching tabs preserves each stack.
- Push slides in from the right over 240ms with the ease curve; the screen underneath slides to -24% and gets a `-8px 0 24px rgba(16,24,40,0.12)` shadow from the incoming screen. Pop reverses.
- Modal push slides up from the bottom (same timing). The screen beneath a modal does not shift.
- `popAll` returns to root (used after approvals).

### Screen scaffold
- Root screen: status bar space 54, then scroll area with 20px side padding. Title t-h with 8 top and 16 bottom; optional sub row (chips) 8 below the title; optional right slot.
- Pushed screen: 52px header row with a 44x44 back button (`chevron_left` 32, ink) and t-row title, ellipsised. Optional right slot (TextButton: blue, 600 17, 44 high).
- Optional pinned footer: white, padding 12 20 34, top hairline grey-2, buttons in a row with gap 8.
- Content bottom padding 24 (40 with no footer and no bar). When the tab bar shows, the scroll area ends 120px above the bottom.

---

## 3. Review tab (`reference/V2Review.jsx.txt`)

### 3.1 Review root
- Title "Review". Sub chip: blue `schedule` "{total} waiting", or green `check` "All clear" when total is 0. Total = posts + music + accounts in queue.
- Seg with three lanes and counts: Posts, Music, Accounts.
- 500ms skeleton (4 blocks of 76) before content appears.
- Empty states: "Nothing to review." / "No songs waiting." / "No accounts waiting."

**Posts lane**: one card per creator with posts in the queue.
- Card padding 14 16, flex row gap 14: Avatar 64 with tone ring; name 700 22/26 (flex 1, no wrap); right column aligned end: "{n} posts" 600 13 blue-deep, then the post thumbs (26 wide, r6, gap 5, wrap, max width 160); chevron grey-3 20.
- Tap card: push CreatorQueue. Tap a thumb: push ReviewDetail for that post directly.

**Music lane**: one card per song waiting.
- 56x56 r14 blue-tint square with `music_note` 28 blue; title = post title (t-row); under it a row with Avatar 28 (no ring) and t-meta at 15px "{creator} · {age} ago"; chevron.
- Tap: push Music.

**Accounts lane**: one card per account waiting.
- Avatar 56; t-row "{creator} · {platform}"; t-meta handle; right-aligned t-meta "{age} ago"; chevron.
- Tap: push Account.

### 3.2 CreatorQueue
- Back title "{Name}'s posts". Header strip: Avatar 56 with online dot, t-card "{n} to review".
- One card per post: Thumb 48 r10 (amber `replay` badge 20px top-right when take > 1), title (600, size steps by length: 17 / 15 / 14 / 12 for over 28 / 40 / 56 chars, 3 line clamp), t-meta "{age} ago", chevron 20.
- Tap: push ReviewDetail. Empty: "All caught up with {Name}."

### 3.3 ReviewDetail (post player)
Full-bleed black screen. Three bands: white header 112, video, white footer 112.

Header: back 44x44 at left 4; title 700 20/1.2 (17 when over 44 chars), 2 line clamp, letter-spacing -0.2; "View script" pill at right: 24 high, blue-tint, 600 12 blue-deep, `keyboard_arrow_down` 16.

Video band (between header and footer): frame image cover. Tap toggles play. Press and hold the right half 300ms for 2x (pill "2x" with `fast_forward` at top centre, `rgba(0,0,0,0.45)` bg). Overlay mimics a feed:
- Top gradient 70px black 0.4 to 0. "Following" (500 17, white 72%, red dot `#FE2C55` 7px) and "For You" (700 17 white, 22x3 underline) centred at top 12. `search` 28 at top right.
- Bottom gradient 240px black 0.55 to 0.
- Right rail at right 12 bottom 52, 48 wide: 48px avatar with 2px white ring and a 20px `#FE2C55` plus disc below; then `favorite`, `mode_comment`, `bookmark`, `reply` (mirrored) at 34px with "0" 600 12 below, 18 apart; spinning 40px vinyl disc (conic greys) with 22px avatar, `rotate 4s linear` while playing.
- Caption block left 12, right 76, bottom 52: handle 700 17, caption 400 15 truncated at 70 chars with bold "more".
- Rail and caption fade out while scrubbing.
- 72px white 90% play disc with `play_arrow` 40 when paused.

Scrubber: 32px hit area straddling the footer edge (bottom = footer minus 14). Track 3px `rgba(255,255,255,0.35)`, grows to 6px while scrubbing; white fill for progress; 14px white knob appears while scrubbing; time readout "0:12 / 0:34" 700 15 white above. Pinned note markers: 12px amber dots with 2px white border on the track; tapping one seeks to it. Duration in the prototype is 34s.

"Edit" handle: centred above the footer (bottom = footer + 10), `keyboard_arrow_up` 26 weight 700 and "Edit" 700 13 white with shadow. Pushes Editor as a modal. Hidden while scrubbing or when the notes sheet is open.

Footer buttons (left 16, right 16, bottom 40, two equal columns gap 10, 56 high):
- Left: secondary style. `close` icon and "Changes" when no notes; `edit_note` and "{n} change(s)" when notes exist. Opens the notes sheet and pauses.
- Right: primary. `check` "Approve" when no notes; `arrow_upward` "Send changes" when notes exist.
- Footer label when the Editor saved an edit: "Save changes" (see Editor handoff).

Script sheet: slides up from the video's bottom edge (clipped to the video band), white, r24 top, grabber 40x5 grey-2, scrim 0.35 over the video. Sections: "HOOK" label (600 13 grey-4 uppercase, 0.4 tracking) with text, numbered points as 24px circles (grey-1 and grey-4; the live point while playing is blue with white number and blue-deep 600 text), "CTA". Drag the grabber down 40px or tap scrim to close; drag up 20px on the handle to open.

Notes sheet: 320 high, white, r24 top, shadow `0 -8px 30px rgba(16,24,40,0.12)`, padding 12 16 34.
- Header: 32px grey-1 close disc, t-row "Notes for {creator}", and a pinned/whole toggle (grey-1 track r999 padding 3; items 26 high 600 12; selected white with card shadow): "At 0:12" / "Whole video".
- Textarea: grey-1, r14, 400 15/20, placeholder "Note at 0:12" or "Note"; fills the sheet when there are no notes, 64 high otherwise. 36px send disc bottom-right: amber `push_pin` when pinned, blue `add_comment` when whole; grey-2 when empty. Enter adds a note.
- Notes list: each row a 24px time pill (amber-tint and amber "0:12", or blue-tint and blue-deep "Whole") tapping seeks; body text; 28px `close` grey-3 to delete. Sorted by time, whole-video notes first.
- Footer button: "Save changes" / "Save 1 change" / "Save 3 changes", disabled when nothing to save. Saves any unsent draft and closes.

Approve or Send changes:
- Removes the post from the queue immediately (optimistic), then plays the celebration overlay: 120px blue disc pops in (scale 0.2 to 1.12 to 1 over 500ms), check draws (stroke-dash 350ms at 300ms), disc swaps out at 950ms, a rocket (`rocket_launch` 88, white, rotated -45) flies from bottom-left to top-right over 1100ms starting at 1100ms, while a blue flood circle scales up from the same origin (900ms from 1150ms). Text rises at 2000ms: "Post approved!" / "Changes sent!" 800 30/36, body 16/22 ("We'll let {creator} know and ping you both when it's up." / "{creator} will get your notes and send a new take."), then a white pill button "Return to {creator}'s posts" (pops once) or "Return to review" (pops to root) when the creator has nothing left.
- Keyframes are in `reference/index.html` (`ap-pop`, `ap-draw`, `ap-swap-out`, `ap-fly`, `ap-flood2`, `ap-rise`).

### 3.4 Music (song approval)
- Back title = post title.
- Two cards in a 2 column grid, gap 10, each 118 high, padding 14, column layout space-between: top row has a 40px disc (TikTok: black with white TikTok mark; Instagram: `linear-gradient(45deg,#F9CE34,#EE2A7B,#6228D7)` with white camera mark) and `open_in_new` 18 grey-3 at the far right; bottom has label 600 15/19 ("TikTok" / "Instagram") and sub 500 12/16 grey-4 "Open post". Left is always TikTok, right is always Instagram.
- Tap: opens the creator's post on that platform in the native app (deep link, web fallback).
- Footer: "Request changes" (secondary) + "Approve" (primary).
- Request changes opens a bottom sheet: close disc, t-row "Notes for {creator}", 120px textarea (grey-1, r14, placeholder "Note"), "Save changes" button (disabled when empty). Saving closes the sheet and shows an amber-tint card under the grid with `edit_note` 22 amber, the note text, and a chevron (tap to edit). The footer becomes a single amber "Request changes" button.
- Approve or Request changes removes the song from the queue and pops.

### 3.5 Account (account approval)
- Back title "{creator} · {platform}".
- Row 1: same TikTok / Instagram cards as Music, sub = "@{handle}". Tap opens the creator's profile in the platform app.
- Row 2: two 9:12 video cards, image cover, r16, no padding, gradient `linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.65))`, centred 48px white 92% play disc with `play_arrow` 28, label 600 15 white and duration 500 12 white 80% at bottom-left 12. Left "TikTok scroll" (0:42), right "Instagram scroll" (0:38). These are the creator's screen recordings.
- Tap a video card: popup player over the screen. Scrim `rgba(0,0,0,0.92)` fades in 220ms; a 9:16 r20 frame (max width 320, padding 72 24 48 around) scales from 0.94 to 1 over 260ms. Autoplays. Tap frame to pause (64px play disc shows). Label 700 14 white top-left, 36px `rgba(0,0,0,0.5)` close disc with `close` 20 top-right, 3px progress line with time "0:12" 600 12 at bottom. Tap X or outside to close.
- Footer and notes: identical to Music ("Request changes" + "Approve"; after a saved note, single amber "Request changes"; amber note card under the grid).
- Approve or Request changes removes the account from the queue and pops.

### 3.6 Creator profile (reached from Messages or elsewhere; included for completeness)
- Back title name, right TextButton "Message" (pushes Chat).
- Card: Avatar 64 with online dot, t-card name, t-meta "{handle} · Online now | Last seen 2h ago".
- Stats card: 3 columns, Num earned this month (green), views, posts.
- SectionTitle "Week 4" with right "{posted} of {n} posted". Card of Rows: Thumb 40 r8, title ellipsised, state Chip (22 high, 12px; Posted/Approved green, Waiting/Changes requested amber, Recording blue, Open grey) and "Day {n}", views Num on the right for posted.

---

## 4. State

- `queue`: posts waiting (id, creator, title, format Reel|Slideshow, kind, type, take, age, points, state).
- `music`: songs waiting (id, creator, post title, song, artist, age).
- `accounts`: accounts waiting (id, creator, platform, handle, followers, age).
- Review lane selection (Posts | Music | Accounts), local.
- Per post: notes[] {at: seconds | null, text}, playback time, playing, scrubbing, script sheet open, notes sheet open, pinned toggle.
- Per music or account: saved note string; popup clip key; playback time.
- Approving or sending removes the item from its list optimistically before the server responds; show the celebration (posts) or pop (music, accounts). Reconcile on error by reinserting and toasting.
- Tab badge counts: Review = total waiting; Messages = unread.

## 5. Assets
- Material Symbols Rounded (variable: opsz 20..48, wght 300..700, FILL). Use the Expo vector icon equivalent or bundle the font.
- `reference/frames/f1.png`, `f2.png`, `f3.png`: placeholder video frames. Replace with real thumbnails.
- Avatars from pravatar.cc: placeholders.
- TikTok and Instagram marks: inline SVG paths in `reference/V2Review.jsx.txt`.

## 6. Files
- `reference/index.html`: app entry, tab definitions, celebration keyframes.
- `reference/tokens.css`, `reference/theme/tokens.ts.txt`: tokens.
- `reference/V2Kit.jsx.txt`: shell, tab bar, screen scaffold, kit components.
- `reference/V2Review.jsx.txt`: every Review screen described above.
- `reference/v2-data.js`: sample data shapes.
- `reference/V2Editor.jsx.txt`, `V2Briefs.jsx.txt`, `V2Messages.jsx.txt`, `V2Analytics.jsx.txt`: other tabs, for context only in this pass.
- `reference/MIGRATION.md`: earlier notes on moving from v1 to v2 tokens.

The `.jsx.txt` files are plain JSX; the extension only keeps them out of this project's build. Open `reference/index.html` in a browser to click through the prototype.
