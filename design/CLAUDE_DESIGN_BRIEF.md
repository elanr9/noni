# Noni — Full App Redesign Brief for Claude Design

You are redesigning the entire Noni app: every screen, every onboarding step, the logo, the icon, the empty states, all of it. This document is everything you need. Read it fully before designing anything.

---

## 1. What Noni is

Noni is an iOS app that automates UGC content creation end to end. It does the UGC manager's job: it scrapes TikTok and Instagram for high performing content, uses AI plus the brand's profile to generate concrete post tasks (hook, script, caption, slide copy), and fills each creator's queue automatically. Creators open the app, see exactly what to post today, record it in app with a teleprompter (or produce a static photo / carousel post), and submit. Admins are a one tap quality gate. After Approve, everything else is automatic: background edit, native posting to the creator's own TikTok and Instagram, tracking, and revenue attribution.

The pipeline: **scrape → ideate → fill queues → record → approve → auto edit → auto post → track.** Humans appear exactly twice: the creator records, the admin approves.

**North star:** someone with zero content skill can post five on brand pieces a day. Every design decision bends toward that.

**Two user types:**
- **Creator:** often young, non technical, holding a phone at arm's length. Their whole world is the Today screen and the Record screen. Everything must be operable one handed.
- **Admin:** a founder or marketer checking in a few times a day to approve content and glance at the calendar and analytics. Fast triage, minimal friction.

**Content formats (do not design video only):** Noni handles both video (talking head with teleprompter) and static photo / carousel posts (TikTok Photo Mode, Instagram carousels: multi slide images with text overlays and a caption CTA). Every screen that shows or handles content must work for both formats. Reference screenshots of real static UGC live in `design/screens/ugc-reference/`.

---

## 2. Logo and app icon

- The mark is a **big, clean, baby blue letter N on a pure white background**.
- The N should look like a **3D bubble**: soft, inflated, glossy, rounded. Think a puffy balloon or inflatable letter with subtle depth, soft highlights, and a gentle shadow. Friendly and modern, not corporate.
- One color for the N (baby blue, see palette below) with lighter highlight and slightly deeper shade tones to sell the 3D bubble effect. No gradients into other hues, no outlines, no extra shapes or text in the mark.
- Deliverables: app icon (white background, bubble N centered, generous padding for iOS rounding), splash screen (white, bubble N centered, optional wordmark below), and a small wordmark lockup ("noni" in a rounded lowercase face next to or below the N) for the welcome screen and login.

---

## 3. Design system

**Palette:**
- Primary accent: baby blue, around `#8EC9F5` to `#A7D3F7`. This is the ONE accent color. Use it for primary buttons, active states, progress, links, and the logo.
- Background: white `#FFFFFF` and a very soft off white `#F7FAFD` for grouped sections.
- Text: near black `#0F1720` primary, muted slate `#6B7A8C` secondary.
- Status colors, used only in chips and small indicators: warm amber for pending / changes requested, green for approved / posted, the baby blue for in progress states. Keep them soft, matching the pastel feel.
- Dark surfaces appear only where the content demands it: the Record screen, video playback, and the review player are dark or edge to edge media.

**Feel:** clean, high contrast, generous whitespace, oversized tap targets, SF rounded feel. Big friendly type, soft large corner radii (16 to 24pt on cards and buttons), subtle soft shadows. The bubble quality of the logo should echo through the UI: pill buttons, rounded chips, soft depth. Playful but trustworthy, never childish.

**Typography:** rounded, confident. Big screen titles, comfortable body sizes. Creator screens especially should be readable at arm's length.

**Copy tone:** short, direct, zero corporate filler. Buttons say what happens: "Post it", "Send for review", "Record", "Approve". Never "Submit", never "OK", never lorem ipsum. Write real copy in every design.

**Empty states:** every list screen gets a real empty state that tells the user the next action, with a small friendly illustration in the same bubble style.

**Platform:** iOS, built in Expo / React Native. Design at iPhone dimensions (390 x 844 safe). Respect safe areas, keep primary actions in thumb reach at the bottom.

---

## 4. Every screen to design

### 4.1 Auth
1. **Login.** Logo lockup, email field, one button (magic link). One screen, no clutter.
2. **Magic link sent / callback.** Confirmation state while the link is processed.

### 4.2 Company onboarding (admin, runs once at signup)
Question heavy flow: one question per screen, a progress bar, big tap targets. It should feel like a conversation, not a form.

