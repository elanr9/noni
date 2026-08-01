// ugc-bible.md Part 8 as structured seed data for public.formats, plus the
// Appendix A FieldVision examples for format_examples. The bible stays prose;
// this file stores the parsed numbers. Update together with the bible and
// bump BIBLE_VERSION in doctrine.ts.
// Keep this file free of Deno and npm imports so Node can import it too.
// Types are structurally identical to FormatSpec/SlotSpec in doctrine.ts,
// declared locally so this file stays import-free.

type SeedSlot = {
  key: string;
  label: string;
  required: boolean;
  rules: string;
  min: number | null;
  max: number | null;
};

export type FormatSeedRow = {
  id: string;
  name: string;
  family: 'video' | 'slideshow' | 'either';
  when_to_use: string;
  why_it_works: string;
  slot_schema: SeedSlot[];
  kill_rules: string[];
  beat_timing: string | null;
  target_length_min_sec: number | null;
  target_length_max_sec: number | null;
  slide_count_min: number | null;
  slide_count_max: number | null;
  requires: string[];
  cta_keyword_policy: 'required' | 'optional' | 'none';
  primary_signal:
    | 'keyword_comments'
    | 'saves_per_reach'
    | 'shares'
    | 'completion'
    | 'comment_velocity';
};

function slot(
  key: string,
  label: string,
  required: boolean,
  rules: string,
  min: number | null = null,
  max: number | null = null,
): SeedSlot {
  return { key, label, required, rules, min, max };
}

