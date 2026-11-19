// Runs under Deno with no network, like llm_test.ts:
//   cd supabase/functions && DENO_NO_PACKAGE_JSON=1 deno test --allow-env _shared/ai/
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import type { LlmClient } from './llm.ts';
import {
  compilePlan,
  EDIT_PLAN_SCHEMA,
  fallbackRawPlan,
  PlanError,
  planEdit,
  readMs,
  renderTakes,
  type PlannerInput,
  type RawPlan,
} from './editPlanner.ts';
import { assertStrictSchema } from './llm.ts';

/** Words 300 ms long; `gaps[i]` is the silence before word i. */
function words(text: string, startMs = 500, gaps: Record<number, number> = {}) {
  let at = startMs;
  return text.split(' ').map((w, i) => {
    at += gaps[i] ?? 60;
    const word = { w, s: at, e: at + 300 };
    at += 300;
    return word;
  });
}

function input(partial: Partial<PlannerInput> = {}): PlannerInput {
  return {
    companyId: null,
    takes: [
      // 0-3 a false start, 2 s pause, then the clean line 4-11.
      { assetId: 't0', durationMs: 9000, words: words('So I found this So I found this app that scans receipts.', 500, { 4: 2000 }) },
      { assetId: 't1', durationMs: 5000, words: words('Um it saves me an hour every week.', 400) },
    ],
    brief: { title: 'Receipts', type: 'Talking Head', kind: 'Guided', notes: '', productName: 'Scanly', clips: [{ say: 'I found this app that scans receipts.', onScreen: 'The app that does my receipts', cta: false }], sound: { title: 'Soft keys', artist: 'Noni' } },
    media: [{ id: 'm1', title: 'Receipt scan', description: '', kind: 'still', durationMs: null }],
    reference: null,
    overlays: [{ id: 'ov1', text: 'The app that does my receipts', startMs: 0, endMs: 9000, y: 0.26 }],
    ...partial,
  };
}

function raw(partial: Partial<RawPlan> = {}): RawPlan {
  return {
    segments: [
      { take: 0, first_word: 4, last_word: 11, framing: 'full', pace: 'normal', reason: 'clean try' },
      { take: 1, first_word: 1, last_word: 7, framing: 'punch_in', pace: 'normal', reason: 'the number' },
    ],
    texts: [],
    inserts: [],
    captions: { enabled: true, position: 'lower' },
    sound: { use_brief_track: true, track_volume: 80 },
    summary: ['Cut the restart — kept the clean try'],
    ...partial,
  };
}

Deno.test('the schema is strict', () => {
  assertStrictSchema(EDIT_PLAN_SCHEMA);
});

Deno.test('the takes render with indexes, pauses and repeats', () => {
  const text = renderTakes(input().takes, input().brief);
  assert(text.includes('4:So 5:I 6:found'));
  assert(text.includes('(pause 2.00 s)'));
  assert(text.includes('filler at 0'));
  assert(text.includes('take 0 words 0-3 and take 0 words 4-11'));
});

Deno.test('cut points come from the word timings, padded but never into a neighbour', () => {
  const inp = input();
  const { plan } = compilePlan(inp, raw(), true);
  const w = inp.takes[0].words;
  assertEquals(plan.keeps.length, 2);
  // Starts 80 ms before "So" (word 4), well after word 3 ended.
  assertEquals(plan.keeps[0].in_ms, w[4].s - 80);
  assert(plan.keeps[0].in_ms >= w[3].e);
  assertEquals(plan.keeps[0].out_ms, w[11].e + 200);
  // "Um" is out and the cut does not include it.
  assert(plan.keeps[1].in_ms >= inp.takes[1].words[0].e);
  assertEquals(plan.keeps[1].zoom, 1.2);
  assertEquals(plan.sound, { use_brief_track: true, track_volume: 30, voice_volume: 100 });
  assertEquals(plan.summary, ['Cut the restart, kept the clean try']);
  assert(plan.cut_ms > 3000);
});

Deno.test('a pause inside a kept range is tightened', () => {
  const inp = input({ takes: [{ assetId: 't0', durationMs: 8000, words: words('One two three four five six', 0, { 3: 1500 }) }] });
  const { plan } = compilePlan(inp, raw({ segments: [{ take: 0, first_word: 0, last_word: 5, framing: 'full', pace: 'normal', reason: '' }] }), true);
  assertEquals(plan.keeps.length, 2);
  const gap = plan.keeps[1].in_ms - plan.keeps[0].out_ms;
  assertEquals(gap, 1500 - 200);
});

Deno.test('overlapping and out of range indexes are repaired, not trusted', () => {
  const inp = input();
  const { plan, repairs } = compilePlan(
    inp,
    raw({
      segments: [
        { take: 0, first_word: 4, last_word: 11, framing: 'full', pace: 'normal', reason: '' },
        { take: 0, first_word: 9, last_word: 40, framing: 'full', pace: 'normal', reason: '' },
        { take: 7, first_word: 0, last_word: 2, framing: 'full', pace: 'normal', reason: '' },
        { take: 1, first_word: 1, last_word: 7, framing: 'full', pace: 'faster', reason: '' },
      ],
    }),
    true,
  );
  assertEquals(plan.keeps.map((k) => k.asset_id), ['t0', 't1']);
  // 2.8 words a second is quick enough already.
  assertEquals(plan.keeps[1].speed, 1);
  assert(repairs.some((r) => r.includes('already kept')));
  assert(repairs.some((r) => r.includes('does not exist')));
  for (let i = 0; i < plan.keeps.length; i++) assert(plan.keeps[i].out_ms - plan.keeps[i].in_ms >= 300);
});

