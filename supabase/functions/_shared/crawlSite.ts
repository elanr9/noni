// Reading a company's public website: which pages are worth reading, and
// the text on them. No headless browser, so a page that only renders in
// JavaScript yields whatever its server sent.

// crawlSite(), the joined-string form older callers use.
const PAGE_CHAR_CAP = 6000;
const TOTAL_CHAR_CAP = 20000;
const MAX_SUBPAGES = 5;
// crawlPages(), the per-page form the company brain uses.
const BRAIN_PAGE_CHAR_CAP = 14000;
const BRAIN_MAX_SUBPAGES = 7;
const MAX_HTML_BYTES = 1_500_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; NoniBot/1.0)';

import { detectBrandColor, stylesheetLinks } from './brandColor.ts';

// Pages that say what the product is, costs and does, best first. A path
// scores by the first pattern it matches.
const WORTH_READING: Array<[RegExp, number]> = [
  [/^(pricing|plans?|prices?)$/, 10],
  [/^(features?|products?|platform|how-it-works|how-we-work|tour|overview)$/, 9],
  [/^(faqs?|questions)$/, 8],
  [/^(customers|testimonials|reviews|case-studies|success-stories|results|wall-of-love)$/, 7],
  [/^(about|about-us|why|why-[a-z0-9-]+|mission|our-story|story|company)$/, 7],
  [/^(use-cases?|solutions?|for-[a-z0-9-]+|compare|vs|alternatives?)$/, 6],
  [/^(download|get-the-app|mobile|ios|android)$/, 5],
  [/^(team|manifesto)$/, 3],
];
// Sign-in, checkout and legal pages say nothing a creator could film.
const NEVER_READ =
  /(^|\/)(log-?in|sign-?in|sign-?up|sign-?out|log-?out|register|auth|oauth|sso|account|my-account|dashboard|admin|cart|basket|checkout|onboarding|get-started|start|terms|terms-of-(service|use)|tos|privacy|privacy-policy|legal|cookies?|cookie-policy|gdpr|dpa|imprint|impressum|accessibility|sitemap|search|unsubscribe|opt-?out|gift|redeem|app|password|reset|verify|wp-admin|wp-login|cdn-cgi|api|_next|static|assets)(\/|$)/i;
// Indexes of many small things. Read one only when the site has nothing better.
const LOW_VALUE =
  /(^|\/)(blog|news|press|media|careers|jobs|changelog|releases|docs|documentation|help|support|community|forum|contact|status|events|webinars|podcast|resources|guides|learn|articles?|posts?|stories|academy|partners|affiliates?|investors|category|tag|author)(\/|$)/i;
const UNNAMED_SCORE = 2;
const MAX_UNNAMED_PAGES = 3;
const NOT_A_PAGE = /\.(png|jpe?g|svg|gif|pdf|css|js|mjs|json|xml|ico|webp|avif|mp4|mov|webm|mp3|woff2?|ttf|zip|dmg|apk|txt)$/i;

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  if (
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  // IPv4 literals, including AWS/GCP/Azure link-local metadata.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const oct = v4.slice(1).map(Number);
    if (oct.some((n) => n > 255)) return true;
    const [a, b] = oct;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  // IPv6 literals: loopback, link-local, unique local.
  if (host.includes(':')) {
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') ||
      host.startsWith('fd')) {
      return true;
    }
  }
  return false;
}

/** Reject private/internal hosts before any server-side fetch with a token or crawl. */
export function assertSafePublicHttpUrl(raw: string): URL {
  const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must be http or https');
  }
  if (url.username || url.password) {
    throw new Error('URL must not include credentials');
  }
  if (isPrivateOrLocalHost(url.hostname)) {
    throw new Error('URL host is not allowed');
  }
  return url;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', sbquo: '‚', bdquo: '„', prime: '′', Prime: '″',
  mdash: '—', ndash: '–', minus: '−', hellip: '…', bull: '•', middot: '·', laquo: '«', raquo: '»',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', divide: '÷', plusmn: '±', micro: 'µ',
  euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', rarr: '→', larr: '←', check: '✓',
  frac12: '½', frac14: '¼', frac34: '¾', eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', uuml: 'ü',
  ouml: 'ö', auml: 'ä', ntilde: 'ñ', ccedil: 'ç', iacute: 'í', oacute: 'ó', uacute: 'ú', szlig: 'ß',
  zwj: '', zwnj: '', shy: '',
};