export const FORMAT_SEED: FormatSeedRow[] = [
  {
    id: 'two_hander_comparison',
    name: 'Two Hander Comparison',
    family: 'video',
    when_to_use:
      'Product demo posts. The highest intent format in the library and the closest thing to a direct response ad that still reads native. The only format where a product screen recording is mandatory.',
    why_it_works:
      'The contrast creates the curiosity gap in under two seconds, the pain detail earns the share, and the demo answers the question the viewer is already asking.',
    slot_schema: [
      slot(
        'on_screen_hook',
        'On screen hook',
        true,
        'The contrast pair as a bare comparison, no verb. Numbers or statuses only. Under eight words.',
      ),
      slot(
        'cold_open',
        'Cold open',
        true,
        'Casual greeting plus the setup question. Spoken, not written. Must sound like two friends. No exposition. Under ten words.',
      ),
      slot(
        'bad_outcome',
        'Bad outcome',
        true,
        'The low number or bad status, delivered flatly, without self pity.',
      ),
      slot(
        'pain_detail',
        'Pain detail',
        true,
        'One concrete, slightly absurd, specific detail about how bad it is. Must be physical, specific, and verifiable sounding. Never an emotion. Never a generalization. If it cannot be filled with something real, kill the idea.',
      ),
      slot(
        'pivot_question',
        'Pivot question',
        true,
        'The bad outcome person asks how. Three to six words.',
      ),
      slot(
        'demo_beats',
        'Demo beats',
        true,
        'Each beat is one action plus one payoff, tied to what is on screen. Never a feature list. Pattern: go to the thing, do the one action, the product returns the specific valuable output, the outcome number appears.',
        3,
        5,
      ),
      slot(
        'cta_keyword',
        'CTA keyword',
        true,
        'One word, lowercase, niche relevant, easy to spell. Paired with a follow ask.',
      ),
    ],
    kill_rules: [
      'Explaining the product before the pivot question',
      'Any demo beat that is a feature rather than an action',
      'A generic pain detail',
      'More than five demo beats',
      'A first line that sounds scripted',
      'Running past the 30 second hard cap',
    ],
    beat_timing:
      'Hook text on screen frame one. Cold open inside two seconds. Pain detail by five. Pivot by eight. Demo runs the middle. CTA in the last three seconds.',
    target_length_min_sec: 20,
    target_length_max_sec: 25,
    slide_count_min: null,
    slide_count_max: null,
    requires: ['can_film_with_second_person', 'product_demo'],
    cta_keyword_policy: 'required',
    primary_signal: 'keyword_comments',
  },
  {
    id: 'talking_head_advice',
    name: 'Talking Head Advice List',
    family: 'video',
    when_to_use:
      'Authority content. Best format for claims that need someone credible attached.',
    why_it_works:
      'The credential in the first three seconds is what makes the advice land instead of reading as generic. Every high performing example observed opens this way.',
    slot_schema: [
      slot(
        'credential',
        'Credential',
        true,
        'First line, before anything else. A specific role or a specific result. Never vague authority. A creator without one cannot run this format.',
      ),
      slot(
        'hook',
        'Hook',
        true,
        'Plain statement of what the post covers. Nine words or fewer. Doubles as the search phrase, so it is both spoken and on screen.',
      ),
      slot(
        'items',
        'Items',
        true,
        'Each item shares the same internal shape: the thing named plainly, why it happens or matters, what to do about it.',
        3,
        6,
      ),
      slot(
        'reversal_beat',
        'Reversal beat',
        false,
        'One item where the advice is to flip the situation back on the other party. Optional but strong.',
      ),
      slot(
        'embedded_plug',
        'Embedded plug',
        false,
        'One sentence inside one item, as the natural solution to that specific item. Never its own item. Never a pitch.',
      ),
      slot(
        'close',
        'Close',
        true,
        'One line of summary or reassurance. Optional CTA keyword.',
      ),
    ],
    kill_rules: [
      'Leading with the hook instead of the credential',
      'A plug that is its own item',
      'Items that do not share the same internal shape',
      'More than six items',
    ],
    beat_timing: null,
    target_length_min_sec: 25,
    target_length_max_sec: 45,
    slide_count_min: null,
    slide_count_max: null,
    requires: ['has_credential', 'on_camera_comfortable'],
    cta_keyword_policy: 'optional',
    primary_signal: 'saves_per_reach',
  },
  {
    id: 'slideshow_tip_list',
    name: 'Slideshow Tip List',
    family: 'slideshow',
    when_to_use:
      'The cheapest format to produce and the easiest to make consistent. Default for volume. Slideshows earn far more comments and saves per unit of production cost than comparable video.',
    why_it_works:
      'No performance required. Images are decorative, not illustrative: they depict the end state the reader wants. Every swipe registers as engagement, so swipe completion is the carousel equivalent of watch time. First and last slides matter most. Production: text baked into the image at 1080 by 1920, image direction per slide from the tenant shot library, audio mandatory.',
    slot_schema: [
      slot(
        'cover_slide',
        'Cover slide',
        true,
        'Hook text over an aspirational photo. Under nine words. Written like a query the reader would type, since slide text is indexed. Optional part number for serialization.',
      ),
      slot(
        'body_slides',
        'Body slides',
        true,
        'Each slide is a header of one to three words naming the category, plus one or two sentences of actual advice.',
        3,
        6,
      ),
      slot(
        'embedded_plug',
        'Embedded plug',
        false,
        'Lives inside one body slide, in the same breath as its advice. Never a dedicated slide.',
      ),
      slot(
        'final_slide',
        'Final slide',
        true,
        'A close that earns the save or the follow. One line of reassurance, or a follow ask for part 2. Never a pitch.',
      ),
    ],
    kill_rules: [
      'Illustrating the advice literally',
      'Headers longer than three words',
      'Body text longer than three lines',
      'More than six body slides',
      'No audio',
      'A weak cover, since the cover decides whether the swipe ever starts',
    ],
    beat_timing: null,
    target_length_min_sec: null,
    target_length_max_sec: null,
    slide_count_min: 5,
    slide_count_max: 10,
    requires: [],
    cta_keyword_policy: 'optional',
    primary_signal: 'saves_per_reach',
  },
  {
    id: 'slideshow_question_list',
    name: 'Slideshow Question List',
    family: 'slideshow',
    when_to_use:
      'Save bait. Overperforms on saves and shares because it is a reference the reader keeps, and saves carry the longest distribution tail.',
    why_it_works:
      'The reader keeps the post as a reference. The explanation under each question is what earns the save.',
    slot_schema: [
      slot('cover_slide', 'Cover slide', true, 'The count plus the context.'),
      slot(
        'question_slides',
        'Question slides',
        true,
        'One question per slide, in quotes, verbatim and usable exactly as written, plus two or three sentences on why asking it helps. Where a question needs a noun the reader supplies, mark it in parentheses so it reads as a fill in template.',
        4,
        6,
      ),
      slot(
        'embedded_plug',
        'Embedded plug',
        false,
        'One slide where the product is how the reader prepares or practices.',
      ),
    ],
    kill_rules: [
      'Questions that are not literally usable as written',
      'Explanations shorter than two sentences, which removes the save value',
    ],
    beat_timing: null,
    target_length_min_sec: null,
    target_length_max_sec: null,
    slide_count_min: 5,
    slide_count_max: 8,
    requires: [],
    cta_keyword_policy: 'optional',
    primary_signal: 'saves_per_reach',
  },
  {
    id: 'myth_bust',
    name: 'Myth Bust',
    family: 'video',
    when_to_use:
      'When the niche document contains a belief that is common, wrong, and costing the reader something. Also the safe home for high saturation claims, since arguing with the consensus is the point.',
    why_it_works:
      'The myth stated plainly in the hook creates instant recognition in believers and instant tension in doubters. Both stay. The receipt is what makes the correction land instead of reading as opinion.',
    slot_schema: [
      slot(
        'myth_verbatim',
        'Myth verbatim',
        true,
        'Stated exactly the way the target reader says it or hears it, as the hook. Must be a belief real people hold. Never a strawman. If the niche document cannot supply a real common belief, kill the idea.',
      ),
      slot(
        'correction',
        'Correction',
        true,
        'One sentence. No hedging, no it depends.',
      ),
      slot(
        'receipt',
        'Receipt',
        true,
        'The specific proof: a number, a firsthand result, a named mechanism. Same standard as the pain detail. Never a vibe.',
      ),
      slot(
        'replacement',
        'Replacement',
        true,
        'What to do instead, as one to three concrete actions.',
        1,
        3,
      ),
      slot(
        'embedded_plug',
        'Embedded plug',
        false,
        'One sentence where the product is how the replacement gets done.',
      ),
    ],
    kill_rules: [
      'Busting a myth nobody holds',
      'More than one myth per post',
      'A receipt that is an opinion',
      'Any superior or mocking tone toward people who believed it, since the viewer is one of them',
    ],
    beat_timing:
      'Myth on screen frame one. Correction by second three. Receipt by second eight. Replacement runs the back half.',
    target_length_min_sec: null,
    target_length_max_sec: 25,
    slide_count_min: null,
    slide_count_max: null,
    requires: ['on_camera_comfortable'],
    cta_keyword_policy: 'optional',
    primary_signal: 'shares',
  },
  {
    id: 'mistake_callout',
    name: 'Mistake Callout',
    family: 'video',
    when_to_use:
      'Authority content when the creator has scar tissue rather than a title. The failed version of the credential format, and the best format for creators whose credibility is having been through it.',
    why_it_works:
      'Admitting cost buys trust a credential cannot. The price tag is what makes it real.',
    slot_schema: [
      slot(
        'standing',
        'Standing',
        true,
        'First line. What the creator lost or went through that earns the list. Specific and costly. Never vague experience.',
      ),
      slot(
        'mistake_items',
        'Mistake items',
        true,
        'Each item: the mistake named plainly, the cost with a number or concrete consequence attached, then the fix. The cost line is required inside every item. A mistake without a price is filler and gets cut.',
        3,
        5,
      ),
      slot(
        'embedded_plug',
        'Embedded plug',
        false,
        'One sentence inside one item, as the fix for that specific mistake.',
      ),
      slot(
        'close',
        'Close',
        true,
        'One reassurance line, that the reader can still recover. Optional CTA keyword.',
      ),
    ],
    kill_rules: [
      'Mistakes without costs',
      'Generic mistakes any niche could claim',
      'Leading with the list instead of the standing',
      "A fix that amounts to don't do the mistake",
    ],
    beat_timing: null,
    target_length_min_sec: 25,
    target_length_max_sec: 45,
    slide_count_min: null,
    slide_count_max: null,
    requires: ['has_scar_tissue', 'on_camera_comfortable'],
    cta_keyword_policy: 'optional',
    primary_signal: 'saves_per_reach',
  },
  {
    id: 'storytime',
    name: 'Storytime',
    family: 'video',
    when_to_use:
      'The one format that earns length, because the open loop carries retention. Origin stories, transformation arcs, near miss stories.',
    why_it_works:
      'The hook states the ending without the explanation and the viewer stays to close the loop.',
    slot_schema: [
      slot(
        'open_loop_hook',
        'Open loop hook',
        true,
        'The outcome or the most dramatic moment, stated first, explanation withheld. Never start at the chronological beginning. Nine words or fewer on screen.',
      ),
      slot(
        'stakes',
        'Stakes',
        true,
        'What the person stood to lose or wanted, in one or two lines, with a number where possible.',
      ),
      slot(
        'beats',
        'Beats',
        true,
        'What happened. Each beat carries one concrete sensory or numeric detail. Pain detail standards apply to every beat.',
        2,
        4,
      ),
      slot(
        'turn',
        'Turn',
        true,
        'The single moment things changed. One beat, specific. If the product appears in this story it appears here, as a detail, one sentence maximum, never as the hero.',
      ),
      slot(
        'resolution',
        'Resolution',
        true,
        'The outcome, with the number that closes the loop opened in the hook.',
      ),
      slot(
        'lesson_line',
        'Lesson line',
        true,
        'One sentence the viewer keeps. Optional CTA or part 2 tease.',
      ),
    ],
    kill_rules: [
      'Chronological openings',
      'A product that saves the day, which viewers smell instantly',
      'Beats without concrete details',
      'Closing the loop early',
      'Anything over 60 seconds',
    ],
    beat_timing:
      'Loop opens frame one. Stakes by second five. Turn no later than the two thirds mark. Resolution and lesson in the final five seconds.',
    target_length_min_sec: 30,
    target_length_max_sec: 60,
    slide_count_min: null,
    slide_count_max: null,
    requires: ['on_camera_comfortable'],
    cta_keyword_policy: 'optional',
    primary_signal: 'completion',
  },
  {
    id: 'day_in_the_life',
    name: 'Day in the Life',
    family: 'video',
    when_to_use:
      'Aspirational identity content. The viewer is not learning, they are trying on the life.',
    why_it_works:
      'Identity content gets shared as this is me or this will be me. The friction beat is what makes it credible instead of an ad.',
    slot_schema: [
      slot(
        'identity_line',
        'Identity line',
        true,
        'Who this is and what makes the day worth watching. First line.',
      ),
      slot(
        'beats',
        'Beats',
        true,
        'Each beat is a time, an action, and one specific detail. Show, never narrate feelings. The detail is the content.',
        5,
        8,
      ),
      slot(
        'friction_beat',
        'Friction beat',
        true,
        'One beat where something is hard, boring, or goes wrong. This is the pain detail slot of this format. A perfect day reads as an ad and dies.',
      ),
      slot(
        'product_beat',
        'Product beat',
        false,
        'Subject to the plug rate. The product appears inside one beat as a tool used naturally, visible for one beat only, never named with a pitch.',
      ),
      slot(
        'close',
        'Close',
        true,
        'The day ends on a state, not a message. Optional follow ask for the next day.',
      ),
    ],
    kill_rules: [
      'A perfect day',
      'Narrated emotions instead of shown details',
      'Product visible in more than one beat',
      'More than eight beats',
      'Beats without times',
    ],
    beat_timing: null,
    target_length_min_sec: 20,
    target_length_max_sec: 40,
    slide_count_min: null,
    slide_count_max: null,
    requires: ['lives_the_identity'],
    cta_keyword_policy: 'none',
    primary_signal: 'shares',
  },
  {
    id: 'tier_list',
    name: 'Tier List',
    family: 'either',
    when_to_use:
      'Comment bait. The format exists to generate disagreement, and first hour comment velocity is a distribution trigger. Also a safe home for high saturation claims.',
    why_it_works:
      'Everyone who disagrees with one placement comments. The controversial placement is the whole engine.',
    slot_schema: [
      slot('category', 'Category', true, 'Named plainly as the hook.'),
      slot(
        'items',
        'Items',
        true,
        'Things the target reader recognizes on sight.',
        5,
        9,
      ),
      slot(
        'placements',
        'Placements',
        true,
        'Each item gets a tier and one line of reasoning. High and low placements get the most reasoning. Middle placements get almost none.',
      ),
      slot(
        'controversial_placement',
        'Controversial placement',
        true,
        'One placement the audience will fight about, held until at least the midpoint. It must be defensible, not random. Rage bait with no reasoning kills trust. If generation cannot find a genuinely debatable placement, kill the idea.',
      ),
      slot(
        'comment_cta',
        'Comment CTA',
        true,
        'Ask directly what got ranked wrong.',
      ),
    ],
    kill_rules: [
      'Safe rankings everyone agrees with',
      'Equal reasoning on every item',
      'The controversial placement inside the first three items, since viewers leave after it',
      'More than nine items',
    ],
    beat_timing: null,
    target_length_min_sec: 25,
    target_length_max_sec: 45,
    slide_count_min: null,
    slide_count_max: null,
    requires: [],
    cta_keyword_policy: 'none',
    primary_signal: 'comment_velocity',
  },
  {
    id: 'green_screen_react',
    name: 'Green Screen React',
    family: 'video',
    when_to_use:
      'The fastest video format to produce and the best way to turn the comment section of previous posts into new content. Also the format for riding niche news.',
    why_it_works:
      'The artifact does the hooking. A real screenshot with a surprising claim is a built in curiosity gap and the take is the payoff.',
    slot_schema: [
      slot(
        'artifact',
        'Artifact',
        true,
        'A real screenshot, on screen from frame one. Never fabricated, never doctored. Real comments from the account own posts are the best source. Blur names when the source is a private person.',
      ),
      slot(
        'take_opening',
        'Take opening',
        true,
        'Agreement, disagreement, or the answer, stated in the first three seconds.',
      ),
      slot(
        'substance',
        'Substance',
        true,
        'Beats correcting, expanding, or answering the artifact. Numbers and named mechanisms, not vibes.',
        2,
        4,
      ),
      slot(
        'embedded_plug',
        'Embedded plug',
        false,
        'One sentence, only when the artifact is a question the product literally answers.',
      ),
      slot(
        'close',
        'Close',
        true,
        'Turn it back: ask the audience their answer, or tease the next artifact.',
      ),
    ],
    kill_rules: [
      'Fake or doctored screenshots',
      'Reacting to something with no tension or question in it',
      'A take that restates the artifact',
      'Going past 30 seconds',
    ],
    beat_timing: null,
    target_length_min_sec: null,
    target_length_max_sec: 30,
    slide_count_min: null,
    slide_count_max: null,
    requires: ['on_camera_comfortable'],
    cta_keyword_policy: 'none',
    primary_signal: 'comment_velocity',
  },
  {
    id: 'before_and_after',
    name: 'Before and After',
    family: 'video',
    when_to_use:
      'Proof content. Use whenever a real, numeric transformation exists. Never use without one.',
    why_it_works:
      'The gap between the two numbers is the hook, the middle is the retention, the reveal is the share.',
    slot_schema: [
      slot(
        'before_state',
        'Before state',
        true,
        'The starting state with a number, on screen first. Shown rather than claimed wherever an artifact exists.',
      ),
      slot(
        'after_teased',
        'After teased',
        true,
        'The end number appears in the hook text alongside the before, but the proof is withheld to the end. The hook is the two numbers, same construction as the two hander.',
      ),
      slot(
        'middle_beats',
        'Middle beats',
        true,
        'What actually changed, each an action with a payoff. If the product appears it is one of these beats, never all of them. A transformation with no visible middle reads as fake and dies in the comments.',
        2,
        4,
      ),
      slot(
        'timeframe',
        'Timeframe',
        true,
        'Stated plainly. Transformations without timeframes read as scams.',
      ),
      slot(
        'proof_artifact',
        'Proof artifact',
        true,
        'The after, shown: the screenshot, the letter, the stat line, the clip. Last three seconds.',
      ),
      slot(
        'cta_keyword',
        'CTA keyword',
        false,
        'Strong here, because intent peaks at the reveal.',
      ),
    ],
    kill_rules: [
      'No numbers',
      'No middle',
      'No timeframe',
      'Showing the after first, which closes the loop and ends retention',
      'Claims that outrun what the proof artifact shows',
    ],
    beat_timing: null,
    target_length_min_sec: 21,
    target_length_max_sec: 34,
    slide_count_min: null,
    slide_count_max: null,
    requires: ['has_transformation', 'proof_artifact'],
    cta_keyword_policy: 'optional',
    primary_signal: 'shares',
  },
  {
    id: 'red_flags_green_flags',
    name: 'Red Flags and Green Flags',
    family: 'either',
    when_to_use:
      'Save bait plus comment bait in one. Use when the niche document contains a decision the reader makes under uncertainty.',
    why_it_works:
      'The reader is about to make the decision and saves the list as a checklist. One debatable flag drives the comments.',
    slot_schema: [
      slot(
        'decision_context',
        'Decision context',
        true,
        'The hook names the decision.',
      ),
      slot(
        'flag_items',
        'Flag items',
        true,
        'Red or green or mixed. Each item is the flag named plainly as an observable behavior, plus one sentence of why. Flags must be things the reader can actually observe. A behavior is usable. An internal trait is not.',
        4,
        6,
      ),
      slot(
        'debatable_flag',
        'Debatable flag',
        true,
        'One flag reasonable people will argue about. Same rules as the tier list controversial placement.',
      ),
      slot(
        'embedded_plug',
        'Embedded plug',
        false,
        'One sentence where the product is how the reader checks a flag.',
      ),
      slot(
        'close',
        'Close',
        true,
        'Save this for when it happens. The save ask is native to this format.',
      ),
    ],
    kill_rules: [
      'Obvious flags everyone already knows',
      'Flags that are not observable',
      'Moralizing',
      'Mixing in flags from outside the stated decision',
    ],
    beat_timing: null,
    target_length_min_sec: 25,
    target_length_max_sec: 40,
    slide_count_min: null,
    slide_count_max: null,
    requires: [],
    cta_keyword_policy: 'none',
    primary_signal: 'saves_per_reach',
  },
];

