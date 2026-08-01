# Noni — Admin app + onboarding design brief for Claude Design

You already designed the Noni creator app (the `ui_kits/creator-app` kit and the `design_handoff_creator_app` handoff bundle). That design shipped. Now design **everything else**: auth, company onboarding, creator onboarding, and the entire admin app. Same product, same design system, same quality bar.

---

## 1. The one rule that governs everything

**The creator app design system is now law. Extend it, never reinvent it.**

- Reuse the existing tokens verbatim: every color, type size, weight, spacing value, radius, shadow, duration, and easing from `tokens/` and the creator handoff README. No new hex values without a reason you can defend in one sentence.
- Primary buttons are `#1BA6EE`. Baby blue `#8EC9F5` is a tint only and never carries white text.
- Reuse existing components (Button, Icon, StatusChip, EmptyState, TabBar, MediaCard, WeekStrip, charts, skeletons) and extend them with variants where admin needs differ. New components only where no existing one fits.
- Same motion language: 240ms surfaces, 160ms color, 90ms `scale(0.97)` press, 420ms chart draw, 1400ms skeleton shimmer, easing `cubic-bezier(0.22,0.61,0.36,1)`.
- Same frame: 390×844 iPhone, safe areas respected, primary actions in thumb reach.
- Same copy rules: short, direct, sentence case, no emoji, buttons say what happens ("Approve", "Request changes", "Turn into task"). Real copy everywhere, never lorem ipsum.
- Same mock data world: FieldVision AI, a football tech brand, is the tenant. All example tasks, scripts, trends, creators, and numbers are football / sports themed. Both content formats appear everywhere: video (Reel) and static photo / carousel (Slideshow). Never design video-only.

---

## 2. Who the admin is

A founder or marketer who opens the app a few times a day to approve content and glance at the calendar. They are not living in this app; they are clearing a queue in ninety seconds between meetings. Every admin screen optimizes for fast triage and glanceable oversight. Approve is the last human touch in the pipeline: after it, editing, posting, and tracking are automatic. The design should quietly communicate that ("Approve and it's live" energy).

---

## 3. Screens to design

### 3.1 Auth (shared by both roles)

1. **Login.** Logo lockup (bubble N + wordmark), email field, one button (magic link). One screen, no clutter.
2. **Magic link sent.** Confirmation state, with a resend affordance after a delay.
3. **Link processing / callback.** Brief loading state while the session resolves.

### 3.2 Company onboarding (admin, runs once at signup)

One question per screen, progress bar, big tap targets. A conversation, not a form. Thirteen steps:

1. **Welcome.** Logo, one line on what Noni does, "Get started".
2. **Company name + website.**
3. **Instagram and TikTok handles.**
4. **Brand study — the showpiece.** "Give us 60 seconds, we're studying your brand." Animated progress states stream in: "Reading your site" → "Watching your posts" → "Learning your voice". This is the moment the product proves it's smart. Make it feel alive and premium. Design the full sequence, not one frame.
5. **Who is your customer.** Free text, AI prefilled suggestion the user confirms or edits.
6. **What are you selling.** Same pattern.
7. **How do people buy.** Three big options: link in bio / DMs / website.
8. **Content pillars.** AI suggested chips from the brand study, tap to keep, add your own.
9. **Tone slider — second showpiece.** Professional ↔ unhinged, with a live example caption that rewrites as the slider moves. Design at least three slider positions.
10. **Cadence.** Posts per week per creator, big stepper or picker.
11. **Who approves content.** Just me / me + others.
12. **Invite creators.** Share sheet with invite links.
13. **Done.** Lands on the admin Calendar already filled with the first week of AI generated tasks. The user never sees an empty app.

### 3.3 Creator onboarding (under two minutes, ends in action)

1. **Invite link landing → magic link auth.**
2. **Name + selfie avatar.**
3. **Camera and mic permissions.** Honest one line explanations for each.
4. **Connect socials.** Link the creator's own TikTok and Instagram (hosted linking flow). Explain plainly: approved content posts to these accounts. Skippable but discouraged.
5. **Teleprompter practice.** Record a 15 second throwaway clip against sample text. Teach by doing. Dark full-screen camera treatment consistent with the Record screen you already designed.
6. **Lands on Home** with their first real task waiting (you already designed Home; just show the transition frame).

