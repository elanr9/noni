# Agent A: Navigation change and the Messages inbox

Reference: reference_ui/AdminMessages.jsx.txt (AdminMessagesScreen, CreatorsList, CreatorsButton), reference_ui/AdminShared.jsx.txt (ADMIN_TABS), reference_ui/AnalyticsScreens.jsx.txt, reference_ui/CreatorsScreens.jsx.txt (TEAM_PEOPLE, SEED_CHANNELS, ChannelScreen).
Touch: app/(admin)/(tabs)/_layout.tsx, app/(admin)/(tabs)/messages.tsx, app/(admin)/(tabs)/creators.tsx (becomes a pushed route: move to app/(admin)/creators.tsx), app/(admin)/(tabs)/analytics.tsx (header button only), components/admin/messages/, lib/messages-api.ts (channels).

## Tab bar
Five tabs: Review (inbox icon, badge = pending review count), Briefs (layout-list), Library (images), Messages (message-circle, badge = unread DMs + unread channels), Analytics (chart-column). Creators is no longer a tab.

## Creators button on Analytics
Directly under the Analytics header, a white pill (height 38, card shadow): three stacked 26px avatars overlapping by 8px with a 2px white ring, then "{n} creators", then a chevron-right in slate-400. Tap pushes the Creators list. Hidden while loading or empty.

## Creators list (pushed)
PushHeader "Creators", meta "{n} approved". Sort chips Earnings / Views / Posts (selected blue-100/blue-700 with trending-up icon). Creator cards exactly as the old Creators tab lane, earned value in green. Empty: users icon, "No creators yet", "Invite from Settings. They upload warm-up proof, you approve, then briefs start landing." Team members and channels are NOT on this screen anymore; they live in Messages.

## Messages inbox
AdminHeader "Messages", subtitle "{unread} unread · {queue} to review" or "All caught up"; trailing 38px white pencil button = new message.
Search pill (fill-quiet, height 40, placeholder "Search people, posts, channels"). Filter chips row: All, Unread, Creators, Team, Channels (selected = blue-500 fill, white text).
Three collapsible sections, each a header row (chevron-down that rotates -90 when collapsed, 700 12px uppercase slate-500 label, optional count in blue-700) followed by one white card of rows separated by 1px lines:
1. "Waiting on you" (count = submissions pending). Rows: 36x48 first-frame thumb, title, "{creator} · {type} · {duration}" with an amber "Take N" pill when attempt > 1, age on the right. Tap opens Review for that submission. Shown under All and Unread only.
2. "Direct messages". Rows: 40px avatar (brand tint for creators, quiet for team; green 11px presence dot with white ring when online), name (team members get their role in 10.5px slate-400 after the name), last message, time on the right (blue-700 when unread), blue unread count pill. Unread rows use 600 ink body text. Tap opens the thread (Agent B).
3. "Channels". Header trailing "+ New" pill (blue-100/blue-700). Rows: 40px rounded square (radius 12, fill-quiet) with "#", "#name", last message, time, unread pill. Tap opens ChannelScreen.
Filters: Creators/Team hide channels; Channels hides DMs and the queue; Unread hides rows with 0 unread. When nothing matches, centered "Nothing here" in slate-400.

## New channel (campaign managers can create channels)
Sheet "New channel", subtitle "Pick who is in it. You can add creators too."
- Name field: "#" prefix, placeholder "channel-name", border turns blue-500 once typed. Slugify on save: lowercase, spaces to hyphens, strip other characters.
- Section "Team": one checkbox reason row per team member (not you), role on the right. Default checked: everyone.
- Section "Creators": single checkbox row "Let all approved creators in" with the approved count on the right. Default off.
- Footer primary button "Create #{slug}" (disabled until a name exists). On save the channel appears at the top of Channels with last message "You created this channel." and time "Now".
messages-api: createChannel({ name, memberIds, allCreators }). Channels with allCreators expose themselves to the creator app.

## States
Loading: header + six 66px skeleton rows. Empty: message-circle icon, "No messages yet", "Threads with creators open the moment a brief is assigned. Posts waiting on your review show up here first."

## Acceptance
- Tab bar shows Messages with a live unread badge; Creators reachable only from Analytics.
- Sections collapse and remember state for the session. Filters behave as listed.
- Creating a channel works end to end and the creator app sees channels flagged allCreators.
