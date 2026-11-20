// Brief import with a fake model, and the document reader on real bytes. Run
// from supabase/functions: DENO_NO_PACKAGE_JSON=1 deno test --allow-env _shared/ai/
import { describe, it } from 'jsr:@std/testing@1/bdd';
import { expect } from 'jsr:@std/expect@1';
import { zipSync } from 'npm:fflate@0.8.2';

import type { AdminClient, GenerateArgs } from './briefEngine.ts';
import { clampCount, type ImportDeps, type ImportPlan, ImportUnreadableError, planImport, planInput, tidyPlan, writeImport } from './briefImport.ts';
import type { BrainContext } from './contracts.ts';
import { DocReadError, docxToText, googleExport, htmlToText, notionPageId, notionToText, readBytes, readLink } from './docText.ts';

const admin = {} as AdminClient;
const brain = (over: Partial<BrainContext> = {}): BrainContext => ({
  companyId: 'co-1', productName: 'Fernly', core: '', constraints: '', retrieved: '', approvedClaims: [], demoMoments: [], conflicts: [], coverage: 0, missing: [], bannedPhrases: ['green thumb'], ...over,
});
const base = (): ImportDeps => ({
  assembleBrainContext: async () => brain(),
  loadLegacyBrand: async () => null,
  recentBriefs: async () => [],
  queueQuestion: async () => undefined,
  now: () => Date.now(),
});
const utf8 = (s: string) => new TextEncoder().encode(s);

const rawPost = (title: string, over: Record<string, unknown> = {}) => ({ title, type: 'Talking Head', origin: 'document', angle: 'For new plant owners.', hook: 'I killed six ferns.', material: 'Hook: I killed six ferns.', direction: '', ...over });

describe('document reader', () => {
  it('reads a Word file, keeping headings and list items', () => {
    const xml = '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Brief</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Never say &quot;guaranteed&quot;</w:t></w:r></w:p></w:body></w:document>';
    expect(docxToText(xml)).toBe('# Brief\n- Never say "guaranteed"');
    const doc = readBytes(zipSync({ 'word/document.xml': utf8(xml) }), 'brief.docx');
    expect(doc).toEqual({ kind: 'text', name: 'brief.docx', text: '# Brief\n- Never say "guaranteed"' });
  });

  it('reads slides and sheets in order', () => {
    const pptx = zipSync({ 'ppt/slides/slide2.xml': utf8('<a:p><a:r><a:t>Second</a:t></a:r></a:p>'), 'ppt/slides/slide1.xml': utf8('<a:p><a:r><a:t>First</a:t></a:r></a:p>') });
    expect((readBytes(pptx, 'deck.pptx') as { text: string }).text).toBe('## Slide 1\nFirst\n\n## Slide 2\nSecond');
    const xlsx = zipSync({
      'xl/workbook.xml': utf8('<workbook/>'),
      'xl/sharedStrings.xml': utf8('<sst><si><t>Hook</t></si><si><t>I killed six ferns</t></si></sst>'),
      'xl/worksheets/sheet1.xml': utf8('<sheetData><row r="1"><c t="s"><v>0</v></c><c t="s"><v>1</v></c><c><v>3</v></c></row></sheetData>'),
    });
    expect((readBytes(xlsx, 'plan.xlsx') as { text: string }).text).toBe('## Sheet 1\nHook | I killed six ferns | 3');
  });

  it('hands PDFs and pictures to the model as they are', () => {
    expect(readBytes(utf8('%PDF-1.7 rest'), 'a.pdf').kind).toBe('pdf');
    expect(readBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]), 'page.png')).toMatchObject({ kind: 'image', mediaType: 'image/png' });
  });

  it('reads text, html and rtf, and names what it cannot open', () => {
    expect(readBytes(utf8('Hook: one\r\n\r\n\r\n\r\nClip: two'), 'a.txt')).toMatchObject({ text: 'Hook: one\n\nClip: two' });
    expect(htmlToText('<h1>Brief</h1><p>One &amp; two</p><script>x()</script>')).toBe('# Brief\nOne & two');
    expect((readBytes(utf8('{\\rtf1\\ansi Hello \\b world\\b0\\par Next}'), 'a.rtf') as { text: string }).text).toBe('Hello world\nNext');
    expect(() => readBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0]), 'old.doc')).toThrow(DocReadError);
    expect(() => readBytes(new Uint8Array(0), 'empty.txt')).toThrow('empty');
    expect(() => readBytes(utf8('x'), 'photo.heic')).toThrow('JPG or PNG');
  });

  it('maps Google and Notion links to their export paths', () => {
    expect(googleExport(new URL('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUv/edit?usp=sharing'))?.href).toBe('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUv/export?format=docx');
    expect(googleExport(new URL('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUv/edit#gid=0'))?.href).toContain('format=xlsx');
    expect(googleExport(new URL('https://example.com/document/d/1AbCdEfGhIjKlMnOpQrStUv'))).toBeNull();
    expect(notionPageId(new URL('https://acme.notion.site/UGC-Brief-e040febf70a94950b8620e6f00005004?pvs=4'))).toBe('e040febf-70a9-4950-b862-0e6f00005004');
    expect(notionPageId(new URL('https://example.com/e040febf70a94950b8620e6f00005004'))).toBeNull();
  });

  it('walks a Notion page in order', () => {
    const blocks = {
      p: { value: { type: 'page', properties: { title: [['UGC brief']] }, content: ['a', 'b'] } },
      a: { value: { type: 'header', properties: { title: [['Hooks']] } } },
      b: { value: { type: 'bulleted_list', properties: { title: [['I killed '], ['six ferns', [['b']]]] }, content: ['c'] } },
      c: { value: { type: 'text', properties: { title: [['nested']] } } },
    };
    expect(notionToText(blocks, 'p')).toEqual({ title: 'UGC brief', text: '# Hooks\n- I killed six ferns\nnested' });
  });

  it('says a private Google file is private, and refuses local addresses', async () => {
    const signIn = async () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } });
    await expect(readLink('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUv/edit', signIn)).rejects.toThrow('Anyone with the link');
    await expect(readLink('http://localhost:3000/brief', signIn)).rejects.toThrow(DocReadError);
    const page = async () => new Response(`<html><title>Brief</title><body><p>${'Real brief text. '.repeat(30)}</p></body></html>`, { headers: { 'content-type': 'text/html' } });
    expect(await readLink('example.com/brief', page)).toMatchObject({ kind: 'text', name: 'Brief' });
  });
});

