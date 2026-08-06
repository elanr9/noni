# Noni: final brief generation spec

Supersedes noni-brief-rebuild-spec.md. Paste into Cursor. Read
NONI_SPEC.md first for architecture context.

Every rule below with a number attached was measured against eleven real
transcripts: six from our creators (@fabri.d1soccer, @d1withseb) and five
from @payt.yoursororitysister promoting Bidly, an account that took a
comparable app to $100k ARR. Do not soften these into prose guidance. The
numbers are the spec.

---

## WHAT WAS ACTUALLY WRONG

The first generated brief failed on five measurable counts against real
posts. This is the target profile:

| metric | real posts | the bad draft |
|---|---|---|
| length | 200 to 600 words, avg 340 | 166 |
| product first mention | 9 to 83% through | 82% |
| credential in first 35 words | 8 of 11 posts | absent |
| "you" / "your" per 100 words | 5.2 to 6.2 | 3.0 |
| speakers | always 1 | 2 |

Things that are NOT signals, do not build rules around them: filler word
rate (the bad draft matched real speech), named entities (the benchmark
account uses almost none), sentence length (the benchmark account writes
longer, smoother sentences than our own creators).

---

## PHASE 1: BRIEF REBUILD (ship this week, Tona is blocked)

### 1.1 Schema

```sql
alter table briefs
  add column hook_options   jsonb  not null default '[]'::jsonb,
  add column talking_points jsonb  not null default '[]'::jsonb,
  add column hashtags       text[] not null default '{}',
  add column search_query   text,
  add column point_count    int,
  add column target_words   int    not null default 380;

alter table profiles
  add column credential_line text,
  add column bio_facts       jsonb   not null default '[]'::jsonb,
  add column script_mode     text    not null default 'beats',
  add column available       boolean not null default true;

alter table profiles
  add constraint script_mode_valid check (script_mode in ('beats','full'));
```

`talking_points` element:

```ts
type TalkingPoint = {
  id: string;
  text: string;
  is_product: boolean;       // exactly one true per array
  edited_by_admin: boolean;
};
```

**Keep `script`.** Still required for `photo_carousel` (slide copy).
Nullable for video. Old video briefs keep theirs and the teleprompter
falls back to it when `talking_points` is empty. Nothing breaks mid week.

**Remove pin to day.** Stop writing `campaign_briefs.pinned_day`, remove
the chip row from `BriefEditSheet`, treat every brief as unpinned in
`buildCreatorWeek`. Leave the column in place, drop it later.

### 1.2 `script_mode` matters more than it looks

Fabri improvises: 10.6 word average sentences, 42 percent of them under
eight words, constant restarts. He should get beats.

The Bidly creator almost certainly reads: 17.4 word average, low
variance, 7 percent short sentences. She converts anyway.

So beats are not the cure for slop. They fit creators who can fill them.
Default to `beats`, but a creator on `full` gets a rendered script built
from the same talking points. Do not remove that path.

### 1.3 `ingest-brief` output contract

Return exactly this JSON, no markdown fences, no preamble.

```json
{
  "title": "5 reasons you're not getting recruited",
  "search_query": "why am i not getting recruited for college soccer",
  "format": "video",
  "point_count": 5,
  "target_words": 380,
  "hook_options": [
    "Five reasons you're not getting recruited for college soccer",
    "You're good enough. That was never the problem."
  ],
  "talking_points": [
    {"id":"a1","text":"Waiting to be found. Coaches are not looking for you.","is_product":false,"edited_by_admin":false},
    {"id":"a2","text":"Only targeting D1. D3 interest raises your value to D1 coaches.","is_product":false,"edited_by_admin":false},
    {"id":"a3","text":"FieldVision writes a personalized email to every school on your list and follows up until they reply.","is_product":true,"edited_by_admin":false},
    {"id":"a4","text":"Same template to 200 coaches. They talk to each other and they can tell.","is_product":false,"edited_by_admin":false},
    {"id":"a5","text":"Starting senior year. Kids committing now started two years ago.","is_product":false,"edited_by_admin":false}
  ],
  "caption": "Stop waiting to get found. Comment D1 for a free trial.",
  "hashtags": ["#collegesoccer","#collegerecruiting","#d1soccer","#ncaa","#d1athlete"],
  "why_it_works": "Answers a query recruits actually type in August.",
  "example_url": "...",
  "example_transcript": "..."
}
```

### 1.4 Generation rules (system prompt)

**Length.** `target_words` between 300 and 450, default 380. Real posts
run 206 to 608 words. That is roughly two minutes of talking, not sixty
seconds. Talking points must contain enough substance to fill it. A five
point list where each point yields fifteen seconds is the shape.

**Talking points.** Beats, not lines. Under 25 words each. A creator
reads a point and starts talking; they do not recite it. If a point reads
as a complete performable sentence with closing rhythm, compress it.
`point_count` comes from the concept: "5 tips" means 5, otherwise
default 4.

