// Reads what a manager hands over as "a brief": an uploaded file (PDF, Word,
// PowerPoint, Excel, text, markdown, HTML, RTF, an image of a page) or a link
// (Google Docs, Sheets and Slides, Notion, Dropbox, any public page). The
// result is either plain text, or the bytes for the model to read itself
// (PDFs and images, where layout and pictures carry meaning).
//
// Nothing here calls a model. Every failure is a sentence the manager can act
// on ("set sharing to Anyone with the link"), thrown as DocReadError.

import { unzipSync } from 'npm:fflate@0.8.2';

import { assertSafePublicHttpUrl } from '../crawlSite.ts';

export type ImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type ReadDoc =
  | { kind: 'text'; name: string; text: string }
  | { kind: 'pdf'; name: string; base64: string }
  | { kind: 'image'; name: string; base64: string; mediaType: ImageType };

/** A reason the manager can read and act on. */
export class DocReadError extends Error {}

export const MAX_FILE_BYTES = 24 * 1024 * 1024;
/** Claude reads a PDF up to 32 MB as base64 in the request; stay well inside it. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4_500_000;
export const MAX_DOC_CHARS = 120_000;

const USER_AGENT = 'Mozilla/5.0 (compatible; NoniBot/1.0)';
const FETCH_MS = 20_000;

// ---------------------------------------------------------------- bytes

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function startsWith(bytes: Uint8Array, magic: number[], at = 0): boolean {
  return magic.every((b, i) => bytes[at + i] === b);
}

function decode(bytes: Uint8Array): string {
  // UTF-16 with a byte order mark is what Windows Notepad and some exports write.
  if (startsWith(bytes, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (startsWith(bytes, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

function imageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

// ---------------------------------------------------------------- text shapes

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '...', mdash: ', ', ndash: ', ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Collapses runs of spaces and blank lines without losing the line structure a brief is written in. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\t  ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** HTML to text that keeps headings, paragraphs, list items and table rows on their own lines. */
export function htmlToText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<h([1-6])[^>]*>/gi, (_, n: string) => `\n\n${'#'.repeat(Number(n))} `)
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|blockquote|ul|ol|table|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return tidy(decodeEntities(body));
}

/** RTF to text: drops the control words and groups that carry no reading text. */
export function rtfToText(rtf: string): string {
  const text = rtf
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|\*)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
    .replace(/\\par[d]?\b|\\line\b/g, '\n')
    .replace(/\\tab\b/g, ' ')
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, n: string) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\\([\\{}])/g, '$1');
  return tidy(text);
}

// ---------------------------------------------------------------- office files

type Zip = Record<string, Uint8Array>;

function xmlText(xml: string, runTag: string): string {
  const out: string[] = [];
  const re = new RegExp(`<${runTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${runTag}>`, 'g');
  for (const m of xml.matchAll(re)) out.push(decodeEntities(m[1]));
  return out.join('');
}

/** A Word document's paragraphs in order, with headings marked and list items dashed. */
export function docxToText(xml: string): string {
  const lines: string[] = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    const p = m[0]
      .replace(/<w:tab\/>/g, '<w:t> </w:t>')
      .replace(/<w:br[^>]*\/>|<w:cr\/>/g, '<w:t>\n</w:t>');
    const text = xmlText(p, 'w:t');
    if (!text.trim()) {
      lines.push('');
      continue;
    }
    const heading = /<w:pStyle w:val="(?:Heading|Title|heading)\s?(\d)?/i.exec(p);
    const listed = /<w:numPr[ >/]/.test(p);
    lines.push(heading ? `\n${'#'.repeat(Math.min(3, Number(heading[1] ?? 1)))} ${text.trim()}` : listed ? `- ${text.trim()}` : text.trim());
  }
  return tidy(lines.join('\n'));
}

function numbered(zip: Zip, pattern: RegExp): string[] {
  return Object.keys(zip)
    .map((name) => ({ name, n: Number(pattern.exec(name)?.[1] ?? NaN) }))
    .filter((f) => Number.isFinite(f.n))
    .sort((a, b) => a.n - b.n)
    .map((f) => f.name);
}