describe('planImport', () => {
  it('sends files to the model, and tidies, caps and numbers what comes back', async () => {
    let seen: Record<string, unknown> = {};
    const plan = await planImport(admin, {
      companyId: 'co-1',
      count: 3,
      docs: [{ kind: 'text', name: 'brief.txt', text: 'Hook one' }, { kind: 'pdf', name: 'b.pdf', base64: 'AAAA' }, { kind: 'image', name: 'p.png', base64: 'BBBB', mediaType: 'image/png' }],
    }, {
      ...base(),
      generateWithFiles: (async (args: Record<string, unknown>) => {
        seen = args;
        return {
          data: {
            readable: true, unreadable_reason: '', summary: 'Three scripts.', product: 'Fernly waters plants.', guidance: 'Never say guaranteed.',
            claims: [{ wording: 'Reminds you when to water.', qualifier: '' }, { wording: 'reminds you when to water.', qualifier: '' }, { wording: 'Free for three plants.', qualifier: 'on the free plan' }],
            posts: [rawPost('One'), rawPost('one'), rawPost('Two', { type: 'Nonsense' }), rawPost('Three', { origin: 'new' }), rawPost('Four')],
          },
        };
      }) as never,
    });
    expect((seen.documents as unknown[]).length).toBe(1);
    expect((seen.images as unknown[]).length).toBe(1);
    expect(String(seen.input)).toContain('<document name="brief.txt">\nHook one');
    expect(String(seen.input)).toContain('Return up to 3 posts');
    expect(plan.posts.map((p) => [p.title, p.type, p.origin])).toEqual([['One', 'Talking Head', 'document'], ['Two', 'Talking Head', 'document'], ['Three', 'Talking Head', 'new']]);
    expect(plan.claims).toEqual([{ id: 'doc:1', wording: 'Reminds you when to water.', qualifier: null }, { id: 'doc:2', wording: 'Free for three plants.', qualifier: 'on the free plan' }]);
  });

  it('turns an unreadable document into a reason for the manager', async () => {
    const run = planImport(admin, { companyId: 'co-1', docs: [{ kind: 'text', name: 'a', text: 'x' }] }, {
      ...base(),
      generateWithFiles: (async () => ({ data: { readable: false, unreadable_reason: 'This is a parking receipt.', summary: '', product: '', guidance: '', claims: [], posts: [] } })) as never,
    });
    await expect(run).rejects.toThrow(ImportUnreadableError);
    await expect(run).rejects.toThrow('parking receipt');
  });

  it('keeps the count inside its limits', () => {
    expect([clampCount(1), clampCount(12), clampCount(400), clampCount('x')]).toEqual([3, 12, 24, 12]);
    expect(planInput([{ kind: 'pdf', name: 'b.pdf', base64: 'A' }], 6, '')).toContain('Attached PDF files: b.pdf.');
    expect(tidyPlan({ readable: true, unreadable_reason: '', summary: '', product: '', guidance: '', claims: [], posts: [] }, 6).posts).toEqual([]);
  });
});

