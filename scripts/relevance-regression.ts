// Relevance gate regression: replays the current gate prompt and Brain docs
// against every golden-labeled trend item and reports agreement. Run after
// any Brain edit or gate prompt change.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
//     npx tsx scripts/relevance-regression.ts [company_id]

import { createClient } from '@supabase/supabase-js';

import {
  buildGatePrompt,
  RELEVANCE_THRESHOLD,
  summarizeItem,
  type GateItem,
  type GateVerdict,
} from '../supabase/functions/_shared/relevance';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): void;
};

type GoldenRow = {
  id: string;
  company_id: string;
  platform: string | null;
  format: string | null;
  author_handle: string | null;
  views: number | null;
  caption: string | null;
  transcript: string | null;
  slide_texts: string[] | null;
  label: 'keep' | 'kill';
  label_reason: string | null;
};

async function askClaude(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return data.content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('');
}

function parseJson<T>(text: string): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = stripped.search(/[[{]/);
  if (start === -1) throw new Error('No JSON in Claude response');
  return JSON.parse(stripped.slice(start)) as T;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  const admin = createClient(url, key);

  let query = admin
    .from('trend_items')
    .select(
      'id, company_id, platform, format, author_handle, views, caption, transcript, slide_texts, label, label_reason',
    )
    .eq('is_golden', true)
    .not('label', 'is', null);
  const companyArg = process.argv[2];
  if (companyArg) query = query.eq('company_id', companyArg);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as GoldenRow[];
  if (rows.length === 0) {
    console.log('No golden-labeled trend items found. Label items in the admin app first.');
    return;
  }

  const byCompany = new Map<string, GoldenRow[]>();
  for (const row of rows) {
    const list = byCompany.get(row.company_id) ?? [];
    list.push(row);
    byCompany.set(row.company_id, list);
  }

  let agree = 0;
  let total = 0;
  const disagreements: string[] = [];

  for (const [companyId, items] of byCompany) {
    const { data: doc } = await admin
      .from('brand_docs')
      .select('content')
      .eq('company_id', companyId)
      .eq('kind', 'audience_niche')
      .maybeSingle();
    const audience = doc?.content ?? '';
    if (!audience.trim()) {
      console.warn(`Company ${companyId}: no audience_niche doc, gate runs blind.`);
    }

    // Leave-the-answer-out: golden items being tested are NOT injected as
    // few-shots, otherwise the gate just reads back the label.
    const gateItems: GateItem[] = items.map((row, i) => ({
      index: i,
      platform: row.platform ?? 'tiktok',
      format: row.format === 'carousel' ? 'carousel' : 'video',
      authorHandle: row.author_handle,
      views: row.views ?? 0,
      caption: row.caption ?? '',
      transcript: row.transcript,
      slideTexts: Array.isArray(row.slide_texts) ? row.slide_texts : null,
    }));
    const { system, user } = buildGatePrompt(audience, [], gateItems);
    const verdicts = parseJson<GateVerdict[]>(await askClaude(system, user));

    for (let i = 0; i < items.length; i += 1) {
      const row = items[i];
      const verdict = verdicts.find((v) => v.index === i);
      if (!verdict) continue;
      total += 1;
      const predicted = verdict.score >= RELEVANCE_THRESHOLD ? 'keep' : 'kill';
      if (predicted === row.label) {
        agree += 1;
      } else {
        disagreements.push(
          [
            `- ${row.label.toUpperCase()} labeled, gate said ${predicted} (score ${verdict.score})`,
            `  item: ${summarizeItem({
              format: row.format,
              caption: row.caption,
              transcript: row.transcript,
              slideTexts: row.slide_texts,
              authorHandle: row.author_handle,
            })}`,
            row.label_reason ? `  your reason: ${row.label_reason}` : null,
            `  gate reason: ${verdict.reason}`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
    }
  }

  console.log(`\nAgreement: ${agree}/${total} (${total ? Math.round((agree / total) * 100) : 0}%)`);
  if (disagreements.length > 0) {
    console.log(`\nDisagreements:\n${disagreements.join('\n\n')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
