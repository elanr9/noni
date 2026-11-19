import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isSocialLink, logBriefEdit, planGuided, planOutline, warmReference } from './brief-ai';
import { emptyGuided } from './brief-library';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));

beforeEach(() => {
  invoke.mockReset();
});

describe('planGuided', () => {
  it('sends the notes and asks with the engine budget as the timeout', async () => {
    invoke.mockResolvedValue({ data: { title: 'T', clips: [{ say: 'a', onScreen: 'b', cta: false }] }, error: null });
    await planGuided({ ...emptyGuided(), title: 'T', notes: 'keep it short', link: 'tiktok.com/@a/video/1', linkNotes: 'ferns' }, 'Talking Head');
    const [name, opts] = invoke.mock.calls[0] as [string, { body: Record<string, unknown>; timeout: number }];
    expect(name).toBe('brief-fill');
    expect(opts.body).toMatchObject({ mode: 'guided', type: 'Talking Head', notes: 'keep it short', linkNotes: 'ferns' });
    expect(opts.timeout).toBe(150_000);
  });

  it('keeps the hooks, shots, warnings, reference note and the draft it was given', async () => {
    invoke.mockResolvedValue({
      data: {
        title: 'Stop killing ferns',
        phrase: 'how to water a fern',
        angle: 'For people who lose plants.',
        clips: [
          { say: 'I killed three ferns.', onScreen: 'three dead ferns', cta: false, shot: 'At the window, fern in frame.' },
          { say: 'Link in my bio.', onScreen: 'Fernly', cta: true, shot: '' },
        ],
        hooks: [{ say: 'I killed three ferns.', onScreen: 'three dead ferns', visual: 'window', archetype: 'confession' }, { say: 'Your fern is not thirsty.', onScreen: 'not thirsty', visual: '', archetype: 'contrarian' }, { say: '', onScreen: '' }],
        caption: 'How to water a fern.',
        tags: ['#ferns'],
        kill_reason: null,
        questions: ['Is there a free plan?'],
        reference_note: 'Only the words of the reference were read, not the picture, so the shots are a best guess.',
        warnings: ['Clip 1 spoken line uses "game changer".'],
      },
      error: null,
    });
    const plan = await planGuided({ ...emptyGuided(), title: 'Stop killing ferns' }, 'Talking Head');
    expect(plan.declined).toBeNull();
    expect(plan.angle).toBe('For people who lose plants.');
    expect(plan.clips.map((c) => [c.text, c.onScreen, c.cta, c.shot])).toEqual([
      ['I killed three ferns.', 'three dead ferns', false, 'At the window, fern in frame.'],
      ['Link in my bio.', 'Fernly', true, undefined],
    ]);
    expect(plan.ai.hooks.map((h) => h.archetype)).toEqual(['confession', 'contrarian']);
    expect(plan.ai.warnings).toHaveLength(1);
    expect(plan.ai.referenceNote).toContain('Only the words');
    expect(plan.ai.draft?.clips).toHaveLength(2);
  });

  it('returns the reason and the questions when the writer declines', async () => {
    invoke.mockResolvedValue({ data: { title: 'T', kill_reason: 'There is no approved claim about light.', questions: ['What does it measure?'], reference_note: null }, error: null });
    const plan = await planGuided({ ...emptyGuided(), title: 'T' }, 'Talking Head');
    expect(plan.declined).toEqual({ reason: 'There is no approved claim about light.', questions: ['What does it measure?'], referenceNote: null });
    expect(plan.clips).toEqual([]);
    const outline = await planOutline({ title: 'T', link: '' });
    expect(outline.declined?.reason).toContain('no approved claim');
  });

  it('throws the server message when the function fails', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context: { json: async () => ({ error: 'empty plan' }) } } });
    await expect(planGuided({ ...emptyGuided(), title: 'T' }, 'Talking Head')).rejects.toThrow('empty plan');
  });
});

describe('reference links', () => {
  it('accepts TikTok and Instagram links only', () => {
    expect(isSocialLink('https://www.tiktok.com/@a/video/1')).toBe(true);
    expect(isSocialLink('instagram.com/reel/abc')).toBe(true);
    expect(isSocialLink('https://youtube.com/watch?v=1')).toBe(false);
    expect(isSocialLink('')).toBe(false);
  });

  it('starts one reading per link and polls it to the end', async () => {
    vi.useFakeTimers();
    invoke
      .mockResolvedValueOnce({ data: { status: 'pending', phase: 'reading' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'pending', phase: 'analyzing' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'done', analysis: {} }, error: null });
    const link = 'https://www.tiktok.com/@a/video/42';
    const first = warmReference(link);
    const second = warmReference(link);
    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(9000);
    await expect(first).resolves.toEqual({ status: 'done' });
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls[0][0]).toBe('reference-analyze');
    // A finished reading is the answer: asking again does not call the function.
    await expect(warmReference(link)).resolves.toEqual({ status: 'done' });
    expect(invoke).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('reports why a post could not be read, and skips links the reader does not take', async () => {
    invoke.mockResolvedValue({ data: { status: 'failed', reason: 'We could not open this post.' }, error: null });
    await expect(warmReference('https://www.instagram.com/reel/zzz')).resolves.toEqual({ status: 'failed', reason: 'We could not open this post.' });
    invoke.mockReset();
    await expect(warmReference('https://youtube.com/watch?v=1')).resolves.toEqual({ status: 'idle' });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('logBriefEdit', () => {
  it('sends the draft and the saved brief, and nothing when the brief was not AI-filled', () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const saved = { title: 'T', clips: [{ say: 'mine', onScreen: '', cta: false }], caption: '', tags: [] };
    logBriefEdit({ libraryBriefId: 'b1', type: 'Talking Head', ai: null, saved });
    expect(invoke).not.toHaveBeenCalled();
    logBriefEdit({
      libraryBriefId: 'b1',
      type: 'Talking Head',
      angle: 'An angle.',
      ai: { hooks: [], warnings: [], referenceNote: null, questions: [], draft: { title: 'T', clips: [{ say: 'theirs', onScreen: '', cta: false }], caption: '', tags: [] } },
      saved,
    });
    const [name, opts] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(name).toBe('brain-signal');
    expect(opts.body).toMatchObject({ signal: 'brief_edit', library_brief_id: 'b1', brief_type: 'Talking Head', saved, draft: { angle: 'An angle.' } });
  });
});
