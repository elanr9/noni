# Agent B: Threads (creator, team) and post threads

Reference: reference_ui/AdminMessages.jsx.txt (ThreadScreen, PostThreadScreen, MsgRow, PostCard, Composer, DayDivider, EVENT_TONE, MSG_DATA for shapes).
Touch: app/(admin)/chat/[creatorId].tsx (replace bubble chat), app/(admin)/messages/[chatId].tsx, new app/(admin)/post-thread/[assignmentId].tsx, components/admin/messages/, lib/messages-api.ts.

## Slack-style rows (replaces chat bubbles everywhere in the admin app)
Every message is left-aligned: 34px avatar, then name (700 14px display, "You" for the admin) and time (600 11px slate-400) on one line, body under it (400 14.5px/1.45 ink). Consecutive messages from the same sender collapse the avatar and header (2px top gap instead of 10px). Day dividers: hairline, uppercase 11px label, hairline ("Monday", "Today").

## Post cards inside conversations
Any message may carry a post. Render a 320px max card: 40x54 first-frame thumb, title (700 13.5px), a state pill under it using EVENT_TONE:
- assigned: layout-list icon, fill-quiet / slate-500, label like "Assigned for Wednesday"
- submitted: inbox, blue-100 / blue-700, "Submitted take 2 · 7 clips · 0:52"
- sent_back: rotate-ccw, amber-soft / amber, "Sent back · 2 notes"; the notes render under the card as rows: section label in blue-700 (Point 3, Slide 2, Whole post), note text
- approved: check, green-soft / green, "Approved · posts Wed 5:00 PM"
- live: trending-up, green-soft / green
Tap the card = open the post thread. When the card is a submitted take still waiting, a full-width sm primary button "Review now" (eye icon) sits inside the card and opens the Review screen for that submission.
Media messages: 168x118 rounded block (image) as before.

## Creator thread
Header: PushHeader with name, meta "@handle · {n} posts in review · {n} live this week", trailing 34px avatar that opens the creator profile.
Body: the rows above, from messages-api plus post events for this creator, merged and sorted by time. Post events come from assignment/submission/review tables: assigned, submitted, sent_back (with notes), approved, live.
Composer: 44px plus button, pill input "Message {first name}", 44px blue send. Plus toggles a row of three tiles (blue-50/blue-700): "A post" (picker of this creator's posts in the current week, sends an assigned/post card), "Photo", "Camera".
Team DM: same screen, meta = role, no avatar button, no "A post" tile.

## Post thread (one post, its whole life)
Route by assignment id. Header: PushHeader title = post title, meta "{creator} · {type} · Reel|Slideshow", trailing 34x46 thumb.
If a take is waiting on review: a blue-50 banner under the header, inbox icon, "Take {n} is waiting on you", sm primary "Review" that opens Review.
Body: every event and message about this post, Slack rows. Events render as a pill (same EVENT_TONE) and sent_back events list the notes as blue-left-bordered rows (off-white, 3px blue-300 left border).
Composer placeholder "Reply about this post". Replies post to this thread and also appear in the creator thread as a message that references the post.
When Review sends back or approves, write the event here. Review's Sent back screen has an "Open thread" button that lands here.

## Acceptance
- Old bubble chat is gone from the admin app; creator app chat is untouched.
- Post cards render all five states; Review now opens the correct submission.
- Post thread shows the full history including notes from every take.
