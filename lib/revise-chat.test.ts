import { describe, expect, it } from 'vitest';

import { addTurn, parseReviseChat, REVISE_TURNS, reviseReply } from './revise-chat';

describe('revise chat', () => {
  it('parses what was stored and drops junk', () => {
    const raw = JSON.stringify([{ role: 'user', text: 'Shorter cues', at: 1 }, { role: 'ai', text: 'Cut every cue to one line', at: 2 }, { role: 'x', text: 'no' }, { role: 'ai', text: ' ' }, 5]);
    expect(parseReviseChat(raw)).toEqual([
      { role: 'user', text: 'Shorter cues', at: 1 },
      { role: 'ai', text: 'Cut every cue to one line', at: 2 },
    ]);
    expect(parseReviseChat('nope')).toEqual([]);
    expect(parseReviseChat(null)).toEqual([]);
  });

  it('caps the thread and ignores blank turns', () => {
    let list = addTurn([], 'user', '  ', 1);
    expect(list).toEqual([]);
    for (let i = 0; i < REVISE_TURNS + 5; i++) list = addTurn(list, 'user', `ask ${i}`, i);
    expect(list).toHaveLength(REVISE_TURNS);
    expect(list[list.length - 1].text).toBe(`ask ${REVISE_TURNS + 4}`);
  });

  it('replies with the note, a plain line, or a retry', () => {
    expect(reviseReply('Cut the hook to 8 words', true)).toBe('Cut the hook to 8 words');
    expect(reviseReply(null, true)).toBe('Updated the post.');
    expect(reviseReply(null, false)).toBe('That did not go through. Try again.');
  });
});
