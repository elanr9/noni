# Noni — Full Frontend Inventory for Claude Design

**Purpose:** One document so Claude Design can redesign the entire iOS app. This describes the **product**, the **as-built Expo/React Native UI**, the **design system tokens**, every **screen**, and the **component library**. Prefer this file over older briefs when they conflict on *what ships today*; use the redesign goals below when deciding *what to invent*.

**Stack:** Expo (SDK 57) · React Native · TypeScript · expo-router · Supabase backend  
**Frame:** iPhone 390×844, safe areas respected, primary actions in thumb reach  
**Roles:** `admin` | `creator` (routes + RLS gated)  
**North star:** Someone with zero content skill can post five on-brand pieces a day. Humans appear twice: creator records, admin approves. After Approve → auto edit → auto post (Upload-Post) → track.

**Mock tenant for designs:** FieldVision AI (football / sports tech). Example tasks, scripts, trends, and creators stay sports-themed.

**Content formats (never video-only):**
| Internal | UI label | What it is |
|---|---|---|
| `video` | Reel / Video | Talking head; teleprompter when script exists |
| `photo_carousel` | Slideshow / Photo | Multi-slide images + overlays + caption CTA |

Reference shots: `design/screens/ugc-reference/`.

---

## 1. Product loop (design around this)

```
scrape trends → AI fills creator queues → creator records/creates → admin approves → auto edit → auto post → track metrics / wallet
```

Copy tone: short, direct, sentence case, no emoji, no corporate filler. Buttons say what happens (`Record`, `Send for review`, `Approve`, `Request changes`, `Post it`). Never `Submit`, never `OK`, never lorem ipsum.

---

## 2. Design system (as implemented)

Source of truth in code: `theme/tokens.ts` (ported from creator design handoff).

### 2.1 Color

| Token | Hex | Use |
|---|---|---|
| `blue50` | `#F2F9FE` | Soft brand wash |
| `blue100` | `#E7F4FD` | Tint surfaces, status “to do” bg |
| `blue200` | `#A7D3F7` | Soft tint |
| `blue300` / `accentTint` | `#8EC9F5` | Baby blue tint only — **never** white text on this |
| `blue400` / `accentHover` | `#4FBAF2` | Hover / lighter accent |
| `blue500` / `accent` | `#1BA6EE` | **Primary action** (buttons, focus ring) |
| `blue600` / `accentPress` / `textBrand` | `#0F8FD1` | Pressed accent, brand text |
| `blue700` | `#0B76AD` | Active tab icon/label, strong brand text |
| `white` | `#FFFFFF` | Surface |
| `offWhite` / `surfaceSunken` | `#F7FAFD` | Screen background |
| `fillQuiet` / `surfaceQuiet` | `#F1F3F5` | Quiet fills |
| `line` / `border` | `#E6EEF6` | Hairline borders |
| `lineStrong` / `borderStrong` | `#D6E3EF` | Stronger borders |
| `slate300` | `#B4BFCB` | Disabled / soft |
| `slate400` / `textSubtle` | `#8E9AA6` | Subtle text, inactive icons |
| `slate500` / `textMuted` | `#6B7A8C` | Secondary text |
| `ink` / `textStrong` | `#0F1720` | Primary text |
| `ink800` | `#151D26` | Dark secondary |
| `ink900` / `surfaceDark` | `#0B0F14` | Record / media chrome |
| `amber` / `amberSoft` | `#E08A16` / `#FDF2DF` | Pending / changes requested |
| `green` / `greenSoft` | `#1F8F5F` / `#E4F5EC` | Approved / posted / approve button |
| `danger` / `dangerSoft` | `#D93A3A` / `#FCEBEB` | Destructive |
| `scrim` | `rgba(0,0,0,0.45)` | Overlay |
| `glass` | `rgba(255,255,255,0.82)` | Floating tab blur feel |

**Rule:** Primary buttons use `#1BA6EE` with white text. Baby blue `#8EC9F5` is tint only.

### 2.2 Type scale

| Token | Size |
|---|---|
| `hero` | 44 |
| `titleXl` | 34 |
| `title` | 30 |
| `titleSm` | 26 |
| `cardLg` | 20 |
| `card` | 18 |
| `action` | 17 |
| `body` | 16 |
| `bodySm` | 15 |
| `meta` | 14 |
| `chip` | 13 |
| `label` | 12 |
| `micro11` | 11 |
| `micro` | 10 |

