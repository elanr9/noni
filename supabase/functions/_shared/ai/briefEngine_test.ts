// The deterministic parts of the brief engine, with a fake model. Run from
// supabase/functions: DENO_NO_PACKAGE_JSON=1 deno test --allow-env _shared/ai/
import { describe, it } from 'jsr:@std/testing@1/bdd';
import { expect } from 'jsr:@std/expect@1';
import {
  ANGLE_SCHEMA,
  CRITIC_SCHEMA,
  ENGINE_SYSTEM,
  OUTLINE_SCHEMA,
  SCRIPT_SCHEMA,
  TITLES_SCHEMA,
  WRITER_EFFORT,
  askBrief,
  tidyAnswers,
  budgetFor,
  buildContext,
  checkScript,
  countWords,
  enforceScript,
  legacyClaimId,
  resolveSpins,
  sanitizeCopy,
  writeBrief,
  type AdminClient,
  type Angle,
  type BriefEngineDeps,
  type CheckContext,
  type Critique,
  type GenerateArgs,
  type LegacyBrand,
  type ManagerAnswer,
  type QueuedQuestion,
  type Script,
} from './briefEngine.ts';
import type { BrainContext, BriefPlan, PlanClip, ReferenceAnalysis } from './contracts.ts';
import { PLAYBOOK_CORE, PLAYBOOK_REFERENCE, playbookForType } from './playbook.ts';

// ---------------------------------------------------------------- fixtures (an invented plant-care app)

const brain = (over: Partial<BrainContext> = {}): BrainContext => ({
  companyId: 'co-1',
  productName: 'Fernly',
  core: 'Fernly is a phone app that tells people when to water each houseplant.',
  constraints: 'Never say a plant cannot die.',
  retrieved: 'Quote [q1]: "I have killed three ferns and I do not know why."',
  approvedClaims: [
    { id: 'c2', wording: 'Reminds you on the day each plant needs water.', qualifier: null },
    { id: 'c1', wording: 'Identifies a plant from one photo.', qualifier: 'most common houseplants' },
  ],
  demoMoments: [
    { id: 'd1', title: 'Photo to schedule', start_state: 'the camera', user_action: 'photographs a plant', end_state: 'a watering schedule', seconds: 5, media_url: null },
  ],
  conflicts: [],
  coverage: 0.8,
  missing: [],
  bannedPhrases: ['green thumb'],
  ...over,
});

const legacy: LegacyBrand = {
  companyName: 'Fernly Inc',
  productName: 'Fernly',
  tone: 'dry',
  audience: 'people with a few houseplants',
  products: 'A plant watering app.',
  pillars: [],
  buyingPath: null,
  vertical: null,
  docs: { productTruth: 'Old sheet text.', audienceNiche: '', voice: '' },
  approvedClaims: [{ id: 'pf-9', name: 'Light meter', what_it_does: 'Measures light with the camera.', claim: '' }],
  features: [],
  hashtagBank: [],
  bannedPhrases: ['plant parent'],
};

const clip = (over: Partial<PlanClip> = {}): PlanClip => ({ say: 'I killed three ferns before I worked this out.', onScreen: 'Three ferns', cta: false, shot: 'Dead fern held to the lens.', demo_moment_id: null, claim_ids: [], ...over });

const goodScript = (): Script => ({
  title: 'Why your fern keeps dying',
  phrase: 'why is my fern dying',
  clips: [
    clip(),
    clip({ say: 'I was watering all of them on Sundays. Turns out they are not all Sunday plants.', onScreen: 'Not all Sunday plants' }),
    clip({ say: 'So I took a photo of each one and it gave every plant its own day.', onScreen: 'A photo of each one', demo_moment_id: 'd1', claim_ids: ['c1', 'c2'] }),
    clip({ say: 'The fern is on Thursdays now. It is called Fernly, link is in my bio.', onScreen: 'The fern is on Thursdays', cta: true }),
  ],
  caption: 'Why is my fern dying? It was the Sundays.',
  tags: ['#houseplants', 'ferns'],
});

const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({
  type: 'Talking Head',
  claimIds: new Set(['c1', 'c2']),
  demoIds: new Set(['d1']),
  banned: ['green thumb'],
  productName: 'Fernly',
  reference: null,
  ...over,
});

