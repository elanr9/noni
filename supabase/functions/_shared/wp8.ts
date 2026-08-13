import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { summarizeItem, type GoldenExample } from './relevance.ts';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export type Caller =
  | { kind: 'cron' }
  | {
      kind: 'user';
      userId: string;
      companyId: string;
      role: string;
      platformAdmin: boolean;
      companyAdmin: boolean;
    };

// Cron jobs authenticate with x-cron-secret; app calls carry the user's JWT.
export async function authenticate(
  req: Request,
  admin: SupabaseClient,
): Promise<Caller | null> {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const header = req.headers.get('x-cron-secret');
  if (cronSecret && header && header === cronSecret) return { kind: 'cron' };

  const authHeader = req.headers.get('Authorization') ?? '';
  const { data } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!data?.user) return null;
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile) return null;
  // Platform admin and company admin inherit campaign manager powers inside
  // their company; platform-only endpoints gate on platformAdmin, company
  // admin-only endpoints gate on companyAdmin.
  return {
    kind: 'user',
    userId: data.user.id,
    companyId: profile.company_id,
    role:
      profile.role === 'admin' || profile.role === 'company_admin'
        ? 'campaign_manager'
        : profile.role,
    platformAdmin: profile.role === 'admin',
    companyAdmin: profile.role === 'company_admin',
  };
}

// Mirrors the SQL has_permission(): platform admin and company admin pass
// everything, campaign managers need the flag in their company_members row.
export async function hasPermission(
  admin: SupabaseClient,
  caller: {
    userId: string;
    companyId: string;
    platformAdmin: boolean;
    companyAdmin?: boolean;
  },
  key: string,
): Promise<boolean> {
  if (caller.platformAdmin || caller.companyAdmin) return true;
  if (!caller.companyId) return false;
  const { data } = await admin
    .from('company_members')
    .select('permissions')
    .eq('company_id', caller.companyId)
    .eq('profile_id', caller.userId)
    .maybeSingle();
  const permissions = data?.permissions as Record<string, unknown> | undefined;
  return permissions?.[key] === true;
}

export async function askClaude(
  system: string,
  user: string,
  maxTokens = 2048,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return data.content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('');
}

/** Cheap ChatGPT path for light edits (Brand Brain cleanup). */
export async function askOpenAI(
  system: string,
  user: string,
  maxTokens = 2048,
): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned an empty response');
  return text;
}

