# Analytics tab and Messages tab: build handoff

Written against the real codebase at `noni/` (Expo, expo-router, Supabase). It says what is already correct, what changes, and exactly how the new Messages tab should look, behave and be stored. Reference implementations (browser React, read as JSX):

- `reference_ui/AnalyticsScreens.jsx.txt` (AnalyticsScreen, MMenu, MAreaChart, MMonthCal, MDayDetail, MPostDetail)
- `reference_ui/AdminMessages.jsx.txt` (AdminMessagesScreen, ThreadScreen, PostThreadScreen, PostCard, MsgRow, Composer, DayDivider, EVENT_TONE, CreatorsList, CreatorsButton, MSG_DATA)
- `reference_ui/CreatorsScreens.jsx.txt` (ChannelScreen, TEAM_PEOPLE, SEED_CHANNELS)
- `reference_ui/admin-data.js` (demo shapes)
- `01_DESIGN_LANGUAGE.md`, `tokens/` (tokens only, no new hex values)

Live boards to look at: `ui_kits/admin-app/messages-review.html` and `ui_kits/admin-app/index.html` (Analytics tab).

---

## Part 1: Analytics tab

### 1.1 What is already right in `app/(admin)/(tabs)/analytics.tsx`
Verified line by line against the reference. Keep as is:
- Header: title, Graph | Calendar segmented pill (fill-quiet track, white active item with card shadow), 38px settings button.
- Top stats card (Views, Posts, Sign-ups, Paid out) with permission gating (`managerAccess.viewSignups`, `viewFinancials`).
- Filters / Sort by / range MenuPill trio, anchored panel, check on the active item.
- Views over time area chart, Top creators rank rows, Top posts rows, Posts by format bars.
- Calendar month grid, $ badge, dot for posts, footnote copy, day detail, post detail with TikTok and Instagram columns.
- Stripe money gate (`buildMoneyGate`, `moneyOn`): every dollar surface obeys the connect date. This was Agent 7 and it is done.
- Loading skeletons (96, 44, 280) and the empty state copy.

### 1.2 What changes

**A. Creators button moves out of the header and becomes a pill under it.**
Today: a 38px `users` icon button sits between the mode toggle and the gear. Remove it.
New: directly under `AdminHeader`, left aligned, a white pill (height 38, radius 999, `shadow.shadowCard`, padding `0 12 0 6`):
- avatar stack: first three approved creators as 26px avatars, each after the first overlapping by 8px (`marginLeft: -8`), each with a 2px white ring (`boxShadow 0 0 0 2px white` in DOM; in RN wrap each avatar in a 30px white circle)
- label `{n} creators` (700 13px, ink)
- `chevron-right` 14px slate-400
Hidden while loading or when the screen is empty. Tap pushes the Creators list.
Reference: `CreatorsButton` in AdminMessages.jsx.txt. Data: `listCreators(companyId)` or the leaderboard call, count = approved creators only.

**B. Creators becomes a pushed route, not a hidden tab.**
Move `app/(admin)/(tabs)/creators.tsx` to `app/(admin)/creators.tsx` and remove its `Tabs.Screen` entry from `(tabs)/_layout.tsx`. The screen body is already right (PushHeader "Creators", meta `{n} approved`, sort chips Earnings / Views / Posts, creator cards, earned value in green, empty state "No creators yet" / "Invite from Settings. They upload warm-up proof, you approve, then briefs start landing."). Only the route changes. Update the two push targets: the new pill (`router.push('/(admin)/creators')`) and Top creators rank rows keep pushing `/(admin)/creator/[id]`.

**C. Small copy and type checks (do while you are in the file).**
- Chart axis labels: reference is 600 10px; code uses 11. Set 10 (SvgText `fontSize={10}`).
- Post detail "Open post" button: reference always renders it. Keep the code's rule (only when `postUrl` exists); a button that opens nothing is worse.
- Calendar cell min height: reference 38, code 44 for hit target. Keep 44.

### 1.3 Acceptance
- No users icon in the Analytics header; the creators pill sits under the header, hides on loading and empty.
- Pill tap lands on the Creators list with a back chevron; the tab bar keeps Analytics highlighted.
- Every money surface still flips with `stripeConnectedAt` (re-run the Agent 7 acceptance).