const angle = (over: Partial<Angle> = {}): Angle => ({
  decision: 'write',
  kill_reason: '',
  title: 'Why your fern keeps dying',
  phrase: 'why is my fern dying',
  angle: 'For someone who waters everything on one day and keeps losing the fern.',
  viewer: 'Someone with five plants and a Sunday routine.',
  pain: 'I have killed three ferns and I do not know why.',
  turn: 'Each plant gets its own day.',
  proof: { demo_moment_id: 'd1', claim_ids: ['c1', 'nope'], what_the_viewer_sees: 'A schedule per plant.' },
  reveal: { when: 'problem_first', why: 'The screen alone is not a hook.' },
  cta: { kind: 'link_in_bio', meaning: 'Get the app.' },
  beats: [{ role: 'hook', job: 'stop', seconds: 3 }],
  hooks: [
    { say: 'I killed three ferns before I worked this out.', onScreen: 'Three ferns', visual: 'Dead fern.', archetype: 'story' },
    { say: 'Stop watering all your plants on Sunday.', onScreen: 'Stop watering on Sunday', visual: 'Watering can.', archetype: 'mistake' },
    { say: 'This fern was dead in March.', onScreen: 'Dead in March', visual: 'Green fern.', archetype: 'result' },
  ],
  reference_use: '',
  questions: [{ question: 'Is there a free plan?', why: 'The ask depends on it.', entity_type: 'offer' }],
  ...over,
});

const reference = (over: Partial<ReferenceAnalysis> = {}): ReferenceAnalysis => ({
  version: 2,
  url: 'https://www.tiktok.com/@a/video/1',
  platform: 'tiktok',
  media: 'video',
  duration_ms: 20000,
  author: 'a',
  caption: '',
  hashtags: [],
  metrics: { views: null, likes: null, comments: null, shares: null, saves: null },
  posted_at: null,
  sound: { title: null, original: null },
  transcript: 'some words',
  words: [],
  observed: { transcript: true, word_timings: false, frames: false },
  format: 'story',
  hook: { spoken: 'x', on_screen: null, visual: '', archetype: 'story', ends_ms: null },
  beats: [{ index: 0, start_ms: 0, end_ms: 3000, role: 'hook', spoken: 'x', visual: '', shot: 'talking_head', function: 'stop' }],
  on_screen_text: [],
  slides: [],
  editing: { cut_count: null, avg_shot_ms: null, captions: 'unknown', notes: '' },
  product_moment: { present: false, start_ms: null, how: '' },
  cta: { kind: 'none', wording: null },
  why_it_works: [],
  transfer: { keep: [], replace: [] },
  ...over,
});

type Reply = (args: GenerateArgs) => unknown;

function harness(replies: Record<string, Reply | unknown>, over: Partial<BriefEngineDeps> = {}) {
  const calls: GenerateArgs[] = [];
  const queued: QueuedQuestion[] = [];
  const recorded: { companyId: string; topic: string; answers: ManagerAnswer[] }[] = [];
  let legacyLoads = 0;
  const deps: BriefEngineDeps = {
    generate: (async (args: GenerateArgs) => {
      calls.push(args);
      const r = replies[args.task];
      if (r === undefined) throw new Error(`no fake reply for ${args.task}`);
      return { data: typeof r === 'function' ? (r as Reply)(args) : r };
    }) as BriefEngineDeps['generate'],
    assembleBrainContext: async () => brain(),
    getReferenceAnalysis: async () => null,
    analyzeReference: async () => null,
    renderReferenceForPrompt: (a) => `REFERENCE ${a.url}`,
    queueQuestion: async (_admin, q) => {
      queued.push(q);
    },
    recordAnswers: async (_admin, input) => {
      recorded.push(input);
    },
    loadLegacyBrand: async () => {
      legacyLoads += 1;
      return legacy;
    },
    recentBriefs: async () => [{ title: 'Repotting in ten minutes', type: 'Talking Head', hook: 'I repotted this on my lunch break.', angle: '' }],
    now: () => 0,
    ...over,
  };
  return { deps, calls, queued, recorded, legacyLoads: () => legacyLoads };
}

const admin = { from: () => ({}) } as unknown as AdminClient;
const ship: Critique = { verdict: 'ship', heard_aloud: 'Sounds like a person.', fixes: [] };

// ---------------------------------------------------------------- schemas

describe('schemas', () => {
  const walk = (node: unknown, path: string): void => {
    if (!node || typeof node !== 'object') return;
    const s = node as { type?: unknown; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown; items?: unknown };
    if (s.type === 'object') {
      expect(s.additionalProperties, path).toBe(false);
      expect([...(s.required ?? [])].sort(), path).toEqual(Object.keys(s.properties ?? {}).sort());
      for (const [k, v] of Object.entries(s.properties ?? {})) walk(v, `${path}.${k}`);
    }
    if (s.items) walk(s.items, `${path}[]`);
  };
  it('every object is closed and requires all of its properties', () => {
    for (const [name, schema] of Object.entries({ ANGLE_SCHEMA, SCRIPT_SCHEMA, CRITIC_SCHEMA, OUTLINE_SCHEMA, TITLES_SCHEMA })) walk(schema, name);
  });
});

