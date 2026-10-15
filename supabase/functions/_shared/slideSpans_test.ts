import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { buildSpanDrawtext, wrappedLineIndices } from './assemble.ts';
import { slideBoxToBakeBox } from './documentAssembly.ts';
import { parseEditDocument } from './editDocument.ts';

const metrics = { unitsPerEm: 1000, winAscent: 900, winDescent: 300, hheaAscender: 900, hheaDescender: -300, family: 'TikTok Sans' };
const frame = { width: 1080, height: 1920 };
const plan = (boxes: Parameters<typeof buildSpanDrawtext>[0]['boxes']) =>
  buildSpanDrawtext({ boxes, frame, metrics, fontPlaceholder: '{input2}', textfilePlaceholder: (i) => `{input${9 + i}}` });

Deno.test('wrappedLineIndices maps collapsed whitespace and newlines', () => {
  assertEquals(wrappedLineIndices('ab  cd\nef', ['ab cd', 'ef']), [[0, 1, 2, 4, 5], [7, 8]]);
});

Deno.test('a box without spans draws nothing here', () => {
  assertEquals(plan([{ text: 'hi', x: 0.5, y: 0.5, size: 0.05, color: '#FFFFFF', bg: false }]), { filters: [], textfiles: [] });
});

Deno.test('colored runs become separate drawtext calls, left to right', () => {
  const out = plan([
    { text: 'one two', x: 0.5, y: 0.5, size: 0.05, color: '#FFFFFF', bg: false, spans: [{ start: 4, end: 7, color: '#E5484D' }] },
  ]);
  assertEquals(out.filters.length, 2);
  assertMatch(out.filters[0], /fontcolor=0xFFFFFF/);
  assertMatch(out.filters[1], /fontcolor=0xE5484D/);
  // Outline per run: a red word keeps a black stroke, white text too.
  assertMatch(out.filters[1], /bordercolor=0x/);
  const xs = out.filters.map((f) => Number(/:x=([\d.]+)/.exec(f)?.[1]));
  assert(xs[0] < xs[1]);
  assert(xs[0] > 0 && xs[1] < 1080);
});

Deno.test('bubble boxes color letters without a stroke and forbidden chars go to text files', () => {
  const out = plan([
    { text: 'a;b c', x: 0.5, y: 0.3, size: 0.05, color: '#FFFFFF', bg: true, spans: [{ start: 0, end: 3, color: '#1BA6EE' }] },
  ]);
  assertEquals(out.textfiles, ['a;b']);
  assertMatch(out.filters[0], /textfile=\{input9\}/);
  assertMatch(out.filters[0], /fontcolor=0x1BA6EE/);
  assert(!out.filters[0].includes('borderw'));
});

Deno.test('slide boxes keep spans through the parser and into the bake box', () => {
  const doc = parseEditDocument({
    version: 1,
    format: 'slideshow',
    aspect: '9:16',
    assets: [{ id: 'a1', kind: 'image', localUri: null, storagePath: 'c/a/p.jpg', durationMs: null, width: 1080, height: 1920 }],
    slides: [
      {
        id: 's1',
        assetId: 'a1',
        crop: null,
        instagramCrop: null,
        boxes: [
          {
            id: 'b1',
            text: 'hello world',
            color: '#ffffff',
            bg: false,
            size: 0.05,
            x: 0.5,
            y: 0.5,
            spans: [{ start: 6, end: 99, color: '#e5484d' }, { start: 0, end: 2, color: 'red' }],
          },
        ],
      },
    ],
  });
  assert(doc && doc.format === 'slideshow');
  const box = doc.slides[0].boxes[0];
  assertEquals(box.spans, [{ start: 6, end: 11, color: '#E5484D' }]);
  assertEquals(slideBoxToBakeBox(box).spans, [{ start: 6, end: 11, color: '#E5484D' }]);
});
