# Noni admin rebuild

You are rebuilding the admin side of Noni. Read this whole document
before doing anything.

Noni is an internal iOS app (Expo, React Native, Supabase) that runs UGC
content operations for FieldVision, a college soccer recruiting app.

The loop: an admin authors 30 posts a week. Creators — real college
soccer players posting from their own TikTok and Instagram accounts —
record them. The admin approves. The system edits and posts through
Upload-Post, never platform APIs directly. Humans appear at authoring,
at approval, and once more to approve music on slideshows.

Content formats are video AND photo_carousel. Never assume video-only
anywhere.

---

## HOW TO BUILD THIS

Eight agents, in separate sessions.

```
Agent 1 (data model) ─┬─ Agent 2 (generation) ── Agent 3 (setup/grid/editor) ── Agent 4 (review/publish)
                      ├─ Agent 5 (Library)
                      ├─ Agent 6 (Creators/messaging/approvals)
                      ├─ Agent 7 (notifications/analytics)
                      └─ Agent 8 (video + slideshow pipeline)
```

Agent 1 runs alone and finishes first. Then 2, 5, 6, 7, 8 run in
parallel. Agent 3 waits for 2. Agent 4 waits for 3.

Create `HANDOFF.md` in the repo root. Every agent reads it first and
appends before reporting done:

```
## Agent N — <name> — <date>
Done: <what shipped, by file>
Schema touched: <tables and columns added or changed>
New shared helpers: <path, what it does>
Deviations: <what changed and why>
Left open: <what the next agent needs>
```

Agents in separate sessions cannot see each other's work. This file is
the only thing keeping them consistent.

### Rules for every agent

- Stay in your scope. If you need something another agent owns, stub it
  and note it in HANDOFF.md.
- Every table and query scoped by `company_id`. No exceptions.
- Third party keys in edge function env only, never in the app.
- Task status changes only via `lib/tasks.ts`.
- Noni database work goes through the Supabase CLI link, **never the
  Supabase MCP**. The MCP points at the FieldVision product database,
  which is a different Supabase project. A previous agent hit this and
  could not read the tables it expected.
- Existing briefs must stay editable throughout. If your change breaks
  them, build a legacy path.
- Do not touch: Upload-Post integration internals, payouts, Stripe, the
  `scrape-trends` / `generate-script` / `auto-fill` pipeline, or the ten
  seeded `product_features` claims.
- `ingest-codebase` is deployed but deliberately dormant. No token, no
  UI, do not wire it up.
- Run `npx tsc --noEmit` before reporting done.

### Before writing code

Read the actual code in your scope. Report: anything here that
contradicts it, column or function names this doc got wrong, what breaks
for existing data, and anything you need that another agent owns. Then
propose a file-by-file plan and wait for confirmation.

Items marked **[confirm]** are recommendations, not decisions. Ask before
building them.

---

## WHAT IS ALREADY SHIPPED

Migrations through 026. `ingest-brief` with `validateBrief`. A query bank
(`search_queries`, 12 seeded). An admin Features screen backed by
`product_features` with ten approved FieldVision claims, plus
`ingest-features` for extracting claims from screenshots and pages.
`publish-campaign` and `_shared/shuffle.ts` for weekly fan-out.

## WHAT IS WRONG

Generated briefs read as ad copy instead of speech. Diagnosed by
measuring eleven real transcripts — six from the two current creators,
five from a benchmark account in an adjacent category that reached $100k
ARR — against a failed generated draft:

| | real posts | the bad draft |
|---|---|---|
| product first mentioned | 9 to 83% through | 82% |
| credential in opening | 8 of 11 | absent |
| "you" per 100 words | 5.2 to 6.2 | 3.0 |
| speakers | always 1 | 2 |

**Not signals. Do not build rules around these:** filler word rate,
named entity density, sentence length. The bad draft matched real speech
on filler exactly.

The flow is also the wrong shape. It authors one brief at a time from a
pasted URL. It needs to author a week.

---

