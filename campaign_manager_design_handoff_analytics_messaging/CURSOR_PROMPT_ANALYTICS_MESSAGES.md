# Cursor prompt: Analytics tab update and Messages tab rebuild

Paste this into Cursor at the repo root.

---

You are implementing two design updates in this Expo + expo-router + Supabase app. The full spec is `design_handoff_campaign_manager/ANALYTICS_AND_MESSAGES_HANDOFF.md`. Read it end to end first, then `design_handoff_campaign_manager/01_DESIGN_LANGUAGE.md`. The reference UI (browser React, source of truth for layout, spacing and copy) is in `design_handoff_campaign_manager/reference_ui/`: `AnalyticsScreens.jsx.txt`, `AdminMessages.jsx.txt`, `CreatorsScreens.jsx.txt`, `admin-data.js`. Translate to React Native primitives and `theme/tokens.ts`; never copy DOM markup, never add a hex value or a font.

Rules
- Copy text verbatim from the handoff and reference files. No em dashes or en dashes anywhere in UI copy; hyphens inside words are fine.
- Tokens only (`color.*`, `type.*`, `shadow.*`, `radiusAdmin.*`, `motion.*`). Hit targets 44px minimum.
- Reuse `components/admin/shared` (AdminScreen, AdminHeader, PushHeader, Card, Avatar, Thumb, SectionLabel, SkeletonCard) and `components/ui` (Button, Icon, EmptyState, PressableScale).
- Do not touch creator app screens under `app/(creator)/` or `components/creator/` except where the handoff names them.
- Keep every file under 600 lines; split screens into `components/admin/messages/*`.

Work in this order, one PR per step, and run `npx tsc --noEmit` and `npx eslint .` before each PR.

Step 1: Analytics (Part 1 of the handoff)
1. Remove the `users` header button from `app/(admin)/(tabs)/analytics.tsx`. Add `components/admin/insights/CreatorsPill.tsx` (avatar stack of three, `{n} creators`, chevron) rendered directly under `AdminHeader`, hidden while loading or empty. Tap pushes `/(admin)/creators`.
2. Move `app/(admin)/(tabs)/creators.tsx` to `app/(admin)/creators.tsx`, register it in `app/(admin)/_layout.tsx` as a pushed screen, remove its `Tabs.Screen` from `(tabs)/_layout.tsx`. Screen body unchanged.
3. Chart axis label font size 11 to 10. Leave everything else alone; it already matches the reference.

Step 2: Data layer (2.7, 2.9)
1. Write the migration in 2.7 (channels on `manager_chats`, `manager_chat_members`, `message_reads`, `review_events.notes jsonb`), with RLS as described. Regenerate `lib/types.ts`.
2. Extend `lib/messages-api.ts` and `lib/manager-messages-api.ts` per 2.7. Add `lib/inbox-api.ts` and `lib/post-events.ts` per 2.7 and 2.9. Unit test `listPostEvents` label formatting and the merge order with fixtures.
3. Switch the tab badge in `(tabs)/_layout.tsx` to `unreadInboxCount()`.

Step 3: Shared message components (2.4, 2.5)
`components/admin/messages/MsgRow.tsx`, `DayDivider.tsx`, `PostCard.tsx` (with `EVENT_TONE`), `Composer.tsx` (rewrite the existing one to the 44px plus / pill / 44px send layout with the attach tile row), `PostPickerSheet.tsx`.

Step 4: Screens (2.3, 2.6)
1. Rewrite `app/(admin)/(tabs)/messages.tsx` as the inbox: header, search, chips, three collapsible sections, new channel sheet, loading and empty states.
2. Rewrite the thread rendering in `app/(admin)/chat/[creatorId].tsx` (creator thread with merged post events) and `app/(admin)/messages/[chatId].tsx` (team DM, channel, brief chat) on `MsgRow`. Delete `components/admin/chat/MessageBubble.tsx`, `components/admin/chat/PostRefBlock.tsx`, `components/admin/messages/ChatBubble.tsx` once nothing imports them.
3. Add `app/(admin)/post-thread/[assignmentId].tsx`. Add the "Open thread" button to Review's sent back and approved confirmations.
4. Presence (2.8): subscribe in the inbox; add tracking in the creator app root layout only (`app/(creator)/_layout.tsx`), nothing else in the creator app.

Step 5: QA
Run every line of 2.11 and 1.3 on an iPhone 15 simulator with two accounts (one manager, one creator). Attach screenshots of: inbox with all three sections, inbox with Unread filter, creator thread with a sent_back card and a waiting submitted card, post thread with two takes, channel creation sheet, Analytics with the creators pill.

Where the handoff and the current code disagree, the handoff wins. Where the handoff is silent, match the closest existing pattern in `components/admin/shared` and say so in the PR description. Section 2.10 lists three defaults; implement the defaults and call them out in the PR.
