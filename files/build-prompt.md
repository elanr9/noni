# Build prompt: Inspiration Engine

Attach `ugc-bible.md` with this prompt.

---

## What we are building

A system that generates UGC posts for a company without a human coming up with ideas.

The core insight: there are only about twelve kinds of short form UGC post. They are written down in `ugc-bible.md` and they never change per company. Each one is a fill in the blank form with named slots. What changes per company is what goes in the blanks.

So generation is: pick a format, pick something to say, fill the slots. Never freeform script writing. If a REQUIRED slot cannot be filled with something real and specific, kill the idea and move on rather than padding it.

The bible is universal and lives in the repo, version controlled, not tenant editable. Everything company specific lives in tenant tables.

**Do not build:** anything that discovers new formats, query regeneration from a thin brand profile, ranking by raw views, or freeform generation that skips the slot schema.

## How to run this build

Seven workstreams. Workstream A must be completed and merged first because everything else depends on its schema and shared helpers. B through G can then run in parallel with separate agents.

Every agent reads this whole document plus the bible before starting, and confirms its contract back before writing code.

---

## Workstream A: Foundation

**Blocks everything. Do this first, alone.**

Goal: schema, seed data, and shared helpers that every other workstream builds on.

Build:
- All migrations for the tables described in the Data model section below.
- A seeding script that parses Part 8 of the bible into the `formats` table. Twelve rows, slot schemas as JSONB with stable slot keys. Strip Appendix A out of the universal seed and load it into `format_examples` for FieldVision as tenant data.
- The doctrine constant: bible Parts 1 through 7 as a compact versioned file in `_shared`, plus a helper that assembles prompt context. The helper must inject the doctrine constant plus exactly one format spec, never the whole bible, never all four brand docs.
- The post object type from bible Part 7, shared across generation and admin.

Done when: `formats` has twelve seeded rows, the context helper is importable, and the post object type is exported.

---

## Workstream B: Onboarding

Goal: a company gives a repo link, a site link, documents, and social handles. The system derives everything else with no interview.

Build:
- Input intake for repo URL, site URL, uploaded docs, social handles.
- Repo reader. README, package manifests, feature modules, pricing logic, onboarding copy. This is the highest signal input for what the product actually does.
- Site and document crawler for positioning and audience.
- Product truth synthesis into `brand_docs`.
- Niche identification from the derived product plus the company's own social follow graph.
- Account universe discovery: who they follow, who their audience follows, and search on the derived niche terms. Writes `source_accounts` with `corpus = niche`.
- Every derived row carries a confidence score. High confidence goes live. Low confidence lands in a review queue.
- Banned claims list. This is the one thing that cannot be derived and must be confirmed by a human. Treat violations as hard rejects downstream, never warnings.

Done when: a repo plus a site plus handles produces populated brand docs, an identified niche, a seeded account universe, and a review queue.

Target: under ten minutes of human attention, spent reviewing rather than answering questions.

---

## Workstream C: Scraping and extraction

Goal: turn scraped posts into structured, reusable material.

Two corpora, never mixed. `format_donor` accounts are best in class UGC accounts from any vertical and teach structure only. `niche` accounts teach claims and vocabulary only.

Build:
- Handle first scraping. Search and hashtags are fallback only.
- Hard dedupe on platform plus post id, plus near duplicate detection on transcript or slide text. One viral post reposted by ten accounts must not appear ten times.
- Video transcription. Vision OCR on slideshow images, capped at the first four slides, cached by image hash.
- Comment scraping, including CTA keyword counts per post.
- **Format classification.** For each kept post, identify which of the twelve formats it instantiates and extract `slot_fills` against that format's schema. This is how donor posts become usable and how `format_examples` gets populated automatically.
- **Claim mining**, niche corpus only. Comment questions and repeated complaints become candidate claims. Recurring phrasings feed `vocabulary`. Candidates require review before going active.
- **Saturation scoring.** Count topic frequency across the niche corpus, write back to `claims`.
- Relevance gate scoring each candidate against the audience doc plus golden set few shot examples. Below threshold items are stored and hidden, never deleted.
- Account health: track keeper rate per source account and auto mute accounts that keep producing junk. Discovered accounts get a probation state that is actually scraped, not muted into a deadlock.

Done when: a scrape run produces classified posts with slot fills, populated format examples, candidate claims, vocabulary entries, and saturation scores.

---

## Workstream D: Generation

Goal: produce post objects by filling slots.

Pipeline, in this exact order:
1. Select format. Weighted by cadence targets from bible Part 10, tenant format performance, and creator capability gates from Part 6. Capability gates are hard filters applied before anything else.
2. Select claim. Active, low saturation, not used recently, live in the current calendar window.
3. Assign the search phrase before the script exists. Validate it against `vocabulary`.
4. Fill slots. Output must match the format's slot schema exactly. Context is the doctrine constant, one format spec, the claim row, that tenant's format examples for that format, the voice doc, and a vocabulary sample.
5. Generate hooks last and plural. Eight to ten variants against the finished body, scored against the Part 2 hook rules, the Part 3 banned constructions, and the vocabulary list. Keep the best, retain the rest for testing.
6. Dedupe. Embed the idea and compare against everything previously drafted or posted for this tenant. Reject before scripting.
7. Assemble the post object from bible Part 7.

