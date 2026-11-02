/**
 * "Fill in with AI" for the Briefs forms. This is the local plan the prototype
 * shipped (hook, points from a pool, close with the product line) so the
 * staged reveal works offline; `planGuided` and `longTextPlan` are the seams
 * where the Claude call described in SCRIPTS.md plugs in.
 */
import { newClip, stText, type BriefClip, type BriefType, type GuidedState } from './brief-library';

type Point = { say: string; screen: string };

const SCRIPT_POOL: Point[] = [
  { say: 'Lead with your best three seconds. Not the warmup, not the walk-on. The one play that makes a coach rewind.', screen: 'Best play first' },
  { say: 'Film from behind the goal, not the sideline. From the sideline every pass looks flat. From behind the goal they can see the space you found.', screen: 'Film from behind the goal' },
  { say: 'Put the score and the minute on screen. A goal in the 88th at one all tells a story. A goal with no context is just a clip.', screen: 'Score and minute on screen' },
  { say: 'Cut on the touch, not the celebration. Coaches want to see the decision, not the dance.', screen: 'Cut on the touch' },
  { say: 'One song, straight through. Every time the music drops they look at the edit instead of you.', screen: 'One song, no drops' },
  { say: 'Lock exposure before kickoff. Otherwise your face goes dark the second the sun moves.', screen: 'Lock exposure first' },
  { say: 'Keep the ball in the bottom third of the frame. That way your run stays in shot, not just the ball.', screen: 'Ball in the bottom third' },
];

const CTA_SCREEN = 'FieldVision scores your film from one phone video. Link in bio.';
const CLOSE_LINE = 'FieldVision does the cutting for you from one phone video. Link in bio, your first match is free.';

function hookFor(t: string, n: number): string {
  if (/^how/i.test(t)) return `If a coach closes your film in ten seconds, it is not your footwork. It is ${n === 1 ? 'this one thing' : `these ${n} things`}.`;
  if (/^why/i.test(t)) return `${t}. I lost two trials before someone told me this.`;
  return `${t}. Number ${n} is the one everybody skips.`;
}

const GS_SUGGEST = ['gs-1', 'gs-2', 'gs-3'];

/** Green screen, per clip mode: hook and CTA face to camera, each tip gets a suggested frame behind the creator. */
function greenify(clips: BriefClip[], g: GuidedState, type: BriefType): BriefClip[] {
  if (type !== 'Greenscreen' || g.fullGreen) return clips;
  return clips.map((c, i) => {
    const mid = i > 0 && !c.cta;
    return { ...c, green: mid, gs: mid ? { src: GS_SUGGEST[(i - 1) % GS_SUGGEST.length], label: 'Suggested frame', kind: 'image', dur: 0 } : null };
  });
}

export type GuidedPlan = { title: string; phrase: string; clips: BriefClip[]; caption: string; tags: string[] };

export function planGuided(g: GuidedState, type: BriefType): GuidedPlan {
  const t = (g.title || '').trim() || 'Why your first touch looks slow on camera';
  const m = t.match(/\b(\d+)\b/);
  const n = m ? Math.min(7, Math.max(1, +m[1])) : 3;
  const topic = t.replace(/^(how to\s+)?/i, '').replace(/^\d+\s+/, '').toLowerCase();
  let clips: BriefClip[];
  if (type === 'Long Text') {
    clips = [newClip(t, { onScreen: t })];
  } else if (type === 'Slideshow') {
    clips = [newClip('', { onScreen: t })]
      .concat(SCRIPT_POOL.slice(0, n).map((p, i) => newClip('', { onScreen: `${i + 1}. ${p.screen}` })))
      .concat([newClip('', { onScreen: CTA_SCREEN, cta: true, doc: { texts: [stText(CTA_SCREEN, { y: 22, size: 20 })], overlays: [{ id: 'prod', x: 50, y: 62, w: 58, src: 'grad:app', label: 'App screen' }] } })]);
  } else {
    clips = [newClip(hookFor(t, n), { onScreen: t })].concat(
      SCRIPT_POOL.slice(0, n).map((p, i) => newClip(i === n - 1 ? `${p.say} ${CLOSE_LINE}` : p.say, { onScreen: `${i + 1}. ${p.screen}`, cta: i === n - 1 })),
    );
  }
  return {
    title: t,
    phrase: g.link ? 'college soccer recruiting film' : m ? `${topic} soccer` : `how to ${topic}`,
    clips: greenify(clips, g, type),
    caption: g.link && g.linkNotes ? `${g.linkNotes.trim().replace(/\.$/, '')}. ${t} with FieldVision, from one phone video.` : `${t}. FieldVision scores your film from one phone video.`,
    tags: ['#collegesoccer', '#soccerrecruiting', '#matchfilm', '#fieldvision'],
  };
}

