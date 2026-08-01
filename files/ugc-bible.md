# UGC Bible

Version 2. Universal. Company agnostic. Identical for every tenant.

## How to use this document

Formats do not change per brand. What changes is the claim dropped into the slots and the voice it is said in. Niche truth lives in a separate per company document. Never mix the two.

Generation fills named slots. It does not write freeform. If a required slot cannot be filled with something real and specific, the idea is killed. Generation moves to the next idea rather than padding.

This file is version controlled in the repo. It is not tenant editable. Nobody's onboarding rewrites universal physics.

**Machine contract.** Parts 1 through 7 are the doctrine constant, injected into every generation and scoring call. Part 8 seeds the `formats` table, one row per format, and exactly one format spec is injected per generation call. Never inject the whole document.

**Tenant examples.** Format specs in Part 8 carry no company specific examples. Concrete examples in a tenant's voice live in `format_examples`, keyed by company, format, and slot. Appendix A holds the FieldVision seed set and is loaded as tenant data, not as universal doctrine.

**Contents**

1. Distribution physics
2. Universal rules
3. Banned constructions
4. The search layer
5. The comment engine
6. Selection rules
7. The post object
8. Formats
9. Testing doctrine
10. Cadence and mix
11. The learning loop
12. Appendix A: FieldVision seed examples

---

## Part 1: Distribution physics

Four mechanical truths. Generation never violates them to be clever.

**Completion rate is the ranking signal, not views.** The algorithm distributes on the proportion of viewers who finish, weighted alongside rewatches, saves, shares, and comments. A 15 second post that 80 percent finish beats a 30 second post that 40 percent finish, even at identical total watch time. Rough gates: 70 percent retention past 3 seconds means the post has a chance, 60 percent at 15 seconds, 50 percent at 30. Lose the first gate and nothing downstream matters.

**The decision happens in under 2 seconds.** Viewers decide to stay or swipe in roughly 1.7 seconds. The hook is not the first line of the script. It is the first frame. Text on screen from frame one, value or tension immediately, no throat clearing, no logo, no intro.

**Length is earned, never defaulted.** The primary cut of any video is 9 to 15 seconds. Go to 21 to 34 only when the format demands setup and payoff, storytime and before and after mostly, and treat that as a tested decision. The production test: if the post can be cut to 15 seconds without losing the core message, the 15 second cut is the primary.

**Saves and shares compound.** A save means the post is a reference. A share means it is an identity statement or a gift. Both extend distribution for weeks, especially on slideshows, which can pull recommendation traffic for a month after posting. Views spike and die. Saves compound. Between two ideas, pick the one someone would save.

---

## Part 2: Universal rules

**Hooks are plain, not clever.** The best performing hooks in every niche observed are flat statements of utility. The specificity lives in the topic, never in the wording. Any hook that sounds written is wrong.

**Word cap on hooks.** Nine words or fewer. Models pad with clauses. Real hooks do not.

**One optional fear parenthetical.** A short bracketed line naming the reader's fear is the only flourish that appears consistently in real posts. Four words maximum. Never more than one per post.

**Read aloud test.** If the target reader would not say the line out loud into their phone, cut it.

**Numbers beat adjectives.** Every claim that can carry a number carries one. Specific numbers read as true. Round vague quantities read as generated.

**The plug is never its own beat.** It rides inside a body item as one sentence. Never a standalone slide, item, or line.

**Plug rate.** One in four or five posts across the feed, spread and never clustered. A feed that pitches every post trains both the algorithm and the audience to treat the account as ads.

**Native or nothing.** Content must look shot for the platform. 9 by 16, platform text styles, platform sounds. Cross posted content with wrong ratios or visible watermarks gets suppressed and reads as an ad.

**Sound is mandatory.** Every post carries audio, including slideshows. Trending audio boosts distribution even when unrelated to the content. Every post specifies an audio direction: trending sound, voiceover, or both.

**Imperfection is a feature.** Clean audio and legible text, yes. But one stumble, one candid detail, one thing slightly off is what separates native from ad. Never sand a post down to smooth.

**Serialization is free reach.** Part 1 on a post that has more to say. Serialized posts also earn profile visits, which is where the follow happens.