Also build:
- The banned constructions filter from Part 3 as a hard reject that triggers regeneration, not softening.
- Kill behavior: when a REQUIRED slot cannot be filled, return `kill_reason` instead of content.

Done when: generation returns valid post objects for all twelve formats, honors capability gates, and kills rather than pads.

---

## Workstream E: Admin app

Goal: a human runs the whole operation from one place, and every human touch is captured as training data.

This workstream splits cleanly into two agents. E1 is the weekly review cycle. E2 is the dashboard. They share the schema in the data model section and nothing else.

### E1: The weekly review cycle

This is the operating rhythm of the product. Content is planned, reviewed, and approved a week at a time. Full automation comes later, and only for archetypes that have proven out. Until then a human approves everything.

The cycle:

1. **Friday night.** A cron job generates next week's batch for every creator, filling the cadence mix from bible Part 10. Creates a `weekly_batch` row with status `in_review` and a `content_task` per planned post, each with a `scheduled_for` date.
2. **Saturday morning.** Push notification to the admin: next week's posts are ready to review. Deep links straight into the review queue.
3. **Admin reviews.** Every task shows the format, the claim it came from, the hook and its alternates, the full script or slide set, the shot or image direction, the caption, hashtags, pinned comment, the assigned creator, and the scheduled day.
4. **Admin acts on each task.** Four actions:
   - **Approve.** Moves to `approved`, then `scheduled`.
   - **Edit then approve.** Inline editing on every field. The generated version is already snapshotted in `original_draft`, so the diff is captured automatically.
   - **Reject.** Requires a one line reason, stored. Rejected drafts are retained as training data and never deleted.
   - **Regenerate.** Same format and claim, fresh fills. Counts as an implicit reject on the previous version.
5. **Comment back to the creator.** Threaded comments per task, admin to creator and back. This is how shot direction and corrections get communicated. Creators see comments on their task view and can reply.
6. **Batch approval.** The week is not published until the batch is approved. Show a progress indicator: how many tasks reviewed, how many left. Approving the batch flips remaining approved tasks to `scheduled`.
7. **Nudges.** If the batch is still `in_review` by Sunday evening, notify again. Never auto approve.

Requirements:
- Swipe or keyboard driven review. An admin should clear thirty tasks in under fifteen minutes.
- One tap hook swap: the alternate hooks generated in Workstream D are shown as options, so fixing a weak hook is a tap, not a rewrite.
- A visible flag on any task where a banned construction or a banned claim was caught and regenerated, so the admin knows what the filter is doing.
- Every edit appends the replaced phrasing to the tenant ban list.

### E2: The dashboard

One admin home screen plus the supporting views.

**Home.** This week at a glance: posts scheduled, posts awaiting review, posts live, and the top performer since last check. A single prominent call to action when a batch needs review.

**Calendar.** The core view. A month or week grid showing every post by day, colour coded by status and by creator. Overlaid on the same axis: daily views and daily sales or signups. This is the correlation view, so a spike in signups sits directly under the posts that ran that day. Clicking any day opens the posts that went out.

**Creators.** A row per creator: capability flags, posts this week, rolling baseline, recent performance against that baseline, which formats they run well, outstanding comments. Clicking through gives their full history and their task queue.

**Campaigns.** A campaign groups tasks over a date range with a goal. Shows spend if relevant, posts, aggregate views, saves, profile clicks, and attributed signups. Enough to tell whether a campaign worked.

**Performance.** Sortable table of every post: format, claim, hook, creator, views, saves, profile clicks, keyword comments, and the primary signal for its format. Ranked by the primary signal, never by raw views. Filterable by format, creator, and date.

**Library management.** Brand docs editor with four tabs marking `human_edited`. Claims table with add, edit, retire, saturation, and last used. Format examples grouped by format. Source accounts with corpus, status, and keeper rate. Banned claims and the ban list.

**Labeling.** Thumbs plus a one line reason on every trend item and every draft, available from both the inspiration feed and the review queue.

**Onboarding review.** The queue of low confidence derived rows from Workstream B, plus mandatory banned claims confirmation before a tenant can publish anything.

Done when: an admin can run a full week end to end from the app, and every approve, reject, edit, and comment lands in the database as structured training data.

---

## Workstream F: Learning loop

Goal: the system behaves like a UGC manager who remembers everything. Bible Part 11 is the spec.

