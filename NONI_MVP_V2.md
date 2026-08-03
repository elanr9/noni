# Noni MVP v2

## The pivot

Old bet: AI runs the campaign. Ingest the company, scrape trends, auto fill queues, humans just record and approve.

New bet: AI makes the campaign manager fast. The manager still authors. AI transcribes, drafts, formats, distributes, and measures.

This is the right call. The old version required the AI to be right about strategy with zero feedback loop. The new version only requires it to be right about typing, which it always is. Everything scraping and auto fill related moves behind a flag, not out of the repo.

---

## Creator app

Three tabs: **Home**, **Calendar**, **Profile**. Nothing else.

### Home

Vertical order:

1. Streak row. Days in a row where all posts got made. Small.
2. One card. The next post to make. This is the hero and it takes most of the screen.
3. One thin line under it: "2 more today" with a chevron. Collapsed by default.

The card is a state machine and never leaves Home until it clears:

`To make` → `Recording` → `In review` → (`Changes requested` → back to Recording) → `Posted`

When it hits Posted, the next post slides into the slot. When all three clear: "Done for today" plus a peek at tomorrow's first brief.

Card actions: Record, Swap, open brief.

Swap pulls only from this week's published pool. Not from the whole backlog. Reason below.

### Calendar

- Seven day strip pinned at the top, current week.
- Below it, the three post cards for the selected day.
- Toggle for week and month.
- Past day: tap a post to see the live post, views, likes, revenue attributed, bounty status.
- Future day: brief is visible and readable. Recording unlocked for the whole week so creators can batch on a Sunday. Posting stays scheduled to the assigned day.

Batch recording is how real creators work. Do not gate it.

### Profile

One screen, sectioned:

- Avatar and name
- Earnings: available, pending, cash out through Stripe Connect
- My performance: total views, posts made, approval rate, best post
- Linked accounts: TikTok, Instagram, reconnect
- Settings, support, sign out, delete account

### Post detail

Same screen in every state. What changes is what is on it.

- Brief: format, hook, script, caption, example video embedded
- Record button when relevant
- Chat thread with the admin, always present
- Once posted: the live post embedded, views, likes, revenue attributed to it, bounty progress and payout

### Cut from the creator side

Inspiration FYP, good idea and bad idea signals, the separate Posts tab, the separate Analytics tab, swap sheets that reach outside the week.

---

## Admin app

Four tabs: **Review**, **Create**, **Creators**, **Analytics**.

### Review

This is the bottleneck and the whole product lives or dies here.

Math: 10 creators times 21 assignments each is 210 reviews a week. If a review takes 30 seconds that is nearly two hours of pure clicking. Design for three seconds.

- One submission at a time, full screen, autoplay
- Approve is a single tap or a swipe. No confirmation screen.
- Request changes requires a note. Friction belongs here, not on approve.
- Next item loads instantly underneath
- Filter by creator or by brief
- Later: auto approve for creators above an approval rate threshold

Kill the confirmation screen that exists today. It doubles the tap count for the most common action.

### Create

The week is a real object, not a pile of tasks. Call it a **weekly campaign**.

- A campaign holds roughly 30 briefs, shared across the entire creator roster, with a drop date of Sunday.
- Three ways to fill a slot: paste a reference link, write from scratch, or pull from the backlog.
- Paste link flow: URL in, transcribe the audio, OCR the on screen text, AI drafts hook, script, caption, format and a one line "why this works", admin edits inline, save. The source video attaches as the example.
- Campaign view is a grid of 30 cards. Reorder, duplicate, delete.
- Publish the campaign. Assignments generate, then push to every creator with a notification Sunday morning.

### Assignment generation

On publish, for each creator:

1. Shuffle the 30 briefs with a seed of `campaign_id + creator_id`. Deterministic, so a republish or a late brief edit never scrambles anyone's week.
2. Take the first 21 and lay them out three per day across the seven days.
3. The remaining 9 become that creator's swap pool for the week.

This gives you three things for free. Everyone works from the same 30 so brief level analytics stays clean. Nobody sees the same order, so the feed does not fill with 10 identical videos on the same morning. And swap has a natural bounded pool that requires no extra UI or rules.

