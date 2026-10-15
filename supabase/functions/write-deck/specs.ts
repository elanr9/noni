// What every post type is, written for the model. One spec per post type the
// editor offers (lib/brief-copy.ts), built from the UGC bible
// (files/ugc-bible.md) and the voice doc (instructions-from-claude/voice-doc-v1.md).
// The editor's deck is always: cover, then the body slides, with one CTA
// slide sitting among them as a counted item.

export type Format = 'slideshow' | 'reel';
export type Kind = 'handheld' | 'story';

export type Range = [number, number];

/** Word ranges the server checks. null means the field is not written. */
export type Shape = {
  coverText: Range;
  coverShot: Range | null;
  pointText: Range;
  pointShot: Range | null;
  ctaText: Range;
  ctaShot: Range | null;
};

export type TypeSpec = {
  /** What the post is and why it works, in one breath. */
  what: string;
  cover: string;
  body: string;
  cta: string;
  /** How a slide or point is laid out, said to the model. */
  slideShape: string;
  /** What kills this type; the model checks itself against it. */
  kills: string;
  /** Default count of body slides including the CTA. */
  count: number;
  numbered: boolean;
  shape: Shape;
};

// Short on purpose: the manager wants ideas to riff on, not explanations.
// A slideshow slide is a 2 to 6 word header plus at most one short sentence;
// a reel cue is one line.
const SLIDESHOW_SHAPE: Shape = {
  coverText: [3, 10],
  coverShot: [3, 8],
  pointText: [3, 20],
  pointShot: [3, 8],
  ctaText: [6, 22],
  ctaShot: [3, 8],
};

const REEL_SHAPE: Shape = {
  coverText: [3, 10],
  coverShot: [5, 12],
  pointText: [2, 8],
  pointShot: [4, 12],
  ctaText: [4, 12],
  ctaShot: [6, 16],
};

/** One line cue rule, said to the model wherever reel cues are written. */
export const CUE_RULE =
  'Cues are prompts for the creator, not instructions about what to say: never start a cue with Say, Talk about, Mention, Explain or Tell. Write the idea itself in the creator\'s words ("Your subject line is the first thing they judge"), never a script, never a setup sentence.';

const REEL_POINT =
  `Each point has text: the on screen label for that clip, 2 to 8 words, the move compressed so someone watching on mute still gets it. And shot: the cue, ONE line of 4 to 12 words, the idea in the creator's words to riff on ("Your subject line is the first thing they judge"). One concrete detail max, short. ${CUE_RULE}`;

const REEL_COVER =
  'cover.text is the title card on screen for the first two seconds, 3 to 10 words, no colon. cover.shot is the spoken hook, ONE punchy line of 5 to 12 words, the same promise said out loud so the audio, the title card and the caption all carry the search phrase. No opener ("So,", "Hey guys", "Let\'s talk about"), straight to the point.';

