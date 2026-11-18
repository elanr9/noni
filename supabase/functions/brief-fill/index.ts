// Fill in with AI for the v2 Create flow: a guided post (hook and points or
// slides, on-screen text, caption, hashtags, search phrase), an outline (title
// and notes) or title ideas, written from the caller's company brand context.
import {
  adminClient,
  askClaude,
  authenticate,
  handleCors,
  jsonResponse,
  legacyBrandLines,
  loadBrandContext,
  parseClaudeJson,
  stripDashes,
  type BrandContext,
} from '../_shared/wp8.ts';

type BriefType = 'Talking Head' | 'Long Text' | 'Slideshow' | 'Greenscreen';
type Body = {
  mode?: 'guided' | 'outline' | 'titles' | 'long_text';
  type?: BriefType;
  title?: string;
  link?: string;
  linkNotes?: string;
  notes?: string;
  typed?: string;
};

type GuidedOut = {
  title: string;
  phrase: string;
  clips: { say: string; onScreen: string; cta: boolean }[];
  caption: string;
  tags: string[];
};

function brandBlock(brand: BrandContext): string {
  const features = brand.features.slice(0, 8).map((f) => `- ${f.name}${f.sentence ? `: ${f.sentence}` : ''}`);
  const claims = brand.approvedClaims.slice(0, 8).map((c) => `- ${c.name}: ${c.claim || c.what_it_does}`);
  return [
    legacyBrandLines(brand),
    `What creators call the product out loud: ${brand.productName}`,
    brand.buyingPath ? `How people get it: ${brand.buyingPath}` : null,
    brand.docs.productTruth.trim() ? `Product truth:\n${brand.docs.productTruth.slice(0, 2500)}` : null,
    brand.docs.audienceNiche.trim() ? `Audience and niche:\n${brand.docs.audienceNiche.slice(0, 2000)}` : null,
    brand.docs.voice.trim() ? `Voice:\n${brand.docs.voice.slice(0, 1500)}` : null,
    features.length ? `Features:\n${features.join('\n')}` : null,
    claims.length ? `Approved claims (only claims you may make):\n${claims.join('\n')}` : null,
    brand.hashtagBank.length ? `Hashtags the brand uses: ${brand.hashtagBank.slice(0, 20).join(' ')}` : null,
    brand.bannedPhrases.length ? `Never say: ${brand.bannedPhrases.join('; ')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const RULES = `You write short-form UGC post plans for TikTok and Instagram that a real creator films for this brand.
Rules:
- Sound like a real person from the audience talking to a friend, never like an ad.
- Concrete and specific to this brand's product and audience. Never invent features, numbers, prices or claims that aren't in the brand context.
- No em dashes or en dashes. Sentence case. No emoji. No hashtags inside spoken lines.
- Spoken lines are short (one or two sentences, under 25 words each).
- On-screen text is 2 to 8 words.
- Output only JSON, no prose.`;

function guidedPrompt(type: BriefType, b: Body): string {
  const topic = (b.title ?? '').trim();
  const ref = (b.link ?? '').trim();
  const shape =
    type === 'Slideshow'
      ? `A photo slideshow. "clips" are slides: slide 1 is the hook slide, then 3 to 6 point slides, then a final CTA slide (cta true). For slides "say" is "" and "onScreen" holds the slide text (up to 14 words for point slides).`
      : type === 'Long Text'
        ? `A single long-text video: one clip whose "onScreen" is the full on-screen story (60 to 120 words, line breaks allowed) and whose "say" is "".`
        : `A ${type === 'Greenscreen' ? 'green screen' : 'talking head'} video. "clips": clip 1 is the hook (say the hook, onScreen a short title), then 3 to 5 point clips, and the last point ends with a natural mention of the product (use what creators call it out loud) and has cta true.`;
  return [
    `Write a ${type} post plan.`,
    topic ? `Topic or working title: ${topic}` : 'Pick the strongest topic for this brand right now.',
    ref ? `Reference video the manager wants to copy the idea of: ${ref}${b.linkNotes ? `\nWhat they liked about it: ${b.linkNotes}` : ''}` : null,
    shape,
    `Return JSON: {"title": string (a scroll-stopping title, under 60 chars), "phrase": string (what the creator should search on TikTok to study similar posts, 2 to 5 words), "clips": [{"say": string, "onScreen": string, "cta": boolean}], "caption": string (one or two sentences), "tags": string[] (4 to 6 hashtags with #)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function clean(s: unknown, max = 600): string {
  return typeof s === 'string' ? stripDashes(s).trim().slice(0, max) : '';
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller || caller.kind !== 'user') return jsonResponse({ error: 'unauthorized' }, 401);
  if (caller.role !== 'campaign_manager') return jsonResponse({ error: 'forbidden' }, 403);
  if (!caller.companyId) return jsonResponse({ error: 'no active company' }, 400);

  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const mode = body.mode ?? 'guided';
  const type: BriefType = body.type ?? 'Talking Head';

  try {
    const brand = await loadBrandContext(admin, caller.companyId);
    const system = `${RULES}\n\nBrand context:\n${brandBlock(brand)}`;

    if (mode === 'titles') {
      const typed = (body.typed ?? '').trim();
      const text = await askClaude(
        system,
        `Suggest 6 post titles for a ${type} post${typed ? ` that start from or build on: "${typed}"` : ''}. Each under 60 characters, specific to this brand's audience. Return JSON: {"titles": string[]}`,
        600,
        { tier: 'fast', timeoutMs: 25000 },
      );
      const out = parseClaudeJson<{ titles?: unknown[] }>(text);
      const titles = (out.titles ?? []).map((t) => clean(t, 80)).filter(Boolean).slice(0, 8);
      return jsonResponse({ titles });
    }

    if (mode === 'outline') {
      const text = await askClaude(
        system,
        [
          'Write an outline brief: a loose plan the creator films in their own words.',
          body.title?.trim() ? `Working title: ${body.title.trim()}` : null,
          body.link?.trim() ? `Reference video: ${body.link.trim()}` : null,
          'Return JSON: {"title": string (under 60 chars), "notes": string (4 to 7 short lines separated by \\n: the idea, the hook to open with, 2 to 4 beats, how to mention the product naturally)}',
        ]
          .filter(Boolean)
          .join('\n'),
        900,
        { tier: 'fast', timeoutMs: 30000 },
      );
      const out = parseClaudeJson<{ title?: string; notes?: string }>(text);
      return jsonResponse({ title: clean(out.title, 100), notes: clean(out.notes, 1500) });
    }

    const text = await askClaude(system, guidedPrompt(mode === 'long_text' ? 'Long Text' : type, body), 1800, { timeoutMs: 45000 });
    const out = parseClaudeJson<GuidedOut>(text);
    const clips = (Array.isArray(out.clips) ? out.clips : [])
      .map((c) => ({ say: clean(c?.say, 300), onScreen: clean(c?.onScreen, 900), cta: !!c?.cta }))
      .filter((c) => c.say || c.onScreen)
      .slice(0, 9);
    if (!clips.length) return jsonResponse({ error: 'empty plan' }, 502);
    const tags = (Array.isArray(out.tags) ? out.tags : [])
      .map((t) => clean(t, 40).replace(/\s+/g, ''))
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .slice(0, 8);
    return jsonResponse({
      title: clean(out.title, 100),
      phrase: clean(out.phrase, 80),
      clips,
      caption: clean(out.caption, 400),
      tags,
    });
  } catch (e) {
    console.error('brief-fill failed', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'failed' }, 500);
  }
});