/** Outline fill: title (when empty) and notes, from a link or a title. */
export const AI_FILL = {
  link: { title: 'Stop filming from the sideline. Do this instead', notes: 'Same structure as the reference.\nHook: call out the mistake in the first line.\nMiddle: three quick fixes, show the phone setup for each.\nClose: FieldVision scores the film for you. Link in bio.' },
  title: { title: '', notes: 'Hook: one line that names the problem.\nMiddle: two or three points, each with one example from a real match.\nClose: FieldVision does this from one phone video. Link in bio.' },
} as const;

export const LONG_TEXT_NOTES = 'One take, eyes on the lens, natural light. Hold the frame for the full 7 seconds. The text is reworded for each creator before it goes out.';

// ————— Long text plan (port of v2-longtext.js): {a|b|c} spins resolve at random on every call. —————

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const spin = (s: string) => s.replace(/\{([^{}]+)\}/g, (_, g: string) => pick(g.split('|'))).replace(/\s+([.,!?])/g, '$1').replace(/ {2,}/g, ' ').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const topicOf = (t: string) => t.replace(/^(how to|why|what|the)\s+/i, '').replace(/^\d+\s+/, '').replace(/[.?!]+$/, '').trim();

const HOW = {
  p1: [
    "{The reason|The real reason|Honestly, the reason} you're not getting recruited {isn't|is not} {your highlights|your highlight video|your film}. {You're just|You are just} {not making it|not putting it together|not cutting it} the right way.",
    '{Nobody|No coach|Not one coach} is {going to|gonna} {sit through|watch} {90 minutes|a full match|a whole game} {to find|looking for} your {best play|three good touches}. {They open the link, give it ten seconds, and move on.|Ten seconds. That is what you get.|You get about ten seconds, then they are gone.}',
    "{If you're|If you are} {sending film|emailing coaches|posting highlights} and {hearing nothing back|getting silence|getting no replies}, it's {probably|most likely|almost always} not your {game|talent|footwork}. It's {how the video is built|the way the video is put together|the edit}.",
  ],
  p2: [
    'Coaches {open|click} {about|roughly|around} one in ten links {they get|that land in their inbox|that get sent to them}. {Most|Nearly all|Almost every one} of them {close|skip|back out of} a {full match|90 minute upload|full game} {within|inside|in under} ten seconds. A {40 second|short|tight} reel with your {best|strongest|three best} plays {first|up front|at the top} is what {actually|really} gets watched.',
    '{Film from behind the goal, not the sideline.|Shoot from behind the goal.} From the sideline every pass looks {flat|the same|like nothing}. From behind the goal they can {see|actually see} the space you {found|made|opened up}. {Put the score and the minute on screen|Add the score and minute} so a goal in the 88th at one all {tells a story|means something|reads like a story}.',
    '{Lead with|Open on|Start with} your best three seconds. Not the warmup, not the walk on. {One song straight through, no cuts on the beat.|One song, no drops, no edits on the beat.} {Score and minute on screen.|The score and the minute, on screen, every clip.} {Behind the goal, not the sideline.|Camera behind the goal, never the sideline.}',
  ],
  p3: [
    "{That's it.|That's the whole thing.|That is the entire difference.} {Do that and they watch to the end.|Do that and the reel gets watched.|Fix that and the replies start.}",
    "{It's not talent.|It was never about talent.|This has nothing to do with talent.} {It's the edit.|It's the first ten seconds.|It's whether they keep watching.} {Fix the edit.|Fix the first ten seconds.|Give them a reason to stay.}",
    "{Same player, different video, different result.|Same footage, better order, different outcome.} {Stop sending full matches.|Stop sending the whole game.} {Send the 40 seconds that matter.|Send the part they'll actually watch.}",
  ],
};
const WHY = {
  p1: [
    'Does anyone else feel like {TOPIC} and {nobody|no one} {talks about it|says anything|will explain why}?',
    "{Here's|Here is} {the part|the thing|what} {nobody|no coach|no one} tells you about why {TOPIC}.",
    "{TOPIC_CAP}... {Let's|Let me} {talk about|get into|break down} {why|what's actually going on}.",
  ],
  p2: [
    "Coaches {open|click} {about|roughly} one in ten links. {They give|You get} ten seconds, {maybe|at most} fifteen. If the first {clip|play|touch} is a warmup or a {walk on|throw in|celebration}, {they're gone|that's it|it's over} before your {best play|goal|assist} ever {shows up|loads|comes on screen}.",
    'A {full match|90 minute upload|whole game} {is|gets} closed in under ten seconds {almost|nearly} every time. {Meanwhile|And yet|Still}, a {40 second|short} reel {with|that opens on} the {best|strongest} three plays {up front|first} gets watched {to the end|all the way through|twice}.',
    'From the sideline every pass looks {flat|the same|like nothing happened}. From behind the goal they can {see|actually see} the space you {found|made}. {Same play, different angle, different reaction.|Same touch, different camera, different answer.}',
  ],
  p3: [
    "{It's not your game.|It was never your game.|This isn't about your game.} {It's the video.|It's the edit.|It's the first ten seconds.} {Fix the video and the replies change.|Change the video and watch what happens.|Fix that and watch who answers.}",
    '{Nobody is going to tell you this in a camp email.|No camp email is going to say this.|You will not hear this from a recruiting service.} {So here it is.|So now you know.|Now you do.}',
    '{Same footage, better order, different result.|Same player, different edit, different season.} {Pay attention to how you send film before you send another one.|Think about this before you send the next link.}',
  ],
};
const NUM = {
  p1: [
    '{N} things {about|in} {TOPIC} that {coaches|scouts|college coaches} {notice|see|clock} {in the first ten seconds|before you ever get an email back|and never tell you about}.',
    "{If|When} a coach {closes|skips} your film {in ten seconds|right away}, it's {usually|almost always|probably} one of these {N} things.",
  ],
  p2: [
    "Your off ball runs. Where you look before the pass. How fast you {recover|get back|track back}. Your first touch under pressure. Who you pass to {when you're tired|in the 80th minute|when your legs are gone}. {None of that shows up in a goal compilation.|A goal compilation shows none of it.|You cannot see any of that in a highlight of goals.}",
    'The angle. The {first|opening} three seconds. {Whether the score is on screen.|The score and the minute on screen.} {How long the clip runs after the touch.|Whether you cut on the touch or the celebration.} {Every one of those is a decision, and most reels get every one of them wrong.|Each one is a choice, and most reels miss all of them.}',
  ],
  p3: [
    "{Fix those and the same footage gets a different answer.|Change those and the same plays read completely differently.} {That's it.|That's the list.|Nothing else on the list matters until those do.}",
    "{None of this is talent.|This has nothing to do with how good you are.} {It's film.|It's how you film and how you cut.} {Film is fixable.|And film is the easy part to fix.}",
  ],
};
const GEN = {
  p1: [
    "{Let's|Let me} {talk about|get into} {TOPIC}, {because|since} {nobody|no one} {explains it|says the quiet part|puts it plainly}.",
    "{TOPIC_CAP}. {Here's|Here is} {what|the part} {nobody|no coach} {tells you|says out loud}.",
  ],
  p2: HOW.p2,
  p3: HOW.p3,
};