**Product point.** Exactly one has `is_product: true`. Position 3 in a 5
point list, position 3 in a 4 point list. Never first, never last.
Measured range is wide (Bidly 9 to 48 percent, ours 53 to 83) so the
middle is the safe overlap until we have attribution data.

Its text must be composed from an `approved_claims` row. The model
phrases, it does not invent capability. If no approved claim fits, set
`text` to null and add `"product_point_blocked": "no matching approved
claim"` so the admin writes it manually.

Mechanism, not benefit. "Writes and sends the emails and follows up" not
"streamlines your outreach."

**Second person.** Aim for 5 to 6 uses of "you" or "your" per 100 words.
The failed draft ran 3.0. Every strong post talks straight at one person.

**Credential.** Do NOT put it in the brief. One brief goes to the whole
roster, so a credential baked into the brief breaks the moment it is
assigned to the other creator. It renders at teleprompter time from
`profiles.credential_line`.

**Hook.** Two options, under 12 words each. Option 0 restates
`search_query` so a searcher knows they landed right. Option 1 is a
contradiction or curiosity angle. Single speaker only. No "Wait what?",
no second voice, no dialogue, ever.

**Caption.** Under 200 chars excluding hashtags. Exactly 5 hashtags from
`hashtag_bank`, chosen by topical fit, not the same 5 every time.

**Format.** Map to one of the four formats below. If the source post uses
something else (two hander skits, POV sketches, green screen reacts), map
to the nearest listed format rather than copying its structure.

1. Numbered advice list. Credential opener, numbered items, product mid
   list. Default format, highest volume.
2. Personal anecdote into product. Real conversation, the mistake it
   exposes, the fix.
3. Question answer explainer. A question people keep asking, answered
   from lived experience on both sides.
4. Product as source. "I asked FieldVision what my chances at MIT are,
   here's what it said." The tool generates the value instead of being
   advertised after it. Underused, highest intent.

**Carousel.** When `format = 'photo_carousel'`, return talking points
(they become slides) AND populate `script` with slide by slide overlay
copy, one slide per point.

### 1.5 Validator (build this, do not rely on the prompt)

`supabase/functions/_shared/validateBrief.ts`. Runs on every draft before
it returns. On failure, retry the Claude call once with the failure list
appended. On second failure, return the draft with a `warnings` array so
the admin sees what is off rather than getting nothing.

Hard fails:
- more than one speaker implied (regex for quoted dialogue markers,
  "wait what", "so you're telling me", alternating question and answer)
- `talking_points` length not equal to `point_count`
- not exactly one `is_product: true`
- product point at index 0 or last index
- hashtags length not equal to 5, or any not in `hashtag_bank`
- caption over 200 chars, hook option over 12 words
- product point text not traceable to an approved claim id

Soft warnings:
- estimated spoken length outside 300 to 450 words
- second person density under 4 per 100 words
- any talking point over 25 words

Log every validation result to a `brief_validations` table with the
brief id, the failures, and whether the retry fixed it. That log is how
you find out which rules are actually load bearing.

### 1.6 UI

**BriefEditSheet.** Remove pinned day chips and the video script
textarea. Add: hook A / B radio with both editable; talking point list
with drag reorder, inline edit, add, delete; the product point rendered
with a distinct border and an FV tag so Tona finds it instantly (editing
it sets `edited_by_admin`); hashtag chips, 5 shown, tap to swap;
`search_query` as a small field under the title. Keep title, format
toggle, caption, why_it_works.

Validation before save: title present, at least 2 points, exactly one
`is_product`, exactly 5 hashtags.

**Teleprompter.** Video on `beats`: render `credential_line`, then the
chosen hook in full, then the numbered points, all static on screen. No
scrolling prose. Video on `full`: render the old scrolling script built
from the points. Carousel: unchanged. Fallback: `talking_points` empty
and `script` present renders the old view.

---

## PHASE 2: QUERY BANK (build immediately after phase 1)

This is higher leverage than the repo ingest and it is why Bidly works. A
647 follower account converted because every video answers a query
someone types with a deadline. Her titles are search strings: "What to
expect during PREFERENCE ROUND", "Let's talk RUSH TERMINOLOGY", "Reasons
you may not get asked back to a house."

Right now `search_query` is a text field, which means it only works when
Tona already knows the query. Fix that.

```sql
create table search_queries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  query        text not null,
  source       text not null,          -- 'manual' | 'autocomplete' | 'comments'
  season_start int,                    -- month 1-12, null = year round
  season_end   int,
  used_count   int not null default 0,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index on search_queries (company_id, used_count);
```

