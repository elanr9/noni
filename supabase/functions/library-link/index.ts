// Resolves a pasted link into a thumbnail for a Library reference item.
// Admin only. { url } -> { thumbnail_url, title } (both nullable; a link
// that resolves nothing still saves as a reference, just without art).
//
// TikTok goes through its public oEmbed endpoint (no key). Everything else
// is a best-effort og:image / twitter:image parse of the page HTML.
// User-supplied URL + server-side fetch = SSRF surface: host validation and
// the post-redirect re-check reuse _shared/crawlSite.ts, same as brand-ingest.

import {
  adminClient,
  authenticate,
  handleCors,
  jsonResponse,
} from '../_shared/wp8.ts';
import { assertSafePublicHttpUrl } from '../_shared/crawlSite.ts';

const FETCH_TIMEOUT_MS = 10000;
const HTML_BYTE_CAP = 262144;

type LinkPreview = { thumbnail_url: string | null; title: string | null };

async function safeFetch(url: URL): Promise<Response> {
  const res = await fetch(url.href, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NoniBot/1.0)' },
    redirect: 'follow',
  });
  // Re-check final URL after redirects (SSRF via redirect).
  assertSafePublicHttpUrl(res.url);
  return res;
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// property/name and content can appear in either order in real-world markup.
function metaPatterns(key: string): RegExp[] {
  return [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      'i',
    ),
  ];
}

async function tiktokOembed(url: URL): Promise<LinkPreview | null> {
  const endpoint = new URL('https://www.tiktok.com/oembed');
  endpoint.searchParams.set('url', url.href);
  const res = await fetch(endpoint.href, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    thumbnail_url?: string;
    title?: string;
  };
  if (!data.thumbnail_url && !data.title) return null;
  return {
    thumbnail_url: data.thumbnail_url ?? null,
    title: data.title ?? null,
  };
}

async function ogPreview(url: URL): Promise<LinkPreview> {
  const res = await safeFetch(url);
  if (!res.ok) return { thumbnail_url: null, title: null };
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('html')) {
    return { thumbnail_url: null, title: null };
  }
  const html = (await res.text()).slice(0, HTML_BYTE_CAP);

  const image = metaContent(html, [
    ...metaPatterns('og:image'),
    ...metaPatterns('twitter:image'),
  ]);
  const title =
    metaContent(html, metaPatterns('og:title')) ??
    /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ??
    null;

  let thumbnail: string | null = null;
  if (image) {
    try {
      // Relative og:image values resolve against the final page URL.
      thumbnail = assertSafePublicHttpUrl(new URL(image, res.url).href).href;
    } catch {
      thumbnail = null;
    }
  }
  return { thumbnail_url: thumbnail, title };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (caller.role !== 'admin') return jsonResponse({ error: 'forbidden' }, 403);

  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }
  if (!body.url || typeof body.url !== 'string') {
    return jsonResponse({ error: 'url required' }, 400);
  }

  let target: URL;
  try {
    target = assertSafePublicHttpUrl(body.url.trim());
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'invalid url' },
      400,
    );
  }

  try {
    if (/(^|\.)tiktok\.com$/i.test(target.hostname)) {
      const oembed = await tiktokOembed(target);
      if (oembed) return jsonResponse(oembed);
    }
    return jsonResponse(await ogPreview(target));
  } catch {
    // Preview is best effort; the reference row already exists client-side.
    return jsonResponse({ thumbnail_url: null, title: null });
  }
});