**Retrieve, do not invent.** Hooks and phrasings are drawn from the tenant's vocabulary table and harvested hook bank wherever possible, and adapted minimally. A model recombining real speech outperforms a model producing speech.

**Kill rather than pad.** Any slot marked REQUIRED that cannot be filled with something concrete kills the idea. Generation returns the kill reason and moves on. This rule outranks throughput targets.

---

## Part 3: Banned constructions

These are hard filters applied to every generated line before it reaches a human. A hit means regenerate, not soften.

**No manufactured antagonist.** Never invent a villain who is not real and specific. "Nobody tells you" is fine. "Your coach will not tell you" is not, because it fabricates a person and an accusation. If the antagonist is real and named in the niche document, it is allowed.

**No conspiracy framing.** No secrets they don't want you to know, no what the industry hides, no they don't want you to see this.

**No adjective stacking.** One adjective per noun, and preferably zero. Insane, crazy, game changing, ultimate, essential, powerful, seamless are all cut on sight.

**No colons in hooks.** A colon is a written punctuation mark. Spoken hooks do not have them.

**No balanced sentences.** Real speech is lopsided. If a line has symmetrical clauses on both sides of a comma, rewrite it.

**No hedges.** Really, truly, actually, honestly, simply, just, very. Cut them all.

**No engagement bait phrasing that is not the format's own CTA.** No "drop a comment below," no "let me know in the comments," unless the format's comment CTA slot specifies it.

**No claims the tenant cannot make.** Every tenant supplies a banned claims list at onboarding. Violations are hard rejects, not warnings.

**Growing ban list.** Every phrase a human rewrites out of a generated hook is appended to the tenant's ban list. The list is a first class training artifact.

---

## Part 4: The search layer

Short form platforms are search engines. Search driven views compound for months while feed views die in days. Every post gets a search phrase assigned at generation time, before the script is written.

The platform indexes three layers and cross references them. A post that hits all three ranks far better than a post that hits one:

1. **Spoken audio.** Speech recognition transcribes everything said. Say the search phrase out loud in the first three seconds.
2. **On screen text.** Text overlays are read. The search phrase appears as the on screen hook or title.
3. **Caption.** The search phrase lands in the first sentence of the caption, inside a natural sentence, never stuffed.

Additional rules:

- **Hashtags: three to five, no more.** One broad, two niche, one problem or intent tag. Never generic viral tags, they signal nothing.
- **Pinned comment.** After posting, pin a comment that restates the topic with one extra keyword rich sentence. Comment text is indexed.
- **Slideshow text is indexed per slide.** Slide headers are search real estate. Write them like queries the reader would type.
- **Never bait and switch.** Pairing a trending sound or hot keyword with unrelated content tanks watch time and gets the post suppressed. The search phrase must be what the post actually delivers.
- **The search phrase is a phrase a real person types.** Validate it against the tenant's vocabulary table. If nobody in the niche uses those words, it is not a search phrase.

---

## Part 5: The comment engine

The comment section is a distribution and conversion channel, not a vanity metric.

**CTA keywords convert comments into leads.** One word, lowercase, easy to spell, niche relevant. The caption or final beat states the mechanic plainly. Every keyword comment is a captured lead and a public proof signal that pushes the post further.

**Always pair the keyword with the follow ask.** Platforms deliver messages from non followers as requests that mostly go unseen. Follow and comment, together, every time. This is mechanical, not growth hacking.

**Comment velocity in the first hour matters.** Early comments trigger wider test audiences. Several formats below are built to provoke replies: controversial tier placements, questions turned back on the viewer, one deliberately debatable item in a list.

**Reply to comments with content.** The best replies are the next post. A good question in the comments is a validated post idea, and answering it as a video reply chains distribution.

**Measurement.** For keyword CTA posts, count keyword comments. That number beats views and is directly available from a comment scrape. For everything else, rank by saves per reach, then shares, then completion. Never rank by raw views.

---

## Part 6: Selection rules

What gets made, before anything gets written.

### Format selection

Weighted by three inputs, in this order:

1. **Cadence targets** from Part 10.
2. **Tenant format performance.** Formats whose best posts beat the account average get weighted up. A format family whose best posts underperform the account average after ten reps gets benched for that tenant.
3. **Creator capability.** Hard gates, not preferences.

