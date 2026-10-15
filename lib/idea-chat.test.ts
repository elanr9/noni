import { describe, expect, it, vi } from 'vitest';

import type { Campaign, WeekBrief, WeekLanes, WeekSlot } from './briefs-api';
import type { ChatIdea, IdeaMakeResult } from './deck-ai';
import {
  currentChips,
  defaultMakeKind,
  dropStaleWriting,
  ideaStateLabel,
  ideaStateOf,
  inputFromIdeaMake,
  makeKindsFor,
  rejectedCovers,
  withIdeaState,
  writingSlots,
  ideaEditorParams,
  ideaPostTypeKey,
  openSlotsLabel,
  parseIdeaParams,
  parseStoredChat,
  pickTargetSlot,
  shownCovers,
  START_CHIPS,
  wireTurns,
  type ChatMessage,
} from './idea-chat';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: globalThis.fetch }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, Easing: { bezier: () => () => 0 } }));

const filled = { kind: 'handheld' } as WeekBrief;

function slot(format: 'slideshow' | 'reel', index: number, brief: WeekBrief | null = null): WeekSlot {
  return { index, briefId: `${format}-${index}`, format, brief };
}

function lanes(slideshow: WeekSlot[], reel: WeekSlot[]): WeekLanes {
  return { campaign: { id: 'c1' } as Campaign, slideshow, reel };
}

const idea: ChatIdea = {
  format: 'slideshow',
  postTypeId: 'tips',
  kind: 'handheld',
  cover: '5 tips for the perfect highlight video',
  say: '',
  count: 5,
  angle: 'Saves.',
  preview: ['Best clip first'],
};

describe('pickTargetSlot', () => {
  const week = lanes([slot('slideshow', 0, filled), slot('slideshow', 1), slot('slideshow', 2)], [slot('reel', 0, filled)]);

  it('fills the slot the chat was opened from when it is still empty', () => {
    const t = pickTargetSlot(week, 'slideshow', 'slideshow-2');
    expect(t.ok && t.slot.briefId).toBe('slideshow-2');
  });

  it('falls back to the first empty slot of the format', () => {
    const first = pickTargetSlot(week, 'slideshow');
    expect(first.ok && first.slot.briefId).toBe('slideshow-1');
    // The preferred slot filled meanwhile, or it is another format.
    const t = pickTargetSlot(week, 'slideshow', 'slideshow-0');
    expect(t.ok && t.slot.briefId).toBe('slideshow-1');
    const r = pickTargetSlot(week, 'slideshow', 'reel-0');
    expect(r.ok && r.slot.briefId).toBe('slideshow-1');
  });

  it('says so when the format has no empty slot', () => {
    expect(pickTargetSlot(week, 'reel')).toEqual({ ok: false, message: 'No empty reel slots left this week. Clear one on the week first.' });
    expect(pickTargetSlot(lanes([], []), 'slideshow')).toEqual({ ok: false, message: 'No empty slideshow slots left this week. Clear one on the week first.' });
  });

  it('skips slots another card is writing into', () => {
    const t = pickTargetSlot(week, 'slideshow', 'slideshow-2', ['slideshow-2']);
    expect(t.ok && t.slot.briefId).toBe('slideshow-1');
    expect(pickTargetSlot(week, 'slideshow', null, ['slideshow-1', 'slideshow-2']).ok).toBe(false);
  });
});

describe('chat helpers', () => {
  const chat: ChatMessage[] = [
    { id: '1', role: 'user', text: 'I need a slideshow idea' },
    { id: '2', role: 'assistant', text: 'Try this.', ideas: [idea], chips: ['Give me a reel version'] },
    { id: '3', role: 'error', text: 'AI request failed.' },
  ];

  it('sends user and AI turns, never errors, with the pitched covers', () => {
    expect(wireTurns(chat)).toEqual([
      { role: 'user', text: 'I need a slideshow idea' },
      { role: 'assistant', text: 'Try this.\nPitched: [slideshow tips] "5 tips for the perfect highlight video"' },
    ]);
    expect(shownCovers(chat)).toEqual([idea.cover]);
  });

  it('shows the last AI chips, else the starters', () => {
    expect(currentChips(chat)).toEqual(['Give me a reel version']);
    expect(currentChips([])).toEqual(START_CHIPS);
    expect(currentChips([{ id: '1', role: 'assistant', text: 'Hm?', ideas: [], chips: [] }])).toEqual(START_CHIPS);
  });

  it('labels open slots', () => {
    expect(openSlotsLabel(lanes([slot('slideshow', 0), slot('slideshow', 1)], [slot('reel', 0)]))).toBe('2 slideshows and 1 reel open');
    expect(openSlotsLabel(lanes([slot('slideshow', 0, filled)], []))).toBe('Every slot is filled');
  });

  it('round trips an idea through editor params', () => {
    expect(ideaPostTypeKey(idea)).toBe('numbered_tips');
    expect(ideaPostTypeKey({ ...idea, format: 'reel', postTypeId: 'tips' })).toBe('numbered_list');
    expect(parseIdeaParams(ideaEditorParams(idea))).toEqual({ cover: idea.cover, say: '', count: 5, angle: 'Saves.' });
    expect(parseIdeaParams({ ideaCover: '  ' })).toBeNull();
    expect(parseIdeaParams({ ideaCover: 'X', ideaCount: 'abc' })?.count).toBe(0);
  });

  it('reads stored chats defensively', () => {
    expect(parseStoredChat(JSON.stringify(chat))).toEqual(chat);
    expect(parseStoredChat('not json')).toEqual([]);
    expect(parseStoredChat(null)).toEqual([]);
    expect(parseStoredChat(JSON.stringify([{ id: 1, role: 'user', text: 'x' }, { id: 'a', role: 'assistant', text: 'y', ideas: [{ bad: true }] }]))).toEqual([
      { id: 'a', role: 'assistant', text: 'y', ideas: [], chips: [] },
    ]);
  });
});