// Vision variant used for carousel slide OCR: image URLs plus a text prompt.
export async function askClaudeVision(
  system: string,
  imageUrls: string[],
  user: string,
  maxTokens = 2048,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5';
  const content = [
    ...imageUrls.map((url) => ({
      type: 'image' as const,
      source: { type: 'url' as const, url },
    })),
    { type: 'text' as const, text: user },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return data.content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('');
}

export function parseClaudeJson<T>(text: string): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = stripped.search(/[[{]/);
  if (start === -1) throw new Error('No JSON in Claude response');
  return JSON.parse(stripped.slice(start)) as T;
}

export type BrandDocs = {
  productTruth: string;
  audienceNiche: string;
  voice: string;
  learnings: string;
};

export type SourcingTerm = {
  term: string;
  kind: 'query' | 'hashtag';
  keepers: number;
  scrapes: number;
};

// Approved claim library row. Product points in briefs must be composed from
// these; the model phrases, it does not invent capability.
export type ProductFeature = {
  id: string;
  name: string;
  what_it_does: string;
  claim: string;
};

export type BrandContext = {
  companyName: string;
  tone: string | null;
  audience: string | null;
  products: string | null;
  pillars: string[];
  buyingPath: string | null;
  handles: { instagram?: string; tiktok?: string };
  vertical: string | null;
  referenceHandles: string[];
  docs: BrandDocs;
  sourcingTerms: SourcingTerm[];
  approvedClaims: ProductFeature[];
  hashtagBank: string[];
  bannedPhrases: string[];
};

const DOC_KIND_TO_KEY: Record<string, keyof BrandDocs> = {
  product_truth: 'productTruth',
  audience_niche: 'audienceNiche',
  voice: 'voice',
  learnings: 'learnings',
};

export async function loadBrandContext(
  admin: SupabaseClient,
  companyId: string,
): Promise<BrandContext> {
  const [{ data: company }, { data: brand }, { data: docs }, { data: claims }] =
    await Promise.all([
      admin.from('companies').select('name, settings').eq('id', companyId).single(),
      admin
        .from('brand_profiles')
        .select(
          'tone, audience, products, content_pillars, buying_path, sourcing, hashtag_bank, banned_phrases',
        )
        .eq('company_id', companyId)
        .maybeSingle(),
      admin
        .from('brand_docs')
        .select('kind, content')
        .eq('company_id', companyId),
      admin
        .from('product_features')
        .select('id, name, what_it_does, claim')
        .eq('company_id', companyId)
        .eq('approved', true),
    ]);
  const settings = (company?.settings ?? {}) as {
    handles?: { instagram?: string; tiktok?: string };
    vertical?: string;
    ugc_reference_handles?: string[];
  };
  const products = brand?.products as { description?: string } | null;
  const brandDocs: BrandDocs = {
    productTruth: '',
    audienceNiche: '',
    voice: '',
    learnings: '',
  };
  for (const row of docs ?? []) {
    const key = DOC_KIND_TO_KEY[row.kind as string];
    if (key) brandDocs[key] = (row.content as string) ?? '';
  }
  const sourcing = (brand?.sourcing ?? {}) as { terms?: SourcingTerm[] };
  return {
    companyName: company?.name ?? 'the brand',
    tone: brand?.tone ?? null,
    audience: brand?.audience ?? null,
    products: products?.description ?? null,
    pillars: Array.isArray(brand?.content_pillars)
      ? (brand.content_pillars as string[])
      : [],
    buyingPath: brand?.buying_path ?? null,
    handles: settings.handles ?? {},
    vertical: settings.vertical ?? null,
    referenceHandles: Array.isArray(settings.ugc_reference_handles)
      ? settings.ugc_reference_handles
      : [],
    docs: brandDocs,
    sourcingTerms: Array.isArray(sourcing.terms) ? sourcing.terms : [],
    approvedClaims: (claims ?? []) as ProductFeature[],
    hashtagBank: Array.isArray(brand?.hashtag_bank)
      ? (brand.hashtag_bank as string[])
      : [],
    bannedPhrases: Array.isArray(brand?.banned_phrases)
      ? (brand.banned_phrases as string[])
      : [],
  };
}

// Fallback context assembled from the legacy brand_profiles fields, used in
// prompts whenever a brand doc has not been written yet.
export function legacyBrandLines(brand: BrandContext): string {
  return [
    `Brand: ${brand.companyName}`,
    brand.vertical ? `Vertical: ${brand.vertical.replace(/_/g, ' ')}` : null,
    brand.tone ? `Voice/tone: ${brand.tone}` : null,
    brand.audience ? `Audience: ${brand.audience}` : null,
    brand.products ? `Product: ${brand.products}` : null,
    brand.pillars.length ? `Content pillars: ${brand.pillars.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

// The audience document drives sourcing and the relevance gate.
export function audienceDoc(brand: BrandContext): string {
  if (brand.docs.audienceNiche.trim()) return brand.docs.audienceNiche;
  return legacyBrandLines(brand);
}

// Few-shot examples for the relevance gate, balanced across keeps and kills.
export async function loadGoldenExamples(
  admin: SupabaseClient,
  companyId: string,
  limit = 16,
): Promise<GoldenExample[]> {
  const { data } = await admin
    .from('trend_items')
    .select('label, label_reason, format, caption, transcript, slide_texts, author_handle')
    .eq('company_id', companyId)
    .eq('is_golden', true)
    .not('label', 'is', null)
    .order('scraped_at', { ascending: false })
    .limit(60);
  const rows = data ?? [];
  const perSide = Math.ceil(limit / 2);
  const pick = (label: 'keep' | 'kill') =>
    rows
      .filter((r) => r.label === label)
      .slice(0, perSide)
      .map((r) => ({
        label,
        reason: (r.label_reason as string | null) ?? null,
        summary: summarizeItem({
          format: r.format as string | null,
          caption: r.caption as string | null,
          transcript: r.transcript as string | null,
          slideTexts: Array.isArray(r.slide_texts) ? (r.slide_texts as string[]) : null,
          authorHandle: r.author_handle as string | null,
        }),
      }));
  return [...pick('keep'), ...pick('kill')];
}

export type TrendForPrompt = {
  platform: string | null;
  hook: string | null;
  transcript: string | null;
  why_it_works: string | null;
  views: number | null;
  format?: string | null;
  caption?: string | null;
  slide_texts?: unknown;
  remake_mode?: string | null;
  remake_reason?: string | null;
};

export type TaskFormat = 'video' | 'photo_carousel';

export type TaskDraft = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  brief: string;
  format: TaskFormat;
  estimatedSeconds: number;
};

// ~150 spoken words per minute, clamped to a believable shoot length.
function estimateSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.round((words / 150) * 60);
  return Math.min(90, Math.max(20, seconds));
}

const BUYING_PATH_CTA: Record<string, string> = {
  link_in_bio: 'send viewers to the link in bio',
  dms: 'tell viewers to DM the account',
  website: 'point viewers to the website',
};

type RawDraft = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  brief: string;
  format: string;
};

export async function generateTaskDraft(
  brand: BrandContext,
  trend: TrendForPrompt | null,
): Promise<TaskDraft> {
  const system = `You write UGC content briefs for creators posting on TikTok and Instagram. You always answer with a single JSON object: {"title": string, "hook": string, "script": string, "caption": string, "brief": string, "format": "video" | "photo_carousel"}. The title is a short punchy task name a creator scans in a feed (under 8 words). The hook is the first spoken line, under 12 words, engineered to stop scrolling. The script is roughly 60 seconds spoken aloud, written in the brand voice, first person, no camera directions, split into 3 or 4 short paragraphs separated by blank lines, and the first paragraph starts with the hook. The caption is under 200 characters with a clear call to action. The brief is one or two plain sentences telling the creator what this post is and why they are making it, like a short job description (no script text). The format is "photo_carousel" only when the idea is clearly a text-on-image slideshow (lists, tips, before/after stills); otherwise "video". Plain language only, no hashtag spam (2 hashtags max).`;

  // Selective doc injection: drafts get Product Truth + Voice + Learnings.
  // The audience doc belongs to sourcing and the gate, not here.
  const docBlocks: string[] = [`Brand: ${brand.companyName}`];
  if (brand.docs.productTruth.trim()) {
    docBlocks.push(`Product truth:\n${brand.docs.productTruth.trim()}`);
  }
  if (brand.docs.voice.trim()) {
    docBlocks.push(`Voice:\n${brand.docs.voice.trim()}`);
  }
  if (brand.docs.learnings.trim()) {
    docBlocks.push(`What has worked so far:\n${brand.docs.learnings.trim()}`);
  }
  if (docBlocks.length === 1) docBlocks.push(legacyBrandLines(brand));
  if (brand.buyingPath) {
    docBlocks.push(`CTA: ${BUYING_PATH_CTA[brand.buyingPath] ?? brand.buyingPath}`);
  }

  const slideTexts =
    trend && Array.isArray(trend.slide_texts)
      ? (trend.slide_texts as string[]).filter((s) => typeof s === 'string')
      : [];

  const remakeLine =
    trend?.remake_mode === 'beat_for_beat'
      ? 'Remake mode: BEAT FOR BEAT. This post wins on format. Keep its structure, timing, and visual concept intact and swap in this brand and its people; deviating from the format kills it.'
      : 'Remake mode: STRUCTURE ONLY. This post wins on the idea. Take the hook style and skeleton, then rewrite the body entirely in the brand voice. Copying it verbatim makes the brand look like a knockoff.';

  const trendLines = trend
    ? [
        '',
        `Base the brief on this trending ${trend.platform ?? 'social'} ${trend.format === 'carousel' ? 'photo slideshow' : 'post'} (${trend.views ?? 'unknown'} views):`,
        trend.hook ? `Its hook: ${trend.hook}` : null,
        trend.why_it_works ? `Why it works: ${trend.why_it_works}` : null,
        trend.caption ? `Caption: ${trend.caption.slice(0, 400)}` : null,
        slideTexts.length
          ? `Slide texts: ${slideTexts.map((s, i) => `[${i + 1}] ${s}`).join(' ')}`
          : null,
        trend.transcript ? `Transcript: ${trend.transcript.slice(0, 2000)}` : null,
        remakeLine,
        trend.remake_reason ? `Mode reason: ${trend.remake_reason}` : null,
        trend.format === 'carousel'
          ? 'The source is a photo slideshow, so use format "photo_carousel" and write the script as slide-by-slide overlay text (one short paragraph per slide).'
          : null,
        'Do not mention the original creator.',
      ].filter((l): l is string => l !== null)
    : ['', 'No trend reference. Draft an original brief from one of the content pillars.'];

  const raw = await askClaude(system, [...docBlocks, ...trendLines].join('\n\n'));
  const draft = parseClaudeJson<RawDraft>(raw);
  if (!draft.title || !draft.script || !draft.caption) {
    throw new Error('Claude returned an incomplete task draft');
  }
  return {
    title: draft.title,
    hook: draft.hook ?? '',
    script: draft.script,
    caption: draft.caption,
    brief: draft.brief ?? '',
    format: draft.format === 'photo_carousel' ? 'photo_carousel' : 'video',
    estimatedSeconds: estimateSeconds(draft.script),
  };
}
