import { deepStrictEqual as assertEquals, throws } from 'node:assert/strict';

import { ctaPlaceFor, isShortMake, normalizeMade, normalizeShort, readMakeIdea, type MakeRaw } from './make.ts';

const opts = {
  format: null,
  typeId: null,
  remix: false,
  known: new Set(['f1']),
  fromModel: (t: unknown) => (typeof t === 'string' ? t.trim() : ''),
  clean: (t: unknown) => (typeof t === 'string' ? t.trim() : ''),
};

const slide = (role: string, text: string, feature_id: string | null = null) => ({ role, text, shot: 'a shot', feature_id });

Deno.test('normalizeMade: cover first, one CTA, model picks format and type', () => {
  const raw: MakeRaw = {
    format: 'slideshow',
    post_type_id: 'howto',
    slides: [slide('cover', 'How to: email a coach'), slide('point', '1. One'), slide('cta', '2. Two', 'f1'), slide('cta', '3. Three', 'f1')],
  };
  const made = normalizeMade(raw, opts);
  assertEquals(made.format, 'slideshow');
  assertEquals(made.typeId, 'howto');
  assertEquals(made.skeleton.map((s) => s.role), ['cover', 'point', 'cta', 'point']);
  assertEquals(made.out[0].text, 'How to email a coach');
  assertEquals(made.out.map((o) => o.feature_id), [null, null, 'f1', null]);
  assertEquals(made.skeleton[2].place, 'any');
});

Deno.test('normalizeMade: pinned format wins, unknown type falls back, last slide becomes the CTA', () => {
  const raw: MakeRaw = { format: 'slideshow', post_type_id: 'nope', slides: [slide('cover', 'Hook'), slide('point', 'a'), slide('point', 'b'), slide('point', 'c', 'zzz')] };
  const made = normalizeMade(raw, { ...opts, format: 'reel' });
  assertEquals(made.format, 'reel');
  assertEquals(made.typeId, 'talking');
  assertEquals(made.skeleton.map((s) => s.role), ['cover', 'point', 'point', 'cta']);
  assertEquals(made.out[3].feature_id, null);
});

Deno.test('normalizeMade: a remix keeps its CTA spot and its own count', () => {
  const body = Array.from({ length: 9 }, (_, i) => slide(i === 0 ? 'cta' : 'point', `Item ${i}`));
  const made = normalizeMade({ slides: [slide('cover', 'Questions to ask'), ...body], numbered: false }, { ...opts, format: 'slideshow', remix: true });
  assertEquals(made.skeleton.length, 10);
  assertEquals(made.skeleton[1].place, 'after_hook');
  assertEquals(made.numbered, false);
});

Deno.test('normalizeMade: drops extra points past the range, never the CTA', () => {
  const body = Array.from({ length: 12 }, (_, i) => slide(i === 11 ? 'cta' : 'point', `Item ${i}`));
  const made = normalizeMade({ post_type_id: 'myths', slides: [slide('cover', 'Myths'), ...body] }, { ...opts, format: 'slideshow' });
  assertEquals(made.skeleton.length, 7);
  assertEquals(made.skeleton[6].role, 'cta');
});

Deno.test('normalizeMade: nothing usable throws', () => {
  throws(() => normalizeMade({ slides: [] }, opts));
});

Deno.test('ctaPlaceFor', () => {
  assertEquals(ctaPlaceFor(1, 5, true), 'after_hook');
  assertEquals(ctaPlaceFor(5, 5, true), 'end');
  assertEquals(ctaPlaceFor(3, 5, true), 'any');
  assertEquals(ctaPlaceFor(5, 5, false), 'any');
});

const card = { cover: 'What to send a coach after a bad game', say: 'Had a bad game in front of a coach? Send this.', outline: ['Own it', 'Name the fix'], angle: 'Saves.', count: 4 };

Deno.test('normalizeMade: a pinned card keeps its cover, hook and count', () => {
  const body = Array.from({ length: 6 }, (_, i) => slide(i === 5 ? 'cta' : 'point', `Item ${i}`, i === 5 ? 'f1' : null));
  const made = normalizeMade(
    { post_type_id: 'talking', slides: [slide('cover', 'A brand new topic'), ...body] },
    { ...opts, format: 'reel', typeId: 'talking', pinned: card },
  );
  assertEquals(made.out[0].text, card.cover);
  assertEquals(made.out[0].shot, card.say);
  assertEquals(made.skeleton.length, 5);
  assertEquals(made.skeleton[4].role, 'cta');
});

Deno.test('readMakeIdea: needs a cover, cleans the rest', () => {
  assertEquals(readMakeIdea({}, opts.clean), null);
  const idea = readMakeIdea({ cover: ' Hook ', outline: ['a', '', 3], count: '5' }, opts.clean);
  assertEquals(idea, { cover: 'Hook', say: '', outline: ['a'], angle: '', count: 5 });
});

Deno.test('isShortMake: story and long text only', () => {
  assertEquals(isShortMake('story', 'slideshow', 'tips'), true);
  assertEquals(isShortMake('handheld', 'reel', 'longtext'), true);
  assertEquals(isShortMake('handheld', 'reel', 'talking'), false);
});

Deno.test('normalizeShort: pinned cover, one CTA, the card hook for reels', () => {
  const made = normalizeShort(
    { cover_shot: 'Something else', cta: { text: 'I log every coach reply in Noni', shot: 'Point at the phone', feature_id: 'f1' }, hashtags: ['#D1', 'd1', 'recruiting'] },
    { format: 'reel', typeId: 'talking', kind: 'story', idea: card, productName: 'Noni', known: opts.known, fromModel: opts.fromModel, clean: opts.clean },
  );
  assertEquals(made.slides.map((s) => s.role), ['cover', 'cta']);
  assertEquals(made.slides[0].text, card.cover);
  assertEquals(made.say, card.say);
  assertEquals(made.slides[1].feature_id, 'f1');
  assertEquals(made.hashtags, ['d1', 'recruiting']);
  assertEquals(made.warnings, []);
  throws(() => normalizeShort({}, { format: 'reel', typeId: 'talking', kind: 'story', idea: card, productName: 'Noni', known: opts.known, fromModel: opts.fromModel, clean: opts.clean }));
});