Weights: regular 400 · semibold 600 · bold 700 · heavy 800.  
Leading multipliers: tight 1.05 · title 1.12 · snug 1.35 · body 1.5.  
Tracking: hero −1.2 · title −0.5 · label +0.7.  
Feel: SF rounded / confident / arm’s-length readable on creator screens.

### 2.3 Space / radius / motion

**Space:** 4, 8, 12, 14, 16, 18, 20, 24, 28, 32, 40 · `gutter` 24 · `cardPad` 18 · `stackGap` 12 · `sectionGap` 28 · `tapMin` 44 · `tapPrimary` 60 · `shutter` 84.

**Radius:** sm 12 · cell 14 · md 16 · lg 18 · xl 20 · 2xl 24 · pill 999.

**Shadows:** `shadowCard`, `shadowRaised`, `shadowFloat` (tab bar), `shadowMedia`, `shadowAccent` (primary CTA glow).

**Motion:** instant 90ms · fast 160ms · base 240ms · slow 420ms · shimmer 1400ms · press scale `0.97` · ease `cubic-bezier(0.22, 0.61, 0.36, 1)`.

### 2.4 Logo / brand mark

- Big clean **baby-blue 3D bubble letter N** on pure white.
- Soft inflated / glossy look; one hue family; no outlines; no extra shapes.
- Wordmark: rounded lowercase “noni” next to or below the N (`components/ui/Wordmark.tsx` — `BubbleMark` + `Wordmark`).
- Deliverables when redesigning: app icon, splash, wordmark lockup.

### 2.5 Status chips (task lifecycle)

| Status | Label | Colors |
|---|---|---|
| `assigned` | To do | blue700 on blue100 |
| `recorded` | Recorded | slate on fillQuiet |
| `submitted` | In review | amber on amberSoft |
| `changes_requested` | Changes needed | amber on amberSoft |
| `approved` | Approved | green on greenSoft |
| `posted` | Posted | white on green |

Transitions only via `lib/tasks.ts` (not a design concern, but status set is fixed).

---

## 3. Navigation map (as built)

```
app/
  index.tsx                          → auth redirect by role / onboarded
  (auth)/
    login.tsx                        Email + password, Apple, Google
    phone.tsx                        Phone OTP
    callback.tsx                     Magic-link / OAuth callback
  (onboarding)/
    index.tsx                        Signed in, no company yet
    company.tsx                      Admin company onboarding (13 steps)
    creator.tsx                      Creator onboarding (name → perms → socials → practice)
    practice.tsx                     Teleprompter practice camera
  (creator)/
    (tabs)/
      index.tsx                      Home (today queue + streak + swap)
      calendar.tsx                   Week / month calendar + day list
      profile.tsx                    Avatar, socials, balance entry, settings
    assignment/[id].tsx              Assignment detail (primary path)
    task/[id].tsx                    Legacy task detail
    record/[id].tsx                  Record / create + teleprompter
    balance.tsx                      Wallet + Stripe Connect cash out
  (admin)/
    (tabs)/
      index.tsx                      Queue (tab label: Review)
      create.tsx                     Campaign / brief builder (MVP core)
      calendar.tsx                   Week grid across creators
      creators.tsx                   Creator leaderboard roster
      analytics.tsx                  Company analytics
      trends.tsx                     Hidden from tab bar (href: null)
      settings.tsx                   Hidden; opened from Analytics gear
    review/[id].tsx                  Review player + approve / changes
    brain.tsx                        Brand Brain docs + sources
    creator/[id].tsx                 Single creator detail
    kitchen-sink.tsx                 Component playground (dev)
```

### Tab bars

**Creator** (floating blur pill): Home · Calendar · Profile  
**Admin** (same chrome): Review · Create · Calendar · Creators · Analytics  
- Trends + Settings routes exist but are **not** in the tab bar (MVP cut). Settings opens from Analytics gear. Brand Brain opens from Settings.

---

## 4. Screen inventory — Auth

### Login — `app/(auth)/login.tsx`
- Brand title / wordmark, email + password, Sign in.
- Apple (iOS) and Google OAuth.
- Copy: “Sign in” / “Email and password.”
- **Redesign note:** Spec prefers magic-link-only; current build uses password + socials.

### Phone — `app/(auth)/phone.tsx`
- Phone number → OTP code. Alternate path.