1. **Welcome.** Logo, one line on what Noni does, "Get started".
2. **Company name + website.**
3. **Instagram and TikTok handles.**
4. **Brand study screen — the showpiece.** "Give us 60 seconds, we're studying your brand." An AI analysis runs while animated progress states stream in: "Reading your site" → "Watching your posts" → "Learning your voice". Make this feel alive and premium: this is the moment the product proves it's smart.
5. **Who is your customer.** Free text, AI prefilled suggestion the user confirms or edits.
6. **What are you selling.** Same pattern.
7. **How do people buy.** Three big options: link in bio / DMs / website.
8. **Content pillars.** AI suggested chips from the brand study, tap to keep, add your own.
9. **Tone slider.** Professional ↔ unhinged, with a live example caption that rewrites as the slider moves. Second showpiece moment.
10. **Cadence.** Posts per week per creator, big stepper or picker.
11. **Who approves content.** Just me / me + others.
12. **Invite creators.** Share sheet with invite links.
13. **Done.** Lands on the Calendar, already filled with the first week of AI generated tasks. The user never sees an empty app.

### 4.3 Creator onboarding (under two minutes, ends in action)
1. **Invite link landing → magic link auth.**
2. **Name + selfie avatar.**
3. **Camera and mic permissions.** Honest one line explanations for each.
4. **Connect socials.** Link the creator's own TikTok and Instagram (hosted linking flow). Explain plainly: approved content posts to these accounts.
5. **Teleprompter tutorial.** Record a 15 second throwaway practice clip against sample text. Teach by doing.
6. **Lands on Today** with their first real task waiting.

### 4.4 Creator side
- **Today.** The whole product for creators. Tasks due today and this week, filled automatically by the AI. Videos owed count at the top, big cards per task with status chips, format indicator (video vs photo carousel), and a clear primary action per card.
- **Task Detail.** Title, hook, script preview, embedded inspiration trend (thumbnail plus why it works), caption, due date, and a giant Record button (or Create button for static tasks).
- **Record — the screen to obsess over.** Full screen front camera. Teleprompter: semi transparent scrolling script over the top third, adjustable scroll speed, 3 second countdown, pause, retake. Controls must be operable one handed at arm's length. Dark, immersive, zero chrome beyond what's needed.
- **Review and Submit.** Playback of the take, retake, and "Send for review".
- **My Posts.** History list with per task status chips and live post links once published.
- **Creator Settings.** Connect / manage own TikTok and Instagram (required before approved content can go live, so show connection status prominently), profile, notifications.

### 4.5 Admin side
- **Queue.** Submissions awaiting review, newest first, badge count. Fast triage layout.
- **Review.** Player and script side by side (or stacked with the script scrollable under the player), Approve or Request Changes with a note. Approve is the last human touch: after it, editing, posting, and tracking are automatic, and the design should quietly communicate that ("Approve and it's live" energy). Must also handle static carousel review: swipeable slides instead of a player.
- **Calendar.** Week view across creators showing the AI filled queue. Oversight and override: edit or remove generated tasks, manual task creation as a fallback, and a Generate button where AI drafts title, hook, script, and caption.
- **Trends.** Scraped feed cards: thumbnail, view count, hook, a one liner on why it works, and a "Turn into task" button.
- **Analytics.** Views and revenue per post, per creator totals, best hooks. Clean data cards, no dashboard bloat.
- **Admin Settings.** Creator roster with social connection status, invite creators, brand profile editor, company settings.

---

## 5. Key components to define

- **Status chips** for the task lifecycle: assigned → recorded → submitted → changes requested → approved → posted. Consistent shape and color language everywhere they appear.
- **Task card** (creator Today and admin Calendar variants).
- **Trend card** (Trends feed and the embedded inspiration inside Task Detail).
- **Primary / secondary buttons**, pill shaped, oversized.
- **Progress bar** for onboarding.
- **Teleprompter overlay** (text treatment, transparency, speed control).
- **Empty states** for Today, My Posts, Queue, Trends, Analytics.
- **Tab bars:** creator (Today, My Posts, Settings) and admin (Queue, Calendar, Trends, Analytics, Settings).

---

## 6. Priority order

Design in this order, most important first:

1. Logo, app icon, splash
2. Record screen
3. Company onboarding flow (all 13 steps, with extra care on the brand study and tone slider screens)
4. Today
5. Review
6. Everything else

---

## 7. Deliverables

- Export code for each screen into `design/` and screenshots into `design/screens/`, one folder per flow (e.g. `design/screens/onboarding-company/`, `design/screens/record/`).
- Every screen designed with real copy, real example content (a football tech brand called FieldVision AI is the first customer, so example tasks, scripts, and trends should be football / sports themed), and every state: default, loading, empty, and error where relevant.
- Keep components small and reusable; the app is built in React Native with TypeScript, so exported code should map cleanly to functional components.
