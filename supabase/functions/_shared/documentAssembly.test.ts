import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import {
  atempoChain,
  buildDocumentGraph,
  buildDocumentTimeline,
  cellFitFilters,
  documentStitchCommand,
  documentSubtitleLines,
  outputWords,
  slideCropFilter,
} from './documentAssembly.ts';
import type { MediaAsset, VideoDocument } from './editDocument.ts';

const video = (id: string, durationMs: number): MediaAsset => ({
  id,
  kind: 'video',
  localUri: null,
  storagePath: `c/a/asset-${id}.mp4`,
  durationMs,
  width: 1080,
  height: 1920,
});

const image = (id: string): MediaAsset => ({
  id,
  kind: 'image',
  localUri: null,
  storagePath: `c/a/asset-${id}.jpg`,
  durationMs: null,
  width: 1000,
  height: 1000,
});

function doc(partial: Partial<VideoDocument>): VideoDocument {
  return {
    version: 1,
    format: 'video',
    aspect: '9:16',
    assets: [],
    blocks: [],
    overlays: [],
    gain: 2,
    subtitles: { enabled: true, y: 0.78 },
    ...partial,
  };
}

Deno.test('atempo chains above 2x', () => {
  assertEquals(atempoChain(1), '');
  assertEquals(atempoChain(0.5), ',atempo=0.5');
  assertEquals(atempoChain(2), ',atempo=2');
  assertEquals(atempoChain(3), ',atempo=2,atempo=1.5');
});

Deno.test('cell fit without crop centres an aspect fill', () => {
  assertEquals(
    cellFitFilters({ width: 1080, height: 960 }, null),
    'scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960',
  );
});

Deno.test('cell fit with crop zooms about the centre and pans against the content', () => {
  assertEquals(
    cellFitFilters({ width: 1080, height: 1920 }, { scale: 1.5, x: 0.1, y: -0.2 }),
    'scale=1620:2880:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2-108:(ih-1920)/2+384',
  );
});

