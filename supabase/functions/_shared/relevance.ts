// Relevance gate prompt, shared verbatim between the scrape-trends edge
// function and scripts/relevance-regression.ts. Keep this file free of Deno
// and npm imports so Node can import it too.

export const RELEVANCE_THRESHOLD = 6;

export type GateItem = {
  index: number;
  platform: string;
  format: 'video' | 'carousel';
  authorHandle: string | null;
  views: number;
  caption: string;
  transcript: string | null;
  slideTexts: string[] | null;
};

export type GoldenExample = {
  label: 'keep' | 'kill';
  reason: string | null;
  summary: string;
};

export type GateVerdict = {
  index: number;
  score: number;
  reason: string;
  remake_mode: 'beat_for_beat' | 'structure_only';
  remake_reason: string;
};

export function buildGatePrompt(
  audienceDoc: string,
  golden: GoldenExample[],
  items: GateItem[],
): { system: string; user: string } {
  const system = `You are the relevance gate for a UGC content engine. You judge scraped social posts against a brand's audience document and decide two things per post.

1. score: 0 to 10. Would this brand's exact audience follow the account that posted this? 10 means squarely in the niche and worth remaking, 0 means irrelevant. Viral but off-niche content scores low; a modest post squarely in the niche scores high. reason: one line.

2. remake_mode, by fixed rule, never freehand judgment:
- "beat_for_beat" only when the post wins on format: trending audio, a visual gimmick, or a timing-based punchline where deviating from the original structure would kill it.
- "structure_only" when the post wins on the idea: listicles, storytime, advice, hot takes, talking-head explanations. Copying these verbatim makes the brand look like a knockoff.
- Hard guardrail: if the post is outside the brand's niche (score below ${RELEVANCE_THRESHOLD}), remake_mode must be "structure_only". Take the idea only, never the execution.
remake_reason: one line naming which rule fired.

Answer with a single JSON array, one object per input item: {"index": number, "score": number, "reason": string, "remake_mode": "beat_for_beat" | "structure_only", "remake_reason": string}.`;

  const goldenBlock = golden.length
    ? [
        '',
        'Labeled examples from this brand (ground truth, match this judgment):',
        ...golden.map(
          (g) =>
            `- ${g.label.toUpperCase()}${g.reason ? ` (${g.reason})` : ''}: ${g.summary}`,
        ),
      ]
    : [];

  const itemBlock = items.map((it) => {
    const lines = [
      `Item ${it.index} (${it.platform} ${it.format}, ${it.views} views, @${it.authorHandle ?? 'unknown'})`,
      `Caption: ${it.caption.slice(0, 300) || 'none'}`,
    ];
    if (it.format === 'carousel' && it.slideTexts?.length) {
      lines.push(`Slides: ${it.slideTexts.map((s, i) => `[${i + 1}] ${s}`).join(' ').slice(0, 1200)}`);
    } else {
      lines.push(`Transcript: ${it.transcript ? it.transcript.slice(0, 1200) : 'unavailable'}`);
    }
    return lines.join('\n');
  });

  const user = [
    'Brand audience document:',
    audienceDoc.trim() || 'No audience document available.',
    ...goldenBlock,
    '',
    'Posts to judge:',
    '',
    itemBlock.join('\n\n'),
  ].join('\n');

  return { system, user };
}

// One-line summary of a trend item, used both for golden few-shots and for
// regression input so the model sees labeled and unlabeled items identically.
export function summarizeItem(item: {
  format: string | null;
  caption: string | null;
  transcript: string | null;
  slideTexts: string[] | null;
  authorHandle: string | null;
}): string {
  const body =
    item.format === 'carousel' && item.slideTexts?.length
      ? item.slideTexts.join(' / ')
      : item.transcript || item.caption || '';
  return `@${item.authorHandle ?? 'unknown'} (${item.format ?? 'video'}): ${body.slice(0, 220)}`;
}