// ---------------------------------------------------------------- prompt assembly

describe('buildContext', () => {
  const base = { type: 'Talking Head' as const, brain: brain(), legacy: null, reference: { state: 'none' as const }, recent: [] };

  it('orders blocks playbook core, type section, company, request material', () => {
    const blocks = buildContext({ ...base, recent: [{ title: 'Old one', type: 'Slideshow', hook: 'An old opening', angle: '' }] });
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toBe(PLAYBOOK_CORE);
    expect(blocks[1]).toBe(playbookForType('Talking Head'));
    expect(blocks[2]).toContain('Fernly is a phone app');
    expect(blocks[2]).toContain('Never say a plant cannot die.');
    expect(blocks[3]).toContain('[d1] Photo to schedule');
    expect(blocks[3]).toContain('I have killed three ferns');
    expect(blocks[3]).toContain('"Old one"');
    // Per-request material never leaks into the stable company block.
    expect(blocks[2]).not.toContain('Old one');
    expect(blocks[2]).not.toContain('I have killed three ferns');
  });

  it('keeps the stable blocks byte-identical when only the request changes', () => {
    const a = buildContext(base);
    const b = buildContext({
      ...base,
      brain: brain({ retrieved: 'Something else entirely.', demoMoments: [] }),
      reference: { state: 'ready', analysis: reference(), rendered: 'RENDERED' },
      recent: [{ title: 'T', type: 'Talking Head', hook: 'h', angle: 'a' }],
    });
    expect(b.slice(0, 3)).toEqual(a.slice(0, 3));
    expect(b[3]).not.toEqual(a[3]);
  });

  it('lists approved claims in a stable order whatever order the brain returns', () => {
    const a = buildContext(base)[2];
    const b = buildContext({ ...base, brain: brain({ approvedClaims: [...brain().approvedClaims].reverse() }) })[2];
    expect(a).toBe(b);
    expect(a.indexOf('[c1]')).toBeLessThan(a.indexOf('[c2]'));
    expect(a).toContain('(only with: most common houseplants)');
  });

  it('changes only the type block across types', () => {
    const a = buildContext(base);
    const b = buildContext({ ...base, type: 'Slideshow' });
    expect(b[0]).toBe(a[0]);
    expect(b[1]).not.toBe(a[1]);
    expect(b[2]).toBe(a[2]);
  });

  it('puts the transplant guidance and the analysis in the request block only when a reference was read', () => {
    const none = buildContext(base);
    expect(none.join('\n')).not.toContain('Working from a reference post');
    const ready = buildContext({ ...base, reference: { state: 'ready', analysis: reference(), rendered: 'RENDERED ANALYSIS' } });
    expect(ready[3]).toContain(PLAYBOOK_REFERENCE);
    expect(ready[3]).toContain('RENDERED ANALYSIS');
    expect(ready[3]).toContain('not its frames');
  });

  it('says plainly when the reference could not be read and never renders the transplant section', () => {
    const blocks = buildContext({ ...base, reference: { state: 'unreadable', url: 'https://x.test/p' } });
    expect(blocks[3]).toContain('could not be read');
    expect(blocks[3]).toContain('You have not seen it');
    expect(blocks[3]).not.toContain('Working from a reference post');
  });

  it('labels legacy context as unverified and gives its claims prefixed ids', () => {
    const blocks = buildContext({ ...base, brain: brain({ coverage: 0.1 }), legacy });
    expect(blocks[2]).toContain('Unverified background from the older product sheet');
    expect(blocks[2]).toContain('Old sheet text.');
    expect(blocks[2]).toContain(`[${legacyClaimId('pf-9')}] Light meter: Measures light with the camera.`);
  });
});

// ---------------------------------------------------------------- checks

