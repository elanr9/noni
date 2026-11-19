// Runs under Deno, with no network: `deno test` from supabase/functions.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { TimedWord } from './contracts.ts';
import { assertStrictSchema } from './llm.ts';
import {
  type AnalysisState,
  analysisInput,
  awaitReferenceAnalysis,
  buildAnalysis,
  chooseFrameTimestamps,
  contactSheetCommand,
  detectPauses,
  HOOK_FRAME_MS,
  MAX_BODY_FRAMES,
  MODEL_ANALYSIS_SCHEMA,
  type ModelAnalysis,
  planSheets,
  ReferenceAnalysisError,
  type ReferenceSource,
  renderReferenceForPrompt,
  renderTimedTranscript,
  speakingRate,
  verifySpoken,
  wordsFromCues,
} from './reference.ts';

/** Words 200 ms long; a number in the list is a silence in ms before the next word. */
function timed(parts: Array<string | number>, gap = 50): TimedWord[] {
  const words: TimedWord[] = [];
  let t = 0;
  for (const part of parts) {
    if (typeof part === 'number') {
      t += part - gap;
      continue;
    }
    words.push({ w: part, s: t, e: t + 200 });
    t += 200 + gap;
  }
  return words;
}

const WORDS = timed(['Stop', 'using', 'spreadsheets', 'for', 'this.', 600, 'I', 'found', 'an', 'app', 'that', 'does', 'it.', 900, 'Link', 'in', 'bio.']);
const TRANSCRIPT = WORDS.map((w) => w.w).join(' ');

function source(over: Partial<ReferenceSource> = {}): ReferenceSource {
  return {
    url: 'https://tiktok.com/@a/video/1',
    platform: 'tiktok',
    media: 'video',
    caption: 'no more sheets #Budget #fyp',
    meta: {
      author: 'a',
      author_followers: 1200,
      duration_ms: 6000,
      posted_at: '2026-10-01T00:00:00.000Z',
      hashtags: ['budget'],
      cover_url: 'https://example.com/c.jpg',
      sound_title: 'original sound',
      sound_original: true,
      views: 1_250_000,
      likes: 90_000,
      comments: 800,
      shares: 4000,
      saves: 12_000,
    },
    transcript: TRANSCRIPT,
    words: WORDS,
    wordTimings: true,
    frameTimestamps: [0, 300, 700, 1100, 1500, 2000, 2500, 3000, 4500, 5600],
    cover: false,
    slides: [],
    durationMs: 6000,
    ...over,
  };
}

function model(over: Partial<ModelAnalysis> = {}): ModelAnalysis {
  return {
    format: 'discovery',
    hook: { spoken: 'stop using spreadsheets for this', on_screen: 'STOP doing this', visual: 'Woman at a desk, close up', archetype: 'stop doing X', ends_ms: 1300 },
    beats: [
      { start_ms: 0, end_ms: 1300, role: 'hook', spoken: 'Stop using spreadsheets for this.', visual: 'Close up, pointing at laptop', shot: 'talking_head', function: 'calls out the old way' },
      { start_ms: 1800, end_ms: 3500, role: 'demo', spoken: 'I discovered an amazing app', visual: 'Phone screen recording', shot: 'screen_recording', function: 'shows the fix' },
      { start_ms: 4400, end_ms: 5200, role: 'cta', spoken: 'Download it today!', visual: 'Back to camera', shot: 'talking_head', function: 'asks for the click' },
    ],
    on_screen_text: [{ text: ' STOP doing this ', start_ms: 0, end_ms: 9000, position: 'upper', role: 'hook' }],
    editing: { cut_count: 2, avg_shot_ms: 2000, captions: 'word_by_word', notes: 'Punch-in on the turn.' },
    product_moment: { present: true, start_ms: 1800, how: 'Tool inside the story; shown categorising a receipt.' },
    cta: { kind: 'link_in_bio', wording: 'Link in bio.' },
    why_it_works: ['Names the old way in the first second.'],
    transfer: { keep: ['"Stop using [incumbent] for [job]" hook'], replace: ['Spreadsheets as the enemy'] },
    ...over,
  };
}

Deno.test('detectPauses finds gaps at or over the threshold and nothing shorter', () => {
  const pauses = detectPauses(WORDS);
  assertEquals(pauses.map((p) => [p.after, p.ms]), [[4, 600], [11, 900]]);
  assertEquals(pauses[0].start_ms, WORDS[4].e);
  assertEquals(pauses[0].end_ms, WORDS[5].s);
  assertEquals(detectPauses(WORDS, 700).length, 1);
  assertEquals(detectPauses([]), []);
});

