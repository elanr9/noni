import { describe, expect, it } from 'vitest';

import { creditLine } from './v2-format';

describe('creditLine', () => {
  it('shows sales and sign-ups when the viewer may see both', () => {
    expect(creditLine({ sales: true, signups: true }, 10200, 5)).toBe('$102 sales · 5 sign-ups');
  });
  it('drops dollars without Financials', () => {
    expect(creditLine({ sales: false, signups: true }, 10200, 1)).toBe('1 sign-up');
  });
  it('drops counts without Sign ups', () => {
    expect(creditLine({ sales: true, signups: false }, 10200, 5)).toBe('$102 sales');
  });
  it('says nothing with both off or nothing credited', () => {
    expect(creditLine({ sales: false, signups: false }, 10200, 5)).toBeNull();
    expect(creditLine({ sales: true, signups: true }, 0, 0)).toBeNull();
  });
});
