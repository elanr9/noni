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
  /** What the actor reported about the post itself. Absent on reads that predate it. */
  meta?: PostMeta;
};

/** Post metadata as the Apify actors return it. Null where the platform or actor gives nothing. */
export type PostMeta = {
  author: string | null;
  author_followers: number | null;
  duration_ms: number | null;
  posted_at: string | null;
  hashtags: string[];
  cover_url: string | null;
  sound_title: string | null;
  sound_original: boolean | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

/** A count the actor reported, or null. Instagram reports -1 for hidden likes. */
function count(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function isoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Ten covers almost every slideshow, so a remix can keep the slide count.
const MAX_OCR_SLIDES = 10;

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

type SubtitleLink = {
  language?: string;
  downloadLink?: string;
  source?: string;
};

type TikTokItem = {
  text?: string;
  mediaUrls?: string[];
  createTimeISO?: string;
  playCount?: number;
  diggCount?: number;
  commentCount?: number;
  shareCount?: number;
  collectCount?: number;
  hashtags?: Array<{ name?: string }>;
  authorMeta?: { name?: string; fans?: number };
  musicMeta?: { playUrl?: string; musicName?: string; musicOriginal?: boolean };
  videoMeta?: {
    transcriptionLink?: string;
    downloadAddr?: string;
    subtitleLinks?: SubtitleLink[];
    duration?: number;
    coverUrl?: string;
    originalCoverUrl?: string;
  };
  imagePost?: { images?: Array<{ imageURL?: { urlList?: string[] } }> };
  slideshowImageLinks?: Array<{ downloadLink?: string }>;
};

/** English speech first, then any other subtitle file the actor returned. */
function pickSubtitle(links: SubtitleLink[] | undefined): string | null {
  if (!links?.length) return null;
  const scored = links
    .filter((l) => Boolean(l.downloadLink))
    .map((l) => {
      const lang = l.language ?? '';
      const source = l.source ?? '';
      let score = 0;
      if (/^en/i.test(lang)) score += 4;
      if (/asr|whisper/i.test(source)) score += 2;
      if (/^mt$/i.test(source) || /machine/i.test(source)) score -= 1;
      return { link: l.downloadLink as string, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.link ?? null;
}

async function scrapeTikTok(url: string, options: ScrapeOptions = {}): Promise<SourcePost | null> {
  const items = (await apifyRun('clockworks~tiktok-scraper', {
    postURLs: [url],
    // Always transcribe. A video that already has a foreign machine
    // translation would otherwise come back with no English speech.
    downloadSubtitlesOptions: 'TRANSCRIBE_ALL_VIDEOS',
    // A charged add-on: the actor copies the video into its key-value store
    // and returns that link in mediaUrls. TikTok's own CDN links need the
    // scraper's cookies, so this is the only video URL another service can fetch.
    ...(options.downloadVideo ? { shouldDownloadVideos: true, shouldDownloadCovers: true } : {}),
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
  const transcript =
    i.videoMeta?.transcriptionLink ?? pickSubtitle(i.videoMeta?.subtitleLinks) ?? null;
  return {
    platform: 'tiktok',
    caption: i.text ?? '',
    media_url: isCarousel
      ? null
      : i.mediaUrls?.[0] ?? i.videoMeta?.downloadAddr ?? i.musicMeta?.playUrl ?? null,
    transcript_url: isCarousel ? null : transcript,
    image_urls: imageUrls,
    format: isCarousel ? 'photo_carousel' : 'video',
    meta: {
      author: i.authorMeta?.name?.replace(/^@/, '') || null,
      author_followers: count(i.authorMeta?.fans),
      duration_ms:
        !isCarousel && typeof i.videoMeta?.duration === 'number' && i.videoMeta.duration > 0
          ? Math.round(i.videoMeta.duration * 1000)
          : null,
      posted_at: isoDate(i.createTimeISO),
      hashtags: (i.hashtags ?? []).map((h) => h.name ?? '').filter(Boolean),
      cover_url: i.videoMeta?.coverUrl ?? i.videoMeta?.originalCoverUrl ?? imageUrls[0] ?? null,
      sound_title: i.musicMeta?.musicName || null,
      sound_original: typeof i.musicMeta?.musicOriginal === 'boolean' ? i.musicMeta.musicOriginal : null,
      views: count(i.playCount),
      likes: count(i.diggCount),
      comments: count(i.commentCount),
      shares: count(i.shareCount),
      saves: count(i.collectCount),
    },
  };
}

type InstagramItem = {
  type?: string;
  caption?: string;
  videoUrl?: string;
  images?: string[];
  displayUrl?: string;
  timestamp?: string;
  hashtags?: string[];
  ownerUsername?: string;
  videoDuration?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  musicInfo?: { song_name?: string; uses_original_audio?: boolean };
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
    meta: {
      author: i.ownerUsername || null,
      author_followers: null,
      duration_ms:
        !isCarousel && typeof i.videoDuration === 'number' && i.videoDuration > 0
          ? Math.round(i.videoDuration * 1000)
          : null,
      posted_at: isoDate(i.timestamp),
      hashtags: (i.hashtags ?? []).filter((h) => typeof h === 'string' && h.length > 0),
      cover_url: i.displayUrl ?? i.images?.[0] ?? null,
      sound_title: i.musicInfo?.song_name || null,
      sound_original:
        typeof i.musicInfo?.uses_original_audio === 'boolean' ? i.musicInfo.uses_original_audio : null,
      views: count(i.videoPlayCount) ?? count(i.videoViewCount),
      likes: count(i.likesCount),
      comments: count(i.commentsCount),
      // The actor does not return shares or saves for Instagram.
      shares: null,
      saves: null,
    },
  };
}

export type ScrapeOptions = {
  /** TikTok only: have the actor store the video so its link can be fetched by other services. */
  downloadVideo?: boolean;
};

/** The scrape alone, with metadata: no transcription and no OCR. Null when the post cannot be read. */
export async function scrapeSocialPost(url: string, options: ScrapeOptions = {}): Promise<SourcePost | null> {
  const host = socialHost(url);
  if (!host) return null;
  return host === 'tiktok' ? await scrapeTikTok(url, options) : await scrapeInstagram(url);
}

/** An Apify storage link with the account token added, which private stores need. Other hosts pass through. */
export function withApifyToken(url: string): string {
  const token = Deno.env.get('APIFY_API_TOKEN');
  try {
    const parsed = new URL(url);
    if (token && /(^|\.)apify\.com$/i.test(parsed.hostname)) {
      parsed.searchParams.set('token', token);
      return parsed.href;
    }
  } catch {
    // Not a URL; the caller's fetch will fail on it.
  }
  return url;
}

export type SubtitleCue = { text: string; start_ms: number; end_ms: number };

function cueTimeMs(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4].padEnd(3, '0'));
}

/** WebVTT or SRT down to timed cues. Empty for a plain transcript. */
export function parseSubtitleCues(raw: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let open: SubtitleCue | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t.includes('-->')) {
      const [from, to] = t.split('-->');
      const start = cueTimeMs(from);
      const end = cueTimeMs((to ?? '').trim().split(/\s+/)[0] ?? '');
      open = start !== null && end !== null ? { text: '', start_ms: start, end_ms: end } : null;
      if (open) cues.push(open);
    } else if (!t) {
      open = null;
    } else if (open) {
      const text = t.replace(/<[^>]+>/g, '').trim();
      if (text) open.text = open.text ? `${open.text} ${text}` : text;
    }
  }
  return cues.filter((c) => c.text.length > 0 && c.end_ms >= c.start_ms);
}

/**
 * The actor's subtitle file: the spoken text, plus timed cues when the file
 * is WebVTT or SRT (cue level timing, not word level). Null when unreadable.
 */
export async function fetchApifySubtitles(url: string): Promise<{ text: string; cues: SubtitleCue[] } | null> {
  try {
    const res = await fetch(withApifyToken(url), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const raw = await res.text();
    const text = subtitleToText(raw);
    return text ? { text, cues: parseSubtitleCues(raw) } : null;
  } catch {
    return null;
  }
}

/** WebVTT and SRT cues down to the spoken line. Plain transcripts pass through. */
function subtitleToText(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('<!') || trimmed.startsWith('<html')) return null;
  const timed = trimmed.startsWith('WEBVTT') || trimmed.includes('-->');
  if (!timed) return trimmed;
  const lines = trimmed.split(/\r?\n/).filter((line) => {
    const t = line.trim();
    if (!t || t === 'WEBVTT' || /^\d+$/.test(t)) return false;
    if (t.includes('-->') || /^\d{2}:\d{2}/.test(t)) return false;
    if (/^(NOTE|STYLE|Kind:|Language:)/.test(t)) return false;
    return true;
  });
  const text = lines
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : null;
}

async function fetchApifyTranscript(url: string): Promise<string | null> {
  const token = Deno.env.get('APIFY_API_TOKEN');
  let href = url;
  try {
    const parsed = new URL(url);
    if (token && /(^|\.)apify\.com$/i.test(parsed.hostname)) {
      parsed.searchParams.set('token', token);
      href = parsed.href;
    }
  } catch {
    return null;
  }
  try {
    const res = await fetch(href, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 0 ? subtitleToText(text) : null;
  } catch {
    return null;
  }
}

export type TimedTranscript = {
  transcript: string;
  /** Deepgram's words with punctuation, times in ms from the start of the media. */
  words: Array<{ w: string; s: number; e: number }>;
  duration_ms: number | null;
};

/** Deepgram on a remote media URL, keeping the word timestamps. Null when it cannot be transcribed. */
export async function transcribeTimed(mediaUrl: string): Promise<TimedTranscript | null> {
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
      metadata?: { duration?: number };
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            words?: Array<{ word?: string; punctuated_word?: string; start?: number; end?: number }>;
          }>;
        }>;
      };
    };
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    if (!alt?.transcript) return null;
    const words: TimedTranscript['words'] = [];
    for (const item of alt.words ?? []) {
      const w = item.punctuated_word ?? item.word;
      if (!w || typeof item.start !== 'number' || typeof item.end !== 'number') continue;
      words.push({ w, s: Math.round(item.start * 1000), e: Math.round(item.end * 1000) });
    }
    const duration = data.metadata?.duration;
    return {
      transcript: alt.transcript,
      words,
      duration_ms: typeof duration === 'number' && duration > 0 ? Math.round(duration * 1000) : null,
    };
  } catch {
    return null;
  }
}

async function transcribe(mediaUrl: string): Promise<string | null> {
  return (await transcribeTimed(mediaUrl))?.transcript ?? null;
}

export async function ocrSlides(imageUrls: string[]): Promise<string[] | null> {
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

/** What a read is doing now, for the Library's live steps. */
export type ReadPhase = 'transcribing' | 'reading_slides';

/**
 * Scrape, then transcribe a video or OCR a slideshow. Null when the post
 * cannot be read. onPhase hears when the scrape is done and the second half
 * starts.
 */
export async function readSocialPost(
  url: string,
  onPhase?: (phase: ReadPhase) => Promise<void> | void,
): Promise<ReadPost | null> {
  const host = socialHost(url);
  if (!host) return null;
  const post = host === 'tiktok' ? await scrapeTikTok(url) : await scrapeInstagram(url);
  if (!post) return null;
  await Promise.resolve(onPhase?.(post.format === 'video' ? 'transcribing' : 'reading_slides')).catch(() => undefined);
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
