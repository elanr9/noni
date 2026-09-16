import { assertEquals } from 'jsr:@std/assert@1';
import {
  CUE_LEAD_MS,
  DEFAULT_SCREENSHOT_HOLD_MS,
  keywordCue,
  sourceToOutputMs,
  speechRangesFromWords,
  subtitleLines,
  type CueContext,
  type KeepRange,
  type TranscriptWord,
} from './cues.ts';

function words(spec: Array<[string, number, number]>): TranscriptWord[] {
  return spec.map(([w, s, e]) => ({ w, s, e }));
}

const baseCtx: CueContext = {
  kind: 'point',
  label: '3. Automate outreach',
  point_text: 'Inkbound automates your outreach so you never chase leads.',
  media_title: 'Outreach dashboard',
  media_kind: 'screenshot',
  product_name: 'Inkbound',
  duration_ms: 12000,
};

Deno.test('keywordCue: media enters on the product mention mid clip', () => {
  const transcript = words([
    ['So', 0, 200],
    ['here', 250, 400],
    ['is', 450, 550],
    ['how', 600, 800],
    ["Inkbound's", 2000, 2600],
    ['automation', 2700, 3200],
    ['handles', 3300, 3600],
    ['outreach.', 3700, 4200],
  ]);
  const cue = keywordCue(transcript, baseCtx);
  assertEquals(cue.media_start_ms, 2000 - CUE_LEAD_MS);
  assertEquals(cue.media_end_ms, 2000 - CUE_LEAD_MS + DEFAULT_SCREENSHOT_HOLD_MS);
  assertEquals(cue.text_start_ms, 3700 - CUE_LEAD_MS);
  assertEquals(cue.text_hold_ms, null);
  assertEquals(cue.source, 'ai');
});

Deno.test('keywordCue: hook text is forced to 0', () => {
  const transcript = words([
    ['Stop', 0, 300],
    ['chasing', 400, 800],
    ['leads', 900, 1200],
    ['with', 1300, 1400],
    ['Inkbound.', 1500, 2100],
  ]);
  const cue = keywordCue(transcript, { ...baseCtx, kind: 'hook', label: 'Stop chasing leads' });
  assertEquals(cue.text_start_ms, 0);
  assertEquals(cue.media_start_ms, 1500 - CUE_LEAD_MS);
});

Deno.test('keywordCue: no match falls back to 0, recording runs to clip end', () => {
  const transcript = words([
    ['Hello', 0, 400],
    ['everyone', 500, 1000],
  ]);
  const cue = keywordCue(transcript, { ...baseCtx, media_kind: 'recording' });
  assertEquals(cue.text_start_ms, 0);
  assertEquals(cue.media_start_ms, 0);
  assertEquals(cue.media_end_ms, null);
});

Deno.test('keywordCue: outro has no media cue', () => {
  const cue = keywordCue([], { ...baseCtx, kind: 'outro' });
  assertEquals(cue.media_start_ms, null);
  assertEquals(cue.media_end_ms, null);
  assertEquals(cue.text_start_ms, 0);
});

const keep: KeepRange[] = [
  [100, 1100],
  [2000, 3000],
];

Deno.test('sourceToOutputMs: inside a range', () => {
  assertEquals(sourceToOutputMs(600, keep), 500);
  assertEquals(sourceToOutputMs(2500, keep), 1500);
});

Deno.test('sourceToOutputMs: in a gap snaps to next range start', () => {
  assertEquals(sourceToOutputMs(1500, keep), 1000);
  assertEquals(sourceToOutputMs(50, keep), 0);
});

Deno.test('sourceToOutputMs: past the end clamps to kept total', () => {
  assertEquals(sourceToOutputMs(9000, keep), 2000);
});

Deno.test('speechRangesFromWords: long pauses are cut leaving 120ms each side', () => {
  const transcript = words([
    ['One', 500, 900],
    ['two', 1000, 1400],
    ['three', 3000, 3400],
    ['four', 3500, 3900],
  ]);
  const ranges = speechRangesFromWords(transcript, 10000);
  assertEquals(ranges, {
    startMs: 350,
    endMs: 4150,
    keep: [
      { startMs: 350, endMs: 1520 },
      { startMs: 2880, endMs: 4150 },
    ],
  });
});

Deno.test('speechRangesFromWords: pads clamp to the clip bounds', () => {
  const transcript = words([
    ['Hi', 50, 400],
    ['there', 500, 1900],
  ]);
  const ranges = speechRangesFromWords(transcript, 2000);
  assertEquals(ranges, {
    startMs: 0,
    endMs: 2000,
    keep: [{ startMs: 0, endMs: 2000 }],
  });
});

Deno.test('speechRangesFromWords: short pieces merge instead of cutting', () => {
  const transcript = words([
    ['Hi', 0, 200],
    ['there', 1200, 1600],
    ['friend', 1700, 2000],
  ]);
  const ranges = speechRangesFromWords(transcript, 3000);
  assertEquals(ranges?.keep, [{ startMs: 0, endMs: 2250 }]);
});

Deno.test('speechRangesFromWords: null without words', () => {
  assertEquals(speechRangesFromWords([], 1000), null);
});

Deno.test('subtitleLines: respects maxChars', () => {
  const transcript = words([
    ['alpha', 0, 300],
    ['beta', 350, 600],
    ['gamma', 650, 900],
    ['delta', 950, 1200],
  ]);
  const lines = subtitleLines(transcript, [[0, 1200]], 0, 11);
  assertEquals(lines.map((l) => l.text), ['alpha beta', 'gamma delta']);
});

Deno.test('subtitleLines: breaks after sentence punctuation and long pauses', () => {
  const transcript = words([
    ['Hello.', 0, 300],
    ['Next', 350, 600],
    ['thing', 650, 900],
    ['later', 1700, 2000],
  ]);
  const lines = subtitleLines(transcript, [[0, 2000]], 0, 40);
  assertEquals(lines.map((l) => l.text), ['Hello.', 'Next thing', 'later']);
});

Deno.test('subtitleLines: times are mapped through keep and offset, min duration, no overlap', () => {
  const transcript = words([
    ['keep', 100, 400],
    ['gone', 1200, 1800],
    ['back.', 2100, 2300],
    ['tail', 2400, 2900],
  ]);
  const lines = subtitleLines(transcript, keep, 5000, 40);
  assertEquals(lines.map((l) => l.text), ['keep', 'back.', 'tail']);
  assertEquals(lines[0].start_ms, 5000);
  assertEquals(lines[0].duration_ms, 600);
  assertEquals(lines[1].start_ms, 5000 + 1100);
  assertEquals(lines[1].duration_ms, 300);
  assertEquals(lines[2].start_ms, 5000 + 1400);
  assertEquals(lines[2].duration_ms, 600);
});

Deno.test('subtitleLines: previous line is trimmed when the minimum would overlap the next', () => {
  const transcript = words([
    ['a', 0, 100],
    ['b.', 150, 250],
    ['c', 300, 400],
  ]);
  const lines = subtitleLines(transcript, [[0, 1000]], 0, 40);
  assertEquals(lines[0].duration_ms, 300);
  assertEquals(lines[1].duration_ms, 600);
});
