# 05 — Creator briefs, creative strategy, company discovery and the "company brain"

Research date: 18 November 2026. Scope: what the AI core of a UGC platform for SaaS and app companies needs in order to (a) ask the right onboarding questions, (b) store what it learns, and (c) generate and grade creator briefs.

## How to read this

- **Evidence quality is uneven.** Almost everything published on UGC briefs is written by vendors (UGC marketplaces, agencies, analytics tools). Where several independent vendors agree, I treat the point as common practice. Statistics from these sources are mostly unverifiable and I flag them.
- **Confidence labels:** **High** = several independent practitioner sources agree, or primary text (Apple, TikTok, FTC, Meta). **Medium** = one strong practitioner source or consistent vendor consensus without data. **Low** = single vendor claim, or my own synthesis.
- **"Synthesis"** marks design recommendations that are mine, built on the sources, and not something a source states.
- Motion's creative-strategy library now redirects from motionapp.com to runneth.com; the URLs below use the address that actually served the content.

## Contents

1. Creator briefs: anatomy, scripting level, failure modes
2. The strategy layer: from product knowledge to angles (a method an AI can follow)
3. Discovery: master question bank, the founder's short list, survey UX
4. The company brain: entities, fields, provenance, contradictions
5. SaaS and app specifics
6. Evaluation: gates, rubrics, good and bad examples
7. Disagreements and open questions
8. Implications for the three deliverables

---

## 1. Creator briefs

### 1.1 What the sources agree on

| Point | Confidence | Sources |
|---|---|---|
| One page (two at most), readable in under two minutes. Studio briefs run 20–50 pages; creator briefs must not. | High | Billo, Insense, Segwise |
| One objective, one audience, one takeaway, one CTA per video. Extra messages become separate videos. | High | Twirl, Billo, inBeat |
| Bullet talking points beat word-for-word scripts for delivery. Full scripts are for compliance wording, technical accuracy, set processes or a tested hook sequence. | High | inBeat, Twirl, Insense, Segwise |
| Split the brief into fixed and open parts: "Must include / Useful context / Creator choice" (Twirl) or "Musts / Maybes / Don'ts" (Segwise). | High | Twirl, Segwise |
| Musts are few: 3–5 (inBeat) or 5–6 (Segwise). | High | inBeat, Segwise |
| Give 2–3 hook options, each a line plus an opening visual, that test different ideas and not rewordings. | High | inBeat, Insense, Segwise |
| Reference videos (2–4 native organic posts in the niche) do more than adjectives. | Medium | Segwise, Insense |
| Describe the audience as a person in a situation or a subculture, with a real customer phrase, not as an age and income range. | Medium | inBeat, Segwise |
| Legal terms, pay and usage rights live in a separate contract; the brief only states what affects filming. | Medium | Segwise (inBeat keeps a short usage section in the brief) |
| Review only against the musts, the facts and the legal list. Everything else is taste. One consolidated round, two at most. | Medium | Segwise, inBeat |
| Ask for modular footage: several hooks, a core body, demo clips, proof clips, two CTAs, plus raw A-roll and B-roll. | Medium | inBeat, Insense |

### 1.2 Section-by-section anatomy

The union of the inBeat, Insense, Twirl, Segwise and Collabstr templates, reordered so the creator reads what changes their filming first.

| # | Section | What goes in it | Fixed or open | SaaS/app note |
|---|---|---|---|---|
| 1 | The job of this video | One line: who should do what after watching (install, start trial, visit link). Placement: organic post, Spark/partnership ad, or asset-only. | Fixed | Placement changes caption rules: Spark Ad captions come from the organic post; non-Spark ad captions carry no links or hashtags (inBeat). |
| 2 | Who it is for | One viewer in one situation, the problem or desire, the main doubt, one verbatim customer phrase. | Fixed (context) | Use the customer's words for the problem, never the product's category name. |
| 3 | The one thing to land | A single sentence the viewer should be able to repeat. | Fixed | Phrase as an outcome the viewer can picture on a screen. |
| 4 | Creator's role and format | Customer, expert or friend; format (problem-solution, demo, first impression, day-in-the-life, comparison, reaction). | Open within a named format | For B2B, "peer who does this job" beats "customer". |
| 5 | Hook options | 2–3 options, each with spoken line, opening visual and on-screen text. Marked as suggestions. | Open | At least one hook must not name the product or category. |
| 6 | Beats | Timed story beats (hook, problem, show it, result/objection, CTA). Not a line-by-line script. | Open wording, fixed order only if the concept depends on it | See the 20–40 second structure in section 5. |
| 7 | Must show | The on-screen moments: which screen, which action, which end state, for how long. | Fixed | The single most important section for software. Specify the "proof frame" (the end state that proves the promise) first. |
| 8 | Must say | Product name once, the approved benefit, offer terms, any exact compliance wording. | Fixed | Pronunciation of the product name belongs here (Twirl). |
| 9 | Must avoid | Unsupported outcomes, regulated claims, competitor names, unsafe or misleading demos, private data on screen. | Fixed | Add: notifications, real customer data, internal dashboards, licence keys (Billo). |
| 10 | Talking points | 3–5 short facts to say in the creator's own words. | Open | Each one should be a workflow moment, not a feature name. |
| 11 | Look and setting | Where it would naturally be filmed, light, framing, what the phone or laptop screen needs to look like. | Open, with a few rules | Screen legibility rules: crop to the controls, enlarge small text, hold the final state (TokPortal). |
| 12 | References | 2–4 links, each with one line saying what to borrow. | Context | Label each: "borrow the opening", "borrow the pacing". |
| 13 | CTA and destination | What the viewer does, where they land, the offer, the code. Described by meaning unless exact wording is required. | Fixed meaning, open wording | See section 5.6 for link-in-bio and code mechanics. |
| 14 | Deliverables and specs | Count, length, 9:16 1080×1920, safe zones, audio rule, captions, file naming, raw footage. | Fixed | Recording environment: device, OS, browser, orientation, test account, plan tier (Billo). |
| 15 | Disclosure and rights | Disclosure wording and toggle, music rule, usage scope, posting requirement. | Fixed | TikTok: commercial-content disclosure setting; commercial music library or original voice only for commercial use (Segwise). |
| 16 | Review | Dates, number of rounds, who approves, what review will check. | Fixed | State that review checks the musts and nothing else. |

inBeat's own worked hook table is a good pattern to copy into the generation prompt, because it forces a line and a visual per hook and forces different ideas:

| Hook type | Line | Opening visual |
|---|---|---|
| Problem | "I stopped carrying a full makeup bag for one reason." | Creator empties an overfilled bag onto a table |
| Discovery | "This is the travel case I wish I had years ago." | Product opens toward the camera |
| Demonstration | "Watch how much this tiny case actually holds." | Fast close-up of products being packed |

### 1.3 What separates native video from a stiff ad

inBeat names four signals viewers read as "ad": a product-first opening, claim-shaped sentences, the same look across creators, and a disclosure that reads like a pasted footer. The causes are upstream: line-by-line scripts, mandatory phrases, growing brand-safety lists where every reviewer adds a restriction, and layered review edits where "whoever edits last ends up writing the script".

Motion's Voice and Copy Standards add the language side, which matters directly for an AI that writes briefs, because creators mirror the brief's register: "Avoid adspeak, since creators will mirror it." Its rules:

- Write at a 6th–7th grade reading level. One idea per sentence. Break up anything over about 20 words.
- Run the out-loud test: if a person filming on their phone would not say it, cut it.
- Banned words include leverage, utilize, showcase, transform, seamlessly, robust, innovative, streamline, game-changer, journey.
- Banned structures include "Are you tired of…?", "Not only X but also Y", "Whether you're X or Y", three matched clauses in a row, and rhetorical questions as transitions.
- For UGC specifically: start mid-thought, round numbers casually, include the real-life reason the person needed the product.

inBeat's side-by-side lines (skincare, but the pattern transfers):

| | Scripted | Native |
|---|---|---|
| Opening | Open with the product on a white surface for three seconds | Open the way your audience expects |
| Language | Say "powered by a patented formula" | Describe what you noticed after two weeks, in your own words |
| CTA | Say the discount code in the final five seconds | Mention the offer once, link in the caption |
| Review | Brand approval on every line | Review against three musts |

**One real disagreement.** Several templates still instruct "product visible in the first 3 seconds" (Insense, Twirl) and Google's ABCD guidance asks for the brand in the first five seconds. Creators quoted at Mumbrella360 single out exactly that rule ("logo within the first three seconds") as the cookie-cutter requirement that strips the story out, and inBeat lists a product-first opening as an ad signal. For organic creator posts the creator-side view is the better default; for paid direct-response edits the early-product rule has more support. **Synthesis:** make "product on screen by second N" a per-placement setting, default off for organic, on (5 seconds) for paid cuts, and get both from one shoot by asking for an alternative opening.

### 1.4 How much to script, by creator and by risk

No source gives a rigorous skill-based rule. Twirl says nothing about skill; inBeat tiers by follower count and then warns that follower count should not set prescriptiveness. The usable rule from the sources is about **risk and format**, not skill: "Expand creative freedom where delivery matters and narrow it where accuracy, regulation, or safety is at risk" (inBeat).

**Synthesis — a scripting dial with four levels, chosen from two inputs (creator experience and claim risk):**

| Level | What the creator receives | Use when |
|---|---|---|
| 0 Prompt | Outcome, one message, musts, don'ts, references | Experienced creator with an established format and real product use; low-risk category |
| 1 Beats | Level 0 plus timed beats and 2–3 hook options | Default for most creators and most SaaS/app briefs |
| 2 Talking track | Level 1 plus suggested wording per beat, marked "say it your way", with fixed lines flagged | New creators, technical products, a sequence that must be right, non-native speakers |
| 3 Script | Word-for-word lines, teleprompter-ready, with fixed lines flagged | Regulated claims (finance, health), exact offer terms, a proven hook sequence being replicated, on-screen "say this" recording modes |

Rules that hold at every level:

- Fixed lines are always marked and always few. Everything else is explicitly labelled as changeable.
- A Level 3 script still has to pass the out-loud test and should be written in the creator's vocabulary, not the website's.
- Let the creator propose a different hook or format. Twirl lists "the creator cannot suggest a different hook, format, or story" as a sign of over-scripting, and inBeat cites a figure that 65% of influencers want early involvement (unverified).
- Real use before filming. inBeat recommends one to two weeks of use for physical products; for software the equivalent is a guided first session that reaches the aha moment, with a seeded demo account.