describe('checkScript', () => {
  const codes = (s: Script, c = ctx()) => checkScript(s, c).map((i) => i.code);

  it('passes a clean script', () => {
    expect(checkScript(goodScript(), ctx())).toEqual([]);
  });

  it('flags a cited claim or demo moment that does not exist', () => {
    const s = goodScript();
    s.clips[2].claim_ids = ['c1', 'c9'];
    s.clips[2].demo_moment_id = 'd7';
    const issues = checkScript(s, ctx());
    expect(issues.map((i) => i.code)).toEqual(['claim_unknown', 'demo_unknown']);
    expect(issues[0].clip).toBe(2);
    expect(issues[0].message).toContain('c9');
  });

  it('accepts legacy claim ids only when they are in the valid set', () => {
    const s = goodScript();
    s.clips[2].claim_ids = [legacyClaimId('pf-9')];
    expect(codes(s)).toContain('claim_unknown');
    expect(codes(s, ctx({ claimIds: new Set([legacyClaimId('pf-9')]) }))).not.toContain('claim_unknown');
  });

  it('wants exactly one CTA clip', () => {
    const none = goodScript();
    none.clips[3].cta = false;
    expect(codes(none)).toContain('cta_count');
    const two = goodScript();
    two.clips[1].cta = true;
    expect(codes(two)).toContain('cta_count');
  });

  it('enforces the word budgets: clip, hook, total', () => {
    const longClip = goodScript();
    longClip.clips[1].say = Array(41).fill('word').join(' ');
    expect(codes(longClip)).toContain('clip_words');

    const longHook = goodScript();
    longHook.clips[0].say = Array(16).fill('word').join(' ');
    expect(codes(longHook)).toEqual(['hook_words']);

    const longTotal = goodScript();
    longTotal.clips = [clip(), ...Array(5).fill(0).map(() => clip({ say: Array(30).fill('word').join(' ') })), clip({ cta: true })];
    expect(codes(longTotal)).toContain('total_words');
  });

  it('sizes the total to the reference when one was read', () => {
    expect(budgetFor('Talking Head').maxTotalWords).toBe(130);
    // 20 s at 2.6 words a second, with a fifth of slack.
    expect(budgetFor('Talking Head', reference()).maxTotalWords).toBe(62);
    expect(budgetFor('Talking Head', reference({ duration_ms: null })).maxTotalWords).toBe(130);
  });

  it('checks copy rules: dashes, emoji, hashtags in lines, hype, banned phrases, product in the hook', () => {
    const s = goodScript();
    s.clips[0].say = 'Fernly saved my fern — honestly a game changer \u{1F331}';
    s.clips[1].say = 'You do not need a green thumb for this #plants';
    s.caption = 'A caption – with a dash';
    const found = codes(s);
    for (const code of ['dash', 'emoji', 'hype', 'banned_phrase', 'hashtag_in_line', 'product_in_hook']) expect(found).toContain(code);
    expect(checkScript(s, ctx()).some((i) => i.clip === -1 && i.code === 'dash')).toBe(true);
  });

  it('matches banned phrases on word boundaries, not inside other words', () => {
    const s = goodScript();
    s.clips[1].say = 'It unlocked nothing, it just told me the day.';
    expect(codes(s)).not.toContain('hype');
  });

  it('slideshows carry no speech and short slides', () => {
    const s: Script = {
      ...goodScript(),
      clips: [
        clip({ say: '', onScreen: 'things that kept my fern alive' }),
        clip({ say: 'spoken by mistake', onScreen: 'one two three' }),
        clip({ say: '', onScreen: Array(15).fill('word').join(' ') }),
        clip({ say: '', onScreen: 'save this', cta: true }),
      ],
    };
    const found = codes(s, ctx({ type: 'Slideshow' }));
    expect(found).toContain('say_not_empty');
    expect(found).toContain('screen_words');
    expect(found).not.toContain('hook_words');
  });

  it('long text is one clip of 45 to 90 words in 2 or 3 paragraphs with spin groups', () => {
    const body = (n: number) => Array(n).fill('word').join(' ');
    const ok: Script = { ...goodScript(), clips: [clip({ say: '', onScreen: `{I thought|I assumed} ${body(20)}\n\n{Turns out|It turns out} ${body(20)}\n\n{That is it|That was all} ${body(5)}` })] };
    expect(checkScript(ok, ctx({ type: 'Long Text' }))).toEqual([]);
    const bad: Script = { ...goodScript(), clips: [clip({ say: '', onScreen: body(30) }), clip({ say: '', onScreen: 'second' })] };
    const found = codes(bad, ctx({ type: 'Long Text' }));
    for (const code of ['clip_count', 'long_text_words', 'long_text_paragraphs', 'long_text_spins']) expect(found).toContain(code);
  });
});