// Appendix A: FieldVision seed examples. Tenant data, never universal
// doctrine. shot_library is a pseudo slot key holding the tenant's image
// direction pool for slideshow production.
export const APPENDIX_A_EXAMPLES: Array<{
  format_id: string;
  slot_key: string;
  example: string;
}> = [
  { format_id: 'two_hander_comparison', slot_key: 'on_screen_hook', example: '0 offers vs 12 offers.' },
  { format_id: 'two_hander_comparison', slot_key: 'on_screen_hook', example: 'D3 walk on vs D1 commit.' },
  { format_id: 'two_hander_comparison', slot_key: 'pain_detail', example: 'emailed 200 coaches and got two replies, both auto responses.' },
  { format_id: 'two_hander_comparison', slot_key: 'demo_beats', example: 'upload film, the system builds the profile, it matches to schools at your level, it sends the outreach.' },
  { format_id: 'two_hander_comparison', slot_key: 'cta_keyword', example: 'offers' },
  { format_id: 'two_hander_comparison', slot_key: 'cta_keyword', example: 'film' },
  { format_id: 'two_hander_comparison', slot_key: 'cta_keyword', example: 'd1' },
  { format_id: 'talking_head_advice', slot_key: 'credential', example: 'current D1 starter. Committed with no showcase exposure.' },
  { format_id: 'slideshow_tip_list', slot_key: 'cover_slide', example: 'things to know before becoming a D1 soccer player.' },
  { format_id: 'slideshow_tip_list', slot_key: 'shot_library', example: 'team huddle, weight room, match action, campus facility, signing day, empty stadium.' },
  { format_id: 'myth_bust', slot_key: 'myth_verbatim', example: 'you need showcase circuit exposure to get recruited.' },
  { format_id: 'myth_bust', slot_key: 'receipt', example: 'committed players from the roster who never attended a showcase, with the count.' },
  { format_id: 'mistake_callout', slot_key: 'standing', example: 'went through recruitment twice, first time got zero offers.' },
  { format_id: 'storytime', slot_key: 'open_loop_hook', example: 'a coach called me the night before signing day.' },
  { format_id: 'day_in_the_life', slot_key: 'identity_line', example: 'day in the life of a D1 soccer player during preseason.' },
  { format_id: 'tier_list', slot_key: 'category', example: 'ranking recruiting outreach methods.' },
  { format_id: 'tier_list', slot_key: 'category', example: 'ranking conference facilities.' },
  { format_id: 'before_and_after', slot_key: 'before_state', example: 'junior year, zero coach responses, the empty inbox on screen.' },
  { format_id: 'red_flags_green_flags', slot_key: 'decision_context', example: 'red flags when a college coach contacts you.' },
];