## ADMIN TABS

**Review · Briefs · Library · Creators · Analytics**

Calendar stops being a tab and becomes a view toggle inside Briefs. The
current Create tab becomes Briefs.

---

## POST TYPES

Seed a `post_types` table. Eight types:

| type | family | talking points | clips |
|---|---|---|---|
| numbered_list | video | 3 to 10 | hook + N + outro |
| talking_head | video | 3 to 5 | hook + N + outro |
| explainer | video | 3 to 5 | hook + N + outro |
| contrast | video | 4 to 6 | hook + N + outro |
| replay_bait | video | 1 | 1 |
| numbered_tips | photo_carousel | 3 to 10 | 1 slide per point |
| how_to | photo_carousel | 3 to 7 | 1 slide per point |
| getting_started | photo_carousel | 3 to 7 | 1 slide per point |

**contrast** covers red flags vs green flags, D3 commit vs D1 commit, 10
offers vs 0 offers. Single speaker alternating between the two sides.
Never two people talking.

**replay_bait** is one 6 to 9 second clip carrying on-screen text that
takes slightly longer to read than the clip runs, so the viewer loops
it. No plug, no credential. Both exemptions live on the type.

**Clip count is derived from the type and never set by a human.** A 5
tips video is 7 clips. Change it to 4 tips and it becomes 6.

---

## BRIEFS: WEEK SETUP

Three stepped screens with next buttons. The only stepped flow in the
product — it runs once a week so it can afford ceremony. Nothing else
can.

**Screen 1, ratio.** Two editable numbers, default 20 videos and 10
slideshows.

**Screen 2, video types.** The 20 splits across the five video types,
prefilled and editable, must sum to the video count.
**[confirm]** default split: numbered_list 8, talking_head 5, explainer
3, contrast 2, replay_bait 2. Numbered list is heaviest because it
dominates both sets of real transcripts.

**Screen 3, slideshow types.** The 10 splits.
**[confirm]** default: numbered_tips 5, how_to 3, getting_started 2.

**These are a POOL, not a lock.** A post's type stays editable from
inside the post afterwards, and the live split updates in the grid
header so drift is visible.

---

## BRIEFS: THE GRID

Two buttons as a switcher, not a nav bar, with counts as progress:

`Videos 7/20`   `Slideshows 3/10`

Each side renders one row per post. All 30 exist from week creation,
starting `incomplete`. Nothing generates up front.

Every empty row is pre-stamped with a post type and a suggested search
phrase from the query bank — lowest `used_count` first, deduped against
this week and recent weeks. An empty row reads:

`Numbered list · video · "why am I not getting recruited for college soccer"`

That kills the blank page problem, which is the real reason 30 briefs a
week is painful.

Four row states, readable while scrolling with no legend: empty,
partial, filled-unreviewed, complete.

---

## BRIEFS: POST EDITOR

Tapping a row opens it.

**Fields:**
- `hook` — max 9 words, selected from 8 to 10 generated options, best
  first
- `talking_points` — count fixed by the post type. **Spoken content
  only.**
- `cta` — the FieldVision plug sentence, also embedded inside one
  talking point
- `caption` — under 200 chars excluding hashtags
- `hashtags` — 3 to 5
- `example_url` — optional, pulled from the Library

**Render fields live on `brief_segments`, not on talking points.**
`brief_segments` is one row per clip or slide including the hook and the
outro, and it carries `overlay_text`, `show_on_screen` (default true) and
`screenshot_url`. The reference posts put the biggest on-screen text on
the hook clip, which talking points cannot express.

There is no `briefs.slide_text`. For a carousel, a segment's
`overlay_text` is the slide copy.

The editor writes overlay toggles and screenshots as direct updates to
the `brief_segments` row. Segment derivation goes through the
`sync_brief_segments` RPC, which deliberately preserves those fields on
surviving rows across re-derives — never push toggles through the RPC
payload.