describe('text helpers', () => {
  it('counts words and resolves spins to the first option', () => {
    expect(countWords('  one two  three ')).toBe(3);
    expect(countWords('')).toBe(0);
    expect(resolveSpins('{Nobody|No one} told me {about ten|ten or so} times')).toBe('Nobody told me about ten times');
  });

  it('repairs dashes and emoji and leaves words and hyphens alone', () => {
    expect(sanitizeCopy('It worked — first try \u{1F389}')).toBe('It worked, first try');
    expect(sanitizeCopy('pages 3–5')).toBe('pages 3 to 5');
    expect(sanitizeCopy('a follow-up at 2 a.m.')).toBe('a follow-up at 2 a.m.');
    expect(sanitizeCopy('one\n\ntwo')).toBe('one\n\ntwo');
  });
});

describe('enforceScript', () => {
  it('drops unknown ids, keeps one CTA, shapes tags and cleans copy without rewriting words', () => {
    const s = goodScript();
    s.clips[1].cta = true;
    s.clips[2].claim_ids = ['c1', 'ghost'];
    s.clips[2].demo_moment_id = 'ghost';
    s.clips[0].say = 'I killed three ferns — then I worked this out.';
    const out = enforceScript(s, ctx());
    expect(out.clips.map((c) => c.cta)).toEqual([false, false, false, true]);
    expect(out.clips[2].claim_ids).toEqual(['c1']);
    expect(out.clips[2].demo_moment_id).toBeNull();
    expect(out.clips[0].say).toBe('I killed three ferns, then I worked this out.');
    expect(out.tags).toEqual(['#houseplants', '#ferns']);
  });

  it('flags the last clip when none carries the ask, and clears speech where nothing is spoken', () => {
    const s = goodScript();
    s.clips[3].cta = false;
    expect(enforceScript(s, ctx()).clips.map((c) => c.cta)).toEqual([false, false, false, true]);
    const slides = enforceScript(s, ctx({ type: 'Slideshow' }));
    expect(slides.clips.every((c) => c.say === '')).toBe(true);
    const long = enforceScript(s, ctx({ type: 'Long Text' }));
    expect(long.clips).toHaveLength(1);
    expect(long.clips[0].cta).toBe(false);
  });
});

// ---------------------------------------------------------------- the engine with a fake model