function officeText(zip: Zip): string | null {
  const utf8 = (name: string) => new TextDecoder('utf-8').decode(zip[name]);
  if (zip['word/document.xml']) return docxToText(utf8('word/document.xml'));
  const slides = numbered(zip, /^ppt\/slides\/slide(\d+)\.xml$/);
  if (slides.length) {
    return tidy(
      slides
        .map((name, i) => {
          const lines = [...utf8(name).matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => xmlText(m[0], 'a:t').trim()).filter(Boolean);
          return `## Slide ${i + 1}\n${lines.join('\n')}`;
        })
        .join('\n\n'),
    );
  }
  if (zip['xl/workbook.xml']) {
    const shared = zip['xl/sharedStrings.xml']
      ? [...utf8('xl/sharedStrings.xml').matchAll(/<si>[\s\S]*?<\/si>/g)].map((m) => xmlText(m[0], 't'))
      : [];
    const sheets = numbered(zip, /^xl\/worksheets\/sheet(\d+)\.xml$/);
    return tidy(
      sheets
        .map((name, i) => {
          const rows = [...utf8(name).matchAll(/<row[ >][\s\S]*?<\/row>/g)].map((row) =>
            [...row[0].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
              .map((cell) => {
                const value = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? xmlText(cell[2], 't');
                return /t="s"/.test(cell[1]) ? shared[Number(value)] ?? '' : decodeEntities(value);
              })
              .filter((v) => v.trim())
              .join(' | ')
          );
          return `## Sheet ${i + 1}\n${rows.filter(Boolean).join('\n')}`;
        })
        .join('\n\n'),
    );
  }
  return null;
}

// ---------------------------------------------------------------- one upload

const extensionOf = (name: string) => (/\.([a-z0-9]{1,6})$/i.exec(name.trim())?.[1] ?? '').toLowerCase();

/** Turns one uploaded or downloaded file into something the planner can read. */
export function readBytes(bytes: Uint8Array, name: string, mime = ''): ReadDoc {
  const label = name.trim() || 'Document';
  const ext = extensionOf(label);
  if (!bytes.length) throw new DocReadError(`${label} is empty.`);
  if (bytes.length > MAX_FILE_BYTES) throw new DocReadError(`${label} is larger than 24 MB. Export a smaller copy and try again.`);

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    if (bytes.length > MAX_PDF_BYTES) throw new DocReadError(`${label} is larger than 20 MB. Export it without full-size images, or split it in two.`);
    return { kind: 'pdf', name: label, base64: toBase64(bytes) };
  }
  const image = imageType(bytes);
  if (image) {
    if (bytes.length > MAX_IMAGE_BYTES) throw new DocReadError(`${label} is too large to read as a picture. Save it smaller or export the brief as a PDF.`);
    return { kind: 'image', name: label, base64: toBase64(bytes), mediaType: image };
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    let zip: Zip;
    try {
      zip = unzipSync(bytes, { filter: (file) => /^(word\/document\.xml|ppt\/slides\/slide\d+\.xml|xl\/(workbook|sharedStrings)\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(file.name) });
    } catch {
      throw new DocReadError(`${label} could not be opened. Export it as a PDF and try again.`);
    }
    const text = officeText(zip);
    if (text === null) throw new DocReadError(`${label} is not a kind of file Noni can read. Export it as a PDF and try again.`);
    if (!text.trim()) throw new DocReadError(`${label} has no text in it.`);
    return { kind: 'text', name: label, text: text.slice(0, MAX_DOC_CHARS) };
  }
  // Legacy Word (.doc), Pages and Keynote are binary formats with no reader here.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]) || ['doc', 'pages', 'key', 'numbers', 'ppt', 'xls'].includes(ext)) {
    throw new DocReadError(`${label} is in an older format Noni cannot open. Export it as a PDF or a .docx and try again.`);
  }
  if (['heic', 'heif', 'tiff', 'tif', 'bmp'].includes(ext) || /image\/(heic|heif|tiff|bmp)/i.test(mime)) {
    throw new DocReadError(`${label} is a picture format Noni cannot read. Save it as a JPG or PNG, or export the brief as a PDF.`);
  }

  const raw = decode(bytes);
  // A file that decodes to control characters is binary, whatever it is called.
  // deno-lint-ignore no-control-regex
  const control = (raw.slice(0, 4000).match(/[\u0000-\u0008\u000e-\u001f]/g) ?? []).length;
  if (control > 40) throw new DocReadError(`${label} is not a kind of file Noni can read. Export it as a PDF and try again.`);
  const text = ext === 'rtf' || raw.startsWith('{\\rtf')
    ? rtfToText(raw)
    : ext === 'html' || ext === 'htm' || /text\/html/i.test(mime) || /^\s*<(!doctype|html)/i.test(raw)
      ? htmlToText(raw)
      : tidy(raw);
  if (!text.trim()) throw new DocReadError(`${label} has no text in it.`);
  return { kind: 'text', name: label, text: text.slice(0, MAX_DOC_CHARS) };
}