describe('writeImport', () => {
  const plan: ImportPlan = {
    summary: '', product: 'Fernly tells you when to water.', guidance: 'Never say guaranteed.',
    claims: [{ id: 'doc:1', wording: 'Reminds you when to water.', qualifier: null }],
    posts: [{ title: 'I killed six ferns', type: 'Talking Head', origin: 'document', angle: 'For new plant owners.', hook: 'I killed six ferns.', material: 'Hook: I killed six ferns.\nPoint: water by soil.', direction: 'Film at the window.' }],
  };
  const script = (over: Record<string, unknown> = {}) => ({
    title: 'I killed six ferns', phrase: 'How to keep ferns alive', angle: 'For new plant owners who keep losing ferns.',
    clips: [
      { say: 'I killed six ferns before I worked this out.', onScreen: 'I killed six ferns', cta: false, shot: 'At the window.', demo_moment_id: null, claim_ids: [] },
      { say: 'I was watering on a schedule, not by the soil.', onScreen: 'Not by the soil', cta: false, shot: 'Finger in soil.', demo_moment_id: 'made-up', claim_ids: [] },
      { say: 'Now my phone reminds me when each one is dry.', onScreen: 'It reminds me', cta: false, shot: 'Phone in hand.', demo_moment_id: null, claim_ids: ['doc:1', 'c9'] },
      { say: 'Search Fernly if you keep buying the same plant.', onScreen: 'Search Fernly', cta: true, shot: 'To camera.', demo_moment_id: null, claim_ids: [] },
    ],
    hooks: [{ say: 'x', onScreen: 'y', visual: 'z', archetype: 'confession' }],
    caption: 'How to keep ferns alive.', tags: ['planttok', '#ferns'],
    ...over,
  });

  it('writes from the document, lets its claims stand and repairs what code can', async () => {
    const calls: GenerateArgs[] = [];
    const out = await writeImport(admin, { companyId: 'co-1', plan, index: 0 }, {
      ...base(),
      generate: (async (args: GenerateArgs) => {
        calls.push(args);
        return { data: script() };
      }) as never,
    });
    // The empty brain did not stop it: the document is what is known.
    expect(calls[0].task).toBe('brief.import.write');
    expect(calls[0].context[2]).toContain('[doc:1] Reminds you when to water.');
    expect(calls[0].context[3]).toContain("The manager's own brief document");
    expect(calls[0].context[3]).toContain('Never say guaranteed.');
    expect(calls[0].input).toContain('Point: water by soil.');
    // Unknown ids fail the code check, so one revision is asked for.
    expect(calls[1].task).toBe('brief.import.revise');
    expect(calls[1].input).toContain('made-up');
    expect(out.clips.length).toBe(4);
    expect(out.clips[2].claim_ids).toEqual(['doc:1']);
    expect(out.clips[1].demo_moment_id).toBeNull();
    expect(out.tags).toEqual(['#planttok', '#ferns']);
    expect(out.phrase).toBe('how to keep ferns alive');
    expect(out.hooks[0].say).toBe(out.clips[0].say);
    expect(out.kill_reason).toBeNull();
  });

  it('keeps the draft when the revision fails, and throws on an empty plan or a missing post', async () => {
    let n = 0;
    const out = await writeImport(admin, { companyId: 'co-1', plan, index: 0 }, {
      ...base(),
      generate: (async () => {
        n += 1;
        if (n === 2) throw new Error('model down');
        return { data: script() };
      }) as never,
    });
    expect(out.title).toBe('I killed six ferns');
    await expect(writeImport(admin, { companyId: 'co-1', plan, index: 0 }, { ...base(), generate: (async () => ({ data: script({ clips: [] }) })) as never })).rejects.toThrow('empty plan');
    await expect(writeImport(admin, { companyId: 'co-1', plan, index: 5 }, base())).rejects.toThrow('not in the import');
  });
});