**Every post plugs FieldVision.** This is deliberate, not an oversight.
All five benchmark posts mention the product; the two current creators
mention FieldVision in five of six. These are ambassador accounts, not
brand accounts.

**The plug rides inside one talking point as a single sentence.** Never
its own talking point, never its own clip. A standalone plug beat is
what makes a post read as an ad. It must trace to an approved
`product_features` row.

**AI assist is per field and on demand,** plus a fill-whole-post action.
Nothing generates when the editor opens.

### Generation order — the current build has this backwards

1. Post type (already assigned)
2. Claim, from an approved `product_features` row
3. Search phrase
4. Talking points
5. **Hook LAST**, against the finished body — 8 to 10 variants, scored,
   best surfaced, rest retained in `hook_variants` for later hook-swap
   testing
6. Caption and hashtags

The current build generates the hook first, which is a guess about
content that does not exist yet.

Also fix in `validateBrief`: hook cap 9 words (currently 12), hashtags 3
to 5 (currently hard-fails anything but exactly 5).

**Kill rather than pad.** If a required field cannot be filled with
something concrete, return `kill_reason` and no content. The slot stays
empty with the reason shown. Hitting 30 is not worth a padded post.

---

## BRIEFS: AI REVIEW

When a post's fields are filled the admin hits Review. This is a step,
not a background check. It returns a score overall and per section —
hook, talking points, CTA — with concrete suggested edits or swaps. She
accepts, edits, or ignores each, then confirms and the post flips to
`complete`.

**Tier 1, deterministic, no model call.** Hook ≤ 9 words. Hashtags 3 to
5. Search phrase present and in the caption's first sentence. Exactly one
plug, embedded in a talking point, traceable to an approved claim.
Talking point count matches the type. Word count within the type's
`target_words_min` / `target_words_max` when both are non-null. Hedges:
really, truly, actually, honestly, simply, just, very. Two or more
adjectives on one noun.

**Second person density: warn below 4 and above 8 per 100 words.** Real
posts run 5.2 to 6.2. Generation currently comes back around 10, which
reads as a listicle lecturing the viewer rather than someone talking, and
a lower bound alone lets it pass silently.

**Tier 2, one structural model call.** Dialogue detection — more than one
speaker implied. Balanced symmetrical clauses. Three-item parallel lists
inside a sentence. Does the post deliver what the search phrase
promises.

**Tier 3, one question only:** does this read as spoken or as written?
Returns a boolean plus the single worst line quoted. Not a paragraph,
not a rating.

**Hard rules:**
- Never blocks. One tap to confirm a badly scored post, no dialog.
- Never silently edits. Suggestions offered, never applied.
- Every override writes to `brief_review_events` with which check fired.
  Note this is NOT `review_events`, which is the submission review thread
  with creator-scoped RLS.
- Every edit diff writes too. When she rewrites a generated line, the
  removed phrase appends to `brand_profiles.banned_phrases`.

The override log is the point, not telemetry. A check overridden twenty
times is a wrong check and we need to see which one.

---

## BRIEFS: PUBLISH

One publish per week. Button disabled with a count until all 30 posts are
`complete`.

- Published before Sunday 8PM EST → scheduled, creators notified Sunday
  8PM EST
- Published after → goes out immediately

Fan-out through existing `publish-campaign` and `buildCreatorWeek`,
unchanged.

---

## LIBRARY

One tab, one list, four source chips. Not four screens.

- **Ideas** — admin quick capture
- **Our posts** — every post from every creator on the roster
- **References** — external posts saved as inspiration
- **From creator** — ideas submitted by creators

**Quick capture is a text field pinned to the top of the tab.** Type,
enter, saved. No sheet, no form, no category picker. It has to work
while walking to the train. Support multiline paste creating multiple
ideas at once — the existing idea library is a Google Doc that needs bulk
importing on day one.

**Saving a reference is pasting a link,** stored with a thumbnail. If it
takes a form, the camera roll wins.

**Scale.** "Our posts" spans the whole roster, planning for ~20 creators
at 30 posts a week. Search problem, not browse problem. Default view is
top performers in the last 60 days, not most recent. Sort by
performance, filter by creator, post type and date, search on topic.