// ---------------------------------------------------------------- links

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function get(fetcher: Fetcher, url: string, init: RequestInit = {}): Promise<Response> {
  assertSafePublicHttpUrl(url);
  const res = await fetcher(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_MS),
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
  });
  // A redirect may have left the public internet.
  if (res.url) assertSafePublicHttpUrl(res.url);
  return res;
}

async function bodyBytes(res: Response, label: string): Promise<Uint8Array> {
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_FILE_BYTES) throw new DocReadError(`${label} is larger than 24 MB.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw new DocReadError(`${label} is larger than 24 MB.`);
  return bytes;
}

const PRIVATE_GOOGLE = 'That Google file is private. In Google, tap Share, set General access to "Anyone with the link", then try again. Or export it as a PDF and upload that.';
const PRIVATE_NOTION = 'That Notion page is private. In Notion, tap Share, turn on "Share to web", then try again. Or export it as a PDF and upload that.';

/** The export address of a Google Docs, Sheets, Slides or Drive link, or null when it is not one. */
export function googleExport(url: URL): { href: string; name: string } | null {
  if (!/(^|\.)google\.com$/i.test(url.hostname)) return null;
  const id = /\/d\/([A-Za-z0-9_-]{15,})/.exec(url.pathname)?.[1] ?? url.searchParams.get('id');
  if (!id) return null;
  if (url.pathname.includes('/document/')) return { href: `https://docs.google.com/document/d/${id}/export?format=docx`, name: 'Google Doc.docx' };
  if (url.pathname.includes('/spreadsheets/')) return { href: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, name: 'Google Sheet.xlsx' };
  if (url.pathname.includes('/presentation/')) return { href: `https://docs.google.com/presentation/d/${id}/export/pptx`, name: 'Google Slides.pptx' };
  if (url.hostname.startsWith('drive.')) return { href: `https://drive.google.com/uc?export=download&id=${id}`, name: 'Google Drive file' };
  return null;
}

/** The dashed page id in a Notion link, or null. */
export function notionPageId(url: URL): string | null {
  if (!/(^|\.)notion\.(so|site)$/i.test(url.hostname)) return null;
  const tail = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const hex = (/([0-9a-f]{32})$/i.exec(tail.replace(/-/g, ''))?.[1] ?? url.searchParams.get('p') ?? '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type NotionBlock = { value?: { id?: string; type?: string; properties?: Record<string, unknown>; content?: string[] } };

function notionPlain(rich: unknown): string {
  if (!Array.isArray(rich)) return '';
  return rich.map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : '')).join('');
}