export const SPECS: Record<Format, Record<string, TypeSpec>> = {
  slideshow: {
    howto: {
      what: 'A how to slideshow: a reader who wants one specific outcome swipes through the steps in the order they do them. It earns saves because it is a reference they come back to.',
      cover: 'The cover is the query the reader types, written as "How to <one specific outcome>", under 10 words. The outcome is narrow (email a college coach, film a highlight video on your phone), never broad (get recruited).',
      body: 'Each body slide is one step, in the order the reader does it. A step is an action they can do tonight, short, one concrete detail max.',
      cta: 'The CTA slide is one of the steps: the step where the product does the work, written as the creator doing that step with it.',
      slideShape: 'Line one: the step number and a short header naming the action, 2 to 6 words ("2. Lead with your grad year"). Line two: at most ONE short sentence on how, one concrete detail max. The whole slide stays under 18 words.',
      kills: 'Steps out of order. Steps that are vague goals instead of actions. Two steps on one slide. A cover outcome so broad no slideshow could deliver it.',
      count: 5,
      numbered: true,
      shape: SLIDESHOW_SHAPE,
    },
    tips: {
      what: 'A numbered tips slideshow: the count on the cover is the promise, one tip per slide. The cheapest format to make and the best for saves.',
      cover: 'The cover leads with the exact number of body slides (the CTA slide counts) and names the specific thing the tips are for, under 10 words ("5 tips for a highlight video coaches finish").',
      body: 'Each body slide is one tip a reader can act on, said short.',
      cta: 'The CTA slide is one of the numbered tips, where the tip is something the product does, said as the creator\'s own habit.',
      slideShape: 'Line one: the tip number and a short header, 2 to 6 words ("3. Put your best clip first"). Line two: at most ONE short sentence on why or how, one concrete detail max. The whole slide stays under 18 words.',
      kills: 'Tips any sport or any product could claim. Headers that name a topic instead of the move ("Film matters"). Body text over two lines. Explaining instead of telling. A count on the cover that does not match the slides.',
      count: 5,
      numbered: true,
      shape: SLIDESHOW_SHAPE,
    },
    start: {
      what: 'A getting started slideshow for someone at zero: the first steps in order, small enough to start this week. It works because the reader feels behind and this makes it doable.',
      cover: 'The cover names the starting point the reader is in, under 10 words ("Starting recruiting as a sophomore with no film").',
      body: 'Each body slide is the next first step, in order, sized so a beginner can do it this week. Earlier steps are the easiest.',
      cta: 'The CTA slide is the step where the product removes the hardest part for a beginner, said as what the creator would do if they were starting over.',
      slideShape: 'Line one: the step number and a short header, 2 to 6 words ("1. Pick 30 schools tonight"). Line two: at most ONE short sentence with the concrete how. The whole slide stays under 18 words.',
      kills: 'Advanced moves a beginner cannot do yet. Steps with no size ("research schools" instead of "pick 30 schools"). Talking down to the reader.',
      count: 4,
      numbered: true,
      shape: SLIDESHOW_SHAPE,
    },
    myths: {
      what: 'A myths slideshow: each slide states a belief the reader actually holds, then kills it with a specific receipt and gives the real move. It gets shared because people send it to the friend who believes the myth.',
      cover: 'The cover leads with the exact number of myths and the cost of believing them, under 10 words ("4 recruiting myths that cost you offers").',
      body: 'Each body slide is one myth stated exactly the way players and parents say it, then the truth with one receipt (a number, a named rule, a firsthand result), short.',
      cta: 'The CTA slide is one of the myths, where the truth is something the product makes easy, said as the creator\'s own experience.',
      slideShape: 'Two lines: "Myth: <the belief, in the words people use>" then "Truth: <the correction and the receipt, ONE short sentence>". Under 24 words in all.',
      kills: 'Myths nobody holds (strawmen). A truth that is an opinion with no receipt. A mocking tone toward people who believed it; the reader is one of them.',
      count: 4,
      numbered: false,
      shape: { ...SLIDESHOW_SHAPE, pointText: [6, 26], ctaText: [8, 28] },
    },
  },
  reel: {
    talking: {
      what: 'One person to camera giving advice they earned. The creator\'s credential plays before the hook (it renders per creator, never write one), then the hook, then the points.',
      cover: REEL_COVER,
      body: 'Each point is one idea from someone who has been through it, short enough to riff on.',
      cta: 'The CTA point is one of the pieces of advice, where the move is something the product does, said as the creator\'s own tool.',
      slideShape: REEL_POINT,
      kills: 'A cue longer than one line. A cue that tells the creator what to say instead of giving the idea. A point that reads like a landing page. A hook that sounds written instead of said. A CTA that sounds like an ad read.',
      count: 4,
      numbered: false,
      shape: REEL_SHAPE,
    },
    tips: {
      what: 'A numbered list to camera: the number in the hook is the promise and every clip is one item. The format that has performed best for this team.',
      cover: `${REEL_COVER} The title card leads with the exact number of points (the CTA counts).`,
      body: 'Each point is one numbered item said plainly, one concrete detail max.',
      cta: 'The CTA point is one of the numbered items, landing in the back half of the list, where the item is something the product does for the creator.',
      slideShape: `${REEL_POINT} Labels start with their number ("3. Email before the ID camp").`,
      kills: 'Items any sport could claim. A count in the hook that does not match the points. The product item placed first.',
      count: 5,
      numbered: true,
      shape: REEL_SHAPE,
    },
    howto: {
      what: 'A how to reel: steps in order, each one shown or said on camera, so the viewer can follow along.',
      cover: `${REEL_COVER} The title card is the outcome as the viewer would search it.`,
      body: 'Each point is one step, in order, short.',
      cta: 'The CTA point is the step the product does, said as the creator doing it.',
      slideShape: `${REEL_POINT} Labels start with the step number ("2. Subject line with grad year").`,
      kills: 'Steps out of order. Goals instead of actions. Steps that need a screen recording nobody can get.',
      count: 4,
      numbered: true,
      shape: REEL_SHAPE,
    },
    explainer: {
      what: 'An explainer: one question the audience keeps asking, answered start to finish from both sides of the creator\'s experience.',
      cover: `${REEL_COVER} The title card is the question or the why ("Why coaches ignore your emails").`,
      body: 'Each point is one beat of the answer and builds on the last: the reason, the proof, what to do about it. One line each.',
      cta: 'The CTA point is the beat where the fix is something the product does.',
      slideShape: `${REEL_POINT} Labels are not numbered; they read as the beat of the answer.`,
      kills: 'A list pretending to be an explanation. Beats that repeat. An answer that hedges.',
      count: 3,
      numbered: false,
      shape: REEL_SHAPE,
    },
    storytime: {
      what: 'A storytime: a real first person story told in past tense with an open loop. Every creator has their own story, so the brief gives prompts, never invented biography.',
      cover: `${REEL_COVER} The hook states the outcome or the worst moment first, never the chronological beginning ("I had zero offers in March of junior year").`,
      body: 'The points are the story beats in order: the stakes, what went wrong, then where it landed. Each cue names the moment of their own story in one short line, with a bracket where their own detail goes ("The coach email nobody answered [month]"). Never state a fact about the creator\'s life; leave a bracket for it.',
      cta: 'The CTA point is the turn of the story: the moment things changed, where the product is one detail of what they did, never the hero.',
      slideShape: `${REEL_POINT} Labels name the beat ("The email nobody answered"). Cues may use one bracket like [your school] where the creator\'s own fact goes.`,
      kills: 'Starting at the beginning. Invented facts about the creator. The product saving the day. Beats with no concrete detail.',
      count: 4,
      numbered: false,
      shape: { ...REEL_SHAPE, pointShot: [4, 14] },
    },
    green: {
      what: 'A green screen react: the creator over a real screenshot (a coach reply, a comment on their post, a stat) giving their take. The screenshot does the hooking.',
      cover: `${REEL_COVER} The title card names what is on screen and the tension in it ("Reacting to a real coach reply").`,
      body: 'The first point\'s cue starts with "On screen:" and the kind of real screenshot to put behind them. Each point is one short beat of the take: what it means, what is wrong or right about it, what to do.',
      cta: 'The CTA point is the beat where what to do next is something the product does.',
      slideShape: `${REEL_POINT} Labels are short takes, not numbered.`,
      kills: 'A fake or doctored screenshot. A take that only restates the screenshot. Going long.',
      count: 3,
      numbered: false,
      shape: REEL_SHAPE,
    },
    longtext: {
      what: 'A long text reel: a 6 second clip with more text on it than anyone can read in 6 seconds, so viewers pause or rewatch. Completion and rewatches carry it.',
      cover: 'cover.text is the long block: 45 to 110 words, written like a player venting or advising in their notes app, a short first line that hooks, then line breaks between thoughts. No title, no hashtags. cover.shot is what the creator does on camera during the clip, one plain line (lacing boots in the car, juggling in the backyard).',
      body: 'There are no body points.',
      cta: 'The CTA slide text is one short first person line, 6 to 16 words, that names the product, shown as the last line of the block.',
      slideShape: '',
      kills: 'A block someone can finish in 6 seconds. Advice with no detail. A block that reads like a caption.',
      count: 0,
      numbered: false,
      shape: { coverText: [45, 110], coverShot: [4, 20], pointText: [2, 8], pointShot: null, ctaText: [6, 16], ctaShot: null },
    },
  },
};

