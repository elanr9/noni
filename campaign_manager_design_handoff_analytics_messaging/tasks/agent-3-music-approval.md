# Agent 3: Music check (round 2 redesign)

Reference: reference_ui/ApprovalScreens.jsx.txt (MusicApproval). Touch: app/(admin)/music/[id].tsx, components/admin/music/, lib/admin-api.ts (music approval), notify function (song link to creator).

## How music works (build the whole loop)
1. A slideshow is approved and posted by Noni. Videos never enter this flow.
2. The creator gets a notification "Add the song". Opening it in the creator app lands on that post with the song we want: the TikTok sound link and the Instagram audio link, each with a Copy button, plus "Mark as added". (Creator side is owned by the creator app agent; the links come from the brief's song fields: song_title, tiktok_sound_url, instagram_audio_url.)
3. When the creator marks it added, the post lands in Review > Music for the campaign manager.
4. The campaign manager checks and taps Approve. Approve unlocks the creator's earnings for that post. Fix song sends it back to the creator with the links again.

## Screen
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

## Fix song sheet
Title "Fix the song", subtitle "{first name} gets this and re-adds it on the live post". Three multi-select checkbox reason rows: "Song is missing on TikTok", "Song is missing on Instagram", "Wrong song". Textarea placeholder "Anything else, in your words" (2 rows). Footer: Cancel (ghost, 28%) + Send (primary, send icon, disabled until a reason or text). Send writes a music review event with the reasons and note, re-sends the song notification with both links, and moves the post out of the queue until the creator marks it added again.

## Confirmations
Sent: blue disc, "Sent to {first name}", "They get the song link again and fix it on the live post. It lands back here when they mark it added.", Back to Review.
Approved: green disc, "Song approved", "{first name} starts earning on this post now.", Back to Review. Approving unlocks earnings for the post (existing wallet gating).

## Acceptance
- All four rows deep-link correctly; a missing URL hides its row rather than opening nothing.
- Approve unlocks earnings; Fix song re-notifies with links and returns the post to the queue on the next mark.
- No em or en dashes; copy verbatim.