**Reachable from inside a post,** filtered to that post's type. Picking
an item fills the post or attaches as the example. Using an item marks it
used, never removes it.

---

## CREATORS

A card per creator showing money earned, posts made, and views, with a
sort control at the top. **[confirm]** what the sort control sorts by.

Tapping opens an Instagram-style profile: stats at the top, then a toggle
between calendar view and grid view of all their posts. Tapping a post
shows views, payout, saves, likes, comments, the video itself, and the
caption.

**Messaging.** One thread per creator, reachable from the top right of
creator detail. A message can carry a post reference that renders inline.
The per-post chat in Review opens this same thread scrolled to that post.
Two entry points, one system. Do not build two.

---

## REVIEW

Three queues.

### 1. Post submissions

Per segment, not per post. Approve the whole thing, or reject individual
clips with a comment. A rejected clip returns to the creator as a short
task with the comment attached and the other clips untouched.

`attempt` increments per segment so repeated redos on the same slot are
visible. That is a signal about the brief, not the creator.

### 2. Music approvals — slideshows only

After a creator marks the song added on a live slideshow (see the
slideshow pipeline below), it lands here. The admin opens the post,
confirms the song is on it, approves. That approval unlocks earnings for
that post.

Keep this queue fast. It is one tap after looking at a post, and it
happens ten times a week.

### 3. Creator account approval — once per creator

New creators must create a **fresh** TikTok and Instagram account and
warm it up before they can be assigned anything.

This matters because a new post is tested on a small pool weighted
toward existing followers. A cold account, or one whose feed is gym
content and cars, throttles every post that creator will ever make. This
gate protects every hour of authoring work downstream.

Required uploads:
- **Instagram:** 20 second screen recording scrolling home, then
  explore, then reels
- **TikTok:** 15 second minimum recording of continuous For You scrolling
- Screenshots of both profiles

The feed has to be college soccer and recruiting content.

Build it properly:
- Status machine `pending → needs_changes → approved`, with a reason on
  `needs_changes` and a resubmit path. A creator who fails with no
  feedback just messages the admin.
- **Store the TikTok and Instagram handles at this step.** Upload-Post
  needs them linked before anything can post. Approval and account
  linking are the same moment.
- Record the decision as structured data, not a free-text note, so this
  can later become an automated vision check.

### Account template, in admin Settings

The admin sets what a creator account should look like, company-scoped:
- the bio text
- the profile picture
- a screenshot of an example account

Bio one-tap copyable, picture one-tap downloadable. If a creator has to
retype a bio they will retype it wrong and then get rejected for it.
Creators see this on their account setup screen alongside the upload
requirements, so the standard is visible before they submit rather than
discovered when they fail.

---

## NOTIFICATIONS

**Admin receives:** new message from a creator, new post submitted for
review, new creator account submitted for approval, **new music approval
pending**, and a creator's post crossing **5k, 10k, 50k, 100k, 1m**
views.

**Creator receives:** new week published, a clip sent back for re-record,
**their post went live** (with links through to both platforms), and
music approved.

Milestones fire once per post per threshold and never repeat. **Store
fired thresholds on the post** so a metrics re-poll cannot re-trigger.
They come off `poll-metrics`, which already runs. Verify by forcing two
polls and confirming one notification.

The milestone is the only purely positive notification in the product.
Everything else is work.

---

## ANALYTICS

The job is to replace the spreadsheet UGC agencies live in.

The primary view is **one time series with posting activity and
conversion events on the same axis.** Tap a day, see which posts ran and
what happened. Everything else is a cut of that. Metrics: revenue,
views, likes, saves, comments over time, plus sales, new accounts and
free trials started per day against the videos posted that day.

**Report on this before building anything:** conversion events live in
the FieldVision product database, a separate Supabase project. Getting
them into Noni is a build, not a query. Find out what exists for
cross-project reads and report before designing.

