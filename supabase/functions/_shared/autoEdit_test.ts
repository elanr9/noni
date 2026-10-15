import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import {
  autoEditPrompt,
  buildAutoEdit,
  cleanText,
  fallbackPlan,
  parsePlan,
  type AutoBrief,
  type AutoTake,
} from './autoEdit.ts';
import type { TranscriptWord } from './cues.ts';

/** Words 400ms apart, each 300ms long, starting at `from`. */
function words(text: string, from = 1000): TranscriptWord[] {
  return text.split(' ').map((w, i) => ({ w, s: from + i * 400, e: from + i * 400 + 300 }));
}

const brief: AutoBrief = {
  title: '5 tips for the perfect highlight video',
  postTypeKey: 'numbered_list',
  postTypeName: 'Numbered list',
  note: null,
  cta: 'Mention Inkbound at the end',
  points: [],
  companyName: 'Inkbound',
};

Deno.test('dead air at the start and end goes, speech stays', () => {
  const take: AutoTake = { assetId: 'a1', durationMs: 8000, words: words('here are five tips for your highlight video') };
  const out = buildAutoEdit([take], { hook: null, headers: [], cuts: [], media: [] });
  assertEquals(out.blocks.length, 1);
  assertEquals(out.blocks[0].assetId, 'a1');
  assert(out.blocks[0].inMs >= 800 && out.blocks[0].inMs < 1000);
  assert(out.blocks[0].outMs <= 1000 + 7 * 400 + 300 + 250);
  assert(out.cutMs > 4000);
});

Deno.test('a retake is cut and the headers land on the output clock', () => {
  // "tip one film high" then a stumble "uh wait" then "tip one film from high up" again.
  const w = words('one film high wait one film from high up two best plays first');
  const take: AutoTake = { assetId: 'a1', durationMs: 7000, words: w };
  const plan = parsePlan(
    {
      hook: 'Five tips for your highlight video',
      headers: [
        { take: 0, word: 4, text: '1. Film from high up' },
        { take: 0, word: 9, text: '2. Best plays first' },
      ],
      cuts: [{ take: 0, from: 0, to: 3 }],
      media: [],
    },
    [take],
    [],
  );
  const out = buildAutoEdit([take], plan);
  // The first block starts at the kept "one" (word 4), not at word 0.
  assert(out.blocks[0].inMs > w[3].s);
  const headers = out.texts.filter((t) => t.role === 'header');
  assertEquals(headers.map((h) => h.text), ['1. Film from high up', '2. Best plays first']);
  // Header 1 starts at the very top of the edit, so the hook has no room and drops.
  assertEquals(out.texts.some((t) => t.role === 'hook'), false);
  assertEquals(headers[0].endMs, headers[1].startMs);
  // Header 2 sits five words after header 1 on the output clock.
  assert(headers[1].startMs - headers[0].startMs >= 5 * 400 - 200);
});

Deno.test('the hook stays until the first header', () => {
  const take: AutoTake = { assetId: 'a1', durationMs: 9000, words: words('here are five tips you need number one film high') };
  const plan = parsePlan(
    { hook: 'Five tips you need', headers: [{ take: 0, word: 5, text: '1. Film high' }], cuts: [], media: [] },
    [take],
    [],
  );
  const out = buildAutoEdit([take], plan);
  const hook = out.texts.find((t) => t.role === 'hook')!;
  const header = out.texts.find((t) => t.role === 'header')!;
  assertEquals(hook.startMs, 0);
  assertEquals(hook.endMs, header.startMs);
});

Deno.test('several takes play back to back and media follows its words', () => {
  const t0: AutoTake = { assetId: 'a1', durationMs: 4000, words: words('hey so here is the thing', 500) };
  const t1: AutoTake = { assetId: 'a2', durationMs: 5000, words: words('inkbound sends your film to coaches', 500) };
  const plan = parsePlan({ hook: null, headers: [], cuts: [], media: [{ take: 1, from: 0, to: 0, feature: 'f1' }] }, [t0, t1], ['f1']);
  const out = buildAutoEdit([t0, t1], plan);
  assertEquals(out.blocks.map((b) => b.assetId), ['a1', 'a2']);
  const firstLen = out.blocks[0].outMs - out.blocks[0].inMs;
  assertEquals(out.media.length, 1);
  assert(out.media[0].startMs >= firstLen - 200 && out.media[0].startMs <= firstLen + 100);
  assert(out.media[0].endMs - out.media[0].startMs >= 2500);
});

Deno.test('a whole take redone later can be cut out', () => {
  const t0: AutoTake = { assetId: 'a1', durationMs: 3000, words: words('five tips for', 200) };
  const t1: AutoTake = { assetId: 'a2', durationMs: 4000, words: words('five tips for your video', 200) };
  const plan = parsePlan({ cuts: [{ take: 0, from: 0, to: 2 }] }, [t0, t1], []);
  const out = buildAutoEdit([t0, t1], plan);
  assertEquals(out.blocks.map((b) => b.assetId), ['a2']);
});

Deno.test('parsePlan drops bad indexes and unknown features', () => {
  const take: AutoTake = { assetId: 'a1', durationMs: 3000, words: words('one two three') };
  const plan = parsePlan(
    {
      hook: '  "Five tips — for you" ',
      headers: [{ take: 0, word: 9, text: 'x' }, { take: 3, word: 0, text: 'y' }, { take: 0, word: 1, text: '' }],
      cuts: [{ take: 0, from: 2, to: 1 }],
      media: [{ take: 0, from: 0, to: 1, feature: 'nope' }],
    },
    [take],
    ['f1'],
  );
  assertEquals(plan.hook, 'Five tips, for you');
  assertEquals(plan.headers, []);
  assertEquals(plan.cuts, []);
  assertEquals(plan.media, []);
});

Deno.test('no words keeps the whole take and the title becomes the hook', () => {
  const take: AutoTake = { assetId: 'a1', durationMs: 6000, words: [] };
  const out = buildAutoEdit([take], fallbackPlan(brief));
  assertEquals(out.blocks, [{ assetId: 'a1', inMs: 0, outMs: 6000 }]);
  assertEquals(out.texts, [{ role: 'hook', text: '5 tips for the perfect highlight video', startMs: 0, endMs: 6000 }]);
});

Deno.test('cleanText strips dashes and emoji', () => {
  assertEquals(cleanText('Film high – always \u{1F525}'), 'Film high, always');
});

Deno.test('the prompt indexes every word by take', () => {
  const take: AutoTake = { assetId: 'a1', durationMs: 3000, words: words('one two') };
  const { user } = autoEditPrompt(brief, [take], [{ id: 'f1', title: 'Film review', description: '', kind: 'clip' }]);
  assert(user.includes('Take 0:'));
  assert(user.includes('[0]one [1]two'));
  assert(user.includes('f1: Film review'));
  assert(user.includes('list post'));
});
