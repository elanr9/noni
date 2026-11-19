// Runs under Deno, with no network: `deno test` from supabase/functions.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { briefEditSignal, editPlanSignal, renderSignal } from './signals.ts';

const draft = {
  title: 'Stop killing ferns',
  angle: 'For people who keep losing plants: one photo tells you when to water.',
  clips: [
    { say: 'I killed three ferns before this.', onScreen: 'three dead ferns', cta: false },
    { say: 'You photograph the plant once.', onScreen: 'one photo', cta: false },
    { say: 'It is called Fernly, link in my bio.', onScreen: 'Fernly', cta: true },
  ],
  hooks: [
    { say: 'I killed three ferns before this.', onScreen: 'three dead ferns', archetype: 'confession' },
    { say: 'Your fern is not thirsty.', onScreen: 'not thirsty', archetype: 'contrarian' },
  ],
  caption: 'How to water a fern without guessing.',
  tags: ['#plantcare', '#ferns'],
};

Deno.test('briefEditSignal records what was kept, edited, removed and which hook was chosen', () => {
  const signal = briefEditSignal({
    libraryBriefId: 'b1',
    briefType: 'Talking Head',
    draft,
    saved: {
      title: 'Stop killing ferns',
      clips: [
        { say: 'Your fern is not thirsty.', onScreen: 'not thirsty' },
        { say: 'You photograph the plant once.', onScreen: 'ONE photo ' },
      ],
      caption: 'How I stopped guessing when to water.',
      tags: ['plantcare', '#houseplants'],
    },
  });
  assertEquals([signal.hook_choice, signal.hook_archetype], [1, 'contrarian']);
  assertEquals(signal.clips.map((c) => c.outcome), ['edited', 'kept', 'removed']);
  assertEquals(signal.clips[0].changes.map((c) => c.field), ['say', 'onScreen']);
  assertEquals(signal.title, null);
  assertEquals(signal.caption?.after, 'How I stopped guessing when to water.');
  assertEquals(signal.tags, { added: ['houseplants'], removed: ['ferns'] });
  assertEquals(signal.kept_ratio, 0.33);
  const text = renderSignal(signal);
  assertStringIncludes(text, 'The manager chose alternative opening 2 (contrarian).');
  assertStringIncludes(text, 'Clip 2 spoken line removed: "It is called Fernly, link in my bio." -> ""');
});

Deno.test('briefEditSignal reports a rewritten opening and an untouched draft', () => {
  const rewritten = briefEditSignal({ libraryBriefId: 'b1', briefType: 'Talking Head', draft, saved: { ...draft, clips: [{ say: 'My own line.', onScreen: '' }, ...draft.clips.slice(1)] } });
  assertEquals(rewritten.hook_choice, -1);
  const untouched = briefEditSignal({ libraryBriefId: 'b1', briefType: 'Talking Head', draft, saved: draft });
  assertEquals([untouched.hook_choice, untouched.kept_ratio, untouched.caption], [0, 1, null]);
});

Deno.test('editPlanSignal keeps the delta and says when the plan went out untouched', () => {
  const base = { ai: true, blocksChanged: false, textsRemoved: 0, textsEdited: 0, textsAdded: 0, captionsChanged: false, soundChanged: false };
  const untouched = editPlanSignal({ assignmentId: 'a1', libraryBriefId: 'b1', format: 'video', delta: base })!;
  assertEquals(untouched.untouched, true);
  const changed = editPlanSignal({ assignmentId: 'a1', libraryBriefId: null, format: 'video', delta: { ...base, blocksChanged: true, textsRemoved: 2 } })!;
  assertEquals(changed.untouched, false);
  assertStringIncludes(renderSignal(changed), 'the creator changed the cuts, removed 2 on-screen texts');
  assertEquals(editPlanSignal({ assignmentId: 'a1', libraryBriefId: null, format: null, delta: null }), null);
  assertEquals(editPlanSignal({ assignmentId: 'a1', libraryBriefId: null, format: null, delta: { textsAdded: 1 } }), null);
});