### 1.5 What creators complain about

| Complaint | Source | What the generator should do |
|---|---|---|
| Vague direction ("make it fun", "be natural and show the product") | Billo, Insense | Never emit an adjective without a reference or an example line |
| Missing essentials: value proposition, audience, platform format | Billo | Hard gate: no brief leaves without sections 1–3, 7, 13 |
| "Authentic" asked for, polished ad expected | Billo | State the polish level and show a reference at that level |
| Overload: every feature, too many scenes, a 30-second video that needs two minutes | Billo, Twirl | Word and scene budget check against target length |
| Internal jargon ("CAC optimisation", "retention funnel") | Billo, Segwise | Jargon filter using the glossary's internal-only list |
| Word-for-word scripts copied from the website | Twirl, Insense, inBeat | Scripting dial; similarity check against website copy |
| Full rewrites after delivery; fragmented feedback from several reviewers | inBeat, Clip | Review against musts only; one owner |
| Usage rights raised after delivery; Spark code requested after posting | Segwise, inBeat | Rights and authorisation in the first brief |
| No stated posting deadline | HireInfluence | Date and time zone always present |
| Subjective notes ("make it pop") | Segwise | Feedback must cite a must or a don't |

Statistics in circulation ("51% of creators quit deals over tight briefs", "93% of marketers say creators' own voice performs best") come from aggregator posts and could not be traced to a primary source. Do not quote them in product copy.

### Sources for section 1

- inBeat, TikTok UGC brief template with examples: https://inbeat.agency/blog/tiktok-ugc-brief-template
- inBeat, why creator content reads like an ad: https://inbeat.agency/blog/creator-content-feels-scripted-how-to-brief-for-native
- Insense, UGC brief template: https://insense.pro/blog/ugc-brief
- Billo, UGC brief mistakes: https://billo.app/blog/ugc-brief-mistakes/
- Twirl, briefing without over-scripting (Aug 2026): https://www.usetwirl.com/post/how-to-brief-ugc-creators-without-over-scripting
- Segwise, what to cut and add in TikTok briefs: https://segwise.ai/blog/briefing-ugc-creators-tiktok-what-to-cut-add
- Collabstr, how to brief a UGC creator: https://collabstr.com/blog/how-to-brief-a-ugc-creator
- SideShift, UGC creative brief: https://sideshift.app/blog/ugc-creative-brief
- Motion, Voice and Copy Standards: https://runneth.com/library/frameworks/voice-copy-standards
- Influencer Marketing Hub, brief mistakes: https://influencermarketinghub.com/ugc-brief-mistakes/
- Clip, why brands keep getting bad UGC: https://useclip.com/why-brands-keep-getting-bad-ugc
- HireInfluence, TikTok creator brief: https://hireinfluence.com/blog/tiktok-creator-brief-what-to-include-and-what-to-cut/

---

## 2. The strategy layer: from product knowledge to angles

### 2.1 The frameworks practitioners actually use

**Motion's Creative Strategy Engine** (the most complete public statement of the matrix, High confidence that it reflects current practice among performance-creative teams). The hierarchy:

Pain or desire → Persona → Messaging angle → Awareness stage → Creative mechanic → Hook → Visual format

- **Anchor on pain by default**; anchor on desire only for aspirational products with no acute functional problem.
- **Personas are life contexts** in which the same pain is experienced differently. 3–5 per pain. Many-to-many.
- **A messaging angle** is "the core truth" for one pain × persona intersection, in conversational language. It is built by answering four questions: how this person experiences the pain (use case), their deepest desired outcome, which features and benefits rank highest for them, and what they would specifically doubt.
- **The angle stays constant; its expression changes by awareness stage** (Schwartz's five: unaware, problem-aware, solution-aware, product-aware, most-aware).
- **Hooks are an execution layer**: 3–5 per angle per stage, each using a different tactic.
- **Formats are grouped by purpose**: educate/reveal, compare/demonstrate, prove/build trust, drive action.

**Motion's eight hook triggers**: pattern interrupt, identity call-out, pain agitation, curiosity gap, social proof, contrarian/myth-busting, aspiration, urgency/stakes. The best hooks combine two. A video hook has three channels (spoken, visual, on-screen text) that must reinforce one promise. Bad patterns: opening with the brand name, "Introducing…", hooks that could apply to any product, and one trigger type across a whole set. (Motion's wider library lists 33 hook tactics and 45+ visual formats; the eight are the core set.)

**Hook rules by awareness stage** (Motion):

| Stage | Rule |
|---|---|
| Unaware | Do not mention the product or hint at a solution. Describe a situation so exactly it feels like mind-reading. |
| Problem-aware | Agitate the pain; do not soften it. |
| Solution-aware | Differentiate against what they have already tried. |
| Product-aware | Remove the specific objection; add proof. |
| Most-aware | Lead with the offer. |

**Schwartz's market sophistication** is a separate axis that many 2026 posts blur with awareness. It asks how many similar claims this audience has already heard: (1) state the claim; (2) enlarge the claim; (3) introduce a mechanism; (4) elaborate the mechanism; (5) identify with the prospect instead of claiming. Most consumer app categories that run UGC (calorie counters, AI note-takers, budgeting, language learning, habit trackers) are at stage 4–5, which is why "it uses AI" is no longer a hook and identity and experience hooks dominate. (My summary of *Breakthrough Advertising*; the search results were secondary.)

**April Dunford's positioning** supplies the differentiation chain the angles hang from: competitive alternatives (what the customer would do if you did not exist, including spreadsheets, hiring someone, and doing nothing) → unique attributes → the value those attributes enable → the customers who care most → market category. Start from alternatives, not from the customer.

**Jobs-to-be-Done, four forces** supplies the switch story: push of the situation, pull of the new solution, anxiety about the new, habit of the present. Each force maps to a content job: push → problem hooks; pull → outcome and demo; anxiety → objection-handling beats; habit → comparison and "you don't have to change X" lines.

**StoryBrand** supplies a guard against the most common founder error: the customer is the hero, the product is the guide. In UGC the creator plays the hero who found a guide. Its three problem levels (external, internal, philosophical) are a quick way to deepen a pain beyond the functional.

**Message mining.** Motion's Review Audit is the most operational public method: score each review 1–5 for specificity and emotion; discard 1s; use 2–3s only to confirm patterns; pull quotes only from 4–5s; tag into five buckets (pain points, trigger moments, objections, transformations, standout language); keep quotes exact; if there are fewer than 20 reviews say so; never invent a theme. Motion's Reddit method: search pain phrases without brand names, capture quote, emotion and hook potential in a table, and click through to the verbatim text instead of trusting an AI summary. Brennan Tobin, in Motion's 2026 survey report: "When I do deep research, I don't want vague summaries that gloss over what matters."

**Competitor teardown** (Motion): identify direct, alternative-solution and aspiration competitors (4–6); capture positioning, audience, 2–4 recurring angles, ad formats and hooks, strengths, gaps; map on two axes; name 3–5 opportunities; avoid echoing saturated angles; label inferred versus verified.

**Platform pressure toward real diversity.** Meta's 2025–26 retrieval changes (commonly called Andromeda) reward ads that differ in concept, persona and format and treat near-duplicates as one ad; Ads Manager now exposes a creative similarity signal (secondary sources; Medium confidence). Advantage+ app campaigns accept up to 50 creatives and list diversification first. The practical consequence for a generator: variation must happen at the angle and format level, not the wording level.

**How practitioners use AI here** (Motion survey, 380+ DTC marketers, self-reported): 82% use AI for ideation, 76% for research, 61% for briefing, 25% for evaluation. Satisfaction is 7.7/10 for brainstorming and 4.2/10 for production. The stated failure is that loose summaries flatten the nuance that drives creative, and the stated fix is verbatim sources, structured inputs and human judgment at decision points.

### 2.2 A step-by-step method an AI can follow

Each step names its inputs, its output object in the brain (section 4), and its stop condition.