**[confirm]** attribution. The CTA is "comment D1 and I'll send you the
link," so links go out by DM. Per-post tracked links will not survive
that — creators will not reliably send the right link for the right
video. Recommend per-creator tracked links plus day-level correlation,
with per-post deferred. Per creator is the decision the admin actually
makes anyway, which is who gets more work.

---

## VIDEO PIPELINE

**There is no external editing step. No CapCut, no manual export, ever.**

### Answer this before proposing a plan

Where does FFmpeg actually run today? `post-approved` is described as
doing a basic FFmpeg pass, but Supabase edge functions are Deno with no
FFmpeg binary and a short timeout. So either that pass is not really
implemented or there is a worker nobody has mentioned. That answer
decides whether stitching is an hour or new infrastructure.

### Part A — stitch and post. Ship this alone, first.

Creator submits N clips, admin approves, the system concatenates them in
slot order, applies the existing pass, and posts through Upload-Post.
Without this the loop never reaches TikTok.

**Normalize clips at capture, not at stitch time.** Concat breaks or
produces garbage when segments differ in codec, resolution, framerate, or
audio sample rate, and that drifts across iPhone models, front vs back
camera, and when AirPods connect mid-session. Pin all four on the camera
component so concat is a stream copy with no re-encode.

**Store each clip's `duration_ms` at submit time.** Overlay timing is
absolute on the timeline; without durations you are probing every clip at
render time.

### Part B — on-screen text and screenshots

Text in a solid background box positioned mid-frame, swapping per
section, plus composited image overlays. This is the InShot / CapCut
look, not burned-in subtitles.

Sources: a talking point's text renders during its clip when
`show_on_screen` is true. A talking point's `screenshot_url`, if set,
composites over that same clip.

**Timing comes free from the structure.** Each clip is one talking point,
so the text for point 4 starts when clip 4 starts. Default rule: **text
shows for the first 3 seconds of its clip**, then disappears while the
clip keeps playing. Per-clip timing override only if asked — 30 posts
times 7 clips is 210 manual decisions otherwise.

**[confirm]** Creatomate for rendering, chosen for time-to-working: the
overlay is built once in their visual editor, then every render is one
API call with variables swapped, and style changes do not need an
engineering ticket. Free trial is 50 credits, no card. A minute of 720p
is roughly 14 credits and scales with resolution, so at 1080x1920 budget
around 30 a minute. Thirty posts a week at 45 seconds is about 90 minutes
a month.

**Do not write the render service's schema into the codebase.** Store our
own timeline object — clips with durations, text elements with start and
duration, image elements with position — with a thin adapter between it
and whichever service we use. If we outgrow it we swap the adapter, not
the pipeline.

---

## SLIDESHOW PIPELINE AND THE MUSIC LOOP

**Only slideshows need a song. Videos do not.**

The API cannot attach a chosen song, and this is verified:

- Instagram's carousel music is mobile app only. Not in the API, not
  even in their own desktop uploader. `musicSoundInfo` is Reels-only;
  feed posts and carousels cannot receive audio fields.
- TikTok photo posts only support `auto_add_music`, where TikTok picks
  the track. `song_clip_id` is video-only.

A track baked into a file is not a native sound. A native sound connects
the post to the platform's sound page and puts it in the audio graph
people browse. That is the whole distribution benefit.

**Audio can be changed after publishing, so slideshows still auto post.**

- Instagram shipped Replace Audio around late July 2026 for feed posts
  and carousels. The soundtrack changes on published content and all
  engagement is kept.
- TikTok photo posts: the `auto_add_music` track can be swapped in-app
  after publishing.

**[confirm] before building:** verify Replace Audio works on the real
Instagram accounts. Sources conflict on whether carousel audio is
editable once live and it may depend on account type. If it does not
work, the fallback is creators posting slideshows manually from their
phone.

### The loop

1. Noni assembles the slides with their overlay text and any attached
   screenshots, same pipeline as video overlays.