/** A Notion record map as indented text, in page order. */
export function notionToText(blocks: Record<string, NotionBlock>, pageId: string): { title: string; text: string } {
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const block = blocks[id]?.value;
    if (!block) return;
    const text = notionPlain(block.properties?.title).trim();
    if (id !== pageId && text) {
      const pad = '  '.repeat(Math.max(0, depth - 1));
      const type = block.type ?? '';
      const prefix = type === 'header' ? '\n# ' : type === 'sub_header' ? '\n## ' : type === 'sub_sub_header' ? '\n### '
        : type === 'bulleted_list' || type === 'numbered_list' || type === 'to_do' ? '- ' : type === 'quote' ? '> ' : '';
      lines.push(`${pad}${prefix}${text}`);
    }
    for (const child of block.content ?? []) walk(child, depth + 1);
  };
  walk(pageId, 0);
  return { title: notionPlain(blocks[pageId]?.value?.properties?.title).trim(), text: tidy(lines.join('\n')) };
}

async function readNotion(fetcher: Fetcher, pageId: string): Promise<ReadDoc> {
  const blocks: Record<string, NotionBlock> = {};
  let cursor: unknown = { stack: [] };
  for (let chunk = 0; chunk < 8; chunk += 1) {
    const res = await get(fetcher, 'https://www.notion.so/api/v3/loadPageChunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, limit: 100, cursor, chunkNumber: chunk, verticalColumns: false }),
    });
    if (!res.ok) throw new DocReadError(PRIVATE_NOTION);
    const json = (await res.json().catch(() => null)) as { recordMap?: { block?: Record<string, NotionBlock> }; cursor?: { stack?: unknown[] } } | null;
    Object.assign(blocks, json?.recordMap?.block ?? {});
    cursor = json?.cursor;
    if (!json?.cursor?.stack?.length) break;
  }
  const { title, text } = notionToText(blocks, pageId);
  if (text.length < 40) throw new DocReadError(PRIVATE_NOTION);
  return { kind: 'text', name: title || 'Notion page', text: text.slice(0, MAX_DOC_CHARS) };
}

function titleOf(html: string): string {
  return decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Reads a link the manager pasted. Google and Notion go through their own
 * export paths; anything else is fetched as a file or a page.
 */
export async function readLink(raw: string, fetcher: Fetcher = fetch): Promise<ReadDoc> {
  let url: URL;
  try {
    url = assertSafePublicHttpUrl(raw.trim());
  } catch {
    throw new DocReadError('That link is not a web address Noni can open.');
  }

  const google = googleExport(url);
  if (google) {
    const res = await get(fetcher, google.href).catch(() => null);
    const type = res?.headers.get('content-type') ?? '';
    // A private file answers with a sign-in page instead of the export.
    if (!res || !res.ok || /text\/html/i.test(type) || /accounts\.google\.com/.test(res.url)) throw new DocReadError(PRIVATE_GOOGLE);
    const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(res.headers.get('content-disposition') ?? '')?.[1];
    return readBytes(await bodyBytes(res, 'That Google file'), named ? decodeURIComponent(named) : google.name, type);
  }

  const notion = notionPageId(url);
  if (notion) return await readNotion(fetcher, notion);

  // A Dropbox share link serves a preview page unless asked for the file.
  if (/(^|\.)dropbox\.com$/i.test(url.hostname)) url.searchParams.set('dl', '1');

  const res = await get(fetcher, url.href).catch(() => null);
  if (!res) throw new DocReadError('That link did not answer. Check it opens in a private browser window, or upload the file instead.');
  if (res.status === 401 || res.status === 403) throw new DocReadError('That link needs a sign-in. Make it public, or upload the file instead.');
  if (!res.ok) throw new DocReadError(`That link answered with an error (${res.status}). Check it, or upload the file instead.`);
  const type = res.headers.get('content-type') ?? '';
  const fileName = decodeURIComponent(new URL(res.url || url.href).pathname.split('/').filter(Boolean).pop() ?? '') || url.hostname;
  if (!/text\/html/i.test(type)) return readBytes(await bodyBytes(res, 'That file'), fileName, type);

  const html = await res.text();
  const text = htmlToText(html);
  // A page that is drawn by script has almost nothing in its HTML.
  if (text.length < 200) throw new DocReadError('That page could not be read from its link. Export it as a PDF, or copy the text and paste it in.');
  return { kind: 'text', name: titleOf(html) || url.hostname, text: text.slice(0, MAX_DOC_CHARS) };
}
