import { deepStrictEqual as assertEquals } from 'node:assert/strict';

import { CHAT_KEEP, chatTurns, normalizeChat } from './chat.ts';

const opts = {
  taken: ['5 tips for a highlight video coaches finish'],
  banned: ['dream school'],
  clean: (t: unknown) => (typeof t === 'string' ? t.trim() : ''),
  fromModel: (t: unknown) => (typeof t === 'string' ? t.trim() : ''),
};

const idea = (over: Record<string, unknown> = {}) => ({
  format: 'slideshow',
  post_type_id: 'tips',
  kind: 'handheld',
  cover: '4 tips for emailing coaches after an ID camp',
  say: 'ignored for slideshows',
  count: 9,
  angle: 'Every camp ends with the same silence.',
  preview: ['1. Email within 48 hours', 'Name the session', 'Ask one question', 'extra'],
  ...over,
});

Deno.test('chatTurns keeps valid turns, the last CHAT_KEEP only', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: ` t${i} ` }));
  const turns = chatTurns([{ role: 'user', text: '' }, null, ...many]);
  assertEquals(turns.length, CHAT_KEEP);
  assertEquals(turns[turns.length - 1], { role: 'assistant', text: 't19' });
  assertEquals(chatTurns('nope'), []);
});

Deno.test('normalizeChat keeps a valid idea and fixes its count and preview', () => {
  const out = normalizeChat({ reply: 'Try these.', ideas: [idea()], chips: ['Give me a reel version.'] }, opts);
  assertEquals(out.ideas.length, 1);
  const got = out.ideas[0];
  assertEquals(got.count, 4); // the number on the cover wins
  assertEquals(got.say, '');
  assertEquals(got.preview, ['Email within 48 hours', 'Name the session', 'Ask one question']);
  assertEquals(out.chips[0], 'Give me a reel version');
  assertEquals(out.chips.length >= 2, true);
});

Deno.test('normalizeChat drops bad types, slop, repeats, banned phrases and out of range numbers', () => {
  const out = normalizeChat(
    {
      reply: 'Here.',
      ideas: [
        idea({ post_type_id: 'listicle' }),
        idea({ format: 'blog' }),
        idea({ cover: 'The ultimate guide to recruiting emails' }),
        idea({ cover: '5 tips for a highlight video coaches finish' }),
        idea({ cover: '12 tips for your dream school visit' }),
        idea({ cover: '12 tips for your official visit weekend' }),
        idea({ cover: 'Hi' }),
      ],
    },
    opts,
  );
  assertEquals(out.ideas, []);
  // Pitched but nothing survived: the reply does not point at missing cards.
  assertEquals(out.reply.startsWith('None of those'), true);
});

Deno.test('normalizeChat: story and long text count 0, long text is always handheld', () => {
  const block = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  const out = normalizeChat(
    {
      ideas: [
        idea({ kind: 'story', cover: 'The week I almost quit club soccer' }),
        idea({ format: 'reel', post_type_id: 'longtext', kind: 'story', cover: block, say: 'Lacing boots in the car' }),
      ],
    },
    opts,
  );
  assertEquals(out.ideas.map((d) => [d.kind, d.count]), [['story', 0], ['handheld', 0]]);
  assertEquals(out.ideas[1].say, 'Lacing boots in the car');
});
