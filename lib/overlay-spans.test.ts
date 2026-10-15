import { describe, expect, it } from 'vitest';

import { applySpanColor, colorRuns, lineCharIndices, lineColorRuns, normalizeSpans, shiftSpans } from './overlay-boxes';

const RED = '#E5484D';
const BLUE = '#1BA6EE';
const W = '#FFFFFF';

describe('normalizeSpans', () => {
  it('drops empty, out of range and colorless spans and merges neighbours', () => {
    expect(normalizeSpans([{ start: 2, end: 2, color: RED }, { start: 0, end: 3 }, { start: 8, end: 20, color: RED }], 10)).toEqual([{ start: 8, end: 10, color: RED }]);
    expect(normalizeSpans([{ start: 0, end: 2, color: RED }, { start: 2, end: 4, color: RED }], 10)).toEqual([{ start: 0, end: 4, color: RED }]);
  });
  it('lets later spans win', () => {
    expect(applySpanColor([{ start: 0, end: 5, color: RED }], 10, 2, 4, BLUE)).toEqual([
      { start: 0, end: 2, color: RED },
      { start: 2, end: 4, color: BLUE },
      { start: 4, end: 5, color: RED },
    ]);
  });
});

describe('shiftSpans', () => {
  const spans = [{ start: 6, end: 11, color: RED }]; // "hello world" -> "world" red
  it('shifts a run when typing before it', () => {
    expect(shiftSpans(spans, 'hello world', 'hey hello world')).toEqual([{ start: 10, end: 15, color: RED }]);
  });
  it('does not color text typed right before or after a run', () => {
    expect(shiftSpans(spans, 'hello world', 'hello Xworld')).toEqual([{ start: 7, end: 12, color: RED }]);
    expect(shiftSpans(spans, 'hello world', 'hello world!')).toEqual([{ start: 6, end: 11, color: RED }]);
  });
  it('grows a run when typing inside it', () => {
    expect(shiftSpans(spans, 'hello world', 'hello woXrld')).toEqual([{ start: 6, end: 12, color: RED }]);
  });
  it('shrinks and drops runs on delete', () => {
    expect(shiftSpans(spans, 'hello world', 'hello wd')).toEqual([{ start: 6, end: 8, color: RED }]);
    expect(shiftSpans(spans, 'hello world', 'hello ')).toEqual([]);
    expect(shiftSpans(spans, 'hello world', 'world')).toEqual([{ start: 0, end: 5, color: RED }]);
  });
  it('handles replacing a selection', () => {
    expect(shiftSpans(spans, 'hello world', 'hi world')).toEqual([{ start: 3, end: 8, color: RED }]);
  });
});

describe('colorRuns', () => {
  it('splits the text into runs', () => {
    expect(colorRuns('hello world', [{ start: 6, end: 11, color: RED }], W)).toEqual([
      { text: 'hello ', color: W, start: 0 },
      { text: 'world', color: RED, start: 6 },
    ]);
    expect(colorRuns('abc', undefined, W)).toEqual([{ text: 'abc', color: W, start: 0 }]);
    expect(colorRuns('', undefined, W)).toEqual([]);
  });
});

describe('lineColorRuns', () => {
  it('maps wrapped lines back to the text', () => {
    const text = 'one  two\nthree four';
    const lines = ['one two', 'three', 'four'];
    expect(lineCharIndices(text, lines)).toEqual([[0, 1, 2, 3, 5, 6, 7], [9, 10, 11, 12, 13], [15, 16, 17, 18]]);
    const runs = lineColorRuns(text, lines, [{ start: 5, end: 8, color: RED }, { start: 15, end: 19, color: BLUE }], W);
    expect(runs).toEqual([
      [{ text: 'one ', color: W, start: 0 }, { text: 'two', color: RED, start: 5 }],
      [{ text: 'three', color: W, start: 9 }],
      [{ text: 'four', color: BLUE, start: 15 }],
    ]);
  });
  it('maps a long word split across lines', () => {
    expect(lineCharIndices('abcdef', ['abc', 'def'])).toEqual([[0, 1, 2], [3, 4, 5]]);
  });
});