/** A creator's copy of a stored long text: `{a|b}` spins resolve again so no two accounts post the same string. */
export function varyLongText(src: string): string {
  return src.includes('{') ? src.split('\n\n').map((p) => cap(spin(p))).join('\n\n') : src;
}

/** Two or three short paragraphs for a 7 second text post. Never the same string twice. */
export function longTextPlan(title: string): string {
  const t = (title || '').trim();
  const topic = topicOf(t) || 'getting recruited';
  const m = t.match(/\b(\d+)\b/);
  const n = m ? m[1] : '3';
  const set = /^how/i.test(t) ? HOW : /^why/i.test(t) ? WHY : m ? NUM : GEN;
  const fill = (s: string) => spin(s).replace(/TOPIC_CAP/g, cap(topic)).replace(/TOPIC/g, topic).replace(/\bN\b/g, n);
  const ps = [fill(pick(set.p1)), fill(pick(set.p2))];
  if (Math.random() < 0.8) ps.push(fill(pick(set.p3)));
  return ps.map(cap).join('\n\n');
}

// ————— Title suggestions (TitleInput) —————

const IDEA_TITLES = [
  '5 things film reveals that your coach misses',
  'How to track your sprint speed from one phone video',
  'Why your first touch looks slow on camera',
  'What a $40 tripod does for your highlight reel',
  '3 passes scouts rewind every time',
  'How I found my weak foot stat in 2 minutes',
  'Stop filming from the sideline. Do this instead',
  'The one number every striker should know',
  'How to send film a coach actually opens',
  'Reacting to my own heat map',
  'Things nobody tells you about getting scouted',
  'Your off ball runs, scored',
  'How to film a full match on a phone',
  'Why 90 minutes of film gets closed in 10 seconds',
  '4 myths about getting recruited',
  'How to cut a 3 minute reel from a full game',
  'The pass map that got me a trial',
  'What coaches look at first on FieldVision',
  'Recovery speed: the stat nobody films',
  'How to tag your best plays in one tap',
  'My recruiting week, start to finish',
];
const GEN_T = ['tips for the perfect highlight video', 'things film reveals that your coach misses', 'mistakes that kill your highlight reel', 'drills that show up on film', 'things scouts rewind every time', 'myths about getting recruited', 'stats every striker should know'];
const HOW_T = ['make the perfect highlight video', 'film a full match on a phone', 'send film a coach actually opens', 'track your sprint speed from one video', 'cut a 3 minute reel from a full game', 'get scouted from your phone'];
const WHY_T = ['your first touch looks slow on camera', '90 minutes of film gets closed in 10 seconds', 'coaches skip your highlight reel', 'your best plays never make the reel'];

