import {
  adminClient,
  askClaude,
  authenticate,
  jsonResponse,
  parseClaudeJson,
} from '../_shared/wp8.ts';

type IngestBody = {
  company_name?: string;
  website?: string;
  instagram_handle?: string;
  tiktok_handle?: string;
};

type BrandResult = {
  tone: string;
  audience: string;
  products: string;
  pillars: string[];
};

async function fetchSiteText(website: string): Promise<string> {
  const url = website.startsWith('http') ? website : `https://${website}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NoniBot/1.0)' },
  });
  if (!res.ok) throw new Error(`site fetch ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

// Best effort: recent TikTok captions via Apify so Claude hears the brand's
// actual social voice, not just the website.
async function fetchRecentCaptions(tiktokHandle: string): Promise<string[]> {
  const token = Deno.env.get('APIFY_API_TOKEN');
  if (!token) return [];
  const handle = tiktokHandle.replace(/^@/, '');
  const res = await fetch(
    `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles: [handle], resultsPerPage: 6 }),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!res.ok) return [];
  const items = (await res.json()) as Array<{ text?: string }>;
  return items.map((i) => i.text ?? '').filter(Boolean).slice(0, 6);
}

async function ingestCompany(
  companyId: string,
  body: IngestBody,
): Promise<BrandResult> {
  const admin = adminClient();
  const { data: company } = await admin
    .from('companies')
    .select('name, website, settings')
    .eq('id', companyId)
    .single();

  const settings = (company?.settings ?? {}) as {
    handles?: { instagram?: string; tiktok?: string };
  };
  const name = body.company_name || company?.name || 'the brand';
  const website = body.website || company?.website || '';
  const tiktokHandle = body.tiktok_handle || settings.handles?.tiktok || '';
  const instagramHandle =
    body.instagram_handle || settings.handles?.instagram || '';

  const [siteText, captions] = await Promise.all([
    website ? fetchSiteText(website).catch(() => '') : Promise.resolve(''),
    tiktokHandle
      ? fetchRecentCaptions(tiktokHandle).catch(() => [] as string[])
      : Promise.resolve([] as string[]),
  ]);

  const system = `You analyze a brand for a UGC content engine. Answer with a single JSON object: {"tone": string, "audience": string, "products": string, "pillars": string[]}. tone: two or three sentences describing the brand voice for short form video. audience: two sentences describing who watches and buys, written so a founder nods and says "yes, that's them". products: two sentences on what is sold and the outcome customers get. pillars: 5 to 7 short content pillar names (2 to 4 words each) tailored to this brand, ordered by expected performance.`;

  const user = [
    `Brand name: ${name}`,
    website ? `Website: ${website}` : null,
    instagramHandle ? `Instagram: ${instagramHandle}` : null,
    tiktokHandle ? `TikTok: ${tiktokHandle}` : null,
    siteText ? `\nWebsite text:\n${siteText}` : '\nNo website text available.',
    captions.length
      ? `\nRecent post captions:\n${captions.map((c) => `- ${c.slice(0, 300)}`).join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const result = parseClaudeJson<BrandResult>(await askClaude(system, user));
  if (!result.audience || !result.products || !Array.isArray(result.pillars)) {
    throw new Error('Claude returned an incomplete brand profile');
  }

  const fields = {
    tone: result.tone,
    audience: result.audience,
    products: { description: result.products },
    content_pillars: result.pillars,
    source_urls: website ? [website] : [],
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await admin
    .from('brand_profiles')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();
  const { error } = existing
    ? await admin.from('brand_profiles').update(fields).eq('id', existing.id)
    : await admin
        .from('brand_profiles')
        .insert({ company_id: companyId, ...fields });
  if (error) throw error;

  return result;
}

Deno.serve(async (req) => {
  const admin = adminClient();
  const caller = await authenticate(req, admin);
  if (!caller) return jsonResponse({ error: 'unauthorized' }, 401);

  const body = ((await req.json().catch(() => null)) ?? {}) as IngestBody;

  try {
    if (caller.kind === 'user') {
      if (caller.role !== 'admin') return jsonResponse({ error: 'forbidden' }, 403);
      const result = await ingestCompany(caller.companyId, body);
      return jsonResponse(result as unknown as Record<string, unknown>);
    }

    // Monthly cron: refresh every company that already has a brand profile.
    const { data: profiles } = await admin
      .from('brand_profiles')
      .select('company_id');
    let refreshed = 0;
    for (const p of profiles ?? []) {
      try {
        await ingestCompany(p.company_id, {});
        refreshed += 1;
      } catch (e) {
        console.error(`brand-ingest failed for ${p.company_id}:`, e);
      }
    }
    return jsonResponse({ refreshed });
  } catch (e) {
    console.error('brand-ingest error:', e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : 'brand ingest failed' },
      500,
    );
  }
});