Deno.test('speakingRate reports pace with and without pauses', () => {
  const rate = speakingRate(WORDS)!;
  assertEquals(rate.words, 15);
  assertEquals(rate.span_ms, WORDS[14].e - WORDS[0].s);
  assert(rate.wps_talking > rate.wps);
  assertEquals(speakingRate([WORDS[0]]), null);
});

Deno.test('renderTimedTranscript breaks at sentences and writes pauses out', () => {
  assertEquals(
    renderTimedTranscript(WORDS).split('\n'),
    [
      '[0.0s-1.2s] Stop using spreadsheets for this.',
      '  (pause 0.6s)',
      '[1.8s-3.5s] I found an app that does it.',
      '  (pause 0.9s)',
      '[4.4s-5.1s] Link in bio.',
    ],
  );
});

Deno.test('wordsFromCues spreads a cue across its words in order', () => {
  const words = wordsFromCues([{ text: 'hi there', start_ms: 1000, end_ms: 2000 }]);
  assertEquals(words.map((w) => w.w), ['hi', 'there']);
  assertEquals(words[0].s, 1000);
  assertEquals(words[1].e, 2000);
  assertEquals(words[0].e, words[1].s);
});

Deno.test('chooseFrameTimestamps is dense in the hook and capped after it', () => {
  const plan = chooseFrameTimestamps(60_000, []);
  assertEquals(plan.hook, HOOK_FRAME_MS);
  assert(plan.body.length <= MAX_BODY_FRAMES && plan.body.length >= 20);
  assert(plan.body.every((t) => t > 3000 && t <= 60_000));
  assertEquals(plan.body[plan.body.length - 1], 59_600);
  for (let i = 1; i < plan.body.length; i++) assert(plan.body[i] - plan.body[i - 1] >= 400);

  const long = chooseFrameTimestamps(180_000, []);
  assert(long.body.length <= MAX_BODY_FRAMES);

  const short = chooseFrameTimestamps(2200, []);
  assertEquals(short.hook, [0, 300, 700, 1100, 1500]);
  assertEquals(short.body, []);
});

Deno.test('chooseFrameTimestamps moves grid points onto pauses and sentence starts', () => {
  const words = timed(['a', 'b', 'c.', 4000, 'New', 'shot', 'here', 3000, 'and', 'another.']);
  const cut1 = words[3].s + 150;
  const cut2 = words[6].s + 150;
  const plan = chooseFrameTimestamps(12_000, words);
  assert(plan.body.includes(cut1), `expected a frame at ${cut1}, got ${plan.body}`);
  assert(plan.body.includes(cut2), `expected a frame at ${cut2}, got ${plan.body}`);
});

Deno.test('planSheets keeps every frame and stays within the image size the model sees in full', () => {
  const plan = chooseFrameTimestamps(60_000, []);
  const sheets = planSheets(plan);
  assertEquals(sheets.flatMap((s) => s.timestamps_ms), [...plan.hook, ...plan.body]);
  for (const s of sheets) {
    assert(s.timestamps_ms.length <= s.cols * s.rows);
    // tile adds 4 px between cells and a 4 px margin on each side.
    assert(s.cols * s.cellW + (s.cols - 1) * 4 + 8 <= 1568);
    assert(s.rows * s.cellH + (s.rows - 1) * 4 + 8 <= 1568);
  }
});