/** Turns &amp;, &#39;, &#x27; and the like into the characters they stand for. An entity nobody knows becomes a space. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (_, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' ';
      // Control characters carry no text.
      return code < 32 && code !== 10 ? ' ' : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? ' ';
  });
}

// Elements whose contents are never page text. Each is removed with what it holds.
const DROPPED_ELEMENTS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas', 'select', 'head'];
function dropElements(html: string, names: string[]): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const name of names) out = out.replace(new RegExp(`<${name}\\b[\\s\\S]*?<\\/${name}\\s*>`, 'gi'), ' ');
  return out;
}

/** The text of a page on one line. Entities are decoded, so "don&#x27;t" reads "don't". */
export function stripHtml(html: string): string {
  return decodeEntities(dropElements(html, DROPPED_ELEMENTS.filter((n) => n !== 'head')).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([,.;:!?])(?= |$)/g, '$1')
    .trim();
}

const BLOCK_BREAK =
  /<\/?(p|div|section|article|main|header|footer|aside|nav|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|td|th|h[1-6]|blockquote|pre|figure|figcaption|form|fieldset|details|summary|address|hr|br|button)\b[^>]*>/gi;

/**
 * The text of a page as a person reads it: one line per block (heading,
 * paragraph, list item, button), menus left out, repeated lines dropped.
 * Kept in page order so a quoted passage can be found again.
 */
export function htmlToText(html: string): string {
  const body = dropElements(html, [...DROPPED_ELEMENTS, 'nav'])
    .replace(BLOCK_BREAK, '\n')
    .replace(/<[^>]+>/g, ' ');
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of decodeEntities(body).split('\n')) {
    const line = raw.replace(/\s+/g, ' ').replace(/ ([,.;:!?])(?= |$)/g, '$1').trim();
    if (!line) continue;
    // A line repeated further down (a button shown twice, a carousel's copy) is noise the second time.
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines.join('\n');
}

function metaOf(html: string): { title: string; description: string } {
  const head = /<head\b[\s\S]*?<\/head\s*>/i.exec(html)?.[0] ?? html.slice(0, 20_000);
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  let description = '';
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/(name|property)\s*=\s*["']?(description|og:description)["'\s>]/i.test(tag)) continue;
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    description = decodeEntities(content?.[1] ?? content?.[2] ?? '').replace(/\s+/g, ' ').trim();
    if (description) break;
  }
  return { title, description };
}

async function fetchPage(url: string, timeoutMs = 15000): Promise<{ html: string; url: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`site fetch ${res.status}`);
  }
  // Re-check final URL after redirects (SSRF via redirect).
  assertSafePublicHttpUrl(res.url);
  const type = res.headers.get('content-type') ?? '';
  if (type && !/html|xml|text\/plain/i.test(type)) {
    await res.body?.cancel();
    throw new Error('not a web page');
  }
  return { html: (await res.text()).slice(0, MAX_HTML_BYTES), url: res.url };
}

/** Stylesheets read when looking for the brand color, and how much of each. */
const MAX_BRAND_STYLESHEETS = 3;
const MAX_STYLESHEET_BYTES = 600_000;

