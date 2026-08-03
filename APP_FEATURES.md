# Noni — App Features, Tabs & Functionalities

Inventory of product surfaces on both roles. Grounded in `NONI_SPEC.md` and the shipped Expo routes under `app/`.

**Pipeline:** scrape trends → Claude ideates → fill creator queues → creator records → admin approves → auto edit → auto post (Upload-Post) → track metrics → bounty / attribution. Humans appear twice: creator records, admin approves.

**Roles:** `admin` and `creator`. Routes and RLS are role-gated. Every query is scoped by `company_id`.

**Content formats:** video (teleprompter) and static photo / carousel. Product is not video-only; photo create/post paths may still be stubbed in places.

---

## Shared (both roles)

| Area | What it does |
|------|----------------|
| Auth | Email/password login today; magic-link callback route exists (`(auth)/login`, `(auth)/callback`) |
| Route guards | Unauthenticated → auth; un-onboarded → onboarding; admin → `(admin)`; creator → `(creator)` |
| Push | Expo push registration; `notify` on submit, review outcomes, comments, bounty credits |
| Task status machine | `assigned → recorded → submitted → (changes_requested → recorded → submitted)* → approved → posted` via `lib/tasks.ts` only |
| Review thread | Shared `review_events` on submissions: comments (no status flip), Request Changes (note + status), Approve |
| Multi-tenant | Company-scoped data and storage paths |

---

## Auth

- **Login** — sign in with credentials; lands in the correct shell by role.
- **Callback** — deep-link / magic-link handler (`noni://auth/callback`).

---

## Onboarding

### Company (admin) — `app/(onboarding)/company.tsx`

One question per screen, progress bar. Writes `brand_profiles` + `companies.settings` on the final step; sets `profiles.onboarded`. Lands on **Calendar**.

1. Welcome (what Noni does)
2. Company name + website
3. Instagram + TikTok handles
4. Brand study (live `brand-ingest`; progress states; soft-fail to generics)
5. Who is your customer (AI-prefilled, editable)
6. What are you selling
7. How people buy (link in bio / DMs / website)
8. Content pillars (chips; keep / add)
9. Tone slider (professional ↔ unhinged; live caption example)
10. Cadence (posts per week per creator)
11. Who approves (just me / me + others)
12. Invite creators (share sheet stub; no invite tokens yet)
13. Done → Calendar with AI-filled week when pipeline has run

### Creator — `app/(onboarding)/creator.tsx` + `practice.tsx`

Under ~2 minutes. Lands on **Home**.

1. Name + selfie avatar
2. Camera + mic permissions
3. Connect TikTok / Instagram (Upload-Post hosted linking)
4. Teleprompter practice (15s throwaway clip; not uploaded)
5. Done → Home with first task when assigned

If there is no profile row: “ask your admin” card.

---

## Creator side

**Tab shell:** Home · Posts · Analytics · Profile  
**Pushed screens:** Task detail, Record (fullscreen modal), Balance

### Tab: Home — `(creator)/(tabs)/index`

- Greeting by name
- Segmented **Calendar** | **Inspiration**
- **Calendar**
  - Week strip (7 days) with posts / make windows
  - Today queue as cards (next post large, rest of day below)
  - Empty state when nothing queued
  - **Swap** on a today slot → Inspiration filtered by format / tags (Swap sheet)
- **Inspiration**
  - Scrollable “FYP” of makeable posts
  - More like this / Less like this signals
- Opens **Task detail** for a queued item

### Tab: Posts — `(creator)/(tabs)/posts`

- Instagram / TikTok account switcher (empty if none linked)
- Views: calendar of past days vs list
- Posted items with performance (views, likes, etc.)
- Empty states: link accounts / nothing posted yet
- Links out to live posts when available

### Tab: Analytics — `(creator)/(tabs)/analytics`

- Personal growth / metrics summary (views, engagement-style numbers)
- Charts / simple stats when data exists
- Empty state when no numbers yet

### Tab: Profile — `(creator)/(tabs)/profile`

- Avatar, name
- **Balance** → Wallet entry (pushes Balance)
- **Accounts** — Instagram / TikTok connect status + reconnect via Upload-Post
- **Settings** — Notifications, posting windows (UI rows)
- **Legal & support** — Contact support, Privacy/terms, Sign out, Delete account

### Task detail — `(creator)/task/[id]`

- Media hero (inspiration cover; tap opens source URL)
- Format (Video / Slideshow), title, brief, bounty/time row
- Hook / script (when present), caption, due
- Status chip; when `changes_requested`, latest note + re-record path
- Review thread (comments both ways)
- Good idea / Bad idea signals
- **Record / Create** for video; photo carousel may show “coming soon” stub
- Send for review after recording

### Record — `(creator)/record/[id]` (fullscreen)