Deno.test('contactSheetCommand is one chain Upload-Post will accept', () => {
  const [hook] = planSheets(chooseFrameTimestamps(30_000, []));
  const command = contactSheetCommand(hook);
  assert(!/[;|&$`]/.test(command), 'forbidden character');
  assert(!/https?:/.test(command));
  assert(command.includes('{input}') && command.endsWith('{output}'));
  assert(command.includes("gte(t,0.300)*(isnan(prev_selected_t)+lt(prev_selected_t,0.300))"));
  assertEquals(command.match(/gte\(t,/g)?.length, 8);
  assert(command.includes('tile=4x2'));
});

Deno.test('verifySpoken accepts a verbatim span and returns the transcript wording', () => {
  const check = verifySpoken('i found an APP that does it', WORDS, { start_ms: 1800, end_ms: 3500, timed: true });
  assertEquals(check.status, 'verbatim');
  assertEquals(check.spoken, 'I found an app that does it.');
  assertEquals(check.span, [5, 11]);
});

Deno.test('verifySpoken picks the occurrence nearest the beat when a phrase repeats', () => {
  const words = timed(['so', 'good', 'right', 2000, 'so', 'good', 'yes']);
  const check = verifySpoken('so good', words, { start_ms: words[3].s, end_ms: words[5].e, timed: true });
  assertEquals(check.span, [3, 4]);
});

Deno.test('verifySpoken repairs a paraphrase from the words inside the time window', () => {
  const check = verifySpoken('I discovered an amazing app', WORDS, { start_ms: 1800, end_ms: 3500, timed: true });
  assertEquals(check.status, 'repaired');
  assertEquals(check.spoken, 'I found an app that does it.');
});

Deno.test('verifySpoken without timing keeps the longest real run or drops the claim', () => {
  const untimed = WORDS.map((w) => ({ w: w.w, s: 0, e: 0 }));
  const window = { start_ms: 0, end_ms: 0, timed: false };
  const partial = verifySpoken('honestly I found an app that works', untimed, window);
  assertEquals(partial.status, 'repaired');
  assertEquals(partial.spoken, 'I found an app that');
  assertEquals(verifySpoken('Download it today!', untimed, window).status, 'dropped');
  assertEquals(verifySpoken('  ', untimed, window).status, 'empty');
});

Deno.test('buildAnalysis keeps spoken text verbatim and clamps times', () => {
  const a = buildAnalysis(source(), model());
  assertEquals(a.version, 2);
  assertEquals(a.observed, { transcript: true, word_timings: true, frames: true, cover: false, frame_count: 10 });
  assertEquals(a.beats.map((b) => b.index), [0, 1, 2]);
  for (const b of a.beats) assert(TRANSCRIPT.includes(b.spoken), b.spoken);
  assertEquals(a.beats[1].spoken, 'I found an app that does it.');
  // The invented CTA line is replaced by what is actually said in that window.
  assertEquals(a.beats[2].spoken, 'Link in bio.');
  assertEquals(a.hook.spoken, 'Stop using spreadsheets for this.');
  assertEquals(a.on_screen_text[0], { text: 'STOP doing this', start_ms: 0, end_ms: 6000, position: 'upper', role: 'hook' });
  assertEquals(a.hashtags, ['budget', 'fyp']);
  assertEquals(a.metrics.saves, 12_000);
  assert(a.editing.notes.includes('Measured pace'));
  assert(a.editing.notes.includes('sampled frames'));
});

Deno.test('buildAnalysis without frames marks visuals inferred and blanks what cannot be known', () => {
  const a = buildAnalysis(source({ frameTimestamps: [], cover: true }), model());
  assertEquals(a.observed.frames, false);
  assertEquals(a.observed.cover, true);
  assert(a.beats.every((b) => b.visual.startsWith('Inferred: ')));
  assert(a.hook.visual.startsWith('Inferred: '));
  assertEquals(a.hook.on_screen, null);
  assertEquals(a.on_screen_text, []);
  assertEquals(a.editing.cut_count, null);
  assertEquals(a.editing.avg_shot_ms, null);
  assertEquals(a.editing.captions, 'unknown');
  // Beat times come from the measured words.
  assertEquals([a.beats[1].start_ms, a.beats[1].end_ms], [WORDS[5].s, WORDS[11].e]);
});

Deno.test('buildAnalysis drops a beat whose words are not in an untimed transcript and nothing was seen', () => {
  const untimed = WORDS.map((w) => ({ w: w.w, s: 0, e: 0 }));
  const a = buildAnalysis(source({ words: untimed, wordTimings: false, frameTimestamps: [] }), model());
  assertEquals(a.beats.length, 1);
  assertEquals(a.beats[0].spoken, 'Stop using spreadsheets for this.');
  assertEquals(a.words, []);
});

Deno.test('buildAnalysis returns a slideshow as one beat per slide', () => {
  const slides = ['3 apps I wish I had sooner', 'Number one', ''];
  const a = buildAnalysis(
    source({ media: 'slideshow', slides, transcript: '', words: [], wordTimings: false, frameTimestamps: [], durationMs: null }),
    model({ beats: model().beats.slice(0, 2) }),
  );
  assertEquals(a.media, 'slideshow');
  assertEquals(a.slides, slides);
  assertEquals(a.beats.length, 3);
  assert(a.beats.every((b) => b.spoken === '' && b.start_ms === 0 && b.end_ms === 0));
  assertEquals(a.hook.on_screen, slides[0]);
  assertEquals(a.on_screen_text.map((t) => t.text), slides.slice(0, 2));
  assertEquals(a.observed.frames, true);
  const text = renderReferenceForPrompt(a);
  assert(text.includes('Slide 1 [hook'));
  assert(text.includes('text: "3 apps I wish I had sooner"'));
});

Deno.test('renderReferenceForPrompt leads with the beat sheet and labels each section', () => {
  const text = renderReferenceForPrompt(buildAnalysis(source(), model()));
  const order = ['REFERENCE POST', 'HOOK', 'BEAT SHEET', 'ON-SCREEN TEXT', 'EDITING', 'PRODUCT AND CTA', 'WHY IT WORKS', 'KEEP', 'REPLACE'].map((h) => text.indexOf(h));
  assert(order.every((i) => i >= 0));
  assertEquals([...order].sort((a, b) => a - b), order);
  assert(text.includes('1.3M views'));
  assert(text.includes('0:01.8-0:03.5 [demo, screen_recording] shows the fix'));
  assert(text.includes('said: "I found an app that does it."'));
  assert(text.includes('0:00.0-0:06.0 [hook, upper] "STOP doing this"'));
  assert(text.includes('enters at 0:01.8 (30% in)'));
  assert(text.includes('Observed: speech with word timing and 10 sampled frames.'));
});

Deno.test('renderReferenceForPrompt says plainly when the video was not seen', () => {
  const text = renderReferenceForPrompt(buildAnalysis(source({ frameTimestamps: [], cover: false, meta: null }), model()));
  assert(text.includes('Not observed: The video was not seen.'));
  assert(text.includes('ON-SCREEN TEXT\nUnknown: the video was not seen.'));
  assert(text.includes('Cuts, shot length and caption style: unknown'));
  assert(text.includes('no proof this post performed'));
  assert(!text.includes('STOP doing this'));
});

Deno.test('analysisInput tells the model which evidence exists', () => {
  const sheets = planSheets({ hook: [0, 300, 700, 1100, 1500], body: [4500] });
  const withFrames = analysisInput(source(), sheets);
  assert(withFrames.includes('Image 1 is a contact sheet of the opening seconds'));
  assert(withFrames.includes('row 2: 1.5s'));
  assert(withFrames.includes('(pause 0.6s)'));
  assert(withFrames.includes('1250000 views'));
  const none = analysisInput(source({ frameTimestamps: [], cover: true }), []);
  assert(none.includes('You have not seen the video itself'));
});

Deno.test('the model schema is valid for structured outputs', () => {
  assertStrictSchema(MODEL_ANALYSIS_SCHEMA);
});

// ---------------------------------------------------------------- waiting on a run in flight

Deno.test('awaitReferenceAnalysis waits on a run in flight and never starts a second one', async () => {
  const done = { beats: [], transcript: 'hello' } as unknown as Awaited<ReturnType<typeof awaitReferenceAnalysis>>;
  const started = new Date(1_000_000).toISOString();
  const states: AnalysisState[] = [
    { status: 'pending', phase: 'reading', started_at: started },
    { status: 'pending', phase: 'analyzing', started_at: started },
    { status: 'done', analysis: done },
  ];
  let clock = 1_000_000 + 5_000;
  let analysed = 0;
  const out = await awaitReferenceAnalysis({} as never, { companyId: 'co', url: 'https://www.tiktok.com/@a/video/1' }, {
    now: () => clock,
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    getState: () => Promise.resolve(states.shift()!),
    analyze: () => {
      analysed += 1;
      return Promise.resolve(done);
    },
  });
  assertEquals(out, done);
  assertEquals(analysed, 0);
});

Deno.test('awaitReferenceAnalysis gives up on a run that outlasts the wait, and starts one when there is none', async () => {
  const done = { beats: [], transcript: 'hello' } as unknown as Awaited<ReturnType<typeof awaitReferenceAnalysis>>;
  let clock = 2_000_000;
  const pending: AnalysisState = { status: 'pending', phase: 'reading', started_at: new Date(clock - 1000).toISOString() };
  let analysed = 0;
  const opts = {
    now: () => clock,
    sleep: (ms: number) => {
      clock += ms;
      return Promise.resolve();
    },
    analyze: () => {
      analysed += 1;
      return Promise.resolve(done);
    },
  };
  let message = '';
  try {
    await awaitReferenceAnalysis({} as never, { companyId: 'co', url: 'u' }, { ...opts, waitMs: 10_000, getState: () => Promise.resolve(pending) });
  } catch (e) {
    message = e instanceof ReferenceAnalysisError ? e.reason : String(e);
  }
  assertEquals(message, 'The reference is still being read.');
  assertEquals(analysed, 0);

  const fresh = await awaitReferenceAnalysis({} as never, { companyId: 'co', url: 'u' }, { ...opts, getState: () => Promise.resolve({ status: 'none' }) });
  assertEquals([fresh, analysed], [done, 1]);
});

