# Handoff: Noni creator app redesign

## Overview
A full visual redesign of the Noni creator app: onboarding and auth, the setup gate, the four main tabs (Home, Posts, Analytics, Profile), post detail for both Reel and Slideshow, the clip-by-clip recorder, the changes-requested state, and balance / payouts. Creator role only. Platform target is iOS first, 390x844, Expo / React Native.

## About the design files
The files in this bundle are **design references written in HTML**. They are prototypes showing intended look, layout and behaviour. They are not production code and should not be copied into the app. The task is to **recreate these screens in the existing Expo / React Native codebase** using its established navigation, state and styling patterns.

`Noni Creator App.dc.html` is a single board holding every screen as a 390x844 phone frame. Each frame carries a visible id badge (1a, 1b, 2a...). Use those ids when referring to screens in commits and PRs.

## Fidelity
**High fidelity.** Colors, type, spacing, radii and shadows are final and come from the Noni design system tokens included in `tokens/`. Content is sample copy in the product's real voice. Match spacing and type exactly; substitute real media for the neutral placeholder frames.

## Design tokens
Authoritative values live in `tokens/*.css` (copied from the design system). Port them to a single RN theme file. Highlights:

- **Ground**: white `#FFFFFF`; off-white `#F7FAFD` for grouped sections; dark `#0B0F14` only for the recorder.
- **Accent**: action blue `#1BA6EE`; brand tint `#A7D3F7` / `#8EC9F5`; soft surface `#E7F4FD`; hairline `#E6EEF6`.
- **Text**: `#0F1720` primary, `#6B7A8C` secondary, `#8E9AA6` tertiary.
- **Status**: amber `#E08A16` on `#FDF2DF` (in review, changes needed); green `#1F8F5F` on `#E4F5EC` (approved); solid green for posted; blue `#0B76AD` on `#E7F4FD` (to do). Red `#D93A3A` is errors only, never a task status.
- **Type**: 44 hero (-1.2px), 34 screen title (-0.5px), 26 detail title, 20 card title, 17 action, 16 body / 1.5, 15 secondary, 14 meta, 13 chip, 12 uppercase label (+0.7px). Weights 600 / 700 / 800 only. Nothing creator-facing below 14px. Web substitutes Figtree; on device use SF Pro / SF Pro Rounded.
- **Shape**: 12 fields, 16-18 cards, 20-24 sheets, 999 on every button and chip. Cards are white, 1px hairline, soft shadow, never a colored left edge.
- **Spacing**: 24 screen gutter, 18 card padding, 12 between cards, 28 between sections. Primary CTA is a 60px full-width pill pinned at the bottom. Tab bar floats 16px off the screen edges with an 18px backdrop blur.
- **Motion**: 240ms ease-out for screens, sheets and progress; 160ms color / opacity; 90ms press scaling to 0.97. No bounce, no parallax.

## Copy rules
No em dashes or en dashes in UI strings. No emoji. Sentence case. Buttons name the action (Record, Add pictures, Cash out, View post). Empty states name the next action.

## Screens

### Onboarding and auth
- **1a Welcome** - brand hero. Logo mark 132px, wordmark, 44px headline "Get paid to post.", body, primary "Get started", secondary "Already have an account? Sign in". A `#F2F9FE` circle bleeds off the top-left corner behind the mark.
- **1b Save your progress** - onboarding shell: 40px back circle, thin full-width progress bar, 34px title, then Apple (ink pill) and Google (outline pill) sign-in centered in the remaining space. No email, no password, no OTP.
- The remaining onboarding questions (name, birthday, phone, UGC knowledge, hardest part, hours per week, earnings estimate, how did you hear, notifications, permissions, done) follow the same shell: back + progress at top, 30px question, filled option rows, disabled-until-answered CTA at the bottom. Not yet drawn.