**Creator capability gates.** Every creator carries flags. Format selection filters on them before anything else.

- `has_credential`: required for talking_head_advice
- `has_scar_tissue`: required for mistake_callout
- `has_transformation`: required for before_and_after
- `can_film_with_second_person`: required for two_hander_comparison
- `lives_the_identity`: required for day_in_the_life
- `on_camera_comfortable`: required for all video formats

A creator who fails every video gate runs slideshow formats only. That is a viable lane, not a failure.

### Claim selection

- **Active only.** Retired claims never resurface.
- **Saturation gated.** A claim with saturation 7 or above is only usable inside myth_bust or tier_list, where the whole point is arguing with the consensus. Never as a straight tip.
- **Recency gated.** No claim reused inside 30 days for the same tenant, and never twice by the same creator.
- **Calendar gated.** A claim tied to a seasonal window is only live inside that window. Claims tied to a deadline get scheduled ahead of it, not after.
- **Proof preferred.** Between two claims, the one carrying a number or a named source wins.

### Anti repetition

- Every idea is embedded and compared against all prior drafted and posted ideas for the tenant. High similarity is rejected before scripting, not after.
- No format runs twice in a row on the same creator account.
- A winning post structure gets rerun with fresh slot fills, but its replacement is planned at the same time. Performance decays with repetition, and the library exists so the system rotates instead of grinding one format to death.

---

## Part 7: The post object

Every generation call returns this shape. Fields are universal. Slot fills are format specific.

```
{
  format_id            string, one of the twelve
  claim_id             reference to the tenant claim used
  search_phrase        string, assigned before the script exists
  hook                 string, the selected hook
  hook_variants        string[], the 8 to 10 generated, scored, retained for testing
  slot_fills           object, keys defined by the format's slot_schema
  script               string | null, for video family
  slides               array | null, for slideshow family
  caption              string, search phrase in the first sentence
  hashtags             string[3..5]
  pinned_comment       string
  audio_direction      enum: trending_sound | voiceover | both
  shot_list            string[] | null, video family
  image_direction      array | null, slideshow family, one entry per slide
  plug                 boolean
  cta_keyword          string | null
  target_length_sec    int | null, video family
  kill_reason          string | null, populated instead of content when a required slot fails
}
```

**Generation order.** Format, then claim, then search phrase, then slot fills, then hooks last and plural, then dedupe, then assemble. Hooks are generated against a finished body, never before it.

---

## Part 8: Formats

Twelve. The library is closed. Every post instantiates exactly one. New formats are added only by a human editing this document.

---

### Format 1: Two Hander Comparison

```
id: two_hander_comparison
family: video
target_length_sec: 20 to 25, hard cap 30
requires: can_film_with_second_person, product_demo
supports_cta_keyword: true
primary_signal: keyword_comments
```

Two people, one bad outcome and one good outcome. The person with the bad outcome asks how. The other demonstrates the product on screen. Ends with a keyword CTA.

**When to use.** Product demo posts. The highest intent format in the library and the closest thing to a direct response ad that still reads native. The only format where a product screen recording is mandatory.

**Why it works.** The contrast creates the curiosity gap in under two seconds, the pain detail earns the share, and the demo answers the question the viewer is already asking.

**Slots**

`on_screen_hook` REQUIRED. The contrast pair as a bare comparison, no verb. Numbers or statuses only. Under eight words.

`cold_open` REQUIRED. Casual greeting plus the setup question. Spoken, not written. Must sound like two friends. No exposition. Under ten words.

`bad_outcome` REQUIRED. The low number or bad status, delivered flatly, without self pity.

`pain_detail` REQUIRED. One concrete, slightly absurd, specific detail about how bad it is. This is the slot that carries the post and the one a model will not produce unprompted. Must be physical, specific, and verifiable sounding. Never an emotion. Never a generalization. If it cannot be filled with something real, kill the idea.

`pivot_question` REQUIRED. The bad outcome person asks how. Three to six words.

`demo_beats` REQUIRED. Min 3, max 5. Each beat is one action plus one payoff, tied to what is on screen. Never a feature list. Pattern: go to the thing, do the one action, the product returns the specific valuable output, the outcome number appears.