Deno.test('text lands on its word, stays long enough to read and never stacks in one zone', () => {
  const inp = input();
  const { plan, replaceOverlayIds, repairs } = compilePlan(
    inp,
    raw({
      texts: [
        { role: 'hook', text: 'The app that does my receipts', take: 0, word: 4, hold: 'read', position: 'upper', replaces: '' },
        { role: 'label', text: 'One hour back every week', take: 1, word: 3, hold: 'to_end', position: 'upper', replaces: '' },
        { role: 'header', text: 'Gone', take: 0, word: 0, hold: 'read', position: 'top', replaces: '' },
      ],
    }),
    true,
  );
  const total = plan.keeps.reduce((n, k) => n + (k.out_ms - k.in_ms) / k.speed, 0);
  assertEquals(plan.texts.length, 2);
  const [hook, label] = plan.texts;
  assertEquals(hook.start_ms, 0);
  assert(hook.end_ms - hook.start_ms >= Math.max(2500, readMs(hook.text)));
  assert(label.end_ms <= total && label.end_ms - label.start_ms >= readMs(label.text));
  // Same zone asked for both: they do not share it while both are up.
  assert(hook.end_ms <= label.start_ms || hook.position !== label.position);
  // The hook repeats the brief text already on the video, so it replaces it.
  assertEquals(replaceOverlayIds, ['ov1']);
  // The header sat on the false start, which was cut, with no kept word close after it.
  assert(repairs.some((r) => r.includes('its word was cut')));
  for (const t of plan.texts) assert(t.start_ms >= 0 && t.end_ms <= total);
});

Deno.test('captions take the lower zone and inserts stay inside the video', () => {
  const inp = input();
  const { plan } = compilePlan(
    inp,
    raw({
      texts: [{ role: 'label', text: 'Scans in two seconds', take: 0, word: 8, hold: 'read', position: 'lower', replaces: '' }],
      inserts: [
        { media_id: 'm1', take: 0, first_word: 9, last_word: 11, layout: 'split' },
        { media_id: 'nope', take: 0, first_word: 9, last_word: 11, layout: 'overlay' },
      ],
    }),
    true,
  );
  const total = plan.keeps.reduce((n, k) => n + (k.out_ms - k.in_ms) / k.speed, 0);
  assertEquals(plan.captions, { enabled: true, position: 'lower' });
  assertEquals(plan.texts[0].position, 'center');
  assertEquals(plan.inserts.length, 1);
  assert(plan.inserts[0].end_ms - plan.inserts[0].start_ms >= 1500);
  assert(plan.inserts[0].end_ms <= total);
});

Deno.test('a plan that keeps nothing is refused', () => {
  assertThrows(() => compilePlan(input(), raw({ segments: [] }), true), PlanError);
  assertThrows(() => compilePlan(input(), raw({ segments: [{ take: 0, first_word: 0, last_word: 0, framing: 'full', pace: 'normal', reason: '' }] }), true), PlanError);
});

Deno.test('the fallback trims pauses and filler, uses the brief hook and says it is not AI', () => {
  const inp = input();
  const { plan } = compilePlan(inp, fallbackRawPlan(inp), false);
  assertEquals(plan.ai, false);
  assertEquals(plan.texts.map((t) => t.text), ['The app that does my receipts']);
  assert(plan.keeps.length >= 3);
  // "Um" at the head of take 1 is gone.
  const t1 = plan.keeps.find((k) => k.asset_id === 't1')!;
  assert(t1.in_ms >= inp.takes[1].words[0].e);
  assert(plan.summary[0].startsWith('Cut '));
});

Deno.test('planEdit falls back with a reason when the call fails', async () => {
  const client: LlmClient = {
    beta: { messages: { stream: () => ({ request_id: null, finalMessage: () => Promise.reject(new Error('boom')) }) } },
  };
  const out = await planEdit(input(), { client, supabase: null });
  assertEquals(out.plan.ai, false);
  assert(out.fallbackReason?.includes('boom'));
  assert(out.plan.keeps.length > 0);
});

Deno.test('planEdit compiles the model answer', async () => {
  const message = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(raw()) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
  let sent: unknown = null;
  const client: LlmClient = {
    beta: {
      messages: {
        stream: (body) => {
          sent = body;
          // deno-lint-ignore no-explicit-any
          return { request_id: 'req_1', finalMessage: () => Promise.resolve(message as any) };
        },
      },
    },
  };
  const out = await planEdit(input(), { client, supabase: null });
  assertEquals(out.fallbackReason, null);
  assertEquals(out.plan.ai, true);
  assertEquals(out.plan.keeps.length, 2);
  assert(JSON.stringify(sent).includes('4:So 5:I'));
});
