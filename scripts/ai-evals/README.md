# Brief engine evals

Cases and a judge rubric for measuring the brief engine
(`supabase/functions/_shared/ai/briefEngine.ts`). Nothing here runs on its own
and no runner is checked in yet: running a case calls the paid model, so it is
a deliberate act.

## Files

- `brief-cases.json`: 15 cases across six product categories (consumer AI app,
  B2B dev tool, finance app, health and fitness app, productivity SaaS,
  education app). Every company is invented.

## Shape of a case

- `company`: a summary of a fictional company brain. `approved_claims` and
  `demo_moments` carry the ids a plan may cite. `constraints` is the text that
  would sit in `BrainContext.constraints`. `coverage` below 0.3 means the case
  exercises the legacy fallback, and `legacy_brand_context` is then what
  `loadBrandContext` would return. `recent_briefs` is the do-not-repeat list.
- `request`: what the manager asked for (`mode`, `type`, `title`, `typed`,
  `linkNotes`). `reference` is a cut-down `ReferenceAnalysis` fixture when the
  case has a reference; `reference_state: "unreadable"` means a link was given
  and could not be read.
- `expect`: `write`, `decline_or_reframe`, `write_or_decline` or `titles`.
- `must` and `must_not`: what a great output does and does not do. These are
  written for a judge to read, not for string matching.

## Running a case, when a runner exists

Build a `BrainContext` from `company` (render `product`, `persona`, `pains`
and `offer_and_cta` into `core`, `constraints` into `constraints`, and pass
the claims and demo moments through), then call `writeBrief(admin, request,
deps)` with fakes for the brain, the reference reader, the legacy loader and
the recent briefs, and the real `generate`. Run each case three times; the
engine is not deterministic, and a case passes only if all three runs pass
the gates.

Report, per case: gate results, the scored criteria, the weighted total, and
the judge's single highest-leverage fix. Report across cases: gate pass rate,
mean weighted score, decline accuracy on cases 06 and 13, and cost and
latency from `ai_runs`.

## The judge

Use a writer-tier model that did not produce the brief's final revision, at
the same or a higher effort, with the case's `company`, `request`, `must`,
`must_not` and the engine's output. Give it the rubric below as its
instructions. It answers the gates first; any failed gate fails the case and
the scored criteria are still filled in for diagnosis.

Calibration comes before trust: have a person score 20 outputs by hand and
compare. A criterion where the judge and the person disagree by more than one
point on a third of outputs is rewritten or dropped. The thresholds below are
starting points from the research (`04-ugc-craft.md` section 8,
`05-briefs-brain.md` section 6) and have not been calibrated against real
performance.

### Judge instructions (text)

You are reviewing a brief that an AI wrote for a creator to film as a short
video for TikTok and Instagram. You are given what is known about the company,
what the manager asked for, what a great answer must and must not do, and the
brief. Read the script the way it will be met: said aloud by a stranger to
someone about to scroll past. Judge what is on the page, not what the writer
probably meant. Quote the line you are judging whenever you mark something
down.

#### Gates (pass or fail; one failure fails the brief)

G1. Truth. Every statement about what the product does, costs or delivers is
supported by an approved claim or a demo moment in the company material. No
invented feature, price, trial length, number or result.

G2. Citations. Every clip that makes a product statement cites a claim id or
demo moment id that exists in the company material, and the cited record says
what the clip says.

G3. Policy. Nothing the company's constraints forbid, and nothing the category
forbids by default: for money, no promised or implied returns or savings and
no second-person statements about the viewer's finances; for health and
fitness, no treatment, cure, amounts or timelines and no body shaming; for AI
products, no capability beyond the claims.

G4. Honest performance. The creator is not made to assert an experience they
may not have had (months of use, a personal result), and the brief does not
depend on hiding that the creator is paid. A disclosure the constraints
require is present in the form they give.

G5. Singular. One viewer, one pain, one point, one ask. Exactly one clip is
the CTA (none for long text).

