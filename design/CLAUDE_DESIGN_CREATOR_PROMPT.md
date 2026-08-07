# Prompt for Claude Design — Noni Creator App (full redesign)

Paste everything below into Claude Design.

---

You are redesigning the **entire Noni creator app** so it is beautiful, modern, and conversion-grade — same quality bar as the best consumer fintech / creator tools (think Cal AI onboarding clarity + a premium creator dashboard).

**Do not invent a new product.** Redesign the screens and flow that already exist. Information architecture, steps, and jobs-to-be-done stay the same. Elevate visual design, typography, hierarchy, motion, empty states, and polish.

**Product (one sentence):** Noni is an app where college-soccer / recruiting creators get a queue of posts, record clip-by-clip (or upload photos for carousels), submit for admin review, and Noni auto-edits (text + screenshots), posts to TikTok + Instagram, and pays them.

**Roles:** This redesign is **creator-only**. Ignore the admin app except where the creator waits on admin (account approval, post revisions).

**Content formats:** Video (Reel) AND static photo carousel (Slideshow). Never design video-only.

**Brand constraints for redesign:**
- Product name: **Noni** (bubble “N” mark exists; treat the wordmark as a hero signal on welcome / first viewport of home)
- Avoid purple-on-white / purple-indigo gradients, warm cream + terracotta “AI default,” and dense broadsheet newspaper layouts
- Prefer a clear, confident direction (you choose: clean light editorial, soft athletic, etc.) with expressive type — not Inter/Roboto/Arial as the hero face
- Cards only when they contain a real interaction; avoid card soup in heroes
- One job per section; reduce pill clusters and stat strip clutter
- Ship intentional motion (2–3 signature moves across the system: progress, success, sheet)

**Platform:** Mobile iOS first (390×844 frame). Expo / React Native will implement later from your screens.

---

## End-to-end creator journey (must remain intact)

### A. Fresh install → Cal AI style onboarding (pre-auth)

One question per screen. Thin top progress bar + back. Bottom primary Continue (disabled until answered). Selected options = high-contrast selected state.

1. **Welcome** — Brand hero. Headline about getting paid to post. Primary: Get Started. Secondary: Already have an account? Sign in.
2. **First name** — Single text field.
3. **Birthday** — Date wheel. Collect only, no age gate copy scare.
4. **Phone** — US phone, formatted.
5. **UGC knowledge** — Single-select: Never heard of it / I’ve seen it around / I’ve made some content / I do UGC already.
6. **Hardest part** — Single-select: Getting views / Knowing what to post / Staying consistent / Getting paid at all.
7. **Hours per week** — Single-select: ~2 / ~5 / ~10 / 15+.
8. **Earnings estimate (payoff)** — Big animated number. Map: 2h→$1,000 · 5h→$1,500 · 10h→$2,200 · 15+→$3,000 / month. Excitement, not a contract.
9. **Save your progress (~60%)** — Auth: Sign in with Apple + Sign in with Google only. No email, no password, no phone OTP.
10. **How did you hear about Noni?** — TikTok / Instagram / Friend / Other.
11. **Notifications** — Why we ping (post ready to record, you got paid) → system permission.
12. **Camera + mic permissions** — Prep for recording.
13. **Done** — You’re in. Next: set up your accounts. CTA into setup.

### B. Setup gate (only UI until complete)

After onboarding, creator cannot see Home / Posts / Analytics. Only a **Get set up** checklist (4 steps). Chat + Profile still reachable for help.

1. **Create your accounts** — Suggested name, username, bio from company template; copy / use; upload two profile screenshots (TikTok + Instagram).
2. **Connect your accounts** — Link TikTok + Instagram (Upload-Post OAuth in browser).
3. **Warm them up** — Multi-page tutorial: scroll/search/like college recruiting + college soccer 15–20 min on both apps; then upload For You screen recordings (TikTok ~15s min, Instagram ~20s min). Submits to **admin account review**. States: To do / In review / Sent back with reason / Done.
4. **Connect your bank** — Stripe Connect for payouts.

When all four complete (account approved + both socials + bank), unlock the main app.