/** One linked stylesheet as text, or '' when it cannot be read. Validates the host before and after the fetch. */
async function fetchStylesheet(url: string): Promise<string> {
  try {
    assertSafePublicHttpUrl(url);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/css,*/*;q=0.5' },
      redirect: 'follow',
    });
    if (!res.ok) {
      await res.body?.cancel();
      return '';
    }
    assertSafePublicHttpUrl(res.url);
    return (await res.text()).slice(0, MAX_STYLESHEET_BYTES);
  } catch {
    return '';
  }
}

/** The brand color the home page shows, from its own CSS and the first stylesheets it links. Never throws. */
async function brandColorOf(html: string, base: URL): Promise<string | null> {
  try {
    const sheets = await Promise.all(stylesheetLinks(html, base).slice(0, MAX_BRAND_STYLESHEETS).map(fetchStylesheet));
    return detectBrandColor(html, sheets);
  } catch {
    return null;
  }
}

const bareHost = (hostname: string) => hostname.toLowerCase().replace(/^www\./, '');

/** How much a path is worth reading: 0 never, otherwise higher is better. */
export function pageScore(path: string): number {
  const clean = path.toLowerCase().replace(/\/+$/, '');
  if (!clean || NOT_A_PAGE.test(clean) || NEVER_READ.test(clean)) return 0;
  const depth = clean.split('/').filter(Boolean).length;
  // An index of posts or jobs, and anything filed under one, ranks under every other page.
  if (LOW_VALUE.test(clean)) return depth === 1 ? 0.5 : 0;
  // Whole path segments only: "tour" must not match "letourneau".
  const segments = clean.split('/').filter(Boolean);
  const hit = WORTH_READING.find(([pattern]) => segments.some((segment) => pattern.test(segment)));
  if (hit) return hit[1] - (depth - 1);
  // An unnamed top-level page is often a product page ("/colleges", "/teams").
  // Deeper unnamed pages are mostly one of thousands (a listing, a profile).
  return depth === 1 ? UNNAMED_SCORE : 0;
}

function linksIn(html: string, base: URL): { paths: string[]; stores: string[] } {
  const paths = new Set<string>();
  const stores = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const raw = decodeEntities(match[1] ?? match[2] ?? '').trim();
    if (!raw || /^(#|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
    try {
      const url = new URL(raw, base);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      if (/(^|\.)apps\.apple\.com$/i.test(url.hostname) && /\/id\d+/.test(url.pathname)) stores.add(`${url.origin}${url.pathname}`);
      if (/^play\.google\.com$/i.test(url.hostname) && url.pathname.startsWith('/store/apps/details') && url.searchParams.get('id')) {
        stores.add(`${url.origin}${url.pathname}?id=${url.searchParams.get('id')}`);
      }
      if (bareHost(url.hostname) !== bareHost(base.hostname)) continue;
      const path = url.pathname.replace(/\/+$/, '');
      if (path && path !== base.pathname.replace(/\/+$/, '')) paths.add(path);
    } catch {
      // Ignore malformed hrefs.
    }
  }
  return { paths: [...paths], stores: [...stores] };
}

/** Same-site paths from the sitemap, for sites whose menu is drawn by JavaScript. */
async function sitemapPaths(base: URL): Promise<string[]> {
  const locs = async (url: string): Promise<string[]> => {
    // The sitemap is a help, not a need: a slow one is skipped.
    const { html } = await fetchPage(url, 6000);
    return [...html.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map((m) => decodeEntities(m[1]));
  };
  try {
    let found = await locs(new URL('/sitemap.xml', base).href);
    const nested = found.filter((u) => /\.xml(\.gz)?$/i.test(u));
    if (nested.length) {
      // An index of sitemaps: the first plain ones hold the main pages.
      const children = nested.filter((u) => !/\.gz$/i.test(u)).slice(0, 2);
      const lists = await Promise.allSettled(children.map((u) => locs(assertSafePublicHttpUrl(u).href)));
      found = lists.flatMap((l) => (l.status === 'fulfilled' ? l.value : []));
    }
    const paths = new Set<string>();
    for (const loc of found.slice(0, 2000)) {
      try {
        const url = new URL(loc);
        if (bareHost(url.hostname) === bareHost(base.hostname)) paths.add(url.pathname.replace(/\/+$/, ''));
      } catch {
        // Ignore malformed entries.
      }
    }
    paths.delete('');
    return [...paths];
  } catch {
    return [];
  }
}

export type CrawledPage = {
  /** Path on the site, "/" for the page that was asked for. */
  path: string;
  url: string;
  title: string;
  /** Readable text, one block per line. The title and meta description lead when the body does not already say them. */
  text: string;
};

function readPage(html: string, url: string, path: string, cap: number): CrawledPage {
  const { title, description } = metaOf(html);
  const body = htmlToText(html);
  const lower = body.toLowerCase();
  // The description is often the plainest sentence on what the product is, and it is not in the body.
  const lead = [title, description].filter((line) => line && !lower.includes(line.toLowerCase()));
  return { path, url, title, text: [...lead, body].join('\n').slice(0, cap) };
}

/**
 * The page asked for plus the same-site pages most worth reading (pricing,
 * features, FAQ, customers, about), each as its own text, and the brand
 * color the home page shows. Sign-in, checkout
 * and legal pages are never read. Also returns app store links found on the
 * home page. Validates the host before every fetch.
 */
export async function crawlPages(
  website: string,
  opts: { maxSubpages?: number; pageCharCap?: number } = {},
): Promise<{ pages: CrawledPage[]; storeLinks: string[]; brandColor: string | null }> {
  const asked = assertSafePublicHttpUrl(website);
  const home = await fetchPage(asked.href);
  // Follow a redirect to www or to another domain the company moved to.
  const base = new URL(home.url);
  const cap = opts.pageCharCap ?? BRAIN_PAGE_CHAR_CAP;
  const max = opts.maxSubpages ?? BRAIN_MAX_SUBPAGES;
  const { paths, stores } = linksIn(home.html, base);

  let candidates = paths;
  if (candidates.filter((p) => pageScore(p) >= 1).length < 3) {
    candidates = [...new Set([...candidates, ...(await sitemapPaths(base))])];
  }
  const ranked = candidates
    .map((path) => ({ path, score: pageScore(path) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));
  let unnamed = 0;
  const good = ranked.filter((c) => c.score >= 1 && (c.score !== UNNAMED_SCORE || ++unnamed <= MAX_UNNAMED_PAGES));
  // A blog or help index is read only when the site offers nothing else, and then only one.
  // No more than three pages from one section, so five customer stories do not crowd out pricing.
  const perSection = new Map<string, number>();
  const spread = good.filter((c) => {
    const section = c.path.split('/').filter(Boolean)[0] ?? '';
    perSection.set(section, (perSection.get(section) ?? 0) + 1);
    return perSection.get(section)! <= 3;
  });
  const chosen = (spread.length ? spread : ranked.slice(0, 1)).slice(0, max);

  const brand = brandColorOf(home.html, base);
  const fetched = await Promise.allSettled(
    chosen.map(async ({ path }) => {
      const page = await fetchPage(new URL(path, base).href, 10000);
      // A redirect to a sign-in wall or off the site is not the page we asked for.
      const landed = new URL(page.url);
      if (bareHost(landed.hostname) !== bareHost(base.hostname)) throw new Error('left the site');
      const landedPath = landed.pathname.replace(/\/+$/, '');
      if (landedPath !== path && pageScore(landedPath) === 0) throw new Error('redirected to a page that is not read');
      return readPage(page.html, page.url, landedPath || '/', cap);
    }),
  );

  const pages = [readPage(home.html, home.url, base.pathname || '/', cap)];
  const seenPaths = new Set([pages[0].path.replace(/\/+$/, '') || '/']);
  const seenText = new Set([pages[0].text]);
  for (const result of fetched) {
    if (result.status !== 'fulfilled') continue;
    const page = result.value;
    // An app shell answers every path with the same page; keep it once.
    if (seenPaths.has(page.path) || seenText.has(page.text)) continue;
    seenPaths.add(page.path);
    seenText.add(page.text);
    pages.push(page);
  }
  return { pages, storeLinks: stores, brandColor: await brand };
}

/**
 * Homepage (or given page) plus up to MAX_SUBPAGES same-domain pages as one
 * string, each later page headed "[Page /path]". Validates host before fetch.
 */
export async function crawlSite(website: string): Promise<string> {
  const { pages } = await crawlPages(website, { maxSubpages: MAX_SUBPAGES, pageCharCap: PAGE_CHAR_CAP });
  const chunks: string[] = [];
  for (const [i, page] of pages.entries()) {
    chunks.push(i === 0 ? page.text : `\n[Page ${page.path}]\n${page.text}`);
    if (chunks.join('').length >= TOTAL_CHAR_CAP) break;
  }
  return chunks.join('\n').slice(0, TOTAL_CHAR_CAP);
}
