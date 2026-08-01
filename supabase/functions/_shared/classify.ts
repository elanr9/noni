// Format classification prompt: which of the twelve bible formats a scraped
// post instantiates, and its slot fills against that format's schema. Shared
// so the G harness can replay it. Keep this file free of Deno and npm imports
// so Node can import it too.

export const CLASSIFY_CONFIDENCE_THRESHOLD = 0.6;
export const EXAMPLE_CONFIDENCE_THRESHOLD = 0.7;

export type ClassifySlot = {
  key: string;
  label: string;
  required: boolean;
};

export type ClassifyFormat = {
  id: string;
  name: string;
  family: string;
  when_to_use: string;
  slots: ClassifySlot[];
};

export type ClassifyItem = {
  index: number;
  platform: string;
  format: 'video' | 'carousel';
  caption: string;
  transcript: string | null;
  slideTexts: string[] | null;
};

export type ClassifyVerdict = {
  index: number;
  format_id: string | null;
  confidence: number;
  slot_fills: Record<string, string>;
  // Set when format_id is null or confidence is low: what the post is
  // instead, or why no format fits. The coverage evidence for the library.
  reason: string | null;
};

function formatBlock(f: ClassifyFormat): string {
  const slots = f.slots
    .map((s) => `${s.key}${s.required ? ' (required)' : ''}: ${s.label}`)
    .join('; ');
  return `- ${f.id} (${f.family}). ${f.when_to_use}\n  Slots: ${slots}`;
}

function itemBlock(item: ClassifyItem): string {
  const body =
    item.format === 'carousel' && item.slideTexts?.length
      ? `Slides: ${item.slideTexts.map((s, n) => `[${n + 1}] ${s}`).join(' ').slice(0, 1500)}`
      : `Transcript: ${item.transcript ? item.transcript.slice(0, 1500) : 'unavailable'}`;
  return `Item ${item.index} (${item.platform} ${item.format})\nCaption: ${item.caption.slice(0, 300)}\n${body}`;
}

export function buildClassifyPrompt(
  formats: ClassifyFormat[],
  items: ClassifyItem[],
): { system: string; user: string } {
  const system = `You classify short form social posts against a closed library of twelve UGC formats. Answer with a single JSON array, one object per input item: {"index": number, "format_id": string | null, "confidence": number, "slot_fills": object, "reason": string | null}.

format_id: the single format the post instantiates, or null when it matches none cleanly. Do not force a fit; a vlog, a skit, or a pure entertainment post is null.
confidence: 0 to 1. Below 0.6 means you are guessing; prefer null with confidence 0.
slot_fills: only when format_id is set. Keys are that format's slot keys. Values are the post's actual content for that slot, quoted or tightly paraphrased from the transcript or slides, never invented. Omit slots the post does not fill. For list-like slots join the items with " | ".
reason: required whenever format_id is null or confidence is below 0.6. One short sentence naming what the post actually is (e.g. "day-in-the-life vlog, no claim or structure") or which formats it sits between. Null when the classification is confident.

The library:
${formats.map(formatBlock).join('\n')}`;
  const user = items.map(itemBlock).join('\n\n');
  return { system, user };
}
