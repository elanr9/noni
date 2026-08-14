# Claude design cursor creator app handoff

**Noni — Creator app.** This folder is the build contract for Cursor. Target: a pixel-accurate, behavior-accurate implementation of the creator app exactly as designed. Do not redesign, simplify, or substitute.

## What is in this folder

```
Claude design cursor creator app handoff/
├── README.md          this file: context, tokens, build plan, acceptance
├── SCREENS.md         every screen, state and measurement
├── FLOWS.md           end-to-end user flows (the behavior contract)
├── CURSOR_PROMPT.md   paste-into-Cursor master prompt + parallel agent plan
└── screenshots/       rendered reference PNGs (390×844 frame)
```

## Ground truth

The living design is code in this project (download the whole project to get it). **When this document and the source disagree, the source wins.**

```
ui_kits/creator-app/       the app: one file per screen + creator-data.js + index.html
ui_kits/shared/Phone.jsx   device chrome (390×844)
ui_kits/shared/data.js     base mock data
components/                design-system primitives (Button, Icon, MediaCard, StatusChip, TabBar, TeleprompterOverlay…)
tokens/*.css               all design tokens (colors, type, spacing, shape, motion)
assets/logo.svg            the Noni mark (rocket, #8EC9F5) — inlined in components/core/Wordmark.jsx
assets/icons/              40 Lucide SVGs, stroke 2, round caps
```

Open `ui_kits/creator-app/index.html` in a browser to run the reference app. The state pills above the phone (Default / First sign in / Loading / Empty / No accounts) are a prototype harness only — do not build them.

## Stack

The production repo is **Expo / React Native + Supabase, TypeScript, file-based routing** (`app/(creator)/…`). Use it. No Tailwind, no component kits, no chart or animation libraries. Fonts on device: SF Pro / SF Pro Rounded (the web prototype substitutes Figtree / Nunito). Icons: `lucide-react-native`; TikTok and Instagram marks are stand-ins (`music-2`, `at-sign`) — swap in official brand SVGs when supplied.

## Design tokens (port verbatim from `tokens/*.css`)

```css
/* Brand blue — 100–300 are tints, 500 is the ONLY action colour */
--blue-50:#F2F9FE; --blue-100:#E7F4FD; --blue-200:#A7D3F7; --blue-300:#8EC9F5;
--blue-400:#4FBAF2; --blue-500:#1BA6EE; --blue-600:#0F8FD1; --blue-700:#0B76AD;
--white:#FFFFFF; --off-white:#F7FAFD; --fill-quiet:#F1F3F5;
--line:#E6EEF6; --line-strong:#D6E3EF;
--slate-300:#B4BFCB; --slate-400:#8E9AA6; --slate-500:#6B7A8C;
--ink:#0F1720; --ink-800:#151D26; --ink-900:#0B0F14;
--amber:#E08A16; --amber-soft:#FDF2DF; --green:#1F8F5F; --green-soft:#E4F5EC;
--danger:#D93A3A; --danger-soft:#FCEBEB;
--accent:#1BA6EE; --scrim:rgba(0,0,0,0.45); --glass:rgba(255,255,255,0.82);
--radius-sm:12px; --radius-md:16px; --radius-lg:18px; --radius-xl:20px; --radius-2xl:24px; --radius-pill:999px;
--shadow-card:0 1px 2px rgba(15,23,32,0.04),0 6px 16px rgba(15,23,32,0.05);
--shadow-raised:0 2px 6px rgba(15,23,32,0.06),0 12px 28px rgba(15,23,32,0.08);
--shadow-float:0 6px 24px rgba(15,23,32,0.14);
--shadow-media:0 4px 18px rgba(15,23,32,0.10);
--shadow-accent:0 8px 20px rgba(27,166,238,0.28);
--ease-out:cubic-bezier(0.22,0.61,0.36,1);
--dur-instant:90ms; --dur-fast:160ms; --dur-base:240ms; --dur-slow:420ms;
```