`cta_keyword` REQUIRED. One word, lowercase, niche relevant, easy to spell. Paired with a follow ask.

**Beat timing.** Hook text on screen frame one. Cold open inside two seconds. Pain detail by five. Pivot by eight. Demo runs the middle. CTA in the last three seconds.

**What kills it.** Explaining the product before the pivot question. Any demo beat that is a feature rather than an action. A generic pain detail. More than five demo beats. A first line that sounds scripted.

---

### Format 2: Talking Head Advice List

```
id: talking_head_advice
family: video
target_length_sec: 25 to 45
requires: has_credential, on_camera_comfortable
supports_cta_keyword: optional
primary_signal: saves_per_reach
```

One person to camera. States a credential, gives a hook, walks through three to six items. Product mentioned once inside one item.

**When to use.** Authority content. Best format for claims that need someone credible attached.

**Why it works.** The credential in the first three seconds is what makes the advice land instead of reading as generic. Every high performing example observed opens this way.

**Slots**

`credential` REQUIRED. First line, before anything else. A specific role or a specific result. Never vague authority. This slot is a casting constraint: a creator without one cannot run this format.

`hook` REQUIRED. Plain statement of what the post covers. Nine words or fewer. Doubles as the search phrase, so it is both spoken and on screen.

`items` REQUIRED. Min 3, max 6. Each item shares the same internal shape: the thing named plainly, why it happens or matters, what to do about it.

`reversal_beat` OPTIONAL but strong. One item where the advice is to flip the situation back on the other party.

`embedded_plug` OPTIONAL. One sentence inside one item, as the natural solution to that specific item. Never its own item. Never a pitch.

`close` REQUIRED. One line of summary or reassurance. Optional CTA keyword.

**What kills it.** Leading with the hook instead of the credential. A plug that is its own item. Items that do not share the same internal shape. More than six items.

---

### Format 3: Slideshow Tip List

```
id: slideshow_tip_list
family: slideshow
slide_count: 5 to 10 including cover and close
requires: none
supports_cta_keyword: optional
primary_signal: saves_per_reach
```

Static photos, one topic per slide, header plus a short body line.

**When to use.** The cheapest format to produce and the easiest to make consistent. Default for volume. Slideshows earn far more comments and saves per unit of production cost than comparable video.

**Why it works.** No performance required. Images are decorative, not illustrative. They depict the end state the reader wants. Swiping is an active behavior and every swipe registers as engagement, so swipe completion is the carousel equivalent of watch time. First and last slides matter most.

**Slots**

`cover_slide` REQUIRED. Hook text over an aspirational photo. Under nine words. Written like a query the reader would type, since slide text is indexed. Optional part number for serialization.

`body_slides` REQUIRED. Min 3, max 6. Each slide is a header of one to three words naming the category, plus one or two sentences of actual advice.

`embedded_plug` OPTIONAL. Lives inside one body slide's text, in the same breath as its advice. Never a dedicated slide.

`final_slide` REQUIRED. A close that earns the save or the follow. One line of reassurance, or a follow ask for part 2. Never a pitch.

**Production requirements.** Text baked into the image at 1080 by 1920 so compression does not blur it. Image direction per slide drawn from the tenant's shot library. Audio is mandatory.

**What kills it.** Illustrating the advice literally. Headers longer than three words. Body text longer than three lines. More than six body slides. No audio. A weak cover, since the cover decides whether the swipe ever starts.

---

### Format 4: Slideshow Question List

```
id: slideshow_question_list
family: slideshow
slide_count: 5 to 8
requires: none
supports_cta_keyword: optional
primary_signal: saves_per_reach
```

Static photos, one question per slide, plus why it works underneath.

**When to use.** Save bait. Overperforms on saves and shares because it is a reference the reader keeps, and saves carry the longest distribution tail.

**Slots**

`cover_slide` REQUIRED. The count plus the context.

`question_slides` REQUIRED. Min 4, max 6. One question per slide, in quotes, verbatim and usable exactly as written, plus two or three sentences on why asking it helps. The explanation is what earns the save.

`embedded_plug` OPTIONAL. One slide where the product is how the reader prepares or practices.

**Convention.** Where a question needs a noun the reader supplies, mark it in parentheses so it reads as a fill in template.