describe('writeBrief', () => {
  const req = { companyId: 'co-1', mode: 'guided' as const, type: 'Talking Head' as const, title: 'Why your fern keeps dying', thorough: true };

  it('runs strategist, writer, critic on one cached prefix and skips the revision when nothing is wrong', async () => {
    const h = harness({ 'brief.angle': angle(), 'brief.write': goodScript(), 'brief.critic': ship });
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(h.calls.map((c) => c.task)).toEqual(['brief.angle', 'brief.write', 'brief.critic']);
    for (const c of h.calls) {
      expect(c.tier).toBe('writer');
      expect(c.effort).toBe(WRITER_EFFORT);
      expect(c.system).toBe(ENGINE_SYSTEM);
      expect(c.context).toEqual(h.calls[0].context);
      expect(c.companyId).toBe('co-1');
    }
    // The manager's request is in the input, never in the cached context.
    expect(h.calls[0].context.join('\n')).not.toContain('Why your fern keeps dying');
    expect(h.calls[0].input).toContain('Why your fern keeps dying');
    expect(plan.kill_reason).toBeNull();
    expect(plan.clips).toHaveLength(4);
    expect(plan.clips[2]).toMatchObject({ demo_moment_id: 'd1', claim_ids: ['c1', 'c2'] });
    expect(plan.hooks).toHaveLength(3);
    expect(plan.hooks[0].say).toBe(plan.clips[0].say);
    expect(plan.angle).toBe('For someone who waters everything on one day and keeps losing the fern.');
    expect(plan.warnings).toEqual([]);
    expect(plan.reference_note).toBeNull();
  });

  it('strips proof ids the strategist invented before the writer sees the angle', async () => {
    const h = harness({ 'brief.angle': angle(), 'brief.write': goodScript(), 'brief.critic': ship });
    await writeBrief(admin, req, h.deps);
    expect(h.calls[1].input).toContain('"c1"');
    expect(h.calls[1].input).not.toContain('nope');
  });

  it('revises once when the code checks or the critic find something, and reports what still fails', async () => {
    const draft = goodScript();
    draft.clips[2].claim_ids = ['c1', 'invented'];
    draft.clips[1].say = 'It is a total game changer for a green thumb like me.';
    const revised = goodScript();
    revised.clips[1].say = 'Still a game changer.';
    const h = harness({
      'brief.angle': angle(),
      'brief.write': draft,
      'brief.critic': { verdict: 'revise', heard_aloud: 'Clip 1 is copy.', fixes: [{ clip: 1, field: 'say', problem: 'reads as an ad', fix: 'Say what happened.' }] } satisfies Critique,
      'brief.revise': revised,
    });
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(h.calls.map((c) => c.task)).toEqual(['brief.angle', 'brief.write', 'brief.critic', 'brief.revise']);
    expect(h.calls[2].input).toContain('cites claim "invented"');
    expect(h.calls[3].input).toContain('reads as an ad');
    expect(h.calls[3].input).toContain('green thumb');
    expect(plan.clips[1].say).toBe('Still a game changer.');
    expect(plan.warnings).toEqual(['Clip 1 spoken line uses "game changer".']);
  });

  it('keeps the draft when the critic fails, and still applies the certain repairs', async () => {
    const draft = goodScript();
    draft.clips[2].claim_ids = ['invented'];
    const h = harness({
      'brief.angle': angle(),
      'brief.write': draft,
      'brief.critic': () => {
        throw new Error('timeout');
      },
      'brief.revise': () => {
        throw new Error('timeout');
      },
    });
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(plan.clips[2].claim_ids).toEqual([]);
    expect(plan.clips).toHaveLength(4);
  });

  it('still writes the whole brief when the strategist tries to decline, and never hands the manager a reason or a question', async () => {
    const h = harness({ 'brief.angle': angle({ decision: 'decline', kill_reason: 'There is no approved claim about light.' }), 'brief.write': goodScript(), 'brief.critic': ship });
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(h.calls.map((c) => c.task)).toEqual(['brief.angle', 'brief.write', 'brief.critic']);
    expect(plan.kill_reason).toBeNull();
    expect(plan.clips.length).toBeGreaterThan(0);
    expect(plan.questions).toEqual([]);
  });

  it('queues what it would have liked to know for the Noni team, not the manager', async () => {
    const h = harness({ 'brief.angle': angle(), 'brief.write': goodScript(), 'brief.critic': ship });
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(plan.questions).toEqual([]);
    expect(h.queued).toEqual([{ companyId: req.companyId, question: 'Is there a free plan?', why: 'The ask depends on it.', entityType: 'offer', askedBy: 'brief.write' }]);
  });

  it('adds the legacy brand context only when coverage is low', async () => {
    const replies = { 'brief.angle': angle(), 'brief.write': goodScript(), 'brief.critic': ship };
    const rich = harness(replies);
    await writeBrief(admin, req, rich.deps);
    expect(rich.legacyLoads()).toBe(0);
    expect(rich.calls[0].context[2]).not.toContain('Unverified background');

    const thin = harness(replies, { assembleBrainContext: async () => brain({ coverage: 0.1 }) });
    await writeBrief(admin, req, thin.deps);
    expect(thin.legacyLoads()).toBe(1);
    expect(thin.calls[0].context[2]).toContain('Unverified background from the older product sheet');
  });

  it('lets a legacy approved claim be cited and checks legacy banned phrases when coverage is low', async () => {
    const draft = goodScript();
    draft.clips[2].claim_ids = [legacyClaimId('pf-9')];
    draft.clips[1].say = 'Every plant parent does this.';
    const h = harness(
      { 'brief.angle': angle(), 'brief.write': draft, 'brief.critic': ship, 'brief.revise': draft },
      { assembleBrainContext: async () => brain({ coverage: 0.1, approvedClaims: [] }) },
    );
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(plan.clips[2].claim_ids).toEqual([legacyClaimId('pf-9')]);
    expect(plan.warnings?.join(' ')).toContain('plant parent');
  });

  it('writes from the idea alone when nothing at all is known about the company, and asks the Noni team for the basics', async () => {
    const h = harness(
      { 'brief.angle': angle({ questions: [] }), 'brief.write': goodScript(), 'brief.critic': ship },
      { assembleBrainContext: async () => brain({ core: '', retrieved: '', approvedClaims: [], demoMoments: [], coverage: 0 }), loadLegacyBrand: async () => null },
    );
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(h.calls.map((c) => c.task)).toContain('brief.write');
    expect(plan.kill_reason).toBeNull();
    expect(plan.clips.length).toBeGreaterThan(0);
    expect(plan.questions).toEqual([]);
    expect(h.queued.length).toBeGreaterThan(0);
  });

  it('survives a brain that throws by falling back to the legacy context', async () => {
    const h = harness({ 'brief.angle': angle(), 'brief.write': goodScript(), 'brief.critic': ship }, {
      assembleBrainContext: async () => {
        throw new Error('no table');
      },
    });
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(h.legacyLoads()).toBe(1);
    expect(plan.clips.length).toBeGreaterThan(0);
  });

  it('uses the stored reference analysis without analysing again', async () => {
    let analysed = 0;
    const h = harness({ 'brief.angle': angle(), 'brief.write': goodScript(), 'brief.critic': ship }, {
      getReferenceAnalysis: async () => reference({ observed: { transcript: true, word_timings: true, frames: true } }),
      analyzeReference: async () => {
        analysed += 1;
        return null;
      },
    });
    const plan = (await writeBrief(admin, { ...req, link: 'tiktok.com/@a/video/1', linkNotes: 'Plants instead of shoes' }, h.deps)) as BriefPlan;
    expect(analysed).toBe(0);
    expect(h.calls[0].context[3]).toContain('REFERENCE https://www.tiktok.com/@a/video/1');
    expect(h.calls[0].input).toContain('Plants instead of shoes');
    expect(plan.reference_note).toBeNull();
  });

  it('analyses a reference that is not stored and notes when only the words were read', async () => {
    const h = harness({ 'brief.angle': angle(), 'brief.write': goodScript(), 'brief.critic': ship }, { analyzeReference: async () => reference() });
    const plan = (await writeBrief(admin, { ...req, link: 'https://www.tiktok.com/@a/video/1' }, h.deps)) as BriefPlan;
    expect(h.calls[0].context[3]).toContain('REFERENCE');
    expect(plan.reference_note).toContain('Only the words');
  });

  it('says so in the plan and the prompt when the reference cannot be read, and never passes the link as if it were watched', async () => {
    const h = harness({ 'brief.angle': angle(), 'brief.write': goodScript(), 'brief.critic': ship }, {
      analyzeReference: async () => {
        throw new Error('private video');
      },
    });
    const plan = (await writeBrief(admin, { ...req, link: 'https://www.tiktok.com/@a/video/1' }, h.deps)) as BriefPlan;
    expect(plan.reference_note).toContain('could not be read');
    expect(h.calls[0].context[3]).toContain('You have not seen it');
    expect(h.calls[0].input).toContain('could not be read');
    expect(h.calls[0].context.join('\n')).not.toContain('REFERENCE');
  });

  it('long text mode forces the type and returns one silent clip', async () => {
    const body = (n: number) => Array(n).fill('word').join(' ');
    const text = `{I thought|I assumed} ${body(20)}\n\n{Turns out|It turns out} ${body(20)}\n\n{That is it|That was all} ${body(5)}`;
    const h = harness({
      'brief.angle': angle({ hooks: [{ say: '', onScreen: 'I thought I was bad at plants', visual: '', archetype: 'story' }] }),
      'brief.write': { ...goodScript(), clips: [clip({ say: 'oops', onScreen: text, cta: true })] },
      'brief.critic': ship,
      'brief.revise': { ...goodScript(), clips: [clip({ say: '', onScreen: text })] },
    });
    const plan = (await writeBrief(admin, { companyId: 'co-1', mode: 'long_text', title: 'Fern', thorough: true }, h.deps)) as BriefPlan;
    expect(h.calls[0].context[1]).toBe(playbookForType('Long Text'));
    expect(plan.clips).toHaveLength(1);
    expect(plan.clips[0]).toMatchObject({ say: '', cta: false });
    expect(plan.clips[0].onScreen).toContain('\n\n');
  });

  it('outline mode is one writer call that shares the guided prefix', async () => {
    const h = harness({
      'brief.outline': { decision: 'write', kill_reason: '', title: 'Why your fern keeps dying', angle: 'For Sunday waterers.', phrase: 'Why Is My Fern Dying', notes: 'Open on the dead fern.\nShow the schedule.', hooks: angle().hooks, questions: [] },
    });
    const plan = (await writeBrief(admin, { ...req, mode: 'outline' }, h.deps)) as BriefPlan;
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ tier: 'writer', system: ENGINE_SYSTEM, effort: WRITER_EFFORT });
    expect(h.calls[0].context[0]).toBe(PLAYBOOK_CORE);
    expect(h.calls[0].context[1]).toBe(playbookForType('Talking Head'));
    expect(plan.notes).toBe('Open on the dead fern.\nShow the schedule.');
    expect(plan.phrase).toBe('why is my fern dying');
    expect(plan.clips).toEqual([]);
    expect(plan.hooks).toHaveLength(3);
  });

  it('titles mode is one fast call grounded in the company block, without the long playbook', async () => {
    const h = harness({ 'brief.titles': { titles: ['Why your fern keeps dying', 'Why your fern keeps dying', 'Stop watering on Sundays — here is why', ''] } });
    const out = await writeBrief(admin, { companyId: 'co-1', mode: 'titles', typed: 'fern' }, h.deps);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].tier).toBe('fast');
    expect(h.calls[0].context.join('\n')).toContain('Fernly is a phone app');
    expect(h.calls[0].context.join('\n')).toContain('I have killed three ferns');
    expect(h.calls[0].context).not.toContain(PLAYBOOK_CORE);
    expect(h.calls[0].input).toContain('"fern"');
    expect(out).toEqual({ titles: ['Why your fern keeps dying', 'Stop watering on Sundays, here is why'] });
  });
});

