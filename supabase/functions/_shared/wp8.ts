import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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
  | { kind: 'user'; userId: string; companyId: string; role: string };

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
  return {
    kind: 'user',
    userId: data.user.id,
    companyId: profile.company_id,
    role: profile.role,
  };
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

export function parseClaudeJson<T>(text: string): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = stripped.search(/[[{]/);
  if (start === -1) throw new Error('No JSON in Claude response');
  return JSON.parse(stripped.slice(start)) as T;
}

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
};

export async function loadBrandContext(
  admin: SupabaseClient,
  companyId: string,
): Promise<BrandContext> {
  const [{ data: company }, { data: brand }] = await Promise.all([
    admin.from('companies').select('name, settings').eq('id', companyId).single(),
    admin
      .from('brand_profiles')
      .select('tone, audience, products, content_pillars, buying_path')
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);
  const settings = (company?.settings ?? {}) as {
    handles?: { instagram?: string; tiktok?: string };
    vertical?: string;
    ugc_reference_handles?: string[];
  };
  const products = brand?.products as { description?: string } | null;
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
  };
}

export type TrendForPrompt = {
  platform: string | null;
  hook: string | null;
  transcript: string | null;
  why_it_works: string | null;
  views: number | null;
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

  const brandLines = [
    `Brand: ${brand.companyName}`,
    brand.vertical ? `Vertical: ${brand.vertical.replace(/_/g, ' ')}` : null,
    brand.tone ? `Voice/tone: ${brand.tone}` : null,
    brand.audience ? `Audience: ${brand.audience}` : null,
    brand.products ? `Product: ${brand.products}` : null,
    brand.pillars.length ? `Content pillars: ${brand.pillars.join(', ')}` : null,
    brand.buyingPath
      ? `CTA: ${BUYING_PATH_CTA[brand.buyingPath] ?? brand.buyingPath}`
      : null,
  ].filter(Boolean);

  const trendLines = trend
    ? [
        '',
        `Base the brief on this trending ${trend.platform ?? 'social'} post (${trend.views ?? 'unknown'} views):`,
        trend.hook ? `Its hook: ${trend.hook}` : null,
        trend.why_it_works ? `Why it works: ${trend.why_it_works}` : null,
        trend.transcript ? `Transcript: ${trend.transcript.slice(0, 2000)}` : null,
        'Adapt the format and energy to this brand. Do not copy it verbatim and do not mention the original creator.',
      ].filter((l): l is string => l !== null)
    : ['', 'No trend reference. Draft an original brief from one of the content pillars.'];

  const raw = await askClaude(system, [...brandLines, ...trendLines].join('\n'));
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