### 3.4 Admin app

Admin tab bar, same floating treatment as the creator one: **Queue · Calendar · Trends · Analytics · Settings**. Review and Brand Brain are pushed screens.

1. **Queue.** Submissions awaiting review, newest first, badge count on the tab. Each row: creator avatar + name, 9:16 thumbnail, format chip (Reel / Slideshow), title, submitted time, status. Built for triage speed: an admin should clear five submissions in under a minute. Empty state: "Nothing to review" with what happens next.
2. **Review.** The most important admin screen. Two variants, one layout language:
   - **Video:** player with the script scrollable beneath (or beside) it so the admin can check delivery against the script.
   - **Slideshow:** swipeable slides with dots, caption below. No fake video chrome.
   - Both: task context (hook, caption), the review thread when the task is in a changes-requested loop (admin notes + creator resubmissions, chronological), and two actions: **Approve** (primary, `#1BA6EE`) and **Request changes** (opens a note field). After Approve, a confirmation state that communicates the automation taking over: it will be edited and posted automatically at its scheduled time.
3. **Calendar.** Week view across all creators showing the AI filled queue. Rows or columns per creator, each cell a compact task card with format chip and status. Oversight and override: tap a task to edit or remove it, a manual "New task" fallback, and a **Generate** button where AI drafts title, hook, script, and caption. Design the task edit sheet.
4. **Trends.** The scraped feed. Cards: 9:16 thumbnail, view count, hook line, one liner on why it works, format, and a **Turn into task** button (choose creator + day, then it drops into the Calendar). Filter chips by format and pillar. Empty and loading states.
5. **Brand Brain.** The brand's living profile, edited by the admin, consumed by the AI. Three parts:
   - **Doctrine documents** as tabs: Product (what it does, who pays, killer features, banned claims), Audience (who they are, pains, dreams, their language), Voice (how the brand talks), Learnings (what has worked). Each is an editable long-text document with an "AI draft" action that fills it from the brand study.
   - **Source accounts:** list of TikTok / Instagram accounts Noni scrapes for inspiration, with active / paused status and an add flow.
   - **Search terms:** the pillar-derived terms driving the scraper, shown as removable chips.
6. **Analytics.** Views and revenue per post, per creator totals, best hooks. Reuse the chart language from the creator Analytics screen (hand-drawn SVG area chart, mini stats, split bar). Clean data cards, no dashboard bloat. Loading and empty states.
7. **Settings.** Creator roster with avatar, name, and social connection status per creator; invite creators (share sheet); company profile basics; sign out.

---

## 4. States

Every screen ships with every state that can occur: default, loading (skeleton shimmer, same treatment as creator app), empty (real copy + next action, bubble-style illustration), and error where relevant. Review needs both format variants and the changes-requested-loop variant. Queue needs populated, single-item, and empty. The brand study screen needs its full animation sequence.

---

## 5. Priority order

1. Admin Queue + Review (both formats) — the daily loop.
2. Admin Calendar (including task edit sheet and Generate).
3. Company onboarding, with extra care on the brand study and tone slider showpieces.
4. Trends.
5. Creator onboarding.
6. Brand Brain, Analytics, Settings, Auth.

---

## 6. Deliverables

Match the creator handoff format exactly:

- A running kit at `ui_kits/admin-app/` (and `ui_kits/onboarding/` for the two onboarding flows) with `index.html` and `all-screens.html`, rendering every screen and state at 390×844, built on the same shared tokens and components.
- New or extended components live in `components/` alongside the existing ones, small and reusable.
- A handoff bundle `design_handoff_admin_app/` containing:
  - `README.md` — the spec, same structure and fidelity as the creator one: every hex, px, weight, radius, shadow, duration, copy string, and state, verified from the running source, with assumptions flagged.
  - `CURSOR_PROMPT.md` — the paste-into-Cursor master prompt, same rules as the creator one (preserve stack, tokens verbatim, no invented details, stage-by-stage implementation with overlay verification, explicit "stop and ask" list).
  - `screenshots/` — numbered PNGs, one per screen/state, same scale convention as before.