/**
 * The post types the editor offers per format, with the body slide range
 * (CTA included). Mirrors POST_TYPES_SLIDESHOW / POST_TYPES_REEL in
 * lib/brief-copy.ts (id, name, minPoints..maxPoints); a unit test keeps the
 * two in step. Long text has no body slides.
 */
export type TypeInfo = { id: string; name: string; min: number; max: number };

export const POST_TYPE_LIST: Record<Format, TypeInfo[]> = {
  slideshow: [
    { id: 'howto', name: 'How to', min: 3, max: 7 },
    { id: 'tips', name: 'Numbered tips', min: 3, max: 10 },
    { id: 'start', name: 'Getting started', min: 3, max: 7 },
    { id: 'myths', name: 'Myths', min: 3, max: 6 },
  ],
  reel: [
    { id: 'talking', name: 'Talking head', min: 3, max: 6 },
    { id: 'tips', name: 'Numbered list', min: 3, max: 8 },
    { id: 'howto', name: 'How to', min: 3, max: 6 },
    { id: 'explainer', name: 'Explainer', min: 2, max: 5 },
    { id: 'storytime', name: 'Storytime', min: 2, max: 6 },
    { id: 'green', name: 'Green screen react', min: 2, max: 5 },
    { id: 'longtext', name: 'Long text', min: 1, max: 1 },
  ],
};

