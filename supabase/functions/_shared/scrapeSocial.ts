// Reads one TikTok or Instagram post: caption, transcript (Apify actor,
// then Deepgram) or slide text (Claude vision OCR). Shared by ingest-brief
// and study-reference so a reference is scraped once and studied once.

import { askClaudeVision, parseClaudeJson } from './wp8.ts';

export type SourcePost = {
  platform: 'tiktok' | 'instagram';
  caption: string;
  media_url: string | null;
  transcript_url: string | null;
  image_urls: string[];
  format: 'video' | 'photo_carousel';
};

const MAX_OCR_SLIDES = 6;

async function apifyRun(actor: string, input: Record<string, unknown>): Promise<unknown[]> {
  const token = Deno.env.get('APIFY_API_TOKEN');
  if (!token) throw new Error('APIFY_API_TOKEN not set');
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(240000),
    },
  );
  if (!res.ok) throw new Error(`Apify ${actor} ${res.status}: ${await res.text()}`);
  return (await res.json()) as unknown[];
}

type TikTokItem = {
  text?: string;
  mediaUrls?: string[];
  videoMeta?: { transcriptionLink?: string };
  imagePost?: { images?: Array<{ imageURL?: { urlList?: string[] } }> };
  slideshowImageLinks?: Array<{ downloadLink?: string }>;
};

async function scrapeTikTok(url: string): Promise<SourcePost | null> {
  const items = (await apifyRun('clockworks~tiktok-scraper', {
    postURLs: [url],
    // Actor transcribes videos without captions; primary transcript source.
    downloadSubtitlesOptions: 'DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES',
  })) as TikTokItem[];
  const i = items[0];
  if (!i) return null;
  const slides = (i.imagePost?.images ?? [])
    .map((img) => img.imageURL?.urlList?.[0])
    .filter((u): u is string => Boolean(u));
  const fallbackSlides = (i.slideshowImageLinks ?? [])
    .map((l) => l.downloadLink)
    .filter((u): u is string => Boolean(u));
  const imageUrls = slides.length > 0 ? slides : fallbackSlides;
  const isCarousel = imageUrls.length > 0;
  return {
    platform: 'tiktok',
    caption: i.text ?? '',
    media_url: isCarousel ? null : i.mediaUrls?.[0] ?? null,
    transcript_url: isCarousel ? null : i.videoMeta?.transcriptionLink ?? null,
    image_urls: imageUrls,
    format: isCarousel ? 'photo_carousel' : 'video',
  };
}

type InstagramItem = {
  type?: string;
  caption?: string;
  videoUrl?: string;
  images?: string[];
};

async function scrapeInstagram(url: string): Promise<SourcePost | null> {
  const items = (await apifyRun('apify~instagram-scraper', {
    directUrls: [url],
    resultsType: 'posts',
    resultsLimit: 1,
  })) as InstagramItem[];
  const i = items[0];
  if (!i) return null;
  const isCarousel = i.type === 'Sidecar' && (i.images?.length ?? 0) > 0;
  return {
    platform: 'instagram',
    caption: i.caption ?? '',
    media_url: isCarousel ? null : i.videoUrl ?? null,
    transcript_url: null,
    image_urls: isCarousel ? (i.images ?? []) : [],
    format: isCarousel ? 'photo_carousel' : 'video',
  };
}

async function fetchApifyTranscript(url: string): Promise<string | null> {
  const token = Deno.env.get('APIFY_API_TOKEN');
  if (!token) return null;
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}token=${token}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function transcribe(mediaUrl: string): Promise<string | null> {
  const key = Deno.env.get('DEEPGRAM_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: mediaUrl }),
        signal: AbortSignal.timeout(90000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: {
        channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
      };
    };
    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || null;
  } catch {
    return null;
  }
}

async function ocrSlides(imageUrls: string[]): Promise<string[] | null> {
  try {
    const urls = imageUrls.slice(0, MAX_OCR_SLIDES);
    const system = `You transcribe the text on social media slideshow images. Answer with a single JSON object: {"slides": string[]}, one string per image in order. Each string is all readable overlay/design text on that slide, cleaned up. Use "" for a slide with no text.`;
    const raw = await askClaudeVision(system, urls, `Transcribe all ${urls.length} slides.`);
    const { slides } = parseClaudeJson<{ slides: string[] }>(raw);
    return Array.isArray(slides) ? slides.map((s) => String(s)) : null;
  } catch (e) {
    console.error('slide OCR failed:', e);
    return null;
  }
}

export type SocialHost = 'tiktok' | 'instagram';

/** tiktok, instagram, or null for any other host (or an unparseable URL). */
export function socialHost(url: string): SocialHost | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  return null;
}

export type ReadPost = {
  post: SourcePost;
  transcript: string | null;
  slideTexts: string[] | null;
};

/** Scrape, then transcribe a video or OCR a slideshow. Null when the post cannot be read. */
export async function readSocialPost(url: string): Promise<ReadPost | null> {
  const host = socialHost(url);
  if (!host) return null;
  const post = host === 'tiktok' ? await scrapeTikTok(url) : await scrapeInstagram(url);
  if (!post) return null;
  let transcript: string | null = null;
  let slideTexts: string[] | null = null;
  if (post.format === 'video') {
    if (post.transcript_url) transcript = await fetchApifyTranscript(post.transcript_url);
    if (!transcript && post.media_url) transcript = await transcribe(post.media_url);
  } else {
    slideTexts = await ocrSlides(post.image_urls);
  }
  return { post, transcript, slideTexts };
}