- Camera + mic
- Teleprompter / karaoke prompter when script exists (speed, countdown, tap-pause)
- Multi-segment takes (split on `---` or paragraphs; stop between parts)
- Flash (rear torch / front glow + brightness), flip camera (hidden while recording)
- Retakes, playback review
- Client compress → upload to `videos` bucket → status → submitted
- Multi-segment stitch happens server-side on approve

### Balance / wallet — `(creator)/balance`

- Available + pending cents
- Ledger history (bounty credits, payouts, adjustments)
- Stripe Connect Express setup
- Cash out (hold → Stripe Transfer → webhook confirms)

---

## Admin side

**Tab shell:** Queue · Calendar · Trends · Analytics · Settings  
**Pushed screens:** Review `[id]`, Review confirmation, Brand Brain  
**Dev-only:** kitchen-sink (component scratch; not product)

### Tab: Queue — `(admin)/(tabs)/index`

- Submissions awaiting review, newest first
- Tab badge with pending count
- Next-up card + queue rows (creator, format, status, thumbnail)
- Empty state when nothing to review
- Tap → **Review**

### Review — `(admin)/review/[id]` (+ confirmation)

- Pinned video/player (real submission; multi-segment previews clip 1 until stitch)
- Tabs: **Script** · **Caption** · **Thread**
- Feedback thread (chronological `review_events`)
- Comment composer (no status change)
- **Approve** (primary) → auto-finish: stitch if needed → FFmpeg basic edit → Upload-Post → `posts` / metrics pipeline
- **Request changes** (note required) → creator re-records
- Confirmation screen → next queue item

### Tab: Calendar — `(admin)/(tabs)/calendar`

- Week grid: creators × days
- Oversight of AI-filled + manual tasks
- Cell → task edit sheet (edit / remove)
- **Generate** (Claude draft: title, hook, script, caption from brand ± trend)
- **New task** (manual create / assign / due)
- Generate + New task are fallbacks; daily auto-fill is the product path

### Tab: Trends — `(admin)/(tabs)/trends`

- Scraped feed cards: cover, views, hook, why it works
- **Scrape now** (triggers `scrape-trends`)
- **Turn into task** (`generate-script` → assigned task with inspiration trend)

### Tab: Analytics — `(admin)/(tabs)/analytics`

- Totals: views, revenue (attribution), bounties paid
- Per-post / per-creator breakdowns, best hooks (as data allows)
- **Poll metrics now** (triggers `poll-metrics`)

### Tab: Settings — `(admin)/(tabs)/settings`

- Creator social connection status overview
- Invite creators (stub share)
- Link to **Brand Brain**
- Sign out
- Company / brand editing entry points as wired

### Brand Brain — `(admin)/brain`

- View / edit brand profile (tone, audience, pillars, products, buying path, handles)
- Source URLs / reference handles as supported
- Feeds generation and scraping context

---

## Automatic backend (no dedicated tab)

These power both sides; admins/creators only trigger or observe them.

| Function | Role |
|----------|------|
| `brand-ingest` | Site + captions → Claude → `brand_profiles` (onboarding + monthly) |
| `scrape-trends` | Apify TikTok/IG → filter → OCR/transcript → classify formats → mine claims/vocab → `trend_items` |
| `generate-script` | Brand ± trend → task draft |
| `auto-fill` | Fill creator Today from top trends by cadence (cron; may be rescheduled with planning workstreams) |
| `post-approved` | On Approve: stitch → FFmpeg edit → Upload-Post to creator’s accounts → `posts` |
| `poll-metrics` | Daily analytics; auto bounty credit at view threshold |
| `stripe-webhook` | Brand revenue attribution + Connect/payout updates |
| `stripe-connect` / `creator-payout` | Wallet onboarding and cash out |
| `social-connect` | Per-creator Upload-Post profile + TikTok/IG link |
| `notify` | Push to the other party on status/comment/bounty |

---

## Money flows

1. **Brand revenue** — unique attribution codes / UTMs per post → Stripe webhook → `revenue_events` (admin Analytics).
2. **Creator payouts** — views ≥ company bounty threshold → wallet credit → Cash out via Stripe Connect Express (creator Balance). Defaults in `companies.settings` (`bounty_amount_cents`, `bounty_view_threshold`).

---

## Explicitly later / partial

- Creatomate rich templates (basic FFmpeg ships)
- Auto-approve rules
- Company self-serve signup / billing for external tenants
- Android
- Full photo/carousel create + Upload-Post photo payload (format field + stubs exist; schema migration for slides may still deepen)
- Invite tokens (share stub only)
- Admin kitchen-sink deleted after redesign pixel pass
- Inspiration planning pipeline (formats, weekly batches, planning_status) — foundation landed; full planner UI (Workstream D/E) continues beyond this inventory

---

## Quick route map

```
(auth)/login, callback
(onboarding)/index → company | creator | practice
(creator)/(tabs)/  Home | Posts | Analytics | Profile
(creator)/task/[id], record/[id], balance
(admin)/(tabs)/    Queue | Calendar | Trends | Analytics | Settings
(admin)/review/[id], review/confirmation, brain
```