export function specFor(format: Format, typeId: string | undefined): TypeSpec {
  const list = SPECS[format];
  return (typeId && list[typeId]) || (format === 'reel' ? list.talking : list.tips);
}

/** Story kind: the manager sets the cover and CTA, the creator fills the middle. */
export function storyNote(format: Format): string {
  return format === 'reel'
    ? 'STORY KIND: the manager writes only the hook and the CTA; the creator records their own beats in between. cover.text is the title card and also the theme the creator riffs on, so it must leave room for any creator\'s own version. cover.shot is the hook they say first.'
    : 'STORY KIND: the manager writes only the cover and the CTA slide; the creator writes their own slides and picks their own photos. The cover is the theme every creator builds on, so it must leave room for any creator\'s own version.';
}

export function storyShape(format: Format, base: Shape): Shape {
  return { ...base, coverText: format === 'reel' ? [3, 12] : [3, 14] };
}

export const PLATFORM_RULES = [
  'HOW SHORT FORM WORKS (never break these to be clever):',
  'The viewer decides in under two seconds whether to stay. The first frame is the hook: text on screen and value or tension right away, no intro, no throat clearing.',
  'Completion, saves and shares carry distribution. Between two ideas, write the one someone would save or send to a teammate.',
  'TikTok and Instagram are search engines. Spoken words, on screen text and the caption are all indexed, and slideshow text is indexed per slide, so slide headers read like things a player would type.',
  'Native or nothing: it must read like a real player posted it from their phone, not like a brand.',
].join('\n');

export const VOICE_RULES = (productName: string, format: Format) =>
  [
    'VOICE: a real player who has been through recruiting talking to a younger player like a big brother. Blunt, specific, plain words, contractions fine. Hooks are flat statements of something useful; the specificity lives in the topic, never in clever wording. If a 17 year old would cringe saying it out loud, rewrite it. If the brand docs carry real creator transcripts, match their cadence, not a tone description.',
    'SHORT WINS: we want ideas, not explanations. Every line is the shortest version that still lands. One concrete detail max, short: a real number, a named rule or date, a named event or a moment only someone who lived it knows. Take facts from the brand docs and playbooks. Never invent a statistic, rule, date or result. Numbers beat adjectives.',
    'NO SETUP LINES: never "Here is why", "That is the real problem", "the real problem", "Say you used to", "Say what your old ... was", no stacked "and it ... every time" lists, no generic openers ("So,", "Hey guys", "Let\'s talk about", "Have you ever").',
    'GENERIC TEST: if a line could sit unchanged in a post for any sport or any product ("stay consistent", "be professional", "start early", "work hard"), it fails. Write the specific move behind it and why it works.',
    'BANNED: manufactured villains and insider bait ("your coach won\'t tell you", "what they don\'t want you to know", "the truth about", "secrets", "hacks"). Marketing words (elite, ultimate, unlock, level up, game changer, seamless, leverage, journey, crucial, essential, stand out, perfect). Colons in the cover. Balanced, symmetrical sentences. Three item lists inside one sentence. Any sentence that could sit on a landing page.',
    'No dashes of any kind and no semicolons. No hedge words (really, truly, actually, honestly, simply, literally, very). No emojis. No hashtags outside the hashtags field.',
    format === 'slideshow'
      ? 'SLIDESHOW TEXT IS POSTED WORD FOR WORD by every creator on the roster, so never write a personal fact (a school they played at, an offer they got) that would be false for some of them. Write advice and observations any of them can stand behind. First person is fine on the CTA slide.'
      : `REEL CUES ARE SPOKEN in each creator's own words over their own credential, so never state a creator's personal history as fact; leave a bracket where their own fact goes ("The first coach email I sent [month]"). Every cue is ONE line. ${CUE_RULE}`,
    `THE PRODUCT IS ${productName}. Credit it only with what the Features list or the Product truth says it does, by mechanism (it writes the email, sends it, follows up), never by benefit (saves time, streamlines). Name it only on the CTA slide and once in the caption. Value before pitch: the post is worth saving even for someone who never opens ${productName}.`,
    'Every slide is different from every other slide. No two make the same point.',
  ].join('\n');