Seed manually for FieldVision: how to email college coaches, what to put
in a recruiting email, are ID camps worth it, how to make a highlight
video, when do coaches start recruiting, NCSA review, is NCSA worth it,
best D1 schools for soccer, walk on vs scholarship, how to get recruited
as a junior, D2 vs D1 soccer, college soccer recruiting timeline.

Then add a third entry point on Create: "Draft from a query." Admin picks
an unused query, `ingest-brief` runs the same generation path with no
source URL, `search_query` prefilled. Sort the picker by lowest
`used_count` so the long tail gets covered.

Later: mine autocomplete and your own post comments to grow the bank
automatically. Do not build that yet.

Note the seasonality difference. Rush spikes hard in August and
September. Soccer recruiting runs on softer windows across the year, so
tag queries with commitment windows rather than expecting one peak.

---

## PHASE 3: REPO INGEST (build last)

New table:

```sql
create table product_features (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null,
  what_it_does text not null,
  claim        text not null,
  surface      text,
  source       text not null,          -- 'repo' | 'manual' | 'site'
  source_ref   text,
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on product_features (company_id, approved);
alter table product_features enable row level security;
```

**Seed ten claims manually before phase 1 ships**, or the product point
blocking rule fires on every brief in week one.

New edge function `ingest-codebase`, following `_shared/wp8.ts` patterns.
Input `{ company_id, repo_url }`, GitHub token from edge env only. Fetch
the repo tree, filter to routes, page components, API handlers and docs,
skip node_modules, lockfiles, tests, migrations, anything over 100KB.
Chunk, one Claude call per chunk, dedupe by name, one merge pass. Insert
with `source = 'repo'`, `approved = false`.

Extraction prompt:

```
You are reading a product codebase to build a claim library for short
form video ads. For each user facing capability, return:

name          what an admin would call it
what_it_does  one sentence, mechanism only. What happens, not what it
              means for the user.
              GOOD: "Writes personalized emails to every coach on a
                     target list and follows up automatically."
              BAD:  "Streamlines outreach so you can focus on the game."
surface       route or screen name if identifiable, else null
claim         one line a 20 year old could say on camera without sounding
              like an ad. Under 20 words. No seamless, powerful,
              revolutionary. No three item lists.
source_ref    file path

Only things a user can actually do. Skip internal utilities, admin
tooling, auth plumbing, anything behind an off feature flag. If unsure it
ships, leave it out. Return a JSON array and nothing else.
```

Admin Features screen: unapproved rows with approve / edit / reject.
**Nothing generated on camera without a human approving it.** A model
reading route files will confidently surface dead code.

Set expectations: a codebase tells you what exists, not what is worth
saying. The best angle in Tona's brief doc is "NCSA charges 5k for
mass-produced emails," which came from market knowledge, not a route
file. This function's job is preventing invented features, not producing
good ideas.

---

## `loadBrandContext` CHANGES

```ts
{
  ...existing,
  approved_claims:  ProductFeature[],   // approved = true only
  hashtag_bank:     string[],
  voice_exemplars:  string[],           // raw creator transcripts
  format_library:   FormatSpec[],
}
```

Add `hashtag_bank text[]` to `brand_profiles`, seeded in `brand-ingest`
from the company's own captions. FieldVision seed: `#collegesoccer
#collegerecruiting #d1soccer #ncaa #d1athlete #soccertraining
#collegesoccerrecruiting #scholarship #fieldvision #d1`.

**Voice exemplars come only from people who will actually perform.**
Format donors like Bidly go in the trends `format_donor` corpus, never in
`brand_docs.voice`. Mixing them contaminates the voice with someone
else's cadence. That separation already exists in `scrape-trends`, keep
it.

---

## OUT OF SCOPE

Do not touch `post-approved`, Upload-Post, `poll-metrics`, payouts,
Stripe, `lib/tasks.ts` transitions, or the Path B trends pipeline
(`scrape-trends`, `generate-script`, `auto-fill`).

Do not change company_id scoping on any query, RLS policies, or where
third party keys live. Support video AND photo_carousel throughout.

---

## BUILD ORDER

1. Phase 1 migration plus ten manually seeded `product_features` rows.
2. `loadBrandContext` extension.
3. New `ingest-brief` contract and prompt.
4. `validateBrief` plus the `brief_validations` log.
5. `BriefEditSheet` rewrite.
6. Teleprompter with fallback.
7. Strip pinned day from the publish flow last, so the week keeps
   publishing while everything else lands.
8. Phase 2 query bank.
9. Phase 3 repo ingest.

---

## WHAT TO MEASURE AFTER THIRTY POSTS

Every number above is derived from eleven transcripts, which is enough to
start and not enough to be right. Once thirty posts have run, check the
product point position and the CTA placement against trial signups per
post, not views. Views will mislead you: Bidly's median video does under
2,000 and the account still converted, because a girl searching
"philanthropy round questions" in August is a buyer and a viral view is
not.