The admin does not assign anything by hand. She writes 30 briefs and hits publish.

One override is worth building: pin a brief to a specific day for everyone. Launches and drops need to land together. Pinned briefs get placed first, then the shuffle fills the rest.

Every brief written is saved to the backlog permanently with lifetime performance attached. That library is the actual moat, not the scraper. After ten weeks she is mostly re-running proven briefs with new hooks instead of writing from zero.

### Creators

A sortable table. Columns: views, followers, posts completed, approval rate, revenue driven, total paid. Tap through to that creator's posts, chat history, and earnings.

### Analytics

- Totals: views, revenue, bounties paid
- Performance at the brief level, not just the post level. Which brief wins across creators is the signal worth having.
- Best hooks, best formats, best creators

### Cut from the admin side

Trends tab, auto fill cron, generate from trend, Brand Brain as a required step, the kitchen sink route.

---

## The schema change that makes this work

Today a task is a one off row. Split it into three objects:

| Object | What it is |
|---|---|
| `brief` | The creative unit. Authored once. Reusable. Has lifetime stats across every creator who ever made it. |
| `assignment` | creator x brief x date. Owns status, submission, chat thread, post link, metrics. Generated on publish, never hand made. |
| `campaign` | ~30 briefs plus a drop date and a draft/published state. |

Everything else follows from this. The backlog is just briefs not attached to a live campaign. The leaderboard is assignments grouped by creator. Brief level analytics is assignments grouped by brief. Swap trades one assignment's brief for one of the 9 unassigned briefs in the same campaign.

---

## Onboarding

Company: name, handles, done. Three screens. The brand voice gets learned from the briefs she writes, which is better data than anything an ingest job produces.

Creator: keep it as is. Name, selfie, permissions, link accounts, teleprompter practice. It is already under two minutes.

---

## What survives untouched

Teleprompter recording, multi segment takes, Upload-Post integration, review thread, push notifications, Stripe Connect and payouts, FFmpeg basic edit, company scoped RLS.

---

## Where I would push back

**1. Chat as the authoring surface.** Chat is bad at producing structured objects that need to be identical every time. She would end up re-explaining format and length in every message. Make the primary path a paste box that turns into an editable form. Add chat only as a secondary tool for bulk operations, for example "write five hook variants of this brief."

**2. Unrestricted swap.** If creators can pull anything from the backlog, the campaign stops being a campaign. Half the point of UGC is many creators making the same brief so you can tell whether the brief or the creator is carrying the numbers. Swap within the published week only.

**3. Streak as the top of Home.** Streaks are strong until someone misses a Tuesday, then they are a reason to quit. Keep it small, define breaking it generously, and let the next post card be the hero.

**4. Video and photo at once.** Ship video only. The photo carousel path touches record, edit, Upload-Post payload and schema all at once for a format that is currently stubbed everywhere.

---

## Build order

1. `brief` / `assignment` / `week` schema plus the Sunday drop job and notification
2. Admin Create: paste link, transcribe, AI draft, edit, publish week
3. Creator Home reduced to the single card, plus Calendar
4. Fast Review: one tap approve, no confirmation screen
5. Creators leaderboard and brief level analytics
6. Money: attribution, bounty thresholds, cash out

Milestones 1 and 2 are the product. Everything after is polish on things that already exist.

### Agent workflow rule

One milestone per agent session. When a milestone is finished, the agent ends the session by writing the handoff prompt for the next milestone, ready to paste into a fresh agent. The handoff prompt contains three things: the current state facts the next agent can rely on without re-reading any history, the exact scope of the next milestone, and the do-not-touch list. This keeps every session's context small and saves tokens.

---

## Open questions

1. What breaks a streak, and is there a grace day?
2. Can a creator decline a brief outright, or only swap it?
3. What happens to a brief a creator never made by end of week. Does it roll into next week, expire, or count against them?
4. Does the pool size flex with roster size, or stay near 30 regardless of headcount?
5. Can the admin edit a published campaign mid week, and do live assignments update if she does?