Deno.test('split block graph: stacked video, mixed audio, concat, conform, loudnorm', () => {
  const d = doc({
    assets: [video('v1', 10000), video('v2', 8000)],
    blocks: [
      {
        id: 'b0',
        layout: 'split_v',
        cells: [
          { id: 'c0', assetId: 'v1', inMs: 1000, outMs: 5000, speed: 1, muted: false, crop: null },
          { id: 'c1', assetId: 'v2', inMs: 0, outMs: 6000, speed: 2, muted: false, crop: null },
        ],
      },
    ],
  });
  const graph = buildDocumentGraph(d);
  assertEquals(graph.inputs.map((i) => i.assetId), ['v1', 'v2']);
  assertEquals(graph.inputFlags, '-i {input0} -i {input1}');
  const chains = graph.filterGraph.split(';');
  // Block is 3000ms (cell 1: 6000 / 2); cell 0 trims to 1000..4000, cell 1 to 0..6000.
  assertEquals(
    chains[0],
    '[0:v]trim=start=1.000:end=4.000,setpts=PTS-STARTPTS,fps=30,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1,format=yuv420p[v0_0]',
  );
  assertEquals(
    chains[1],
    '[0:a]atrim=start=1.000:end=4.000,asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0_0]',
  );
  assertEquals(
    chains[2],
    '[1:v]trim=start=0.000:end=6.000,setpts=(PTS-STARTPTS)/2,fps=30,scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1,format=yuv420p[v0_1]',
  );
  assertEquals(
    chains[3],
    '[1:a]atrim=start=0.000:end=6.000,asetpts=PTS-STARTPTS,atempo=2,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0_1]',
  );
  assertEquals(chains[4], '[v0_0][v0_1]vstack=inputs=2:shortest=1[v0]');
  assertEquals(chains[5], '[a0_0][a0_1]amix=inputs=2:duration=shortest:normalize=0[a0]');
  assertEquals(chains[6], '[v0][a0]concat=n=1:v=1:a=1[cv][ca]');
  assertEquals(chains[7], '[cv]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[outv]');
  assertEquals(
    chains[8],
    '[ca]loudnorm=I=-16:TP=-1.5:LRA=11,volume=2.00,alimiter=limit=0.95:attack=5:release=50:level=false[outa]',
  );
  const command = documentStitchCommand(graph.inputFlags);
  assert(!/[;|&$`]/.test(command), 'command has a forbidden character');
  assertMatch(command, /-filter_complex_script \{graph\} -map "\[outv\]" -map "\[outa\]"/);
});

Deno.test('image cells loop for the block, muted blocks get silence, assets dedupe', () => {
  const d = doc({
    assets: [image('p1'), video('v1', 10000)],
    blocks: [
      {
        id: 'b0',
        layout: 'single',
        cells: [{ id: 'c0', assetId: 'p1', inMs: 0, outMs: 3000, speed: 1, muted: true, crop: null }],
      },
      {
        id: 'b1',
        layout: 'split_h',
        cells: [
          { id: 'c1', assetId: 'v1', inMs: 0, outMs: 2000, speed: 1, muted: true, crop: null },
          { id: 'c2', assetId: 'p1', inMs: 0, outMs: 5000, speed: 1, muted: true, crop: null },
        ],
      },
    ],
  });
  const graph = buildDocumentGraph(d);
  assertEquals(graph.inputs.length, 2);
  assertEquals(graph.inputs[0], { assetId: 'p1', kind: 'image', holdMs: 3000 });
  assertEquals(graph.inputFlags, '-loop 1 -t 3.000 -i {input0} -i {input1}');
  const chains = graph.filterGraph.split(';');
  assertEquals(
    chains[0],
    '[0:v]fps=30,trim=duration=3.000,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p[v0_0]',
  );
  assertEquals(
    chains[1],
    'anullsrc=channel_layout=stereo:sample_rate=48000:duration=3.000,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0]',
  );
  assert(chains.some((c) => c.startsWith('[v1_0][v1_1]hstack=inputs=2:shortest=1[v1]')));
  assert(chains.some((c) => c.startsWith('anullsrc') && c.endsWith('[a1]')));
  assert(chains.some((c) => c === '[v0_0][a0][v1][a1]concat=n=2:v=1:a=1[cv][ca]'));
  assert(!graph.filterGraph.includes(':a]'), 'muted cells must not reference audio streams');
});

Deno.test('timeline keeps overlay windows and maps subtitle words through trims and speed', () => {
  const d = doc({
    assets: [video('v1', 10000), image('p1')],
    blocks: [
      {
        id: 'b0',
        layout: 'single',
        cells: [{ id: 'c0', assetId: 'v1', inMs: 2000, outMs: 6000, speed: 2, muted: false, crop: null }],
      },
    ],
    overlays: [
      { kind: 'text', id: 't', text: 'Hi', color: '#FFFFFF', bg: false, size: 0.05, x: 0.5, y: 0.3, startMs: 500, endMs: 1500 },
      { kind: 'image', id: 'i', assetId: 'p1', x: 0.5, y: 0.6, width: 0.4, startMs: 0, endMs: 2000, enter: 'pop' },
    ],
  });
  // 'Hello' ends before the in point and 'late' starts after the out point; both drop.
  const words = new Map([['v1', [{ w: 'Hello', s: 1000, e: 1900 }, { w: 'there.', s: 3000, e: 3600 }, { w: 'late', s: 7000, e: 7500 }]]]);
  assertEquals(outputWords(d, words), [{ w: 'there.', s: 500, e: 800 }]);
  const lines = documentSubtitleLines(d, words);
  assertEquals(lines.length, 1);
  assertEquals(lines[0].text, 'there.');
  assertEquals(lines[0].start_ms, 500);
  const timeline = buildDocumentTimeline(d, lines);
  assertEquals(timeline.clips, [{ slot_index: 0, duration_ms: 2000 }]);
  assertEquals(timeline.texts[0].start_ms, 500);
  assertEquals(timeline.texts[0].duration_ms, 1000);
  assertEquals(timeline.images[0].screenshot_path, 'c/a/asset-p1.jpg');
  assertEquals(timeline.images[0].enter, 'pop');
  assertEquals(timeline.subtitles, true);
  assertEquals(timeline.subtitle_lines?.length, 1);
});

Deno.test('slide crop filter rounds and drops empty crops', () => {
  assertEquals(slideCropFilter(null), null);
  assertEquals(slideCropFilter({ x: 0, y: 0, width: 0, height: 10 }), null);
  assertEquals(slideCropFilter({ x: 10.4, y: 20.6, width: 900.2, height: 1600 }), 'crop=900:1600:10:21');
});