**What kills it.** Questions that are not literally usable as written. Explanations shorter than two sentences, which removes the save value.

---

### Format 5: Myth Bust

```
id: myth_bust
family: video
target_length_sec: under 25
requires: on_camera_comfortable
supports_cta_keyword: optional
primary_signal: shares
```

States a belief the target reader holds, kills it with a specific receipt, replaces it with the real move.

**When to use.** When the niche document contains a belief that is common, wrong, and costing the reader something. Also the safe home for high saturation claims, since arguing with the consensus is the point.

**Why it works.** The myth stated plainly in the hook creates instant recognition in believers and instant tension in doubters. Both stay. The receipt is what makes the correction land instead of reading as opinion.

**Slots**

`myth_verbatim` REQUIRED. Stated exactly the way the target reader says it or hears it, as the hook. Must be a belief real people hold. Never a strawman. If the niche document cannot supply a real common belief, kill the idea.

`correction` REQUIRED. One sentence. No hedging, no it depends.

`receipt` REQUIRED. The specific proof: a number, a firsthand result, a named mechanism. Same standard as the pain detail. Never a vibe.

`replacement` REQUIRED. What to do instead, as one to three concrete actions.

`embedded_plug` OPTIONAL. One sentence where the product is how the replacement gets done.

**Beat timing.** Myth on screen frame one. Correction by second three. Receipt by second eight. Replacement runs the back half.

**What kills it.** Busting a myth nobody holds. More than one myth per post. A receipt that is an opinion. Any superior or mocking tone toward people who believed it, since the viewer is one of them.

---

### Format 6: Mistake Callout

```
id: mistake_callout
family: video
target_length_sec: 25 to 45
requires: has_scar_tissue, on_camera_comfortable
supports_cta_keyword: optional
primary_signal: saves_per_reach
```

Mistakes I made, or mistakes everyone in this niche makes. Each mistake carries a cost and a fix.

**When to use.** Authority content when the creator has scar tissue rather than a title. The failed version of the credential format, and the best format for creators whose credibility is having been through it.

**Why it works.** Admitting cost buys trust a credential cannot. The price tag is what makes it real.

**Slots**

`standing` REQUIRED. First line. What the creator lost or went through that earns the list. Specific and costly. Never vague experience.

`mistake_items` REQUIRED. Min 3, max 5. Each item: the mistake named plainly, the cost with a number or concrete consequence attached, then the fix. The cost line is required inside every item. A mistake without a price is filler and gets cut.

`embedded_plug` OPTIONAL. One sentence inside one item, as the fix for that specific mistake.

`close` REQUIRED. One reassurance line, that the reader can still recover. Optional CTA keyword.

**What kills it.** Mistakes without costs. Generic mistakes any niche could claim. Leading with the list instead of the standing. A fix that amounts to don't do the mistake.

---

### Format 7: Storytime

```
id: storytime
family: video
target_length_sec: 30 to 60, hard cap 60
requires: on_camera_comfortable
supports_cta_keyword: optional
primary_signal: completion
```

A real narrative with an open loop hook, stakes, a turn, and a resolution.

**When to use.** The one format that earns length, because the open loop carries retention. Origin stories, transformation arcs, near miss stories.

**Why it works.** The hook states the ending without the explanation and the viewer stays to close the loop.

**Slots**

`open_loop_hook` REQUIRED. The outcome or the most dramatic moment, stated first, explanation withheld. Never start at the chronological beginning. Nine words or fewer on screen.

`stakes` REQUIRED. What the person stood to lose or wanted, in one or two lines, with a number where possible.

`beats` REQUIRED. Min 2, max 4. What happened. Each beat carries one concrete sensory or numeric detail. Pain detail standards apply to every beat.

`turn` REQUIRED. The single moment things changed. One beat, specific. If the product appears in this story it appears here, as a detail, one sentence maximum, never as the hero.

`resolution` REQUIRED. The outcome, with the number that closes the loop opened in the hook.

`lesson_line` REQUIRED. One sentence the viewer keeps. Optional CTA or part 2 tease.

**Beat timing.** Loop opens frame one. Stakes by second five. Turn no later than the two thirds mark. Resolution and lesson in the final five seconds.