describe('ask first, then one call', () => {
  const req = { companyId: 'co-1', mode: 'guided' as const, type: 'Talking Head' as const, title: 'Why your fern keeps dying' };
  const draft = () => ({ ...goodScript(), angle: 'For Sunday waterers.', hooks: angle().hooks, questions: [] });

  it('asks up to three tappable questions on the fast tier and drops ones with nothing to tap', async () => {
    const h = harness({
      'brief.ask': {
        questions: [
          { question: 'Which mistakes go in?', options: ['Watering on a schedule', 'Pot with no drainage', 'Direct afternoon sun', 'Misting the leaves', 'A fifth'], many: true },
          { question: 'No options', options: ['Only one'], many: false },
          { question: 'What does the app do here?', options: ['Shows the week', 'The product is not shown'], many: false },
        ],
      },
    });
    const { questions } = await askBrief(admin, req, h.deps);
    expect(h.calls.map((c) => [c.task, c.tier])).toEqual([['brief.ask', 'fast']]);
    expect(questions.map((q) => q.question)).toEqual(['Which mistakes go in?', 'What does the app do here?']);
    expect(questions[0].options).toHaveLength(4);
    expect(questions[0].many).toBe(true);
  });

  it('asks nothing when the model fails or there is no idea yet', async () => {
    expect((await askBrief(admin, req, harness({}).deps)).questions).toEqual([]);
    expect((await askBrief(admin, { ...req, title: ' ' }, harness({ 'brief.ask': { questions: [] } }).deps)).questions).toEqual([]);
  });

  it('writes in one call when the checks pass, with the answers in the request and stored in the brain', async () => {
    const answers = [{ question: 'Which mistakes go in?', answers: ['Watering on a schedule', 'Pot with no drainage'] }];
    const h = harness({ 'brief.draft': draft() });
    const plan = (await writeBrief(admin, { ...req, answers }, h.deps)) as BriefPlan;
    expect(h.calls.map((c) => c.task)).toEqual(['brief.draft']);
    expect(h.calls[0].input).toContain('What the manager decided');
    expect(h.calls[0].input).toContain('Pot with no drainage');
    expect(plan.clips.length).toBeGreaterThan(0);
    expect(plan.kill_reason).toBeNull();
    expect(plan.questions).toEqual([]);
    expect(h.recorded).toEqual([{ companyId: 'co-1', userId: null, topic: req.title, answers }]);
  });

  it('revises once when a line reads machine written', async () => {
    const sloppy = draft();
    sloppy.clips[1].say = 'In this video I show you a game changer.';
    const h = harness({ 'brief.draft': sloppy, 'brief.revise': goodScript() });
    const plan = (await writeBrief(admin, req, h.deps)) as BriefPlan;
    expect(h.calls.map((c) => c.task)).toEqual(['brief.draft', 'brief.revise']);
    expect(h.calls[1].input).toContain('in this video');
    expect(plan.clips.map((c) => c.say).join(' ')).not.toContain('game changer');
    expect(h.recorded).toEqual([]);
  });

  it('keeps only answers that say something', () => {
    expect(tidyAnswers([{ question: 'Q', answers: [' a ', 'a', ''] }, { question: '', answers: ['x'] }, { question: 'Empty', answers: [] }, 'junk'])).toEqual([{ question: 'Q', answers: ['a'] }]);
  });
});

describe('playbook', () => {
  const all = [PLAYBOOK_CORE, PLAYBOOK_REFERENCE, ...(['Talking Head', 'Greenscreen', 'Slideshow', 'Long Text'] as const).map(playbookForType)];
  it('is sized for the cached prefix', () => {
    const words = countWords(PLAYBOOK_CORE);
    expect(words).toBeGreaterThanOrEqual(2500);
    expect(words).toBeLessThanOrEqual(4000);
    for (const section of all.slice(1)) expect(countWords(section)).toBeLessThan(700);
  });
  it('follows the copy rules it teaches and never uses the test company niche', () => {
    for (const text of all) {
      expect(text).not.toMatch(/[‒-―]/);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text.toLowerCase()).not.toMatch(/soccer|recruit|highlight video|fieldvision/);
    }
  });
});