### C. Main app (4 tabs)

**Home · Posts · Analytics · Profile**

#### Home
- Greeting + streak pill
- **Hero next post** — large thumbnail/example frame, title, format pill (Reel / Slideshow), status
- Primary CTA: Record or Create
- Secondary: Swap (today’s assigned post only)
- “More today” expand if multiple
- Bell → Messages; badge when unread admin message or any post in Changes requested
- Empty: nothing queued / all done for today / peek tomorrow

#### Posts
- Segmented: **Calendar | List**
- Calendar: month grid with dots on days that have posts; day list below with Post rows
- List: all assignments newest first — thumb, title, status, views/likes when live, earnings progress toward bounty
- Tap → assignment detail; Record/Create from row when actionable

#### Analytics
- Segmented: TikTok | Instagram (filters post list; totals may be combined)
- Mini stats: Views, Likes, Earned
- Area chart (last 30 days); tapping a mini stat switches the chart metric
- Split bar: where views came from (when attributable)
- Posts list with performance → assignment detail
- Empty: numbers show up after first post goes live

#### Profile
- Avatar, name, handle, company
- Connected accounts (TikTok / Instagram status)
- Balance / payouts entry
- Messages
- Account setup / settings-ish rows
- Sign out

### D. Push screens (from Home / Posts)

#### Assignment detail
- Title, hook/description, format
- Watch the example (in-app browser)
- Status chip
- If **Changes requested**: amber primary card with structured revision notes (Hook / Clip N / Caption etc.), then feedback thread
- Sticky bottom CTA: Record / Create / Record again / Redo your slides
- After posted: metrics, bounty progress, optional Music added step for slideshows
- Thread for comments with admin

#### Record (video, full screen dark)
- Clip-by-clip stepper (hook → points → outro/CTA)
- Hook + CTA: teleprompter script
- Points: large on-screen talking point (beats), not a full script
- Flow per clip: countdown → record → review → Retake or Keep
- Progress saves; leave and resume mid-post
- Final submit when all clips kept

#### Upload (slideshow / new-world photo carousel)
- One photo slot per slide (talking point / overlay text shown)
- Pick / swap from library
- Submit when all slides filled

#### Chat / Messages
- One thread with admins
- Pinned cards for posts with Changes requested → open that post
- Post references in messages deep-link to assignment

#### Balance / Payouts
- Available balance
- Cash out to bank (Stripe)
- Ledger history
- Connect / finish payout setup if needed

#### Account setup (also reachable from setup checklist)
- Template bio, name ideas, handles, verification screenshots

#### Warm-up tutorial
- 4 screens: what / why For You matters / what to do / prove with recordings

---

## States every important screen needs designs for

- Loading (skeletons, not spinners where possible)
- Empty
- Error / soft failure (toast or inline)
- Primary success (submit sent, cash out started, all done today)
- Changes requested
- In review (account warm-up pending)
- Sent back (account)
- Unlinked socials
- Partial setup (N of 4)

---

## Copy rules

- No em-dashes or en-dashes in UI strings
- Confident, short, creator-facing
- Format pills: **Reel** / **Slideshow** (not “Video” / “Photo carousel” in creator UI)

---

## Deliverables I want from you

1. **Full screen map** (flow diagram): Welcome → … → Setup → Tabs → Record/Upload → Revision → Analytics/Balance
2. **Pixel-ready screens** for every screen listed above, including key states
3. **Shared components:** Tab bar, progress shell (onboarding), option list, primary/secondary buttons, status chips, Post hero card, Post row, sheets, revision card, teleprompter chrome, empty states
4. **Motion notes:** onboarding progress, estimate number, keep-clip success, tab transitions, sheet
5. **Design tokens:** color, type scale, spacing, radii, elevation — one coherent system

Match the **jobs** of the current product; freely upgrade look, layout, and delight. Prefer one strong composition per first viewport (especially Welcome and Home). Brand (Noni) must read as hero-level on Welcome — not a tiny nav label.

Start with Welcome + Save your progress + Setup checklist + Home (next post hero) + Record (one clip) + Changes requested on assignment detail, then fill the rest of the map.
