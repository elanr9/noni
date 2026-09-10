# Screen map

Reference file (in reference_ui/) → screen → codebase target. "This round" lists the changes made in the latest design pass; the reference files already include them.

| Reference | Screen | Codebase target | This round |
|---|---|---|---|
| ReviewScreen.jsx.txt | Review tab: Posts / Music / Accounts queues | app/(admin)/(tabs)/index.tsx, components/admin/QueueRow, MusicApprovalRow, AccountRow | Music rows lost their inline Approve button: full text shows untruncated, whole card opens the approval screen, chevron on the right |
| ReviewDetailScreen.jsx.txt | Post review (9:16 player) + revision mode | app/(admin)/review/[id].tsx, components/admin/review/, RequestChangesSheet | Revision mode has NO caption card: captions come from the brief and are placed automatically, only spoken sections get notes |
| ApprovalScreens.jsx.txt (MusicApproval) | Music approval | app/(admin)/music/[id].tsx | Song player card removed. Footer: "Request Changes" / "Accept Song". Request Changes opens a sheet with 3 multi-select reasons + optional note, then a Sent back takeover |
| ApprovalScreens.jsx.txt (AccountApproval) | Account approval | app/(admin)/account-approval/[accountId].tsx | Rebuilt as a review, not a scroll: 2-column grid of 5 even cards (IG scroll, TikTok scroll, Profile screenshots, Feed test, Handles). Tap opens a sheet: Back or Request changes with a note. Footer: "Send back · N" + "Approve and link" |
| BriefsScreen.jsx.txt | Briefs week list + calendar + week detail | app/(admin)/(tabs)/calendar.tsx, app/(admin)/week/[id].tsx | Current week is never incomplete: only Next week + finished weeks. Current week chip is green "Day N of 7". Each card: stat pills for $/day avg, views/day, posts/day per creator, and the creator count right-aligned |
| LibraryScreen.jsx.txt | Library: Posts / References / Ideas | app/(admin)/(tabs)/library.tsx | Idea composer placeholder "Type a post idea"; format chips select with blue-500 fill + white text + small scale transition |
| CreatorsScreens.jsx.txt | Creators, profile, chat, channels | app/(admin)/(tabs)/creators.tsx, app/(admin)/chat/[creatorId].tsx | Chat composer has a plus button opening Photos / Camera / Video attach options; threads render image and video bubbles with duration badges |
| AnalyticsScreens.jsx.txt | Analytics + Settings | app/(admin)/(tabs)/analytics.tsx, settings.tsx, lib/analytics-api.ts | All money data is gated on Stripe: it exists only from the connect date (A_STRIPE.sinceDay). Paid out reads "since Aug 11", calendar $ badges and day sales only from that day, post earnings hidden before it. Views/posts/sign-ups are never gated |
| AuthScreens.jsx.txt | Sign-in / welcome | app/(auth)/, app/(onboarding)/ | New intro screen: soft blue circle wash, big rocket logo, "Welcome to Noni!" (rounded font, blue-600), hero "UGC Made Easy", invite line, Continue with Google button (white, 1.5px border, Google G) |
| WeekSetupScreen.jsx.txt, PostEditorScreen.jsx.txt, PostEditorSteps.jsx.txt, EditorSheets.jsx.txt | Week setup + post editor | app/(admin)/week-setup.tsx, components/admin/editor/ | Unchanged this round; reference for parity |
| AdminShared.jsx.txt | Shared primitives (Card, Sheet, ActionBar, chips, skeletons, PushHeader, Segmented) | components/admin/shared/ | Foundation for every task |

Demo data shapes for all of the above are in reference_ui/admin-data.js.