Canvas: 390×844 logical, 24px gutters, floating tab bar (`left/right:16, bottom:22`, blur 18px over `--glass`). Buttons and chips are always fully round (999px). Weights 600/700/800 only for headings; body 400. Sentence case everywhere; no emoji; no exclamation marks.

## Post-type and format color coding (shared with the campaign manager app)

```
Format:   Reel       #E7F4FD / #0B76AD (icon: video)
          Slideshow  #ECE7FB / #5B44B4 (icon: images)
Type:     Talking head #ECE7FB/#5B44B4 · Numbered list #E3F2FD/#0E6BA8 · How to #E7EAFB/#3B4EA0
          Explainer #DFF3EE/#0E6E5C · Contrast #FDEEDC/#95560C · Replay bait #FBE7EF/#A03A67
Status dots: assigned #8EC9F5 · submitted/recorded/changes_requested #E08A16 · posted/approved #1F8F5F
```

These chips sit ON the media (top-left) everywhere a post is shown. Pillar tags ("stats", "training") never appear on creator cards.

## Motion contract

Screens fade+rise 240ms `--ease-out`; task detail and messages slide in from the right; the record screen slides up; popovers pop 160ms; toasts spring up 240ms; every button compresses `scale(0.97)` for 90ms on press. Skeletons shimmer 1400ms linear. No bounces, no parallax.

## Build plan (phases — see CURSOR_PROMPT.md for the parallel agent split)

1. **Tokens + primitives** — theme layer, Button, Icon, StatusChip, chips (FormatTag/TypeTag), EmptyState, TabBar, MediaCard (with the `chips` overlay prop), TeleprompterOverlay, SlideNav.
2. **Shell + navigation** — 4 tabs (Home, Posts, Analytics, Profile) + pushed modes (task detail, record, messages) + invite modal + setup home gating.
3. **Screens in parallel** (independent workstreams; see agent split).
4. **Flows + state machine** — the task status machine drives everything: `assigned → recording (clips|slides) → processing → review → submitted → approved|changes_requested → posted`; queue state lives in the shell and every surface derives from it.
5. **States pass** — loading skeletons, empty, unlinked, first sign in, for every screen.
6. **Acceptance pass** — run the reference app side by side, screen by screen, overlay screenshots at 50%.

## Acceptance checklist (summary — full details in SCREENS.md)

- [ ] Tokens spot-check 10 values; Figtree/SF Pro loading; gutter 24; floating blurred tab bar.
- [ ] First sign in: invite modal → Accept → Get set up (3 steps, bank first) → tabs gated.
- [ ] Home: no segmented control; welcome; week strip with status-colored dots; time pager; one hero post card with on-media chips; Record/Create + Swap; changes-requested card state; auto-advance after submit.
- [ ] Record: clip-per-block, teleprompter only on hook/CTA clips, talking point header on middle clips, pre-placed screen recording + on-screen text, clip-saved panel (Redo / Next), processing, review with autofilled brief details, Send for approval.
- [ ] Slideshow create: one upload tile per slide, slide text pre-filled, process, review with slide scroll.
- [ ] Swap: full-row library list → preview modal (playable / scrollable) → Use this post / Back.
- [ ] Posts: calendar / briefs / list views; changes banner → per-post revision thread + Record changes; post detail with platform switcher, Views/Likes/Saves/Earned, tier progress, Open on TikTok + Instagram.
- [ ] Messages: manager thread with bubbles, quotes, post refs, voice notes, day dividers, pinned Record changes bar when a fix is owed.
- [ ] Profile: role switcher (FieldVision AI Creator ⇄ Campaign Manager), photo upload avatar, Current earnings card, accounts, inbox/setup, settings, legal, sign out; scrolls.
- [ ] Slideshows are scrollable (arrows + dots + per-slide tint) everywhere a post is viewed.
- [ ] No emoji, sentence case, buttons name the action, press = scale(0.97) @90ms.

## Open items the design cannot supply

Real media frames (all placeholders are gradients), official TikTok/Instagram SVGs, licensed fonts, the real payout rules (the $1.50 CPM / $20 tiers are placeholders), real analytics endpoints, and error/offline states. Ask before inventing any of these.
