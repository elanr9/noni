const PAGE_CHAR_CAP = 6000;
const TOTAL_CHAR_CAP = 20000;
const MAX_SUBPAGES = 5;
const SUBPAGE_HINTS = [
  'about', 'product', 'pricing', 'feature', 'how', 'faq', 'team', 'mission', 'why',
];

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

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NoniBot/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`site fetch ${res.status}`);
  // Re-check final URL after redirects (SSRF via redirect).
  assertSafePublicHttpUrl(res.url);
  return res.text();
}

/**
 * Homepage (or given page) plus up to MAX_SUBPAGES same-domain pages,
 * preferring about/product/pricing paths. Validates host before fetch.
 */
export async function crawlSite(website: string): Promise<string> {
  const base = assertSafePublicHttpUrl(website);
  const homeHtml = await fetchPage(base.href);

  const paths = new Set<string>();
  for (const match of homeHtml.matchAll(/href="([^"#?]+)"/gi)) {
    try {
      const url = new URL(match[1], base);
      if (url.hostname !== base.hostname) continue;
      assertSafePublicHttpUrl(url.href);
      const path = url.pathname.replace(/\/$/, '');
      if (!path || path === base.pathname.replace(/\/$/, '')) continue;
      if (/\.(png|jpe?g|svg|gif|pdf|css|js|ico|webp|mp4)$/i.test(path)) continue;
      paths.add(path);
    } catch {
      // Ignore malformed or disallowed hrefs.
    }
  }

  const ranked = [...paths].sort((a, b) => {
    const score = (p: string) =>
      SUBPAGE_HINTS.some((h) => p.toLowerCase().includes(h)) ? 0 : 1;
    return score(a) - score(b) || a.length - b.length;
  });

  const chunks = [stripHtml(homeHtml).slice(0, PAGE_CHAR_CAP)];
  for (const path of ranked.slice(0, MAX_SUBPAGES)) {
    try {
      const html = await fetchPage(new URL(path, base).href);
      chunks.push(`\n[Page ${path}]\n${stripHtml(html).slice(0, PAGE_CHAR_CAP)}`);
    } catch {
      // Skip unreachable pages.
    }
    if (chunks.join('').length >= TOTAL_CHAR_CAP) break;
  }
  return chunks.join('\n').slice(0, TOTAL_CHAR_CAP);
}