**What kills it.** Chronological openings. A product that saves the day, which viewers smell instantly. Beats without concrete details. Closing the loop early. Anything over 60 seconds.

---

### Format 8: Day in the Life

```
id: day_in_the_life
family: video
target_length_sec: 20 to 40
requires: lives_the_identity
supports_cta_keyword: false
primary_signal: shares
```

Time stamped beats through a real day of the target identity.

**When to use.** Aspirational identity content. The viewer is not learning, they are trying on the life.

**Why it works.** Identity content gets shared as this is me or this will be me. The friction beat is what makes it credible instead of an ad.

**Slots**

`identity_line` REQUIRED. Who this is and what makes the day worth watching. First line.

`beats` REQUIRED. Min 5, max 8. Each beat is a time, an action, and one specific detail. Show, never narrate feelings. The detail is the content.

`friction_beat` REQUIRED. One beat where something is hard, boring, or goes wrong. This is the pain detail slot of this format. A perfect day reads as an ad and dies.

`product_beat` OPTIONAL, subject to the plug rate. The product appears inside one beat as a tool used naturally, visible for one beat only, never named with a pitch.

`close` REQUIRED. The day ends on a state, not a message. Optional follow ask for the next day.

**What kills it.** A perfect day. Narrated emotions instead of shown details. Product visible in more than one beat. More than eight beats. Beats without times.

---

### Format 9: Tier List

```
id: tier_list
family: video or slideshow
target_length_sec: 25 to 45 for video
requires: none
supports_cta_keyword: false
primary_signal: comment_velocity
```

Ranking things the niche cares about into tiers.

**When to use.** Comment bait. The format exists to generate disagreement, and first hour comment velocity is a distribution trigger. Also a safe home for high saturation claims.

**Why it works.** Everyone who disagrees with one placement comments. The controversial placement is the whole engine.

**Slots**

`category` REQUIRED. Named plainly as the hook.

`items` REQUIRED. Min 5, max 9. Things the target reader recognizes on sight.

`placements` REQUIRED. Each item gets a tier and one line of reasoning. High and low placements get the most reasoning. Middle placements get almost none.

`controversial_placement` REQUIRED. One placement the audience will fight about, held until at least the midpoint. It must be defensible, not random. Rage bait with no reasoning kills trust. If generation cannot find a genuinely debatable placement, kill the idea.

`comment_cta` REQUIRED. Ask directly what got ranked wrong.

**What kills it.** Safe rankings everyone agrees with. Equal reasoning on every item. The controversial placement inside the first three items, since viewers leave after it. More than nine items.

---

### Format 10: Green Screen React

```
id: green_screen_react
family: video
target_length_sec: under 30
requires: on_camera_comfortable
supports_cta_keyword: false
primary_signal: comment_velocity
```

Creator over a screenshot: a post, a headline, a comment, a stat, a message. Points at it, gives the take.

**When to use.** The fastest video format to produce and the best way to turn the comment section of previous posts into new content. Also the format for riding niche news.

**Why it works.** The artifact does the hooking. A real screenshot with a surprising claim is a built in curiosity gap and the take is the payoff.

**Slots**

`artifact` REQUIRED. A real screenshot, on screen from frame one. Never fabricated, never doctored. Real comments from the account's own posts are the best source. Blur names when the source is a private person.

`take_opening` REQUIRED. Agreement, disagreement, or the answer, stated in the first three seconds.

`substance` REQUIRED. Min 2, max 4 beats correcting, expanding, or answering the artifact. Numbers and named mechanisms, not vibes.

`embedded_plug` OPTIONAL. One sentence, only when the artifact is a question the product literally answers.

`close` REQUIRED. Turn it back: ask the audience their answer, or tease the next artifact.

**What kills it.** Fake or doctored screenshots. Reacting to something with no tension or question in it. A take that restates the artifact. Going past 30 seconds.

---

### Format 11: Before and After

```
id: before_and_after
family: video
target_length_sec: 21 to 34
requires: has_transformation, proof_artifact
supports_cta_keyword: true
primary_signal: shares
```

The transformation reveal. Two states with numbers, and the middle that explains the change.

**When to use.** Proof content. Use whenever a real, numeric transformation exists. Never use without one.