/** Up to five title ideas for what is typed so far: numbers, "how", "why" and templated variations. */
export function titleIdeas(value: string, extra: string[] = []): string[] {
  const tq = (value || '').trimStart();
  if (tq.length < 1) return [];
  const tLow = tq.toLowerCase();
  const words = tLow.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || '';
  const num = (tLow.match(/^(\d+)\b/) || [])[1];
  const gen: string[] = [];
  if (num) GEN_T.forEach((t) => gen.push(`${num} ${t}`));
  if (/^how/.test(tLow)) HOW_T.forEach((t) => gen.push(`How to ${t}`));
  if (/^why/.test(tLow)) WHY_T.forEach((t) => gen.push(`Why ${t}`));
  if (/^(what|the)/.test(tLow)) gen.push('What coaches look at first on FieldVision', 'The one number every striker should know', 'The pass map that got me a trial');
  const fits = (t: string) => {
    const l = t.toLowerCase();
    if (l === tLow) return 0;
    if (l.startsWith(tLow)) return 3;
    const ws = l.split(/\s+/);
    const rest = words.slice(0, -1).every((w) => ws.some((x) => x.startsWith(w)));
    const lastOk = !last || ws.some((x) => x.startsWith(last));
    if (rest && lastOk) return 2;
    if (words.every((w) => l.includes(w))) return 1;
    return 0;
  };
  let ideas = [...new Set(gen.concat(extra, IDEA_TITLES))]
    .map((t) => [t, fits(t)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  if (tq.length >= 3 && ideas.length < 3) {
    const topic = tq.replace(/^(how to|why|what|the)\s+/i, '').replace(/[.?!]+$/, '').trim();
    const low = topic.charAt(0).toLowerCase() + topic.slice(1);
    const own = [`How to ${low}`, `Why ${low} matters more than you think`, `3 things about ${low} coaches never say`, `${topic.charAt(0).toUpperCase() + topic.slice(1)}: what nobody tells you`, `The truth about ${low}`].filter((t) => t.toLowerCase() !== tLow);
    ideas = [...new Set(ideas.concat(own))].slice(0, 5);
  }
  return ideas;
}

/** Words of `t` that start with a typed word, for bolding in the suggestion list. */
export function matchedWords(t: string, typed: string): { text: string; hit: boolean }[] {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  return t.split(/(\s+)/).map((w) => ({ text: w, hit: !!w.trim() && words.some((q) => w.toLowerCase().startsWith(q)) }));
}

/** Sample link the Paste pill drops in when the clipboard holds no link. */
export const SAMPLE_LINK = 'tiktok.com/@recruitready/video/7318';