### Callback — `app/(auth)/callback.tsx`
- Session resolve / loading while link processes.

---

## 5. Screen inventory — Company onboarding (admin)

Route: `app/(onboarding)/company.tsx` · 13 steps · `ProgressBar` + `StepShell` · big tap targets.

| Step | Title / beat |
|---|---|
| 0 | Welcome — logo, one-liner, Get started |
| 1 | Company name + website |
| 2 | Instagram + TikTok handles |
| 3 | **Brand study showpiece** — “Give us 60 seconds…” phases: Reading your site → Watching your posts → Learning your voice (fires `brand-ingest`) |
| 4 | Who is your customer (AI-prefilled, editable) |
| 5 | What are you selling |
| 6 | How do people buy — link in bio / DMs / website (`OptionCard`) |
| 7 | Content pillars — chips + add own |
| 8 | **Tone slider showpiece** — Professional ↔ Unhinged; live example caption rewrites |
| 9 | Cadence — posts/week (1,2,3,5,7) |
| 10 | Who approves — just me / me + others |
| 11 | Invite creators — share sheet |
| 12 | Done → admin Calendar (never empty ideal) |

Shared UI: `components/OnboardingUI.tsx` (`ProgressBar`, `StepShell`, `OptionCard`, `Chip`).

---

## 6. Screen inventory — Creator onboarding

Route: `app/(onboarding)/creator.tsx` (+ `practice.tsx`).

1. Name + selfie avatar  
2. Camera + mic permissions (honest one-liners)  
3. Connect TikTok / Instagram (Upload-Post hosted linking)  
4. Teleprompter tutorial → `practice.tsx` (15s throwaway, dark camera)  
5. Lands on creator Home with first task  

Orphan state: `(onboarding)/index.tsx` — signed in but not on a team (“Almost in”).

---

## 7. Screen inventory — Creator app

### Home — `app/(creator)/(tabs)/index.tsx`
- Greeting: “Welcome back, {firstName}.”
- Wordmark header, streak flame, pull-to-refresh.
- Today’s assignments as cards (`PostCard` / status chips); primary action into assignment.
- **Swap** opens `SwapSheet` — filtered pool of alternate briefs (format + pillars).
- Empty: “Nothing queued today” + next action.
- Toast on swap success.
- **Gap vs brief:** Brief wanted Home segment Calendar | Inspiration FYP; as-built Home is today queue + swap, Calendar is its own tab.

### Calendar — `app/(creator)/(tabs)/calendar.tsx`
- Segmented Week / Month.
- `WeekStrip` day picker; `MonthGrid` for month.
- Day list of assignments with status; tap → assignment detail.
- Simple performance numbers where posted (views / money helpers).

### Profile — `app/(creator)/(tabs)/profile.tsx`
- Avatar (picker), name, company.
- TikTok / Instagram connect status + connect CTA.
- Balance row → `/balance`.
- Settings group: notifications tone, delete account / privacy / support style rows, sign out.
- App Store compliance affordances live here.

### Assignment detail — `app/(creator)/assignment/[id].tsx`
- Format pill, title, hook, why-it-works, optional example link.
- Script block and/or caption.
- Changes-requested banner with note.
- Posted metrics (views, likes, revenue, bounty).
- Primary CTA: **Record** (video) or **Create** (slideshow) → record route.
- Review thread when looping.

### Task detail (legacy) — `app/(creator)/task/[id].tsx`
- Older parallel of assignment detail; still in tree.

### Record / Create — `app/(creator)/record/[id].tsx`
- Full-screen dark camera for video + `Teleprompter` / `BeatsPrompter` when script/beats exist.
- Slideshow / static create path for `photo_carousel` (no fake video chrome).
- Playback → retake → send for review.

### Balance — `app/(creator)/balance.tsx`
- Available + pending cents, ledger history, Stripe Connect onboarding, Cash out.
- Sportsbook-wallet energy: earn → withdraw.

---

## 8. Screen inventory — Admin app

### Queue / Review tab — `app/(admin)/(tabs)/index.tsx`
- Title “Queue”; tab label “Review”; badge = pending count.
- Filter chips: All + by creator + by brief.
- `NextUpCard` (in-flight automation hint).
- Rows: `QueueRow` (avatar, 9:16 thumb, format, title, age, status).
- Empty: “Nothing to review” → Open Calendar.
- Skeleton: `QueueSkeletonRow`.