**Why it works.** The gap between the two numbers is the hook, the middle is the retention, the reveal is the share.

**Slots**

`before_state` REQUIRED. The starting state with a number, on screen first. Shown rather than claimed wherever an artifact exists.

`after_teased` REQUIRED. The end number appears in the hook text alongside the before, but the proof is withheld to the end. The hook is the two numbers, same construction as Format 1.

`middle_beats` REQUIRED. Min 2, max 4. What actually changed, each an action with a payoff. If the product appears it is one of these beats, never all of them. A transformation with no visible middle reads as fake and dies in the comments.

`timeframe` REQUIRED. Stated plainly. Transformations without timeframes read as scams.

`proof_artifact` REQUIRED. The after, shown: the screenshot, the letter, the stat line, the clip. Last three seconds.

`cta_keyword` OPTIONAL. Strong here, because intent peaks at the reveal.

**What kills it.** No numbers. No middle. No timeframe. Showing the after first, which closes the loop and ends retention. Claims that outrun what the proof artifact shows.

---

### Format 12: Red Flags and Green Flags

```
id: red_flags_green_flags
family: video or slideshow
target_length_sec: 25 to 40 for video
requires: none
supports_cta_keyword: false
primary_signal: saves_per_reach
```

Paired judgment list. What to avoid and what to look for in a niche decision.

**When to use.** Save bait plus comment bait in one. Use when the niche document contains a decision the reader makes under uncertainty.

**Why it works.** The reader is about to make the decision and saves the list as a checklist. One debatable flag drives the comments.

**Slots**

`decision_context` REQUIRED. The hook names the decision.

`flag_items` REQUIRED. Min 4, max 6, red or green or mixed. Each item is the flag named plainly as an observable behavior, plus one sentence of why. Flags must be things the reader can actually observe. A behavior is usable. An internal trait is not.

`debatable_flag` REQUIRED. One flag reasonable people will argue about. Same rules as the tier list controversial placement.

`embedded_plug` OPTIONAL. One sentence where the product is how the reader checks a flag.

`close` REQUIRED. Save this for when it happens. The save ask is native to this format.

**What kills it.** Obvious flags everyone already knows. Flags that are not observable. Moralizing. Mixing in flags from outside the stated decision.

---

## Part 9: Testing doctrine

The system learns by shipping variants and killing losers.

**One variable per variant.** A test changes the hook, or the pain detail, or the CTA. Never two at once. Hooks are the highest leverage variable and get tested first. Three to five hook variants on the same body is the default sprint.

**Expect a 1 in 10 hit rate.** Most posts perform at baseline. The system's job is reps and honest measurement, not perfect posts. Volume during testing beats polish.

**Diagnose by where retention breaks.** A post that loses most viewers inside three seconds has a hook problem: rewrite the hook, keep the body. A post that holds three seconds but dies at five to ten has a body problem. A format family whose best posts underperform the account average after ten reps gets benched for that tenant.

**Rank by the right signal.** Saves per reach first, then shares, then completion, then keyword comments where a CTA exists. Raw views last. Slideshow and video are ranked separately, since they have different physics.

**Human labels outrank metrics during cold start.** Post metrics arrive slowly and noisily. Accept or reject labels and human edit diffs arrive immediately and cleanly. Until a tenant has meaningful volume, labels are the training signal and metrics are confirmation.

**Every result writes back to the tenant, never to this document.** Performance per format, per hook pattern, per slot fill feeds the tenant's learnings doc and ban list. The bible stays universal.

---

## Part 10: Cadence and mix

**Default daily mix while testing.** Two to three posts per day, majority slideshows for volume, video where the format demands it. Roughly 70 percent video and 30 percent slideshow once an account matures past testing. During cold start slideshows can run higher, since production cost is near zero and their save driven tails compound.

**Plug rate holds across the mix.** One in four or five posts, spread across formats, never clustered.

**Serialization slots in deliberately.** A part 1 that performs gets its part 2 within 48 hours while the audience is warm.

**Consistency within niche is a ranking input.** Accounts that post repeatedly in one topic build topical authority in search. The system never posts off niche to chase a trend.

**Winners get remixed inside 48 hours.** See Part 11. This behavior is worth more than the discovery pipeline and requires no statistics, only a threshold.