G6. Shape. The plan has the form its type requires: spoken clips with derived
on-screen text for Talking Head and Greenscreen; text-only slides for
Slideshow; one silent clip of two or three paragraphs with word-level
variation for Long Text; four to seven lines of direction for an outline. The
spoken word count fits the clip lengths at about 2.6 words a second.

G7. Reference honesty. With a readable reference: no sentence, on-screen text
or personal detail is copied from it. With an unreadable reference: the brief
says it could not be read and does not describe it.

G8. Copy rules. No em or en dashes, no emoji, no exclamation marks, no
hashtags inside lines, sentence case, and none of the company's banned
phrases.

G9. The case's own `must_not` list. Any item present fails the brief.

G10. Decision. When the case expects a decline or a reframe, the engine did
not write the unsupported idea as asked. When the case expects a brief, the
engine did not decline for a reason the company material answers.

#### Scored criteria (0 to 3 each; weight in brackets)

S1. Stop power of the opening [x3]. 0: opens on the product, a greeting or a
line any product could use. 3: the first frame and first line make the right
stranger think "that is me" or need to know what happens next, and picture,
text and voice carry one promise.

S2. Sounds like a person [x3]. 0: written register, benefit lists, praise
words, tidy moral. 3: every line could be said to a friend across a table;
contractions, fragments, one small imperfection or doubt; nothing that could
sit on a landing page. Name the single line that sounds most like copy.

S3. Specificity of the situation [x3]. 0: "busy people who want to be
productive". 3: one person in one moment, with a time, a sum, a place or an
object, in the customer's own words where the material has them.

S4. Proof on screen [x3]. 0: the outcome is asserted. 3: a listed demo moment
is specified with start state, action and an end state held long enough to
read, and the script is planned around that frame.

S5. The pivot [x2]. 0: "that is where X comes in". 3: the product arrives as
the next thing that happened in the story.

S6. On-screen text [x2]. 0: a different idea from the spoken line, or a
headline. 3: each label is the clip's own words compressed and readable at a
glance; the hook text works with the sound off.

S7. Hook options [x2]. 0: one hook, or three rewordings. 3: three ways in that
differ in kind, each with line, text and visual, none naming the product.

S8. The ask [x2]. 0: stacked or generic asks, or a mechanism the company does
not have. 3: one ask, after the result, matched to the hook's promise, using
the mechanism the company material confirms.

S9. Uniqueness [x2]. 0: a competitor could run it unchanged. 3: it rests on
something only this product does or only this customer says.

S10. Transplant quality, only when a reference was read [x2]. 0: the
reference's structure is lost, or its subject leaks through. 3: beat order,
proportions, product timing and kind of ask are kept, the subject is entirely
this company's, and the brief says what it kept and replaced.

S11. Filmable [x1]. 0: needs a crew, several locations or screens that do not
exist. 3: one person, one phone, where they would naturally be, with shot
direction they can follow.

S12. Search, caption and tags [x1]. 0: a category label as the phrase, ad copy
as the caption. 3: a phrase a person would type, carried naturally into the
first line or text and the caption; three to five relevant tags.

S13. The case's own `must` list [x3]. Score the share of items met: none 0,
some 1, most 2, all 3.

S14. Questions [x1]. 0: none when the material has an obvious gap, or
questions the material already answers. 3: the questions are the ones a
strategist would ask, each answerable in a sentence.

Weighted total as a share of the maximum for the criteria that apply: below
55 percent, regenerate; 55 to 75 percent, fix the two lowest criteria; above
75 percent with all gates passed, ship.

#### What the judge returns

For each gate: pass or fail and, on a fail, the quoted line. For each
criterion: the score and one sentence of evidence. Then the single change
that would most improve the brief, not a list. For titles mode, apply G1, G3,
G8, G9, S3, S9 and S13 only.

## What these cases do not cover

Whether a brief performs. That needs posted videos and the outcome data in
the product (sign-ups per post), and is the only measure that settles the
open doctrine questions (when to show the product, which ask, how long).