### Review detail — `app/(admin)/review/[id].tsx`
- Header “Review” + queue counter; swipe/advance through queue.
- Creator meta + age.
- **Video:** `PinnedPlayer` + script lines (`ScriptLineList`) with seek when timings exist.
- **Slideshow:** `SlideshowViewer` with dots.
- Segmented: Script | Caption | Thread (`ThreadTab` / `ReviewThread`).
- Actions: **Approve** (green) · **Request changes** → `RequestChangesSheet` (note required).
- After approve: automation takes over (edit → post → track).

### Create — `app/(admin)/(tabs)/create.tsx` *(MVP center of gravity)*
- Campaign builder targeting ~30 briefs.
- Ingest / auto-fill briefs, backlog sheet, publish campaign.
- `BriefEditSheet` for title, format (video | photo_carousel), hooks (2 options), talking points, hashtags, script, caption, why it works, target words, drop day.
- Format pills, draft cards, publish CTA.
- This is the admin “fill the week” surface (Trends tab hidden).

### Calendar — `app/(admin)/(tabs)/calendar.tsx`
- Week-of label, Mon–Sun columns × creator rows.
- `CalendarCell` compact cards (format + status).
- Empty: no creators / no posts — point to Settings or Create.
- Oversight grid; deep edit mostly via Create / brief sheets.

### Creators — `app/(admin)/(tabs)/creators.tsx`
- Leaderboard roster: views, followers, posts, approval rate, revenue, paid.
- Sort chips; tap → `creator/[id]`.

### Creator detail — `app/(admin)/creator/[id].tsx`
- Single creator performance / profile admin view.

### Analytics — `app/(admin)/(tabs)/analytics.tsx`
- Stats strip; sections: Briefs, Best hooks, Best formats, Best creators.
- Gear → Settings.
- Loading / empty copy per section.

### Trends — `app/(admin)/(tabs)/trends.tsx` *(hidden tab)*
- Scraped feed cards: thumb, views, hook, why it works, Create task.
- Still navigable; not in tab bar.

### Settings — `app/(admin)/(tabs)/settings.tsx` *(hidden tab)*
- Company basics, invite creators, link to Brand Brain, sign out.

### Brand Brain — `app/(admin)/brain.tsx`
- Tabs/docs: Product · Audience · Voice · Learnings (editable long text).
- Source accounts list (add / mute).
- Saved search terms chips.
- Consumed by AI generation / scrape.

### Kitchen sink — `app/(admin)/kitchen-sink.tsx`
- Dev component gallery; not product UI.

---

## 9. Component library (reuse these)

### Shared UI — `components/ui/`
| Component | Role |
|---|---|
| `Button` | variants: primary, secondary, tint, outline, ghost, danger, approve · sizes lg/md/sm · block · icons |
| `PressableScale` | 0.97 press |
| `TabBar` | Floating blur tab bar |
| `Icon` | Lucide wrapper (see icon names below) |
| `Wordmark` / `BubbleMark` | Logo |
| `EmptyState` | Illustration slot + title + body + action |
| `Skeleton` / `SkeletonLine` / `SkeletonCard` | 1400ms shimmer |
| `Segmented` | 2–3 option control |
| `Dropdown` | Compact filter/sort |
| `SheetShell` | Bottom sheet chrome |
| `FormatPill` | Reel vs Slideshow (overlay variant for media) |
| `MediaCard` | 9:16 cover + format + meta |
| `MediaFallback` | Missing thumb |
| `InfoBlock` | Label + body |
| `StatusChip` | Task lifecycle (also `components/StatusChip.tsx`) |

### Creator — `components/creator/`
`PostCard` · `PostRow` · `PostPager` · `WeekStrip` · `MonthGrid` · `SwapSheet` · `MiniStat` · `AreaChart` · `SplitBar`

### Admin — `components/admin/`
`QueueRow` · `QueueSkeletonRow` · `NextUpCard` · `PinnedPlayer` · `SlideshowViewer` · `ScriptLineList` · `ThreadTab` · `RequestChangesSheet` · `BriefEditSheet` · `BacklogSheet` · `CalendarCell`

### Other
`Teleprompter` / `BeatsPrompter` · `ReviewThread` · `TaskCard` · `OnboardingUI` · `Screen` / `LoadingScreen` / `BrandTitle`

