import { describe, expect, it } from 'vitest';

import { changedMeaningfully, editSignals, normalizeLine, type SignalSlide } from './ai-edit-signals';

const ctx = { companyId: 'c1', briefId: 'b1', format: 'reel', postType: 'reel_talking' };

describe('normalizeLine', () => {
  it('ignores numbering, case, spacing and punctuation', () => {
    expect(normalizeLine('2. Lead with your grad year!')).toBe('lead with your grad year');
    expect(changedMeaningfully('2. Lead with your grad year', '3) lead  with your grad year.')).toBe(false);
    expect(changedMeaningfully('Lead with your grad year', 'Lead with your position')).toBe(true);
  });
});

describe('editSignals', () => {
  const slides: SignalSlide[] = [
    { id: 0, role: 'cover', text: 'Why coaches ignore you', shot: 'Coaches skip most emails', aiText: 'Why coaches ignore you', aiShot: 'Here is why coaches skip your emails every time' },
    { id: 1, role: 'point', text: 'Subject line', shot: 'Your subject line is the first thing they judge', aiText: 'Subject line', aiShot: 'Say what your old subject line was and why it failed' },
    { id: 2, role: 'point', text: 'Typed by hand', shot: 'No AI here' },
  ];

  it('logs edits once per version, never typed slides', () => {
    const first = editSignals(slides, ctx, new Map(), { final: false });
    expect(first.rows.map((r) => [r.kind, r.role])).toEqual([
      ['edit', 'cover.shot'],
      ['edit', 'point.shot'],
    ]);
    expect(first.rows[1]).toMatchObject({ before: 'Say what your old subject line was and why it failed', after: 'Your subject line is the first thing they judge', briefId: 'b1', format: 'reel', postType: 'reel_talking' });
    const again = editSignals(slides, ctx, first.logged, { final: false });
    expect(again.rows).toEqual([]);
  });

  it('skips the slide being worked on during autosave', () => {
    const r = editSignals(slides, ctx, new Map(), { final: false, skip: new Set([1]) });
    expect(r.rows.map((x) => x.role)).toEqual(['cover.shot']);
  });

  it('approves kept lines on the final save only, and logs a later edit again', () => {
    const first = editSignals(slides, ctx, new Map(), { final: false });
    const fin = editSignals(slides, ctx, first.logged, { final: true });
    expect(fin.rows.map((r) => [r.kind, r.role])).toEqual([
      ['approve', 'cover'],
      ['approve', 'point'],
    ]);
    const changed = slides.map((s) => (s.id === 1 ? { ...s, shot: 'Grad year goes in the subject line' } : s));
    const later = editSignals(changed, ctx, fin.logged, { final: true });
    expect(later.rows).toHaveLength(1);
    expect(later.rows[0]).toMatchObject({ kind: 'edit', role: 'point.shot', after: 'Grad year goes in the subject line' });
  });

  it('never logs an emptied line', () => {
    const r = editSignals([{ id: 0, role: 'cta', text: '', shot: '', aiText: 'I let Noni send it' }], ctx, new Map(), { final: true });
    expect(r.rows).toEqual([]);
  });
});