---

## Part 11: The learning loop

The system behaves like a UGC manager who remembers everything. It does not wait for statistical significance, because at real posting volume that never arrives.

### Detecting a winner

Never an absolute number. A post is a winner when it beats a baseline, and the baseline is relative:

- **Creator baseline.** The rolling median of that creator's last 20 posts. 50k views is a hit on a small account and a miss on a large one.
- **Format baseline.** The rolling median for that format on that tenant, so a slideshow is never judged against a video.
- **Threshold.** Roughly 3x the creator baseline on the format's primary signal marks a winner. Roughly 0.3x marks a loser.
- **Signal, not views.** Judged on the format's `primary_signal` from Part 8, with saves per reach and profile clicks weighted alongside. A post with huge views and no profile clicks is not a winner and must never be treated as one.

### The remix trigger

When a post crosses the winner threshold, generate variants inside 48 hours while the audience is still warm. Four variant types, generated together:

1. **Cross creator.** The same post assigned to other creators who pass the format's capability gates. This is the cleanest experiment in the system: same idea, different person. If it wins again the idea carried it. If it dies the creator carried it.
2. **Hook swap.** Same body, new hooks pulled from the retained `hook_variants` that lost the first time.
3. **Claim swap.** Same format and same hook shape, a different claim from the same pillar.
4. **Format port.** The same claim rebuilt in an adjacent format. A video that hit becomes a slideshow, and the reverse.

### Attribution

Every post carries `generation_meta`: format, claim, hook pattern, slot fills, creator, search phrase, plug flag. Wins and losses are attributed across all of those dimensions rather than to the post as a whole.

At real volume no single dimension will be statistically clean. That is expected. The loop is a slowly improving prior, not an optimizer, and the cross creator variant is what makes attribution honest without needing large samples.

### Writeback

Results update tenant state only. The bible never changes.

- Format weights in selection shift toward what wins for this tenant.
- Winning hook patterns enter the tenant's hook bank and are drawn from first.
- Claims that produce winners get boosted. Claims that repeatedly flop get retired.
- Creator baselines and capability flags update.
- The learnings doc receives a written summary, and the ban list receives every phrase a human edited out.

### Decay and benching

- A winner may be rerun a limited number of times. Performance decays fast with repetition, and the tenant should stop reusing a structure once its variants fall below the creator baseline.
- A format whose best posts underperform the account average after ten reps gets benched for that tenant, not deleted.
- Benched formats are retried after a set interval, since audiences and platforms change.

### Cold start

Before a tenant has meaningful post volume, the loop runs on human labels and approval diffs instead of metrics. Labels are dense and immediate. Metrics are sparse and confounded. Metrics take over as confirmation only once volume exists.

---

## Appendix A: FieldVision seed examples

Tenant data, not doctrine. Loaded into `format_examples` for FieldVision at seed time and never injected as universal context.

**two_hander_comparison**
- `on_screen_hook`: 0 offers vs 12 offers. D3 walk on vs D1 commit.
- `pain_detail`: emailed 200 coaches and got two replies, both auto responses.
- `demo_beats`: upload film, the system builds the profile, it matches to schools at your level, it sends the outreach.
- `cta_keyword`: offers. film. d1.

**talking_head_advice**
- `credential`: current D1 starter. Committed with no showcase exposure.

**slideshow_tip_list**
- `cover_slide`: things to know before becoming a D1 soccer player.
- shot library: team huddle, weight room, match action, campus facility, signing day, empty stadium.

**myth_bust**
- `myth_verbatim`: you need showcase circuit exposure to get recruited.
- `receipt`: committed players from the roster who never attended a showcase, with the count.

**mistake_callout**
- `standing`: went through recruitment twice, first time got zero offers.

**storytime**
- `open_loop_hook`: a coach called me the night before signing day.

**day_in_the_life**
- `identity_line`: day in the life of a D1 soccer player during preseason.

**tier_list**
- `category`: ranking recruiting outreach methods. Ranking conference facilities.

**before_and_after**
- `before_state`: junior year, zero coach responses, the empty inbox on screen.

**red_flags_green_flags**
- `decision_context`: red flags when a college coach contacts you.
