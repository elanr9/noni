import { describe, expect, it } from 'vitest';

import { clock, fromPostNotes, saveLabel, toFlatNote, toPostNotes } from './notes';

describe('review notes', () => {
  it('formats clock times', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(12.7)).toBe('0:12');
    expect(clock(65)).toBe('1:05');
  });

  it('writes pinned and whole notes in order', () => {
    const out = toPostNotes(
      [
        { id: 'a', at: 12, text: 'Louder here ' },
        { id: 'b', at: null, text: 'Shorter overall' },
      ],
      true,
    );
    expect(out).toEqual([
      { label: 'Whole video', text: 'Shorter overall' },
      { label: '0:12', text: 'Louder here' },
    ]);
    expect(toFlatNote(out)).toBe('Whole video: Shorter overall\n\n0:12: Louder here');
  });

  it('labels slideshow notes by slide', () => {
    expect(toPostNotes([{ id: 'a', at: 2, text: 'Crop tighter' }], false)).toEqual([{ label: 'Slide 3', text: 'Crop tighter' }]);
  });

  it('reads sent notes back', () => {
    expect(fromPostNotes([{ label: '1:05', text: 'x' }, { label: 'Hook', text: 'y' }], true).map((n) => n.at)).toEqual([null, 65]);
    expect(fromPostNotes([{ label: 'Slide 2', text: 'x' }], false)[0]?.at).toBe(1);
  });

  it('counts the save button', () => {
    expect(saveLabel(0)).toBe('Save changes');
    expect(saveLabel(1)).toBe('Save 1 change');
    expect(saveLabel(3)).toBe('Save 3 changes');
  });
});
