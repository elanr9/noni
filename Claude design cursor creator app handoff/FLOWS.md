# Flows — the behavior contract

The whole app hangs off one task status machine. Queue state lives in the shell; every tab derives from it live.

```
assigned ──record──▶ processing ──▶ review ──send──▶ submitted ──manager──▶ approved ──▶ posted
   ▲                                                      │
   └────────────── record changes ◀── changes_requested ◀─┘
```

## F1. First sign in
1. Creator signs in → **invite modal** over the app: "You've been invited to join FieldVision AI's team" → **Accept invite**.
2. Home tab = **Get set up** with exactly three steps (Connect your bank → Connect accounts → Warm them up), progress `0 of 3`, CTA on the first open step.
3. Posts/Analytics show empty states; Profile shows $0.00 earnings and unconnected accounts until setup completes.

## F2. Daily recording (reel)
1. Home shows today: week strip (status dots), time pager, one post card. Tap **Record**.
2. Record screen (slides up): clips = script blocks. Hook/CTA clips run the **teleprompter** (clear overlay, "(This won't show on the video)"); middle clips show a **talking point** instead ("Say it your way"). The brief's screen recording sits picture-in-picture and the per-clip on-screen line is already on the frame.
3. 3-2-1 countdown (800ms/step) → record → **Stop saves this clip** → "Clip n saved" panel → **Redo clip** or **Next clip** → after the last, **Process post** (or **Finish with n** early).
4. Processing (~2s spinner) → **Review**: playable 9:16 preview + autofilled brief details (title, chips, caption) → **Send for approval**.
5. Back on Home: toast `Sent for approval. It posts once approved.`, that slot's dot turns amber, subtitle recounts, and the card auto-advances to the next open post.

## F3. Daily creating (slideshow)
Same as F2 but the record screen is the **photo upload list**: one tile per slide, slide text pre-filled. All tiles filled → **Process slideshow** → review (scroll through slides with arrows/dots) → **Send for approval**.

## F4. Swap a post
Home → **Swap** on an assigned slot → sheet lists the rest of the brief's post library as full rows → tap a row → **preview modal** (play the example / scroll the slides, read why it works) → **Use this post** (replaces the slot in place, toast `Swapped in "…"`) or **Back**.

## F5. Changes requested (the not-approved loop)
1. Manager requests changes → task status `changes_requested`: Home dot goes amber, subtitle says `1 to fix…`, the card shows the **Changes requested** chip (no note text) + **Fix it** + **See feedback**.
2. **See feedback** → Messages thread: the feedback arrives as a post-reference bubble + note + voice note; a **Record changes** bar is pinned above the composer.
3. Posts tab shows an amber **Changes requested banner**; tapping it opens the per-post **Changes detail**: post card + only that post's revision thread + pinned **Record changes**.
4. **Record changes** (from either place) or **Fix it** (Home) → the normal record/upload flow → review → **Send for approval** → status back to `submitted` everywhere at once.

## F6. Messages
Home top-right message icon (always visible) or Profile › Messages → one thread with the campaign manager: day dividers, post references, voice notes, quoted replies, working composer. Approvals and feedback both land here.

## F7. Browsing results
- **Posts › calendar**: pick a day → that day's PostRows.
- **Posts › briefs**: one card per week with totals → week detail (Views/Likes/Earned, posts best-first).
- **Posts › list**: sortable (Newest/Virality/Likes/Views).
- Any PostRow → **Post detail**: watch/scroll the post, switch TikTok ⇄ Instagram (every post is on both), see Views/Likes/Saves/Earned + tier progress, open on either platform.

## F8. Profile / roles
Role switcher at the top swaps between `FieldVision AI Creator` and `FieldVision AI Campaign Manager` for the same account. Avatar tap = upload photo. Earnings card → payouts. Everything scrolls; nothing clips.