### Setup gate
- **1c Get set up** - four checklist rows with status chips (Done / Done / In review / To do), a 2-of-4 progress bar, pinned CTA for the next incomplete step, and the tab bar shown at 40% with pointer events off, since Home, Posts and Analytics stay locked until all four are complete.

### Main tabs
- **1d Home** - greeting, streak pill, "UP NEXT TODAY" label, one 264x470 (9:16) hero post card with the format pill, a solid-blue content-type tag beside it, the due time and the title overlaid on the frame. Single CTA: "View post". No swap, no meta column.
- **2a Posts, calendar** - segmented Calendar / Grid, month header, 7-column grid with 44px day cells and up to two blue dots per day, selected day filled ink, then that day's post rows below.
- **2b Posts, grid** - segmented with Grid active, a posts / views / earned summary row, then a 3-column grid of 9:16 tiles at 6px gutters. Each tile shows a status dot plus format glyph top right, and either a view count or a "To do" pill bottom left. Tapping a tile opens 2f.
- **2c Analytics** - title with earned-to-date at the right, TikTok / Instagram segmented, Views and Likes stat cards (selected card uses the brand tint and drives the chart), a 30-day area chart, and a stacked source bar with legend.
- **2d Profile** - avatar, name, handle, company, connected account rows with follower counts and a green Connected label, a solid blue balance card, then Messages (with unread badge), Account setup and Settings rows.

### Post detail and capture
- **1g Post detail, Reel** - back plus status chip, 26px title, format pill and due meta, a "Watch the example" row with a 72x128 thumb, then Hook and What to cover info blocks. Pinned CTA "Record".
- **1h Post detail, Slideshow** - same shell with Slideshow pill, three slide-copy info blocks, pinned CTA "Add pictures".
- **1e Record** - dark. The capture viewport is a true 9:16 area (390x693) pinned below the status bar, with the shutter bar in the 97px below it. Inside the viewport: close, "Clip 1 of 4, hook", a pulsing record dot with elapsed time, a four-segment clip stepper, a "Watch example" pill carrying that clip's runtime, and the teleprompter scrim at the bottom with the active word in brand tint. Shutter is a 76px ring; Retake left, Keep right.
- **1f Assignment, changes requested** - amber "What to fix" card with one row per structured note (Hook, Clip 3), a "Watch the example" row, the admin message thread, and a pinned "Record again" with a note that kept clips are saved.
- **2f Post detail, posted** - back, Posted chip, share; a 180x320 player with the platform pill and post date; a four-up stats row (Views, Likes, Comments, Shares); a blue-50 earnings card showing amount earned, progress toward the bounty and how many more views clear the rest; then the caption block.

### Money
- **2e Balance and payouts** - 44px available balance, what is still clearing, the connected bank row, a ledger of post payouts and cash-outs with a pending amber row, and a pinned "Cash out $412.00".

## States still to design
Loading skeletons, empty states per tab, error / soft failure toasts, submit success, account sent-back, unlinked socials, and the warm-up tutorial and chat thread screens.

## Assets
- Logo: `uploads/noni-logo-mark-transparent.png` (and `noni-logo.svg`) in the project root, supplied by the client.
- Icons: Lucide, stroke 2, rounded caps. Names used: arrow-right, at-sign, bell, chevron-left, chevron-right, chevron-down, check, clock, dollar-sign, download, eye, images, music-2, pencil, play, share-2, settings, switch-camera, video, x, zap, circle-user-round, house, layout-list, chart-column, message-circle, rotate-ccw, send.
- TikTok and Instagram brand marks are missing; `music-2` and `at-sign` stand in. Drop the real SVGs in before shipping.
- Post frames are neutral placeholders. Every one should be a real scraped 9:16 frame in the app.

## Files
- `Noni Creator App.dc.html` - the screen board. Open it in a browser.
- `tokens/` - the design system tokens, verbatim.
- `PARALLEL_BUILD_PLAN.md` - how to split this across parallel Cursor agents.