export const CTA_NUDGE =
  'The CTA is a tip with the product in it, never an ad read. Add a nudge only when the brand docs name a CTA mechanic (for example comment a keyword and the creator sends a free trial), and then follow it exactly. Never "it is in my bio" or "link in bio" unless that mechanic says so.';

export const DETAILS_RULES = (productName: string) =>
  `CAPTION: one or two short sentences, under 180 characters, typed like a creator, not a brand. The first sentence carries the search phrase inside a natural sentence, never stuffed. Mention ${productName} once with the CTA mechanic or where to find it. It can turn a question back on the viewer. No hashtags inside it. HASHTAGS: 3 to 5, lowercase, no # sign: one broad, two niche, one about the problem or intent, from the hashtag bank when there is one, never generic viral tags. SEARCH PHRASE: what a target viewer actually types into TikTok search to find this exact post, lowercase, 3 to 8 words, and the post must deliver exactly that.`;

/** One ai_feedback row, as write-deck reads it. */
export type FeedbackRow = {
  kind: string;
  surface?: string | null;
  format?: string | null;
  post_type?: string | null;
  role?: string | null;
  before?: string | null;
  after?: string | null;
  note?: string | null;
};

const squash = (t: string | null | undefined, max = 160) => {
  const one = (t ?? '').replace(/\s*\n+\s*/g, ' / ').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 3).trimEnd()}...` : one;
};

/** The editor logs roles as cover, point, cta, caption, with ".shot" for the shot field. */
function fieldName(format: string | null | undefined, role: string | null | undefined): string {
  const reel = format === 'reel';
  const [r, shot] = (role ?? '').split('.');
  if (!r) return '';
  if (shot) {
    if (r === 'cover') return reel ? 'spoken hook' : 'cover photo';
    if (r === 'cta') return reel ? 'CTA cue' : 'CTA photo';
    return reel ? 'point cue' : 'slide photo';
  }
  if (r === 'cover') return reel ? 'title card' : 'cover';
  if (r === 'point') return reel ? 'point label' : 'slide';
  if (r === 'cta') return reel ? 'CTA label' : 'CTA slide';
  return r;
}

/**
 * "How this team edits our AI": the company's newest feedback (newest first),
 * compact, for the cached brand prefix. Up to 12 before/after pairs, the
 * covers they rejected and their revise notes as standing preferences.
 * Empty when there is nothing to learn from yet.
 */
export function feedbackBlock(rows: FeedbackRow[]): string {
  const pairs: string[] = [];
  const seenPair = new Set<string>();
  const rejected: string[] = [];
  const notes: string[] = [];
  for (const r of rows) {
    if (r.kind === 'edit' && pairs.length < 12) {
      const before = squash(r.before);
      const after = squash(r.after);
      if (!before || !after || before === after || seenPair.has(before)) continue;
      seenPair.add(before);
      const where = [r.format, fieldName(r.format, r.role)].filter(Boolean).join(' ');
      const how = r.surface === 'check' ? ' (a fix from the strict read they kept)' : '';
      pairs.push(`- ${where || 'line'}${how}: "${before}" -> "${after}"`);
    } else if (r.kind === 'dismiss' && rejected.length < 10) {
      const c = squash(r.before, 100);
      if (c && !rejected.includes(`- ${c}`)) rejected.push(`- ${c}`);
    } else if (r.kind === 'revise' && notes.length < 8) {
      const n = squash(r.note, 160);
      if (n && !notes.some((x) => x.toLowerCase() === `- ${n}`.toLowerCase())) notes.push(`- ${n}`);
    }
  }
  if (!pairs.length && !rejected.length && !notes.length) return '';
  return [
    'HOW THIS TEAM EDITS OUR AI (newest first; this is their taste, so write the way the "after" reads, never the way the "before" reads):',
    pairs.length ? `What the AI wrote -> what they shipped:\n${pairs.join('\n')}` : '',
    notes.length ? `Standing preferences from their revise notes (apply them without being asked):\n${notes.join('\n')}` : '',
    rejected.length ? `Covers they rejected (never pitch these or anything like them):\n${rejected.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