describe('card states', () => {
  const second: ChatIdea = { ...idea, cover: 'How to email a coach after a bad game' };
  const base: ChatMessage[] = [{ id: 'a', role: 'assistant', text: 'Two.', ideas: [idea, second], chips: [] }];

  it('sets, reads and clears a card state', () => {
    const writing = withIdeaState(base, 'a', 1, { status: 'writing', slot: 4, briefId: 'b5', kind: 'story' });
    expect(ideaStateOf(writing[0], 1)).toEqual({ status: 'writing', slot: 4, briefId: 'b5', kind: 'story' });
    expect(ideaStateOf(writing[0], 0)).toBeNull();
    expect(writingSlots(writing)).toEqual(['b5']);
    expect(ideaStateOf(withIdeaState(writing, 'a', 1, null)[0], 1)).toBeNull();
  });

  it('labels writing and made cards with the two digit slot', () => {
    expect(ideaStateLabel({ status: 'writing', slot: 4, briefId: 'b', kind: 'handheld' })).toBe('Writing into slot 05');
    expect(ideaStateLabel({ status: 'made', slot: 0, briefId: 'b', kind: 'handheld' })).toBe('In slot 01');
  });

  it('dismissed covers go out as rejected and are marked in the transcript', () => {
    const chat = withIdeaState(base, 'a', 0, { status: 'dismissed' });
    expect(rejectedCovers(chat)).toEqual([idea.cover]);
    expect(wireTurns(chat)[0].text).toContain(`"${idea.cover}" (rejected)`);
  });

  it('keeps states through storage and drops writing ones whose run is gone', () => {
    const chat = withIdeaState(
      withIdeaState(base, 'a', 0, { status: 'made', slot: 1, briefId: 'b2', kind: 'handheld' }),
      'a',
      1,
      { status: 'writing', slot: 2, briefId: 'b3', kind: 'handheld' },
    );
    const stored = parseStoredChat(JSON.stringify(chat));
    expect(stored).toEqual(chat);
    const after = dropStaleWriting(stored, () => false);
    expect(ideaStateOf(after[0], 0)?.status).toBe('made');
    expect(ideaStateOf(after[0], 1)).toBeNull();
    expect(ideaStateOf(dropStaleWriting(stored, () => true)[0], 1)?.status).toBe('writing');
  });

  it('offers Handheld and Story, Handheld only for Long text', () => {
    expect(makeKindsFor(idea).map((k) => k.kind)).toEqual(['handheld', 'story']);
    expect(makeKindsFor({ ...idea, format: 'reel', postTypeId: 'longtext' }).map((k) => k.kind)).toEqual(['handheld']);
    expect(defaultMakeKind(idea)).toBe('handheld');
    expect(defaultMakeKind({ ...idea, kind: 'story' })).toBe('story');
    for (const k of makeKindsFor(idea)) expect(k.line).not.toMatch(/[\u2010-\u2015-]/);
  });
});

describe('inputFromIdeaMake', () => {
  const made: IdeaMakeResult = {
    format: 'reel',
    postTypeId: 'talking',
    kind: 'story',
    cover: 'What to send a coach after a bad game',
    say: 'Had a bad game in front of a coach? Send this.',
    slides: [
      { role: 'cover', text: 'What to send a coach after a bad game', shot: 'Had a bad game in front of a coach? Send this.', featureId: null, place: null },
      { role: 'cta', text: 'I send mine from Noni', shot: 'Point at the phone', featureId: 'f1', place: 'any' },
    ],
    caption: 'Bad games happen.',
    hashtags: ['recruiting'],
    searchPhrase: 'email coach after bad game',
    sourceNote: '',
    warnings: [],
  };

  it('saves a Story as cover and CTA with the cover as its theme', () => {
    const input = inputFromIdeaMake(made, 'pt1');
    expect(input.kind).toBe('story');
    expect(input.slides.map((s) => s.role)).toEqual(['cover', 'cta']);
    expect(input.story).toEqual({ theme: made.cover, beats: [], min: 4, max: 8, ctaAt: 'any' });
    expect(input.cta).toEqual({ text: 'I send mine from Noni', featureId: 'f1' });
    expect(input.postTypeId).toBe('pt1');
    expect(input.title).toBe(made.cover);
  });

  it('saves a Handheld as the whole deck', () => {
    const input = inputFromIdeaMake({ ...made, kind: 'handheld' }, null);
    expect(input.kind).toBe('handheld');
    expect(input.story).toBeNull();
  });
});