### Icon names
`house` `layout-list` `chart-column` `circle-user-round` `bell` `play` `pause` `video` `images` `mic` `clock` `calendar-days` `rotate-ccw` `sparkles` `check` `plus` `arrow-right` `chevron-*` `x` `eye` `flame` `zap` `users` `inbox` `message-circle` `share-2` `thumbs-up` `thumbs-down` `trending-up` `link` `dollar-sign` `circle-check-big` `circle-alert` `trash-2` `log-out` `settings` `at-sign` (IG) `music-2` (TikTok)

---

## 10. Key interaction patterns

1. **Floating tab bar** — glass pill, active blue700, inactive slate400, badge on Review.
2. **Cards** — white on offWhite, radius 16–24, soft soft shadows; not dashboard chrome.
3. **Sheets** — Swap, Request changes, Brief edit, Backlog — thumb-reachable, scrim.
4. **Dark media surfaces** — Record, review player, practice only.
5. **One-handed creator** — primary CTA bottom, oversized (60pt) primary buttons.
6. **Empty states** — every list: real copy + next action + friendly illustration opportunity.
7. **Formats everywhere** — Queue, Calendar, Create, Home, Review must show Reel vs Slideshow.

---

## 11. Spec vs as-built (redesign decisions)

Use these as intentional redesign questions; do not silently invent a third IA without stating it.

| Area | Spec / older brief | As built today |
|---|---|---|
| Creator tabs | Home · Posts · Profile | Home · Calendar · Profile |
| Home | Calendar \| Inspiration segment + 3 hero cards | Today queue + streak + Swap |
| Posts tab | Account switcher, vertical day calendar, simple analytics | Folded into Calendar + Profile + Balance |
| Admin tabs | Queue · Calendar · Trends · Analytics · Settings | Review · Create · Calendar · Creators · Analytics |
| Trends | First-class tab | Hidden; Create/campaign is the fill path |
| Auth | Magic link email | Password + Apple + Google (+ phone) |
| Admin Create | Manual fallback + Generate | Primary campaign / brief pipeline |

**Recommended redesign priority (from briefs):**
1. Logo, icon, splash  
2. Creator Home + Calendar + Profile (or restore Posts if you want the brief IA)  
3. Record / Create media  
4. Admin Queue + Review (both formats)  
5. Admin Create + Calendar  
6. Company onboarding (brand study + tone)  
7. Creator onboarding + Balance  
8. Brand Brain, Analytics, Settings, Auth polish  

---

## 12. States every screen must ship

- Default (populated)  
- Loading (skeleton shimmer, not bare spinners where possible)  
- Empty (copy + next action)  
- Error (where network/actions fail)  
- Format variants: video **and** photo_carousel  
- Changes-requested loop on Assignment + Review  

---

## 13. File map for implementers (after design)

| Concern | Path |
|---|---|
| Tokens | `theme/tokens.ts` |
| Routes | `app/**` |
| Components | `components/**` |
| Task status | `lib/tasks.ts` |
| Assignments API | `lib/tasks-api.ts` |
| Admin queue/review | `lib/admin-api.ts`, `lib/admin-queue-map.ts` |
| Briefs / campaigns | `lib/briefs-api.ts` |
| Wallet | `lib/wallet-api.ts` |
| Product spec | `NONI_SPEC.md` |
| Older design briefs | `design/CLAUDE_DESIGN_BRIEF.md`, `design/CLAUDE_DESIGN_ADMIN_BRIEF.md` |
| UGC refs | `design/screens/ugc-reference/` |

---

## 14. Hard constraints (do not violate in redesign)

- iOS-first Expo app; designs must map to RN functional components.  
- Both content formats on every content surface.  
- One accent action color: `#1BA6EE`.  
- Creator operable one-handed at arm’s length.  
- Admin optimized for ninety-second triage.  
- After Approve, UI should feel like “it’s live / automation owns it.”  
- No platform API posting UI — posting is Upload-Post behind the scenes.  
- All data is company-scoped (multi-tenant); designs can stay single-tenant FieldVision for mocks.

---

## 15. Deliverables expected from Claude Design

- Screen designs at 390×844 with real FieldVision copy and both formats.  
- All states (default / loading / empty / error) for list screens.  
- Component-friendly exports → drop into `design/` and screenshots into `design/screens/<flow>/`.  
- Extend existing token language; do not invent a second palette without a one-sentence reason.  
- Motion notes: press, sheet present, skeleton shimmer, brand-study phase sequence, tone-slider caption rewrite.