---

## Part 2: Messages tab

### 2.1 What it is
One Slack-style inbox for the campaign manager. Three collapsible sections: **Waiting on you** (posts pending review), **Direct messages** (creators and team members), **Channels**. Every conversation uses left-aligned rows (avatar, name, time, body). Posts travel through conversations as cards with a state pill, and every post has its own thread that shows its whole history (assigned, submitted, sent back with notes, approved, live). Creators are no longer a tab; team members and channels are no longer on the Creators screen.

### 2.2 What exists today
- `app/(admin)/(tabs)/messages.tsx`: three flat lists (Creators, Brief chats, Managers) using `InboxRowCard`. Replace the whole screen.
- Creator threads: `messages` table (company_id, creator_id, author_id, body, brief_id, assignment_id; media rides in `body` as `[[media]]{json}`), read by `lib/messages-api.ts`, rendered by `components/admin/chat/AdminChatThread.tsx` + `MessageBubble` + `PostRefBlock` (bubbles). Replace the rendering, keep the table and API.
- Team chats: `manager_chats` (kind `brief` | `dm`) + `manager_messages` (reply_to, forward_label, assignment_id, brief_id, media, voice, reactions) + `manager_chat_reads`, in `lib/manager-messages-api.ts`, rendered by `app/(admin)/messages/[chatId].tsx` with `ChatBubble`. Keep the tables, extend for channels, replace the rendering.
- Post history: `submissions` (attempt number, status), `review_events` (approved | changes_requested | comment, note), `assignments` (assigned, live_at via `getAssignmentLiveAt`). Read by `lib/review-events.ts` and `lib/admin-api.ts`.
- Tab bar (`(tabs)/_layout.tsx`): Messages already in the bar with an unread badge from `unreadManagerMessageCount()`; Creators already `href: null`. The badge must grow to include creator-thread unread and channel unread once those exist (2.7).

### 2.3 Inbox screen (`app/(admin)/(tabs)/messages.tsx`)
Reference: `AdminMessagesScreen`.

**Header.** `AdminHeader` title "Messages", subtitle `{unread} unread · {queue} to review`, or "All caught up" when both are zero (subtitle hidden while loading). Trailing: 38px white circle with card shadow, `pencil` 18px ink = new message (opens a picker of creators and team members; picking one opens that thread).

**Search.** Pill, height 40, fill-quiet, `search` 15px slate-400, placeholder "Search people, posts, channels" (500 14px). Filters DMs by person name and channels by name, case-insensitive. Queue rows are not searched.

**Filter chips.** One row, horizontal scroll: All, Unread, Creators, Team, Channels. Height 32, padding 0 12, radius 999. Selected: blue-500 fill, white text. Unselected: fill-quiet, slate-500. 700 12.5px.
- All: every section.
- Unread: only rows with unread > 0; queue section still shows.
- Creators: DMs with creators only; no queue, no channels.
- Team: DMs with team members only; no queue, no channels.
- Channels: channels only.
When a filter leaves nothing: centered "Nothing here" (500 14px slate-400, 40px vertical margin).

**Section header.** Full-width pressable row, padding `14 2 6`: `chevron-down` 14px slate-400 (rotates -90° when collapsed, `motion.fast`), label 700 12px uppercase `tracking-label` slate-500, optional count 700 12px blue-700, optional trailing control. Collapsed state persists for the session (module-level or context state, not AsyncStorage).