Build:
- Metrics ingest, including saves and profile clicks, not just views.
- Rolling baselines per creator and per format. Winners and losers are relative to baseline, never absolute numbers.
- **Winner detection** on the format's primary signal, weighted with saves per reach and profile clicks. A post with huge views and no profile clicks is not a winner.
- **Remix trigger** firing inside 48 hours, generating four variant types: cross creator, hook swap, claim swap, format port. The cross creator variant is the cleanest experiment in the system and must be built.
- Attribution across `generation_meta` dimensions.
- Writeback to tenant state only: format weights, hook bank, claim boosts and retirements, creator baselines, learnings doc, ban list. The bible is never written to.
- Decay and benching rules.
- Cold start mode: run on labels and approval diffs until post volume exists.

Done when: a winning post automatically produces variants and shifts future selection weights.

---

## Workstream G: Regression harness

Goal: know whether a change made things better or worse.

Build:
- A local script that runs the current gate prompt and current brand docs against a labeled holdout set and reports agreement.
- Label 60 to 80 items. Use 30 as few shot examples in the gate prompt. Hold the rest back as a test set the model never sees.
- Report agreement on the holdout only. A regression that tests on its own few shot examples is worthless.
- Run after any brand doc edit or prompt change.

Done when: a brand doc edit that hurts quality is caught before it ships.

---

## Data model

Confirm this back before implementing.

**Universal, seeded from the bible, identical for all tenants**

`formats`: `id` slug, `name`, `family` enum video or slideshow, `when_to_use`, `why_it_works`, `slot_schema` jsonb as an ordered array of slots each with `key` `label` `required` `rules` `min` `max`, `kill_rules` text[], `beat_timing`, `target_length_sec`, `slide_count`, `requires` text[] capability flags, `supports_cta_keyword`, `primary_signal`.

**Per tenant**

`brand_docs`: `product_truth`, `audience_niche`, `voice`, `learnings`. Human owned except learnings.

`claims`: `claim`, `contradicts`, `audience_segment`, `proof`, `saturation_score` 0 to 10, `source` enum, `status` enum, `last_used_at`, `confidence`.

`format_examples`: `company_id`, `format_id`, `slot_key`, `example`, `source` enum admin or harvested.

`vocabulary`: verbatim audience phrases.

`calendar_events`: seasonal anchors that gate which claims are live.

`banned_claims`: human confirmed, hard reject downstream.

`ban_list`: phrases humans edited out, grows automatically.

`creators`: capability flags `has_credential`, `has_scar_tissue`, `has_transformation`, `can_film_with_second_person`, `lives_the_identity`, `on_camera_comfortable`, plus rolling baselines.

`source_accounts`: `corpus` enum format_donor or niche, `status` including probation, `keeper_rate`, `last_scraped_at`.

`trend_items`: `format_id`, `slot_fills` jsonb, `relevance_score`, `relevance_reason`, `label`, `label_reason`, `is_golden`, `format`, `image_urls`, `slide_texts`, `caption`, `cta_keyword_count`.

`content_tasks`: the post object, plus `generation_meta` jsonb with format, claim, hook pattern, creator, search phrase, plug flag, and `original_draft` for diffing at approval. Adds `status` enum draft, in_review, approved, rejected, scheduled, posted; `scheduled_for` date; `weekly_batch_id`; `reject_reason`; `filter_flags` text[] recording any banned construction or banned claim caught during generation.

`weekly_batches`: `company_id`, `week_start` date, `status` enum generating, in_review, approved, published, `generated_at`, `reviewed_at`, `reviewed_by`. One per company per week.

`task_comments`: `task_id`, `author_id`, `author_role` enum admin or creator, `body`, `created_at`. Threaded admin to creator communication on a specific post.

`post_metrics`: `task_id`, `captured_at`, `views`, `saves`, `shares`, `comments`, `profile_clicks`, `link_clicks`, `keyword_comment_count`, `completion_rate` where available. Profile clicks and saves are required, not optional. Ranking on views alone is explicitly wrong.

`revenue_events`: `company_id`, `date`, `signups`, `revenue`, `source` where attributable. Powers the calendar overlay that sits sales against posts and views on the same axis.

`campaigns`: `company_id`, `name`, `goal`, `starts_on`, `ends_on`. Tasks reference a campaign optionally.

---

## Contracts between workstreams

- A owns the schema. B through G do not alter it without going back to A.
- C writes `format_examples`, `claims`, `vocabulary`, `trend_items`. D reads them.
- D writes `content_tasks` and `weekly_batches`. E and F read them.
- E1 owns task status transitions, `task_comments`, `original_draft` diffs, and the ban list. Nothing else writes task status.
- E2 is read only over everything except the library management tables it edits directly.
- F reads `post_metrics` and `revenue_events`, writes tenant weights, hook bank, claim state, creator baselines, and the learnings doc only. It never writes to the bible or to human owned brand docs.
- Only approved and scheduled tasks are ever published. No path exists that publishes a task that skipped review.

Confirm your workstream contract and flag anything that conflicts with the existing schema before writing code.