2. Posts through Upload-Post: `auto_add_music` on TikTok, silent on
   Instagram.
3. **Creator is notified their post went live**, with deep links to the
   post on both platforms.
4. Creator opens each app, adds the song, comes back and taps a single
   **"Music added"** button. One tap, no form, no upload.
5. That notifies the admin, and the post lands in the **music approval
   queue** in Review.
6. Admin opens the post, confirms the song is on it, approves.
7. **Earnings unlock for that post only on approval.**

Do not attempt automated song detection. Official APIs do not expose
audio on carousels or on a user's own TikTok posts, and TikTok's
`auto_add_music` means a track is always technically present, so "has a
song" is always true and tells you nothing. The creator checkbox plus a
one-tap admin confirmation is faster and more reliable than anything
scraped.

Videos skip this loop entirely and are fully automatic end to end.

---

## AGENT SCOPES

**Agents 1, 2 and 3 are complete or in progress. Their sections below are
historical.** What they settled, which supersedes anything earlier in
this doc:

- Week container is `campaigns` extended with `video_target`,
  `slideshow_target`, `type_split`. No `weeks` table.
- Brief authoring overrides go to `brief_review_events`. `review_events`
  stays the submission thread and gained a nullable `segment_id` for
  per-clip rejection comments.
- Render fields live on `brief_segments`. No `briefs.slide_text`.
  `sync_brief_segments` RPC handles all derivation transactionally and
  preserves `overlay_text`, `show_on_screen` and `screenshot_url` on
  surviving rows.
- Length targets are per type via `post_types.target_words_min/max`.
  Null on both means no check. The old 300-450 global target is deleted.
- Music approval columns are on `assignments`:
  `music_marked_by_creator_at`, `music_approved_at`, `music_approved_by`.
  `milestones_fired` is an int array on `posts`.
- Credential is never generated. It renders at record time from
  `profiles.credential_line`.
- `hook_options` holds 8 to 10 strings, best first. That ordering is the
  contract with the creator app.
- Storage buckets: `brief-assets` for segment screenshots,
  `account-verification` for warm-up proof.
- Account template lives in `companies.settings` jsonb.
- The env `NONI_TEST_*` account is a creator despite its label. Mint an
  admin session via magic link, see `scripts/acceptance-agent2.ts`.

**Agent 1 — data model.** Complete. Migrations 027 and 028 applied.

**Agent 2 — generation.** Complete. `ingest-brief` rewritten with
generation key order enforcing claim → search phrase → talking points →
hooks last. `brief-assist` deployed for per-field and single-point
regeneration. Kill-rather-than-pad returns `{ kill_reason }` with no
content.

**Agent 3 — setup, grid, editor.** Complete. Week setup, the Briefs grid
with the four row states and live split, the post editor with on-demand
fill (phrase or link) and per-field regen, segments as the render
manifest, legacy sheet path, Library picker stubbed. See HANDOFF.md.

**Agent 4 — review and publish.** Complete. Three check tiers behind the
Review step in the post editor, per-section scores and apply-or-ignore
suggestions, `brief_review_events` logging with banned-phrase capture,
publish gated on every post reviewed (legacy briefs count when filled),
Sunday 8PM EST notification scheduling. See HANDOFF.md.

**Agent 5 — Library.** The tab, four chips, quick capture, multiline
paste, reference-by-link, performance sort, and the picker that opens
from inside the post editor.

**Agent 6 — Creators, messaging, approvals.** The Creators tab and
profile, one messaging thread per creator with two entry points, the
account approval queue and status machine, the account template in
Settings, and the music approval queue in Review.

**Agent 7 — notifications and analytics.** Push for admin and creator
events listed above, milestones with idempotency, the post-went-live
notification with deep links to both platforms. The time series. Report
on cross-project reads before designing.

**Agent 8 — video and slideshow pipeline.** Answer the FFmpeg question
first. Part A stitch and post, then Part B overlays, then slideshow
assembly, `auto_add_music` posting, and the creator "Music added"
button.