**Section body.** One white `Card pad={0}` (overflow hidden), rows separated by 1px `line`, no border after the last. Every row: `padding 10 12`, gap 11, min height 44:
- lead (thumb, avatar or # tile)
- title 700 14.5px display, letter-spacing -0.2, ink, one line ellipsis
- time on the right, 600 11.5px, slate-400 (blue-700 when the row has unread)
- second line 13px, one line ellipsis: 500 slate-400, or 600 ink when unread
- trailing unread pill when unread > 0: min width 20, height 20, padding 0 6, radius 999, blue-500, white 700 11px

**1. Waiting on you.** Count = `listAssignmentQueue().length`. Shown under All and Unread only. Row: `Thumb` 36×48 radius 8 (first frame or cover), title = brief title, second line `{creator short name} · {post type label} · {duration}` with the creator name in 600 ink; when `attempt > 1` append an amber pill "Take {n}" (amber-soft bg, amber text, 700 10px, padding 1 6). Time = age (`14m ago`, `2h ago`, `Yesterday`). Tap opens Review for that submission (`/(admin)/review/[id]`).

**2. Direct messages.** Merge two sources into one list sorted by last message time, newest first; people with no messages yet go after, alphabetical:
- creators: `listCreatorInbox(companyId)` (add `unread` and `online`, see 2.7 and 2.8)
- team members: manager DMs from `listManagerInbox` (kind `dm`) plus every campaign manager and the company admin who has no DM yet
Row: 40px `Avatar` (brand tint for creators, quiet for team). Online creators get an 11px green dot bottom-right with a 2px white ring. Title = name; team members get their role after the name in 700 10.5px slate-400 ("Admin", "Campaign manager"). Second line = last message preview (`You: …` when mine, `Photo` / `Video` for media). Tap opens the creator thread (`/(admin)/chat/[creatorId]`) or the team DM (`/(admin)/messages/[chatId]`).

**3. Channels.** Header trailing control: pill "+ New" (blue-100 bg, blue-700, 700 11.5px, `plus` 12px strokeWidth 2.5, padding 4 8). Rows: lead = 40px rounded square (radius 12, fill-quiet) with "#" in 700 18px display slate-500; title `#{name}`; second line = last message preview with the author's first name prefix ("Elan: Budget tops up Friday…"); time; unread pill. Tap opens the channel screen.
Existing `brief` kind chats belong here too, rendered as `#week-{n}-brief`, so nothing that exists today disappears. (Flagged for Chris in 2.10.)

**States.** Loading: header, then six 66px skeleton rows with 8px gap (no search, no chips). Empty (no creators, no chats, no queue): `EmptyState` `message-circle`, "No messages yet", "Threads with creators open the moment a brief is assigned. Posts waiting on your review show up here first.", margin-top 40.

**New channel sheet.** Title "New channel", subtitle "Pick who is in it. You can add creators too.", maxHeight 78%.
- Name field: 1.5px border (`border-strong`, turns blue-500 once there is text), radius md, padding 13 14; "#" prefix 700 16px display slate-400; input placeholder "channel-name" (600 15px); autofocus. Slugify on save: lowercase, spaces to hyphens, strip anything but `a-z0-9-`.
- Section label "Team": one checkbox row per team member except you (min height 48, radius 10; fill-quiet / ink unselected, blue-100 / blue-700 selected; 18px square check box radius 5, blue-500 with white check when on, else white with 1.5px border-strong). Role on the right (600 12px). Default: all checked.
- Section label "Creators": one row "Let all approved creators in" with the approved count on the right. Default off.
- Footer: primary lg block button `Create #{slug}` (placeholder `#channel` before typing), disabled until a name exists.
- On save: `createChannel({ name, memberIds, allCreators })`, close, insert the channel at the top of Channels with last message "You created this channel." and time "Now", then open it.

### 2.4 Message rows (shared component, `components/admin/messages/MsgRow.tsx`)
Reference: `MsgRow`, `DayDivider`. Replaces `MessageBubble` and `ChatBubble` everywhere in the admin app. The creator app is untouched.
- Row: 34px avatar column (quiet tone for you and team, brand for creators), gap 10, top padding 10.
- Header line: name 700 14px display, letter-spacing -0.2, ink ("You" for the signed-in manager), time 600 11px slate-400, baseline aligned, gap 7.
- Body: 400 14.5px / 1.45 ink, margin-top 2.
- Consecutive messages from the same author (no day divider between) collapse: no avatar, no header, top padding 2.
- Day divider: hairline, uppercase 700 11px letter-spacing 0.5 slate-400 label ("Monday", "Yesterday", "Today"), hairline; padding `14 0 2`.
- Media message: 168×118 radius 12 block (`blue-50` to `blue-100` tint) with `images` 22px blue-300 until the signed URL loads, then the image cover; video shows a play glyph and the `len` label.
- Long-press a row: reply, react, copy (existing manager_messages features stay; creator `messages` get copy only).

### 2.5 Post cards inside conversations (`components/admin/messages/PostCard.tsx`)
Reference: `PostCard`, `EVENT_TONE`. Any message may carry a post (assignment_id on the row) and a post event.
- Card: margin-top 6, max width 320, white, 1px `border`, radius md, card shadow, overflow hidden.
- Pressable top: padding 10, `Thumb` 40×54 radius 8, title 700 13.5px / 1.3 display one line, state pill under it, `chevron-right` 16px slate-300.
- State pill: inline, gap 5, padding `3 8 3 6`, radius 999, 700 11px, icon 11px strokeWidth 2.5, one line ellipsis:

| event | icon | bg | fg | label pattern |
|---|---|---|---|---|
| assigned | layout-list | fill-quiet | slate-500 | `Assigned for {weekday}` |
| submitted | inbox | blue-100 | blue-700 | `Submitted take {n} · {clips} clips · {m:ss}` or `· {n} slides` |
| sent_back | rotate-ccw | amber-soft | amber | `Sent back · {n} notes` |
| approved | check | green-soft | green | `Approved · posts {Wed 5:00 PM}` |
| live | trending-up | green-soft | green | `Live · {views} views` |

- sent_back notes render under the pressable inside the card: rows with `off-white` bg, radius 8, padding 7 9; section label 700 11px blue-700 min width 46 ("Hook", "Point 3", "Slide 2", "Whole post"), then note 500 12.5px / 1.4 ink.
- When the card is a submitted take that is still waiting: a full-width `Button size="sm" variant="primary" icon="eye"` "Review now" inside the card (padding 0 10 10) opens Review for that submission.
- Tap anywhere else on the card opens the post thread.

### 2.6 Screens

**Creator thread** (`app/(admin)/chat/[creatorId].tsx`, replace `AdminChatThread` rendering). Reference: `ThreadScreen`.
- White background. `PushHeader` title = creator name, meta `@{handle} · {n} posts in review · {n} live this week`, trailing 34px avatar button that opens `/(admin)/creator/[id]`. 1px `line` under the header.
- Body: scrolling list, padding `4 GUT 16`, of merged and time-sorted items: `messages` rows for this creator plus post events for this creator (2.9). Day dividers between calendar days. Messages that carry `assignment_id` render body then `PostCard`.
- `?assignment=` param still scrolls to that post and preloads the reference, as today.
- Composer (reference `Composer`): 1px `line` top, white, padding `10 GUT 26`; 44px `plus` button (fill-quiet), pill input "Message {first name}" (fill-quiet, 400 15px), 44px blue-500 send button with `shadow-accent`. Plus toggles a tile row above the composer (padding `10 GUT 0`, 1px line top): three tiles (flex 1, radius md, blue-50 bg, blue-700 700 12px, icon 18px blue-600): "A post" `layout-list`, "Photo" `images`, "Camera" `camera`. "A post" opens a picker of this creator's assignments in the current and next week; picking one sends a message with `assignment_id` set (renders as an assigned card).

**Team DM** (`app/(admin)/messages/[chatId].tsx` for `kind = dm`). Same screen as above with `MsgRow` rows from `manager_messages`. Meta = the person's role. No avatar button, no "A post" tile (Photo and Camera stay). Replies, forwards, reactions and voice notes keep working with the new row layout: a reply quote is a 2px blue-300 left-bordered block above the body; reactions render as small pills under the body.

**Channel** (`app/(admin)/messages/[chatId].tsx` for `kind = channel` and `kind = brief`). Reference: `ChannelScreen` for structure, but use `MsgRow` rows (the reference channel still shows bubbles; the Slack rows win, as the task file for Agent B states "replaces chat bubbles everywhere in the admin app").
- `PushHeader` title `#{name}`, meta `{n} members` ("1 member" singular). Brief chats: title `#week-{n}-brief`, meta same.
- Composer placeholder `Message #{name}`. Photo and Camera tiles only.
- Header tap opens a members sheet (list of members with role; managers can add team members and toggle "Let all approved creators in"; anyone can leave except the creator of the channel).

**Post thread** (new `app/(admin)/post-thread/[assignmentId].tsx`). Reference: `PostThreadScreen`.
- `PushHeader` title = post title, meta `{creator} · {post type label} · Reel|Slideshow`, trailing `Thumb` 34×46 radius 8. 1px line under.
- If a submitted take is waiting on review: banner under the header, margin `10 GUT 0`, padding 10 12, radius md, blue-50; `inbox` 16px blue-600; "Take {n} is waiting on you" 600 13px ink; `Button size="sm" variant="primary"` "Review".
- Body: every event and message about this post (2.9), `MsgRow` layout, newest at the bottom. Events render as the state pill (padding `4 9 4 7`, 700 12px, icon 12px). sent_back notes render under the pill as rows: off-white, radius 10, padding 8 10, 3px blue-300 left border, label 700 11px blue-700 min width 46, note 500 13px / 1.4 ink.
- Composer placeholder "Reply about this post". A reply inserts into `messages` with `creator_id` and `assignment_id` set, so it appears both here and in the creator thread (as a message with a post card).
- Review's "Sent back" and "Approved" confirmations get an "Open thread" secondary button that lands here.

**Creators list** (`app/(admin)/creators.tsx`): see Part 1.2 B.

### 2.7 Data: what to add

**Migration `0xx_channels_and_creator_thread_reads.sql`**
```sql
-- Channels reuse manager_chats.
alter table public.manager_chats
  drop constraint manager_chats_brief_shape;
alter table public.manager_chats
  add column if not exists name text,
  add column if not exists all_creators boolean not null default false,
  add column if not exists created_by uuid references public.profiles;
alter table public.manager_chats
  add constraint manager_chats_kind_check check (kind in ('brief','dm','channel'));
alter table public.manager_chats add constraint manager_chats_shape check (
  (kind = 'brief'   and campaign_id is not null and user_a is null and user_b is null)
  or (kind = 'dm'   and campaign_id is null and user_a is not null and user_b is not null and user_a < user_b)
  or (kind = 'channel' and campaign_id is null and user_a is null and user_b is null and name is not null)
);
create unique index manager_chats_channel_name on public.manager_chats (company_id, name) where kind = 'channel';

create table public.manager_chat_members (
  chat_id    uuid not null references public.manager_chats on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (chat_id, profile_id)
);

-- Read markers for creator threads (the messages table has none today).
create table public.message_reads (
  company_id   uuid not null references public.companies on delete cascade,
  creator_id   uuid not null references public.profiles on delete cascade,
  profile_id   uuid not null references public.profiles on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (creator_id, profile_id)
);
```
RLS: channels are readable and writable by campaign managers of the company who are in `manager_chat_members`, by the company admin, and by creators of the company when `all_creators = true`. `brief` and `dm` policies stay as they are. `message_reads`: a profile reads and upserts only its own rows. `manager_chat_reads` already covers channel unread.

**`lib/messages-api.ts`**
- `listCreatorInbox` returns `unread` (messages after `message_reads.last_read_at` not authored by me) and keeps `lastMessageAt`.
- `markCreatorThreadRead(creatorId)` upserts `message_reads`; call on thread open and on every new incoming message while open.
- `listPostThread(assignmentId)`: `messages` where `assignment_id = ?`, oldest first.
- `sendMessage` accepts `assignmentId`.

**`lib/manager-messages-api.ts`**
- `createChannel({ name, memberIds, allCreators }) => chatId` (insert `manager_chats` kind `channel` + `manager_chat_members` rows including the creator of the channel).
- `listManagerInbox` returns channels (`kind = 'channel'`, with `name`, `memberCount`, `allCreators`) alongside brief chats and DMs; the inbox preview for channels and brief chats prefixes the author first name.
- `listChannelMembers(chatId)`, `addChannelMembers`, `setChannelAllCreators`, `leaveChannel`.
- `unreadManagerMessageCount` counts channels too.

**New `lib/inbox-api.ts`** (keeps the screen thin)
- `loadInbox(companyId, meId)` returns `{ queue, dms, channels, unreadTotal }` by fanning out to `listAssignmentQueue`, `listCreatorInbox`, `listManagerInbox`, team roster (`listCampaignManagers` + company admin) and presence.
- `unreadInboxCount()` = creator unread + manager unread; `(tabs)/_layout.tsx` uses this for the badge instead of `unreadManagerMessageCount`.

**Creator app.** Channels with `all_creators = true` appear in the creator app's Messages list as `#name` rows and open the same channel thread (creator app keeps its bubble styling). Out of scope for this handoff beyond the RLS and API; note it in the PR.

### 2.8 Presence
Green dot = creator online. Use Supabase Realtime Presence on a per-company channel `presence:{companyId}`; the creator app tracks `{ profileId, at }` while foregrounded; the admin inbox subscribes and treats a creator as online when tracked. No dot for team members (the reference does not show one). If Realtime is unavailable, hide the dot; never fake it.

### 2.9 Post events (derived, not stored)
A post's history is assembled at read time from existing tables, per assignment, and mapped to the five card states:

| event | source | time | label |
|---|---|---|---|
| assigned | `assignments.created_at` (or `assigned_at` if present), brief drop day | created | `Assigned for {weekday}` (`Assigned to {creator} for {weekday}` in the post thread) |
| submitted | each `submissions` row, `attempt`, clip count and duration from the render / segment tables | submitted_at | `Submitted take {n} · {clips} clips · {m:ss}` |
| sent_back | `review_events` where `action = changes_requested`, grouped per submission; notes = the event's structured notes (section label + text). Today `note` is one string: split on the `Section: text` lines Review already writes, and make Review write structured notes going forward (`review_events.notes jsonb` in the same migration, nullable) | created | `Sent back · {n} notes` |
| approved | `review_events` where `action = approved`; schedule from the assignment's scheduled publish time | created | `Approved · posts {Wed 5:00 PM}` |
| live | `getAssignmentLiveAt` | live_at | `Live · {views} views` (views from the latest `post_metrics` snapshot when present, else just "Live") |
| comment | `review_events` where `action = comment` | created | renders as a plain message from its author |

`lib/post-events.ts`: `listPostEvents(assignmentId)` and `listCreatorPostEvents(companyId, creatorId, since)`; each returns `{ id, kind, at, authorId, label, notes?, submissionId?, waiting: boolean }`. `waiting` is true for the latest submitted event when that submission's status is pending review; it drives "Review now" and the post-thread banner.

Merged creator thread = `messages` rows + `listCreatorPostEvents` sorted by `at`. Assigned events for the current and next week only, so old threads are not flooded; everything else always shows.

### 2.10 Open questions for Chris (defaults chosen, change if you disagree)
1. Brief chats render as `#week-{n}-brief` channels. Alternative: drop brief chats entirely once channels exist.
2. Notes structure: adding `review_events.notes jsonb` now versus parsing the existing `note` string forever. Default: add the column, backfill by parsing.
3. Presence needs the creator app to track. If that lands later, ship the inbox without dots.

### 2.11 Acceptance
- Tab bar: Messages badge = creator unread + team unread + channel unread; Creators has no tab and no hidden tab entry.
- Inbox: three collapsible sections, chips filter as specified, search filters people and channels, collapse state survives leaving and returning to the tab within a session.
- Waiting on you count equals the Review tab's submission count; tapping a row opens the same Review screen.
- Bubble components (`MessageBubble`, `ChatBubble`, `PostRefBlock`) have no remaining admin imports; creator app files are untouched.
- Post cards render all five states with the right icon, colors and label; sent_back shows its notes; "Review now" opens the right submission.
- Post thread shows the full history for a post with two takes, including notes from take 1; replying there also shows the reply in the creator thread with the post card attached.
- Creating a channel with two team members and "all creators" on: it appears at the top of Channels, opens, accepts a message, and a creator account can read it.
- Opening a creator thread clears its unread; the badge updates without restarting the app.
- Loading and empty states match the copy above verbatim.