**Step 0 — Facts before strategy.** Build a facts-only product catalogue: what the product is, platforms, features, plans, prices, trial terms, stated claims with their wording, stated audience. Record only what a source states; mark anything inferred. (Motion's Product Catalog rule: if a field can be answered with "so what?" it is not a fact and belongs downstream.) Output: `ProductFact`, `Feature`, `Offer`, `Claim`.

**Step 1 — Alternatives and the differentiation chain.** List what the customer would use otherwise (named competitors, generic tools, a manual workaround, doing nothing). For each, write: what it does well, where it fails, and which of our attributes answers that failure. Derive `unique attribute → enabled value → who cares most`. Output: `Alternative`, `Differentiator`. Stop if no attribute is unique against any alternative: flag to the human, because every angle downstream will be generic.

**Step 2 — Mine voice of customer.** Sources in priority order: support tickets and sales-call notes (if supplied), app store reviews (ours and competitors'; 3-star and 4-star reviews carry the most specific language), Reddit and niche forums, G2/Capterra/Trustpilot, social comments on our and competitors' posts, onboarding-survey answers. Apply the 1–5 quality score. Tag each quote: bucket (pain, trigger, objection, transformation, standout language), JTBD force (push, pull, anxiety, habit), emotion, persona guess, source URL, date. Never paraphrase inside the quote field. Output: `VoiceOfCustomerQuote`.

**Step 3 — Cluster into pains and desired outcomes.** Group quotes. Name each pain in the customer's words. Record frequency, intensity (emotional language, workarounds tried, money or time lost) and which alternatives it attaches to. Add the three StoryBrand levels where the quotes support them. Output: `Pain`, `DesiredOutcome`. A pain with no quotes is a hypothesis and is stored as one.

**Step 4 — Personas as contexts.** For each strong pain, find 3–5 life or work contexts in which it shows up differently. Each persona gets: the situation, the trigger moment, the vocabulary, where they spend time online, and the creator who would be a credible peer. Output: `Persona`.

**Step 5 — Demo-able moments.** For every feature, ask: is there a 3–8 second on-screen sequence with a visible before and after? Record start state, action, end state (the proof frame), seconds to complete, whether sample data is needed, and what must not be on screen. Rank by visual payoff and by link to a top pain. Output: `DemoMoment`. This step is what most strategy frameworks, built for physical products, lack.

**Step 6 — Angles.** For each priority pain × persona, answer Motion's four questions and write one conversational sentence. Attach: the differentiator it rests on, the proof points that support it, the objection it must survive, the demo moment that shows it, and its angle family (transformation, identity, mechanism, objection reversal, social proof, comparison, offer-led, urgency). Output: `Angle`. Reject an angle that a named competitor could run unchanged.

**Step 7 — Stage and sophistication.** For each angle decide which awareness stages it will be expressed at, and set the category's sophistication level once. Low budget or new account: start at problem-aware and solution-aware. Organic creator posts skew unaware and problem-aware because the feed is cold. Output: fields on `Angle` and `Concept`.

**Step 8 — Concepts.** A concept = angle × stage × format × creator archetype × demo moment. Generate a deliberately diverse slate: no two concepts share both angle and format; cover at least three angle families and three formats; include at least one concept with no product mention in the hook. Output: `Concept`.

**Step 9 — Hooks.** 3–5 per concept, each with spoken line, opening visual and on-screen text, each using a different trigger (or pair). Use mined phrases verbatim where they fit. Apply stage rules. Output: `Hook`.

**Step 10 — Grade and prune** using the concept rubric in section 6. Kill, fix or keep.

**Step 11 — Brief.** Render surviving concepts through the anatomy in 1.2 at the scripting level from 1.4. Run the brief rubric.

**Step 12 — Tag everything shipped.** Every video carries: persona, pain, angle, stage, format, hook trigger, demo moment, creator, CTA type, length. Without these tags the performance data cannot teach the system anything.

**Step 13 — Read performance by layer.** Diagnose in order, because each metric points to a different layer:

| Signal | Layer at fault | Next move |
|---|---|---|
| Low 3-second hold / thumb-stop | Hook (visual first, then line) | New hooks on the same body |
| Good hold, steep drop mid-video | Body: demo too slow, too many points | Shorten, move proof frame earlier |
| Good completion, low profile visits or clicks | CTA or relevance (wrong persona, wrong stage) | Change CTA; re-target persona |
| Good clicks, low installs or trials | Store page or landing page, or promise mismatch | Fix destination; check claim against product |
| Installs but no activation | Angle attracts the wrong user | Retire or reframe the angle |
| Comments ask "what app is this?" | Product under-named | Add name on screen; pin comment |
| Comments say "ad" | Native feel | Loosen script; change opening |

Comment quality is a real signal: Cal AI's team reportedly used comment sections ("thank you for this", detailed product questions) as their main conversion read once install spikes became unattributable at scale (FunnelFox write-up; Medium confidence).

**Step 14 — Write learnings back.** A learning is a claim with evidence: "For persona X, pain-agitation hooks beat curiosity hooks on 3-second hold, n=14 videos, Sept–Oct 2026". Store with sample size and date; decay it. Feed winning hooks, formats and phrases back as few-shot references, and feed confirmed losers as negative examples.

**Iteration cadence.** A common operator pattern (Superscale, vendor source, Low–Medium): 5 concepts on one pain; keep the top 2; test 5 hooks on the winner with the body unchanged; scale; refresh when the click rate falls about 30% from peak. Sarah Levinger's caution in Motion's report applies: "Science needs a hypothesis" — every test should name what it is testing.

**A counterpoint worth keeping.** At least one practitioner argues pain-first concepts can be unstable and that forward-looking, "thinking out loud" creative does better. Cal AI's reported best performers "barely mentioned the app" and rode formats creators already made ("what I eat in a day"). **Synthesis:** the matrix is for coverage and learning, not a formula; always include concepts that start from the creator's existing native format and insert the product as a moment.

### Sources for section 2

- Motion, Creative Strategy Engine: https://runneth.com/library/frameworks/creative-strategy-engine
- Motion, Hook Writing: https://runneth.com/library/frameworks/hook-writing
- Motion, Review Audit: https://runneth.com/library/frameworks/review-audit
- Motion, Competitor Analysis: https://runneth.com/library/frameworks/competitor-analysis
- Motion, Creative Analysis: https://runneth.com/library/frameworks/creative-analysis
- Motion, Product Catalog: https://runneth.com/library/frameworks/product-catalog
- Motion, Reddit mining tutorial: https://motionapp.com/library/talk/how-to-mine-reddit-for-meta-ad-gold-no-budget-needed/
- Motion, "AI divide" survey report: https://runneth.com/thumbstop-pulse/ai-divide
- Creative OS, 3×3×3 multiplication: https://creativeos.beehiiv.com/p/128-the-creative-multiplication-strategy
- Jon Loomer on Meta Andromeda and diversification: https://www.jonloomer.com/meta-andromeda/
- Darkroom on Andromeda retrieval: https://www.darkroomagency.com/observatory/meta-andromeda
- Segwise on Advantage+ app creative limits: https://segwise.ai/blog/meta-andromeda-2-0
- Swipefile, five stages of market sophistication: https://swipefile.com/5-stages-of-market-sophistication/
- Selzee, five levels of awareness with example hooks: https://selzee.com/eugene-schwartz-5-levels-of-awareness
- April Dunford positioning summaries: https://commoncog.com/obviously-awesome/ and https://wynter.com/post/product-positioning
- JTBD four forces: https://jobstobedone.org/the-four-forces/ ; switch interview: https://jobstobedone.org/switch-interview/
- Koji, switch interview questions by force: https://www.koji.so/visuals/switch-interview-questions-push-pull-anxiety-habit
- FunnelFox on Cal AI: https://blog.funnelfox.com/cal-ai-influencer-marketing/
- Superscale, UGC guide for app founders: https://superscale.ai/learn/ugc-videos-complete-guide-for-app-founders-2025/

---

## 3. Brand and product discovery

### 3.1 What good intake looks like

I found no canonical UGC-agency intake form in public. The most useful public models:

- **Motion's Brand Intake**: ask only eight things, all in one message (name, URL, which products, focus, audience details, competitors, constraints, existing creative), then research nine areas from the web (story, catalogue, differentiation, competitors, the "old way", audience, voice, inferred constraints, strategic context), then return a document where every constraint is labelled **Confirmed** or **Inferred**, gaps are flagged, and the user is asked one closing question: does anything look off or missing?
- **Twirl's seven questions** for a brief: who it is for, what problem, the main message, what the viewer must see, the CTA, required claims, claims to avoid.
- **JTBD switch questions** (Koji's bank): "When did you first realize you needed something different?", "What had to be true for you to start looking?", "What did you imagine using it for?", "What worried you about switching?", "Did anything almost make you not buy?", "What did you have to give up?"
- **Dunford's opening move**: list your happiest customers; what would they have used if you did not exist?
- **A caution** from one agency critique: heavy questions about past performance anchor the new strategy to the past. Ask about past content last and briefly.
- **Survey design rule** from progressive-profiling guides: for each question, name the screen or output where the answer changes something; if you cannot, delete the question.

### 3.2 Master question bank

Legend for the last column:

- **Auto** — infer and use without asking; show in the review screen.
- **Confirm** — infer, pre-fill, ask the human to confirm or edit.
- **Human** — cannot be reliably inferred; ask.
- Inference sources: **W** website, **S** app store listing and reviews, **C** codebase or product build, **So** social accounts, **R** third-party reviews and forums, **D** docs/help centre, **$** billing or analytics integrations.

#### A. Product and how it works

| ID | Question | Why it matters for generation | Inferable? |
|---|---|---|---|
| A1 | In one plain sentence, what does it do and for whom? | Seeds every brief's "one thing"; tests whether the generator can say it without jargon | Confirm (W, S) |
| A2 | What does a user do in the first session, step by step? | Defines what a creator can film on day one | Confirm (C, D, S screenshots) |
| A3 | Which platforms (iOS, Android, web, desktop, extension)? | Decides device shown and store CTA | Auto (W, S, C) |
| A4 | What inputs does the user need to bring (data, accounts, files, a team)? | Flags demos that need seeded data or cannot be shown solo | Confirm (C, D) |
| A5 | What is the output or artefact a user ends up with? | The thing to show when the UI is dull | Confirm (C, W) |
| A6 | What does it replace or sit alongside in the user's day? | "Old way versus new way" formats | Human (partly R) |
| A7 | What category would a customer type into search or the App Store? | Vocabulary for solution-aware hooks; caption keywords | Confirm (S, W) |
| A8 | What can it not do that people assume it can? | Prevents overclaiming in scripts | Human |
| A9 | What is changing in the next 90 days (launches, removals, pricing)? | Freshness; avoid briefing a feature about to change | Human |
| A10 | Integrations and requirements (accounts, permissions, hardware) | On-screen moments, objections | Auto (W, C, D) |

#### B. The aha moment and features worth showing on screen

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| B1 | What is the moment a new user says "oh, that's good"? What is on screen at that instant? | The proof frame; the centre of every demo | Human (C and $ can propose candidates) |
| B2 | How long from opening the app to that moment? | Whether it fits a 20–40 second video uncut | Confirm (C) |
| B3 | Which three features make people tell a friend? | Prioritises demo moments | Human (R, S reviews suggest) |
| B4 | For each, the exact screen path to reach it | Shot list accuracy | Auto (C, D) |
| B5 | Which screens look best? Which look bad or are being redesigned? | Avoids filming weak UI | Human |
| B6 | Is there a demo account or sample data creators can use? | Removes private-data risk; makes demos repeatable | Human |
| B7 | What must never appear on screen (customer data, internal tools, unreleased features)? | Must-avoid list | Human |
| B8 | Which features sit behind the paywall or a higher plan? | Prevents showing something a trial user cannot get | Auto (C, W pricing) |
| B9 | Is there a physical-world trigger for use (a receipt, a meeting, a gym session)? | Hands-and-object formats; settings | Confirm (W, R) |
| B10 | Any feature that is impressive but slow, flaky or rate-limited on camera? | Avoids failed takes and misleading speed-ups | Human |

#### C. Ideal customers, personas and their language

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| C1 | Describe your three happiest customers: who they are and the situation they were in when they signed up | Persona contexts (Dunford, JTBD) | Human |
| C2 | Who pays, who uses, who recommends? (B2B) | Who the video is talking to | Human (W hints) |
| C3 | What words do customers use for the problem? Paste a message, review or call note. | Verbatim language for hooks | Confirm (R, S) — human paste is higher value |
| C4 | Where do they hang out online (subreddits, creators, hashtags, communities)? | Reference sourcing, creator matching | Confirm (So, R) |
| C5 | Who is a bad-fit customer you do not want? | Negative targeting in hooks; avoids churn-prone installs | Human |
| C6 | Which segment do you most want more of in the next quarter? | Prioritises the matrix | Human |
| C7 | Markets and languages | Creator locale, claims rules | Confirm (W, S) |
| C8 | Age range and any under-18 exposure | Policy and platform restrictions | Confirm (S age rating) |

#### D. Pains, jobs and desired outcomes

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| D1 | What was happening in the customer's life or work the day they went looking? | Trigger moments make the best openings | Human (R suggests) |
| D2 | What had they already tried, and why did it fail them? | Solution-aware hooks | Confirm (R) |
| D3 | What does the problem cost them (time, money, embarrassment, stress)? | Stakes | Confirm (R) |
| D4 | What does "it worked" look like one week and three months in? | Outcome claims; before/after | Human (R suggests) |
| D5 | What do they feel about the problem that they would not say to a colleague? | Internal-problem hooks | Human / R |
| D6 | When and where do they use the product (commute, desk, kitchen, bed)? | Setting and B-roll | Confirm (R, $) |
| D7 | What job are they really hiring it for (functional, emotional, social)? | Angle families | Confirm |

#### E. Alternatives, competitors and switching

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| E1 | If you did not exist, what would your customers use? Include spreadsheets, a person, nothing. | Dunford's starting point; the "old way" | Confirm (R, W comparison pages) |
| E2 | Named competitors, and which one you lose to most | Teardown targets | Confirm (W, S "you might also like", R) |
| E3 | Why do people switch to you? Why do they switch away? | Differentiators and objection pre-emption | Human (R suggests) |
| E4 | What can you say that no competitor can truthfully say? | The uniqueness test for angles | Human |
| E5 | May creators name competitors? Compare directly? | Comparison formats; legal | Human |
| E6 | Which competitor content do you admire or dislike? | References and anti-references | Human |

#### F. Proof

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| F1 | Numbers you can stand behind (users, ratings, time saved, results), each with a source and date | Proof points; each becomes a `Claim` with substantiation | Confirm (W, S) — substantiation is Human |
| F2 | Testimonials you have permission to quote, and in what form | Social-proof formats | Human (permission) |
| F3 | Press, awards, notable customers, investors, certifications | Authority beats | Auto (W) with Confirm |
| F4 | Typical result versus best result | FTC "typical results" issue | Human |
| F5 | Founder story or origin worth telling | Founder-led and story formats | Confirm (W about page) |
| F6 | Screens, charts or artefacts that are proof in themselves | Visual proof | Human / C |

#### G. Objections

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| G1 | The top three reasons people hesitate or do not convert | Objection beats; product-aware hooks | Confirm (R, S low-star reviews) |
| G2 | Your honest best answer to each | Prevents the generator inventing rebuttals | Human |
| G3 | What do people misunderstand about the product? | Myth-busting hooks | Human / R |
| G4 | Privacy, security or trust worries | Sensitive in finance, health, AI | Confirm (W, S privacy label) |
| G5 | What do skeptical comments on your posts say? | Comment-reply video formats | Auto (So) |

#### H. Pricing, offer, trial and conversion path

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| H1 | Plans and prices, per market | CTA accuracy; Apple treats a false price in marketing as grounds for removal | Auto (W, S, C, $) |
| H2 | Free tier or trial: length, card required, what is included | "Free" claims must be exact | Confirm (C, S, W) |
| H3 | Where should a viewer go: store page, website, waitlist, demo booking? | CTA and destination | Human |
| H4 | Creator codes or links: do you support them, what do they give, where are they entered? | Code mechanics in the brief | Confirm (C, $) |
| H5 | What happens between install and paying, step by step? | Avoids promising something the funnel does not deliver | Auto (C) |
| H6 | Current promotions and their end dates | Freshness of offer lines | Human / $ |
| H7 | What do you count as a conversion for this programme? | Objective line; learning loop | Human |
| H8 | Refund or cancel terms you want stated or not stated | Compliance | Human |

#### I. Brand voice and personality

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| I1 | Pick where you sit on: funny–serious, casual–formal, irreverent–respectful, enthusiastic–matter-of-fact | Tone line in briefs | Confirm (W, So) |
| I2 | Three accounts or brands whose voice you would like to be mistaken for; three you would hate to be | References beat adjectives | Human |
| I3 | Words and phrases you always or never use; how the name is written and pronounced | Glossary; must-say | Confirm (W) — pronunciation is Human |
| I4 | Humour, swearing, slang, memes: how far is fine? | Creator freedom boundaries | Human |
| I5 | How do you talk about competitors and about the problem's seriousness? | Tone guardrails | Human |
| I6 | May creators be critical or mention a downside? | Believability; honest-review formats | Human |

#### J. Visual identity

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| J1 | Logo, colours, fonts, app icon | Overlays, end cards | Auto (W, S, C) |
| J2 | How polished should videos look, with an example | Sets expectation; prevents "authentic but polished" conflict | Human |
| J3 | Light or dark mode, device frame preferences | Screen recording spec | Confirm (C, S screenshots) |
| J4 | Settings and looks that fit or clash with the brand | Setting guidance | Human |
| J5 | Caption and on-screen text style preferences | Edit spec | Confirm (So) |

#### K. Claims and compliance

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| K1 | Is the product in a regulated or sensitive category (finance, health, kids, dating, gambling, AI companions)? | Switches on stricter scripting and review | Confirm (S category, W) |
| K2 | Claims you are allowed to make, with the evidence for each | Whitelist; only these may appear as must-say | Human |
| K3 | Claims that must never be made | Banned list | Human (generator proposes category defaults) |
| K4 | Required disclaimers or exact wording | Level 3 fixed lines | Human |
| K5 | Licences, registrations, regulator approvals, by market | Finance and health eligibility on TikTok and Apple | Human |
| K6 | Who approves content and how fast? | Review section | Human |
| K7 | Disclosure wording you want creators to use | Disclosure section | Confirm (default from platform rules) |
| K8 | Are AI-generated people or voices acceptable in content for your brand? | AI-label rules; brand stance | Human |
| K9 | Trademarks, partner logos or third-party content that must or must not appear | Must-avoid | Human |

#### L. Past content

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| L1 | Links to your three best-performing videos or ads and why you think they worked | Few-shot references; seed learnings | Confirm (So) — "why" is Human |
| L2 | What flopped or embarrassed you? | Negative examples | Human |
| L3 | Creators you have worked with; who did well | Creator archetype | Human / So |
| L4 | Hooks or lines that are worn out for you | Avoid repetition | Human / So |
| L5 | Competitor or category videos you wish were yours | References | Human |

#### M. Goals and measurement

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| M1 | The one outcome that matters this quarter (installs, trials, paid, sign-ups, awareness) | Objective line; rubric weighting | Human |
| M2 | Target volume and budget per video or per result | Scope of slate | Human |
| M3 | How will results be tracked (codes, links, store analytics, "how did you hear")? | CTA design | Confirm (C, $) |
| M4 | What would make you call this a failure? | Sets guardrails | Human |

#### N. Platforms

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| N1 | Which platforms, and organic, paid or both? | Placement rules, length, caption rules | Human |
| N2 | Will creators post on their own accounts, on brand accounts, or hand over files? | Disclosure, rights, caption control | Human |
| N3 | Existing handles and what each account is for | One job per account | Auto (So) |
| N4 | Will you boost creator posts (Spark or partnership ads)? | Authorisation step in the brief | Human |

#### O. Creator preferences

| ID | Question | Why it matters | Inferable? |
|---|---|---|---|
| O1 | Who would your customer believe: a peer, an expert, a friend, the founder? | Creator role | Human (persona suggests) |
| O2 | Any must-have traits (profession, life stage, device, language, accent, location)? | Matching | Human |
| O3 | Faces or faceless? Voice-over acceptable? | Format set | Human |
| O4 | Anyone you would not want associated with the brand | Brand safety | Human |
| O5 | How much freedom are you comfortable giving, shown as three sample briefs | Sets the scripting dial honestly | Human |

### 3.3 The founder's short list

These ten cannot be inferred well and each one changes generation materially. Everything else should arrive pre-filled for confirmation.

1. **The aha moment** (B1): "Show us the moment a new user gets it. Record your screen for 30 seconds or tell us what is on screen."
2. **Best customers and their situation** (C1, D1): "Think of three customers who love it. What was going on the day they signed up?"
3. **The alternative** (E1, E3): "If you disappeared tomorrow, what would they go back to, and what would they miss?"
4. **The only-we line** (E4): "What can you say that no competitor can honestly say?"
5. **Proof you will stand behind** (F1, F4): "Which numbers and results are true, typical and safe to say out loud?"
6. **The hesitation** (G1, G2): "Why do people who should buy not buy, and what is your honest answer?"
7. **Never say, never show** (K2–K4, B7): "What must a creator never claim or show?"
8. **The action and the offer** (H3, H4, M1): "What should a viewer do next, and what do they get?"
9. **Voice by example** (I2, L1, L2): "Paste three videos you wish were yours and one you would hate."
10. **The believable messenger** (O1, O5): "Who would your customer trust, and how much freedom will you give them?"

Optional eleventh for B2B: who pays versus who uses (C2).

### 3.4 Survey UX patterns

| Pattern | How | Basis |
|---|---|---|
| Scan first, ask second | Take the URL and store link, build a draft profile, then show it | Motion Brand Intake; Google's Pomelli builds a "Business DNA" (fonts, colours, tone, values, images) from a URL and lets the user edit it; HubSpot generates brand voice from website content and lets users tune attributes or upload samples |
| Confirm, do not compose | Each inferred answer is a card with Confirm / Edit / Wrong. Show the source ("from your App Store description") | Motion's Confirmed/Inferred labels |
| Flag low confidence and conflicts | Sort the review so uncertain and conflicting facts come first ("your site says 7-day trial, the App Store says 3") | Pomelli reviews warn the scan picks up stale pages, old logos and third-party widgets |
| Voice or screen recording for the hard ones | Aha moment, customer story and "only we" are easier spoken than typed; transcribe and extract, keep the audio as a source | Synthesis; I found no public evidence on voice-note onboarding |
| Examples not adjectives | Ask for three liked and one disliked video; show sample hooks or sample briefs and let them pick | Reference-over-adjective consensus in brief guides |
| Forced choices for tone | Sliders or pairs, then show a sample line in that tone to confirm | HubSpot attribute tuning |
| Ask in context, later | Ask for banned claims when the first brief shows a claim; ask about a persona when the first video for it is reviewed; three or four questions per touch | Progressive-profiling guides |
| One closing question | "Anything here that looks off or is missing?" | Motion Brand Intake |
| Paste box for raw material | Reviews export, support tickets, call notes, a sales deck, brand guidelines | Verbatim-source consensus |
| Show what the answer changed | After an answer, regenerate one hook or one brief line live | "Name the screen where the answer changes something" |

### Sources for section 3

- Motion, Brand Intake: https://runneth.com/library/frameworks/brand-intake
- Twirl, seven brief questions: https://www.usetwirl.com/post/how-to-brief-ugc-creators-without-over-scripting
- Koji, switch interview questions: https://www.koji.so/visuals/switch-interview-questions-push-pull-anxiety-habit
- JTBD switch interview: https://jobstobedone.org/switch-interview/
- Dunford summaries: https://commoncog.com/obviously-awesome/ ; https://nateliason.com/notes/obviously-awesome-april-dunford
- Content Snare, marketing client questionnaire: https://contentsnare.com/marketing-client-questionnaire/
- AgencyAnalytics, client onboarding questionnaire: https://agencyanalytics.com/blog/client-onboarding-questionnaire
- Leadsie, onboarding questionnaire: https://www.leadsie.com/blog/client-onboarding-questionnaire
- Koji, progressive profiling guide: https://www.koji.so/docs/progressive-profiling-guide
- Saasfactor, AI SaaS onboarding without losing data: https://www.saasfactor.co/blogs/how-to-simplify-ai-saas-onboarding-without-losing-the-data-your-ai-needs
- Google Pomelli coverage: https://www.searchenginejournal.com/google-labs-deepmind-launch-pomelli-ai-marketing-tool/559569/ ; https://www.aifire.co/p/google-pomelli-review-a-free-ai-content-generator
- HubSpot, set up brand voice: https://knowledge.hubspot.com/branding/set-up-brand-voice-using-ai

---

## 4. The company brain

### 4.1 How existing tools structure brand knowledge, and where they fall short

| Tool | What it stores | Shortfall for this use |
|---|---|---|
| Jasper IQ | Six components including Brand Voice (tone, personality, on- and off-limits words), Knowledge Base (product details, messaging, FAQs, positioning; documents and live drives), Audiences, Style Guide, Visual Guidelines. Setup advice: one voice, two audiences, five knowledge items. | Knowledge is documents, not typed facts. No demo moments, no claim substantiation, no performance learnings. |
| Writer | Knowledge Graph over company documents; voice profiles; terminology lists; style rules enforced on output | Built for enterprise text governance. Reviews disagree on whether enforcement is a gate or a suggestion. No creative-strategy objects. |
| HubSpot brand voice | Tone, personality and style inferred from the website, tunable by attribute or by 2–3 writing samples | Voice only. No product truth. |
| Google Pomelli | "Business DNA" from a URL: fonts, colours, tone, values, images, catalogue | Depends on a clean site; tone collapses to labels like "Inspirational". |
| Canva brand kit | Logos, colours, fonts, templates, with a voice field | Visual identity, little product or audience knowledge. |
| Creatify, Arcads and similar | A product URL becomes a script and an avatar video | One-shot scrape per video; no persistent, reviewable knowledge; scripts regress to the category average. |
| Foreplay, MagicBrief | Swipe file plus brief builder; brand and product profiles feed an AI brief or storyboard | Inspiration-first; the brand profile is thin. (Segwise reports MagicBrief was shut down on 31 July 2026 after Canva's 2025 acquisition; I could not verify this.) |
| Motion's skills | Separate documents: brand context, product catalogue (facts only), review audit, competitor analysis, with Confirmed/Inferred labels and research notes | The closest model. Still documents and not a queryable store; no freshness or performance loop. |

What they get wrong, in order of cost:

1. **Voice is treated as the whole brand.** Tone is the least valuable part for UGC, because the creator supplies the voice. The scarce inputs are product truth, customer language, demo moments and allowed claims.
2. **Facts, claims and customer language are blended into prose.** The generator cannot tell "the product page says" from "a reviewer said" from "we guessed".
3. **No provenance, so no way to check or expire anything.**
4. **Relevance is mistaken for authority.** A well-written marketing page outranks the real spec in retrieval (see tianpan.co's "The marketing page your RAG cited as an engineering spec").
5. **Nothing is learned from results.**
6. **Output converges on the category average.** Smartly's 2026 report is cited as finding 86% of marketers have seen AI output resembling competitors' (secondary). The stated remedy across sources is specific brand language, customer quotes and differentiators as inputs.
7. **No model of what can be shown on a screen.**

### 4.2 Design principles

1. **Typed entities, not documents.** Documents are sources; the brain holds extracted, linked records.
2. **Three kinds of statement, never mixed:** facts (what is true of the product), voice of customer (what people said, verbatim), and strategy (what we decided: personas, angles, concepts). Motion's catalogue rule is the test for the first kind.
3. **Every record carries provenance, confidence, freshness and status.**
4. **Authority is a field, separate from relevance.** Retrieval filters and ranks on it.
5. **Claims are first-class and gated.** Nothing reaches a "must say" unless it links to an approved claim.
6. **Contradictions are stored and shown, not averaged.**
7. **Learnings are evidence-backed and decay.**
8. **Hard constraints are injected, not retrieved.** Banned claims, required disclaimers and must-not-show lists go into every generation call in full; similarity search must not be able to miss them.

### 4.3 The fact envelope (on every record)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `company_id` | uuid | |
| `entity_type` | enum | See 4.4 |
| `status` | enum | `inferred`, `confirmed`, `disputed`, `stale`, `retired` |
| `confidence` | 0–1 | Set by rule, not by the model's self-report: confirmed by human = 1.0; stated verbatim on a tier-1 or tier-2 source = 0.9; corroborated by two tier-3 sources = 0.7; single inferred = 0.4 |
| `authority_tier` | 1–6 | See 4.5 |
| `sources[]` | list | Each: `source_type`, `url_or_ref`, `locator` (selector, timestamp, page), `verbatim_excerpt`, `captured_at`, `content_hash` |
| `extracted_by` | enum | `human`, `model:<id>`, `import` |
| `confirmed_by`, `confirmed_at` | user, time | Null until confirmed |
| `valid_from`, `valid_until` | time | Offers and prices must have `valid_until` or a re-check interval |
| `last_verified_at`, `recheck_after` | time | Per freshness class (4.6) |
| `supersedes`, `conflicts_with[]` | ids | |
| `scope` | object | `markets[]`, `platforms[]`, `plan`, `persona_ids[]` — a fact can be true only in one market or plan |
| `usage` | enum | `generation_ok`, `context_only`, `blocked` |
| `embedding`, `search_text` | | For retrieval |

### 4.4 Entities and fields

**Company**: name, written form, pronunciation, one-line description (confirmed), category terms customers use, stage, markets, languages, regulated-category flags, approver.

**Product**: name, platforms, store IDs and URLs, category, age rating, one-line description, the job it is hired for, inputs required, output or artefact, integrations, known limitations, roadmap notes with dates.

**Feature**: name, internal name, customer-facing name, plain description, plan or paywall gating, availability by platform, maturity (stable, beta, being redesigned), linked pains, linked demo moments.

**DemoMoment** (the entity others lack): feature_id, title, start_state, user_action, end_state (proof frame), seconds_to_complete, needs_sample_data, screen_path, device and orientation, visual_payoff (1–5), legibility notes (what to crop or enlarge), must_not_show[], is_aha_moment, reference capture (image or clip), reliability on camera (1–5), linked pain_ids, last_checked_against_build.

**Persona**: label, situation (the context in which the pain appears), trigger moments, role (payer, user, recommender), vocabulary[], where they spend time (communities, hashtags, creators), awareness-stage default, believable messenger, bad-fit markers, priority, linked quotes.

**Pain**: name in customer words, external / internal / philosophical levels, cost (time, money, feeling), frequency and intensity scores, attempted alternatives, linked quotes (count and ids), linked personas, status (evidenced or hypothesis).

**DesiredOutcome**: statement, time horizon (first session, a week, three months), how it shows on screen, typical versus best case, linked proof.

**Alternative / Competitor**: name, type (direct, generic tool, manual workaround, do nothing, aspirational), what it does well, where it fails, switch-to reasons, switch-away reasons, their recurring angles and formats, saturation notes, may_name (bool), may_compare (bool), source ad or post links.

**Differentiator**: attribute, versus which alternative, enabled value, who cares most, substantiation, uniqueness check (date and method).

**VoiceOfCustomerQuote**: verbatim text (immutable), source type (app store, Reddit, support, call, survey, comment), URL, date, rating if any, quality score 1–5, bucket (pain, trigger, objection, transformation, standout language), force (push, pull, anxiety, habit), emotion, persona guess, product or competitor it refers to, permission to quote publicly (default no; language may be used, attribution may not).

**ProofPoint**: statement, type (number, testimonial, press, award, customer logo, rating, certification, artefact), value and unit, as-of date, substantiation link, typicality (typical, best case, single case), permission, linked claim_id.

**Claim**: exact approved wording, variants allowed (bool), type (performance, comparative, price, health, financial, AI capability, safety), status (`approved`, `needs_substantiation`, `banned`), substantiation, required qualifier or disclaimer, markets, platforms where restricted, approver, expiry. Banned claims are stored as patterns with examples and reasons so they can be matched semantically.

**Objection**: statement in customer words, frequency, approved answer, proof that answers it, demo moment that answers it, persona scope.

**Offer**: plans and prices by market, trial terms (length, card required, what is included), free tier limits, current promotion, creator code mechanics (format, benefit, where entered), destination URLs, valid dates, exact required wording.

**ConversionPath**: steps from video to value (profile → link → store → install → onboarding → paywall → activation), where codes are entered, attribution methods available, known leaks.

**VoiceRule**: tone positions (four axes), do and don't lists with example lines, humour and profanity limits, how to speak about competitors, reading level, banned words, spoken register samples. Split into `brand_voice` (captions, overlays, brand-account posts) and `creator_latitude` (what creators may do in their own voice).

**GlossaryTerm**: term, written form, pronunciation, meaning, customer-facing or internal-only, preferred synonym, never-use variants.

**VisualIdentity**: logo files, colours, fonts, app icon, UI mode preference, polish level with reference, setting guidance, overlay and caption style.

**ComplianceProfile**: regulated flags, licences by market, platform restrictions, disclosure wording, AI-content stance, music rule, minors policy, approval workflow and service level.

**Goal**: objective, primary metric, targets, budget, platforms, placement (organic, boosted, asset-only), time frame.

**CreatorPreference**: role, traits, face or faceless, exclusions, scripting-dial default.

**Angle**: sentence, pain_id, persona_id, family, differentiator_id, proof_ids[], objection_id, demo_moment_id, stages it can run at, uniqueness check, status (candidate, testing, winner, fatigued, retired), performance summary.

**Concept**: angle_id, stage, format, creator archetype, hook_ids[], demo_moment_id, CTA type, target length, hypothesis being tested, rubric scores.

**Hook**: spoken line, opening visual, on-screen text, trigger types, stage, source (mined phrase id, reference id, generated), performance.

**Reference / ContentAsset**: URL or file, owner (own, competitor, category, creator), transcript, first-three-seconds description, tags (persona, pain, angle, stage, format, hook trigger, demo moment, CTA, length), metrics with dates, "what to borrow" note, liked or disliked by the company.

**Learning**: statement, scope (persona, platform, format), evidence (asset ids, metric, sample size, date range), strength, decay date, status (active, contradicted, expired).

**Contradiction**: record ids, field, values, sources, detected_at, resolution (rule applied or human decision), resolved_by.

### 4.5 Authority and precedence

| Tier | Source | Wins for |
|---|---|---|
| 1 | Human-confirmed statement in the product; legal or compliance document supplied by the company | Everything, until it expires |
| 2 | Live product truth: the build or codebase, billing configuration, store configuration | What the product does, prices, trial terms, gating, screen paths |
| 3 | Current first-party published: website, store listing, help centre, pricing page | Stated claims, positioning, naming |
| 4 | First-party social and past content | Voice, references, past offers (treat as possibly stale) |
| 5 | Third-party: reviews, Reddit, press, comparison sites | Customer language, pains, objections, alternatives — never product facts or allowed claims |
| 6 | Model inference | Hypotheses only; never a must-say |

Two axes, not one: tiers 2–3 are authoritative for **what is true**; tier 5 is authoritative for **how customers talk and feel**. A review saying "it's free" does not make the product free; it does tell you people value that it feels free.

### 4.6 Freshness classes

| Class | Examples | Re-check | On expiry |
|---|---|---|---|
| Volatile | Prices, trial terms, promotions, codes, store rating, user counts | 7 days, and before every brief that cites them | Block from must-say until re-verified |
| Moving | Features, screen paths, demo moments, UI | On each release or 30 days | Mark stale; warn in brief |
| Slow | Personas, pains, alternatives, voice | 90 days or on new voice-of-customer volume | Prompt a review |
| Evidence | Learnings, winning hooks | 60–90 day decay; platform changes reset | Downgrade to context only |
| Durable | Name, origin story, licences (with their own expiry) | Annual | — |

### 4.7 Handling contradictions

1. **Detect at write time.** New extraction compared against existing records for the same entity and field within the same scope (market, plan, platform).
2. **Check scope before calling it a conflict.** "$9.99" and "£8.99" are two markets. "7-day trial" and "3-day trial" may be two plans or an A/B test.
3. **Apply tier precedence**, then recency within a tier.
4. **Safety rule for claims and offers:** when two sources disagree on a price, trial, number or capability, use neither in a must-say; use the more conservative value in context; raise a confirm card.
5. **Keep both** records, link them, mark the loser `disputed` or superseded. Never delete.
6. **Tell the generator.** Retrieval returns a conflict flag; the prompt instructs the model to reason about it explicitly and avoid the disputed fact. The CONFLICTS paper (arXiv 2506.08500) reports that prompting models to reason explicitly about conflicts in retrieved documents improves answers.
7. **Human resolution becomes tier 1** with an expiry so it is re-asked if the underlying sources change again.

### 4.8 Retrieval and assembly notes

- **Always injected in full:** company one-liner, banned claims, required disclaimers, must-not-show, disclosure rule, offer and CTA for the placement, glossary must-use and never-use, scripting-dial level.
- **Retrieved by structure, not similarity:** given a concept, follow links: angle → pain → quotes; angle → differentiator → proof; angle → demo moment → feature; persona → vocabulary and references.
- **Retrieved by similarity:** quotes, references, past hooks and learnings relevant to the persona and format, filtered by `usage = generation_ok`, status and freshness.
- **Diversity control:** pass the angles, formats and hooks already used for this company and persona in the recent window as "do not repeat".
- **Citations in output:** each must-say and proof line in a generated brief carries the id of the claim or proof record. A brief with an uncited factual line fails a gate.

### Sources for section 4

- Jasper IQ: https://help.jasper.ai/hc/en-us/articles/18618654325787-Jasper-IQ ; https://www.jasper.ai/jasper-iq
- Writer governance: https://writer.com/product/govern ; https://writer.com/blog/webinar-recap-ai-brand-engine/
- HubSpot brand voice: https://knowledge.hubspot.com/branding/set-up-brand-voice-using-ai
- Pomelli: https://www.androidcentral.com/apps-software/googles-pomelli-ai-is-here-to-be-your-new-marketing-department
- Arcads and Creatify reviews: https://www.marketermilk.com/blog/arcads-review ; https://dupple.com/reviews/arcads-ai
- Foreplay briefs: https://www.foreplay.co/briefs ; AI brief generators roundup: https://segwise.ai/blog/best-ai-creative-brief-generators-2026
- Motion Product Catalog and Brand Intake: https://runneth.com/library/frameworks/product-catalog ; https://runneth.com/library/frameworks/brand-intake
- RAG authority versus relevance: https://tianpan.co/blog/2026-05-31-the-marketing-page-your-rag-cited-as-an-engineering-spec
- RAG corpus governance and per-class freshness: https://tianpan.co/blog/2026-04-27-rag-corpus-governance-indexing-policy
- CONFLICTS benchmark: https://arxiv.org/pdf/2506.08500
- AI sameness: https://www.emarketer.com/content/marketers-produce-more-ads-with-ai-originality-remains-elusive ; https://segwise.ai/blog/keep-ai-generated-ads-on-brand

---

## 5. SaaS and app specifics

### 5.1 Explaining software in 20–40 seconds

Recurring structure across Billo, Superscale, TokPortal and the B2B write-ups: **situation → the moment it gets solved on screen → what changed → what to do**. Billo: start with the problem, show the key steps, stop right after the aha moment; the CTA comes after the viewer has watched the result happen.

**Plan backward from the proof frame** (TokPortal): write the final on-screen state first, then the minimum steps to reach it. One action, one outcome.

A working template for 30 seconds:

| Seconds | Beat | Notes |
|---|---|---|
| 0–3 | Hook | A situation or a result, not a feature. Visual, spoken and text agree. |
| 3–9 | The problem as lived | One specific moment. The old way on screen if possible. |
| 9–20 | Show it | One demo moment, cropped and legible, real speed where possible. End on the proof frame and hold it for a beat. |
| 20–26 | What changed | Outcome in the creator's words; one proof point or objection answered. |
| 26–30 | CTA | One action. |

**Word budget.** Adroom's planning figure is about 2.2 spoken words per second (33 words for 15 seconds, 53 for 24). Energetic creator delivery runs faster, so treat 2.2–3.0 as the range: roughly 65–90 spoken words for 30 seconds, less when the screen needs silence to be read. A brief whose must-says and talking points exceed the budget fails a gate.

**Length by purpose** (Billo; Superscale): paid cuts 15–45 seconds with the first value moment in 3–5 seconds; consideration or tutorial 60–90 seconds; film long, cut several short variants. Format lengths from Superscale: problem-discovery-solution 15–25s, feature discovery 15–20s, before/after 20–30s, social-proof story 25–35s, day-in-the-life 30–45s.

### 5.2 Turning features into everyday moments

The translation chain, to be run by the generator for each feature:

feature → what it removes or gives → the moment in a day when that matters → what the person was about to do instead → what is visible on screen at the payoff

Example: "automatic meeting notes" → no typing while listening → the 4pm call where you were asked "can you send the notes?" → scrolling back through a chat trying to remember → the summary with action items appearing as the call ends.

Useful patterns from the sources:

- **Ride a format the creator already makes.** Cal AI's best integrations were "what I eat in a day" and snack roundups that barely mentioned the app; individual videos reportedly reached tens of millions of organic views (FunnelFox). The app appears as one moment inside native content.
- **Attach to a physical trigger**: a receipt, a notebook, a fridge, a gym, a commute (TokPortal's hands-and-object format).
- **Outcome screens as social objects**: streaks, milestones, dashboards (Billo cites Duolingo, Revolut, YNAB, Notion setups).
- **Workflow, not feature list.** Billo lists "narrating a feature list instead of a workflow" as a core mistake.
- **For B2B**: have the people closest to customers list 10–15 common customer problems, narrow to 3–5, and write problem–agitate–solution scripts in conversational language (VideoFirst).

### 5.3 Showing the screen

From Billo's tech-UGC guide and TokPortal:

- Specify the recording environment: device, OS, browser, orientation.
- Use a clean test account with realistic sample data, on the right plan tier, with a clear starting path.
- Exclude licence keys, customer data, internal dashboards, file paths, notifications, bookmarks. Blur anything sensitive.
- Crop to the relevant controls, enlarge small text, hold the final state.
- If the outcome is not visible in the interface, show the artefact it produces (an exported file, a sent message, a calendar entry).
- For before/after, use the same input for both states and do not invent time-saved figures.
- Do not fake speed or results; Billo notes misleading demos can trigger app store enforcement, and Apple's guideline 2.3.1 covers misleading marketing outside the App Store.

Ways to combine face and screen: green screen with the creator over a screenshot or recording; picture-in-picture; over-the-shoulder phone-in-hand; cutaway inserts; hands-only; text-led slideshow; screen recording with voice-over.

### 5.4 Faceless and low-visual products

TokPortal's seven faceless formats: one-action screen demo; before-and-after workflow; text-led slideshow; hands-only or object-led demo; recurring character episode; question answered with screen proof; result story with visible evidence. It also recommends one editorial job per account and no reposting of the same clip across accounts.

When the product is not visually interesting (APIs, back-office tools, security, infrastructure), show one of:

1. **The artefact** it produces.
2. **The absence**: the thing that no longer happens (the 11pm reconciliation, the pager alert).
3. **The person's reaction or routine** around it, with the screen as a brief insert.
4. **The old way** in painful detail, then a short cut to the new.
5. **A metaphor or skit** where the product appears only at the moment it solves the recurring problem.
6. **A number changing** on a dashboard, with conditions stated.

### 5.5 B2B versus consumer

| | Consumer app | B2B SaaS |
|---|---|---|
| Messenger | Peer or friend; niche creators with tight communities | A practitioner in the role; employees and founders; micro-experts |
| Pain | Personal, daily | Felt personally, bought by the company ("workflow pain is felt personally even when budgets are corporate", OpenClip) |
| CTA | Download free, start trial | Try free, book a demo, join a webinar |
| Cycle | Minutes to days | Long; pair cold creator hooks with retargeting that uses real demo and customer footage |
| Channels | TikTok, Reels, Shorts | The same plus LinkedIn; reuse in email, sales sequences and landing pages |
| Proof | Ratings, streaks, transformations | ROI, named customers, case-study style |
| Metric | Installs, trials, cost per install | Demo requests, trial sign-ups, pipeline |

Evidence for B2B creator content is thinner and mostly from vendors; no independent 2026 benchmark for B2B SaaS on TikTok turned up. Cited examples of B2B brands using the style: Faddom, JustCall, Pecan AI (VideoFirst), without results.

A related distinction from Cal AI's founder: volume UGC ("spray and pray" across many creators) versus selected influencers with tight communities ("sniper"). Reported figures put about $1,000 as buying roughly 30 UGC videos or one influencer video. The two need different briefs: the first benefits from templates and beats; the second from Level 0–1 briefs that fit the creator's format.

### 5.6 CTAs, link-in-bio and codes

- **Specific beats generic.** "Download free" or "Try it now" over "Check it out" (Superscale).
- **Describe the CTA by meaning** and fix wording only for offer terms (inBeat).
- **Organic posts cannot carry a clickable link in the caption**, so the path is: name the app clearly (spoken and on screen), point to the profile link or tell people to search the store, and pin a comment. Expect many viewers to search the store directly.
- **Codes capture what links miss.** Users hear the code, search the store, install and enter the code during onboarding or at a redemption screen; those installs are invisible to link tracking. Unique link per creator plus a code field plus a "how did you hear about us" question is the common combination (MakeInfluence).
- **Attribution undercounts creators.** One analysis estimates click-based attribution undervalues creator campaigns by roughly 2–4× because of second-screen behaviour, in-app browsers breaking deep links and delayed installs (single-source estimate; Low confidence on the number, High on the direction).
- **Brief implications:** say the code once aloud and show it as text; say what the code gives; say exactly where it is entered; keep the offer line identical to the `Offer` record; never state a price or trial length that is not current.
- **Placement matters:** Spark Ad captions come from the organic post; asset-only paid cuts do not carry the creator's caption (inBeat). Request Spark or partnership authorisation in the brief.
- **Music:** commercial use requires the commercial music library or original voice (Segwise).

### 5.7 Policy limits on claims

This is a summary for product design, not legal advice. Platform policies changed several times in 2026 and should be re-read from the primary pages before each rule is hard-coded.

**Apple App Store Review Guidelines (primary text, High confidence):**

- 2.3.1(a): marketing an app in a misleading way, "such as by promoting content or services that it does not actually offer … or promoting a false price, whether within or outside of the App Store, is grounds for removal". Creator videos count as marketing outside the store.
- 1.4.1: health-measurement accuracy claims must be supported by disclosed data and methodology; apps claiming to measure blood pressure, temperature, glucose or oxygen with device sensors alone are not permitted; apps should remind users to consult a doctor.
- 3.1.2: subscriptions must clearly describe what the user gets for the price; tricking users into subscribing under false pretences leads to removal.
- 3.2.1(viii): trading, investing and money-management apps should come from the licensed institution. Loan apps must disclose terms including maximum APR and may not exceed 36% APR or require repayment in 60 days or less.
- Section 3 intro and 3.2.2(x): no manipulation of reviews or rankings; no forcing users to rate or review.
- 5.1.2(i): disclose sharing of personal data with third-party AI.

**FTC (US):**

- The Consumer Review Rule (16 CFR Part 465, effective October 2024) bans fake or false reviews and testimonials, including AI-generated ones and testimonials attributed to people who do not exist. Liability attaches when the business knew or should have known. Insider testimonials must disclose the connection.
- Practitioner commentary says enforcement attention in 2026 includes "scripted endorsements that don't reflect real consumer experiences" (Benesch). This is the legal reason, beyond performance, not to script a creator saying "I've used this for six months" unless it is true.
- Endorsement Guides: clear disclosure of material connections; results shown must be typical or the typical result must be disclosed. (From general knowledge of the 2023 Guides; not re-verified in this pass.)
- A claim of first penalties under the rule in April 2026 appeared on one low-quality page and is unverified.

**TikTok:**

- Financial services ads (help page last updated September 2026): no get-rich-quick, pyramid or too-good-to-be-true offers; advertisers must be licensed where required, include disclaimers, and target 18+; loans and credit in many markets must disclose rates, fees and repayment examples on landing pages; many products are prohibited by market (payday loans, binary options, crypto in some markets).
- Branded content by creators in finance: reporting conflicts. 2021 coverage describes an outright ban on financial products in branded content; 2026 secondary sources describe a new Branded Content Policy effective 31 August 2026 that makes finance, alcohol and gambling permission-gated. **Unresolved; check TikTok's page before enabling finance briefs for creator-posted content.**
- AI-generated content: realistic AI content must be labelled; ads containing AI-generated content must be disclosed with TikTok's toggle or a visible label, or they are rejected or restricted (vendor sources date an ads update to July 2026). Sources disagree on whether a photorealistic avatar presenting a review always triggers the label.
- Commercial-content disclosure setting must be on for creator posts promoting a brand.
- Ad review is reported to flag absolute words ("guaranteed", "100%", "miracle") (single vendor source).

**Meta:**

- Personal Attributes policy (primary): ads must not assert or imply personal attributes, including health and financial status. "You" is allowed; "Dealing with depression?" or "Struggling with debt?" directed at the viewer is not. This directly constrains pain-agitation and identity-call-out hooks for health and finance apps when creator content is run as ads. First-person framing ("I was drowning in subscriptions") is the standard workaround.
- AI labelling: "AI info" labels apply automatically for Meta's generative tools and, per Billo, for third-party tools detected through C2PA metadata since mid-2026.

**YouTube / Google:** realistic synthetic content must be disclosed; Shorts show an on-video label; since July 2026 YouTube has tightened monetisation rules on mass-produced, templated content (Billo). Relevant if briefs are templated heavily across many accounts.

**EU:** AI Act Article 50 transparency duties applied from 2 August 2026 (Billo).

**Category defaults the generator should apply before the company says anything:**

| Category | Default banned patterns | Default scripting level |
|---|---|---|
| Finance, investing, credit, crypto | Guaranteed or implied returns; "risk-free"; income claims; specific gains without typicality; get-rich framing; urgency about markets; second-person financial-status hooks in paid | 3 for claims and offer; licences required |
| Health, fitness, nutrition, mental health | Diagnose, treat, cure; measurement accuracy without evidence; weight-loss amounts and timeframes without typicality; replacing a professional; second-person health-status hooks in paid | 2–3 |
| AI products | Capabilities the product lacks; "never wrong"; human-level or professional-replacement claims; hiding that output is AI where it matters; speed-ups that misrepresent latency | 1–2, with demo honesty rules |
| Kids and teens | Anything directed at under-13s; data collection claims | 3 |
| Any subscription | Wrong price or trial length; "free" without the condition | Offer line fixed |
| Any | Absolute words: guaranteed, 100%, best, number one (without substantiation), instant | — |

### Sources for section 5

- Billo, tech UGC: https://billo.app/blog/tech-ugc/
- Superscale, app founder guide: https://superscale.ai/learn/ugc-videos-complete-guide-for-app-founders-2025/
- TokPortal, faceless UGC for apps: https://www.tokportal.com/learn/faceless-ugc-for-apps
- SideShift, UGC for B2B and SaaS: https://sideshift.app/blog/ugc-for-b2b-and-saas
- VideoFirst, UGC in B2B SaaS: https://videofirst.beehiiv.com/p/the-rise-of-ugc-in-b2b-saas
- OpenClip, UGC ads for SaaS: https://openclip.app/use-cases/ugc-ads-for-saas
- FunnelFox on Cal AI: https://blog.funnelfox.com/cal-ai-influencer-marketing/
- Net Influencer on Cal AI's influencer playbook: https://www.netinfluencer.com/cal-ai-founder-zach-yadegari-breaks-down-the-influencer-playbook-behind-his-apps-growth/
- MakeInfluence, influencer marketing for app installs: https://www.makeinfluence.com/en/academy/influencer-marketing-for-app-installs-creative-strategy
- Apptica, attributing influencer campaigns: https://apptica.com/blog/how-to-attribute-influencer-campaigns-in-mobile-marketing/
- Adroom/Pixis on ABCD and dialogue budget: https://pixis.ai/blog/googles-abcd-framework-explained-how-to-score-your-video-before-launch/
- Apple App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- FTC rule announcement: https://www.ftc.gov/node/86101
- Benesch on FTC enforcement: https://www.beneschlaw.com/insight/five-stars-zero-tolerance-ftc-turns-up-enforcement-under-consumer-review-rule/
- TikTok financial services ad policy: https://ads.tiktok.com/help/article/tiktok-ads-policy-financial-services
- TikTok ad policy change log 2026: https://ads.tiktok.com/help/article/tiktok-ad-policy-change-log-2026
- TikTok branded content (historic ban): https://mumbrella.com.au/tiktok-prohibits-financial-services-and-products-branded-content-693178
- Billo, AI labelling across platforms 2026: https://billo.app/blog/ai-labeling/
- Meta Personal Attributes policy: https://transparency.meta.com/policies/ad-standards/objectionable-content/personal-attributes
- Jon Loomer on "you" in ad copy: https://www.jonloomer.com/can-we-use-the-words-you-and-your-in-facebook-ads-copy/

---

## 6. Evaluation

### 6.1 What exists

There is no published, widely used scorecard for UGC concepts. What practitioners use:

- **Motion's Creative Analysis** is diagnostic, not numeric: is the angle a specific claim for a specific person; is the pain immediately legible; is the persona a context; does the awareness stage match the placement ("mismatched awareness stage is one of the most common reasons an ad underperforms"); does the mechanic land cleanly; does the format fit; does each beat earn the next; is the CTA earned. Output: what works, what does not and why, and the single highest-leverage fix.
- **Motion's hook criteria**: reader's voice, specific numbers and details, the persona's exact language, pain or desire before product, written for one person, passes the read-aloud test, varied triggers across the set.
- **Brief checklists**: one objective, one audience, one takeaway, one CTA; every claim approved and supported; a named approver before production.
- **Feedback grid**: like / don't like × on brief / off brief, which separates taste from compliance.
- **Google's ABCD** (Attract, Brand, Connect, Direct): guidance, not a formula. Adroom gates generated video at 80% adherence with up to three regeneration attempts, which is a usable pattern for an automated loop, though ABCD's early-branding rule conflicts with native-feel advice for organic posts.
- **Alexandra Greifeld's filter** (Motion report): keep angles that have emotional resonance, are structurally different, and are testable.
- **The logo-swap test**: remove the product name; if a competitor could run it unchanged, it is not specific enough.

### 6.2 Concept gates (pass/fail, before any scoring)

1. **Truth**: every factual statement maps to a confirmed fact or approved claim. Nothing volatile is stale.
2. **Policy**: no banned pattern for the category, platform and placement.
3. **Showable**: a demo moment exists, is current, and fits the time available at real speed.
4. **Singular**: one persona, one pain, one message, one CTA.
5. **Honest performance**: the creator is not asked to assert an experience they have not had.

### 6.3 Concept rubric (score 0–3 each; weights in brackets)

| Dimension | 0 | 3 |
|---|---|---|
| Specificity of situation [×3] | "Busy professionals who want to be productive" | "You're in the 4pm call and someone says 'can you send the notes?'" |
| Customer language [×2] | Website phrasing | Built on a mined phrase, cited |
| Hook stop power [×3] | Opens on the product name or "Are you tired of…" | First frame and first line create a question or a jolt, and all three channels agree |
| Stage fit [×2] | Offer-led hook for a cold feed | Hook form matches the stage and placement |
| Proof frame [×3] | Outcome asserted, not shown | A legible on-screen end state proves the promise |
| Uniqueness [×2] | Passes unchanged with a competitor's name | Rests on a named differentiator |
| Believability [×2] | Absolute claims, perfect results | Stated conditions, a doubt answered, a small imperfection |
| Native fit [×2] | Looks like an ad cut | Borrows a format this creator type already makes |
| Diversity versus slate [×1] | Same angle and format as another concept | New angle family or new format |
| Testability [×1] | No stated hypothesis | Names the variable being tested |

Suggested thresholds (Synthesis; calibrate on real outcomes): any gate fail = kill or fix; below 55% of weighted maximum = regenerate; 55–75% = fix the lowest two dimensions; above 75% = ship. Always return the single highest-leverage fix, not a list.

### 6.4 Brief rubric

**Gates:**

- Objective, audience situation and one message are present.
- Must-says and proof lines each cite a claim or proof record.
- Offer and CTA match the current `Offer` record for the market and placement.
- Disclosure and music rules present for the platform.
- Spoken-word budget fits the target length.
- Must list has six items or fewer.
- No banned claims; no internal-only glossary terms.
- Deadline with time zone; reviewer named; review scope stated.

**Scored (0–3):**

| Dimension | 0 | 3 |
|---|---|---|
| Length and scan-ability | Several pages, prose | One page, filming-relevant lines only |
| Fixed versus open clarity | Everything reads as mandatory | Musts, context and creator's choice visibly separated |
| Hook options | One hook, or three rewordings | 2–3 different ideas, each with line, visual and text |
| Must-show precision | "Show the app" | Screen, action, end state, duration, what to hide |
| Language | Adspeak and jargon | Passes the out-loud test at a 6th–8th grade level |
| References | None, or adjectives | 2–4 links with "borrow this" notes |
| Scripting level fit | Full script for an experienced creator in a low-risk category | Level matches creator and risk |
| Feasibility | Needs three locations and a team account | One person, one phone, one seeded account, under an hour |
| Creator latitude | Cannot propose changes | Invited to pitch another hook or format |

### 6.5 Good and bad, concretely

**Audience line**

- Bad: "Millennials and Gen Z, 22–35, interested in productivity."
- Good: "Someone two weeks into a new job who is in back-to-back calls and keeps losing what they agreed to. They've tried typing notes and gave up. They'd say: 'I literally cannot listen and write at the same time.'"

**Single message**

- Bad: "AI-powered notes with summaries, action items, 40 languages, CRM sync and enterprise-grade security."
- Good: "The notes write themselves, and the to-dos are already pulled out when the call ends."

**Hook set**

- Bad (three rewordings, product-first): "Meet NoteApp, the AI note-taker." / "Introducing NoteApp, your AI meeting assistant." / "NoteApp takes notes for you with AI."
- Good (three ideas):
  - Pain: line "I haven't typed a single meeting note since March." Visual: closes a laptop mid-call and picks up coffee. Text: "haven't taken notes in 8 months".
  - Curiosity plus proof: line "This is what my boss got four seconds after our call ended." Visual: phone screen with a summary arriving. Text: "sent 4 sec after the call".
  - Contrarian: line "Taking notes in meetings is making you worse at your job." Visual: scribbling, then tossing the pen. Text: "stop taking notes".

**Must show**

- Bad: "Show the main features of the app."
- Good: "Screen: end-of-call summary. Start on the live call screen, tap End, hold on the summary for two full seconds so 'Action items (3)' is readable. Use the demo workspace. Notifications off. Do not show the Contacts tab."

**Talking points**

- Bad: "Mention our proprietary transcription engine with industry-leading accuracy."
- Good: "It catches who said what, even when people talk over each other. Say what surprised you."

**CTA**

- Bad: "Check out the link in bio to learn more about our plans and pricing."
- Good: "It's free for your first ten calls. Search NoteApp, and my code MAYA gets you a month of Pro; you type it in on the last sign-up screen."

**Claim**

- Bad (finance app, paid placement): "Are you drowning in debt? This app guarantees you'll save $500 a month."
- Good: "I found three subscriptions I'd forgotten about in the first five minutes. Yours will be different, but look."

**Feedback to a creator**

- Bad: "Can you make it pop more and feel more premium?"
- Good: "Two changes, both from the musts: the summary screen needs to be on for two seconds (it's on for half a second), and the trial is 7 days, not 14."

### Sources for section 6

- Motion, Creative Analysis: https://runneth.com/library/frameworks/creative-analysis
- Motion, Hook Writing and Voice standards: https://runneth.com/library/frameworks/hook-writing ; https://runneth.com/library/frameworks/voice-copy-standards
- Motion, "AI divide" (Greifeld's filter): https://runneth.com/thumbstop-pulse/ai-divide
- ABCD and Adroom's 80% gate: https://pixis.ai/blog/googles-abcd-framework-explained-how-to-score-your-video-before-launch/
- Beloved Brands, advertising decisions checklist: https://beloved-brands.com/advertising-decisions/
- The Brandgym, writing better briefs: https://thebrandgym.com/?p=9017
- Creator brief checklist (one objective, one audience, one takeaway): https://verified.influencer.com/tutorial-creator-brief.html
- Segwise, creative effectiveness scoring 2026: https://segwise.ai/blog/creative-effectiveness-scoring-guide-2026
- Logo-swap test: https://alvinding.substack.com/p/why-your-ai-ads-all-look-the-same

---

## 7. Disagreements and open questions

| Topic | Positions | My read |
|---|---|---|
| Product in the first 3 seconds | Insense, Twirl, ABCD say yes; creators and inBeat call it an ad signal | Per-placement setting; default off for organic |
| Pain-first versus native-first | Motion anchors on pain; Cal AI's best videos barely mentioned the app; one practitioner calls pain concepts unstable | Use the matrix for coverage; always include native-format concepts |
| Rights and legal inside the brief | Segwise: separate document; inBeat and Insense: short section in the brief | Keep only what affects filming in the brief |
| Shot lists | Segwise: cut frame-by-frame shot lists; inBeat: provide A-roll and B-roll lists | For software, a precise must-show list is needed; keep everything else loose |
| Volume UGC versus selected influencers | Cal AI's founder favours selected creators with tight communities; volume platforms argue the reverse | Different brief levels for each; the platform should support both |
| Scripting by creator skill | No source gives evidence; tiers by follower count are a poor proxy | Dial on risk and format first, experience second; learn the right level per creator from outcomes |
| AI avatars and labels | Sources conflict on whether a realistic avatar always needs TikTok's label | Label by default |
| TikTok finance branded content | Historic ban versus reported 2026 permission tier | Unverified; check before enabling |
| MagicBrief status | Segwise says shut down July 2026; other listings say active | Unverified |
| Statistics on creator preferences and UGC trust | Widely repeated, rarely sourced | Do not rely on them |

Gaps I could not fill from public sources: a real agency intake form for UGC specifically; any controlled evidence on scripted versus unscripted performance; independent B2B SaaS short-form benchmarks; evidence on voice-note onboarding; SideShift's own brief guidance beyond generic templates.

---

## 8. Implications for the three deliverables

**Onboarding survey**

- Start with URL and store link, scan, then show a confirm-or-edit profile sorted by uncertainty and conflict.
- Ask the founder the ten questions in 3.3, with voice or screen recording offered for the aha moment and the customer story.
- Ask for examples (liked and disliked videos, sample brief levels) instead of adjectives.
- Defer the rest; ask in context when a brief first needs it.
- Apply category default banned claims before the founder answers, and show them for confirmation.

**Brain schema**

- Typed entities with a shared envelope for provenance, confidence, authority tier, freshness and status.
- `DemoMoment`, `Claim`, `VoiceOfCustomerQuote`, `Offer` and `Learning` are the entities that existing brand-voice tools lack and that matter most here.
- Two authority axes: product truth versus customer language.
- Volatile facts re-verified before use; contradictions stored, surfaced and resolved conservatively.
- Hard constraints injected into every call in full.

**Generation prompts and rubrics**

- Pipeline: facts → alternatives → voice of customer → pains → personas → demo moments → angles → concepts → hooks → gates and rubric → brief → tags → learnings.
- Brief renderer with a four-level scripting dial chosen from claim risk and creator experience.
- Hooks always as line plus visual plus text, different triggers, stage rules applied, at least one with no product mention.
- Language checks: reading level, out-loud test, banned words and structures, similarity to website copy.
- Word budget against target length.
- Citation of claim and proof ids on every factual line.
- Review flow that checks musts only and returns one highest-leverage fix.
