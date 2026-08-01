// Claim mining prompt: turns the niche corpus (transcripts, slides, comment
// questions) into candidate claims, vocabulary, and per-item topics for
// saturation scoring. Niche corpus only, never format donors. Keep this file
// free of Deno and npm imports so Node can import it too.

export type MiningItem = {
  index: number;
  caption: string;
  transcript: string | null;
  slideTexts: string[] | null;
};

export type MinedClaim = {
  claim: string;
  proof: string | null;
  audience_segment: string | null;
  topic: string;
  confidence: number;
};

export type MiningResult = {
  claims: MinedClaim[];
  vocabulary: string[];
  topic_by_item: Array<{ index: number; topic: string }>;
};

function itemBlock(item: MiningItem): string {
  const body =
    item.slideTexts?.length
      ? `Slides: ${item.slideTexts.map((s, n) => `[${n + 1}] ${s}`).join(' ').slice(0, 1200)}`
      : `Transcript: ${item.transcript ? item.transcript.slice(0, 1200) : 'unavailable'}`;
  return `Item ${item.index}\nCaption: ${item.caption.slice(0, 250)}\n${body}`;
}

export function buildClaimMiningPrompt(
  audienceDoc: string,
  existingClaims: string[],
  items: MiningItem[],
  commentQuestions: string[],
): { system: string; user: string } {
  const system = `You mine an audience's own content and questions for claims a brand could build posts around. Answer with a single JSON object: {"claims": [{"claim": string, "proof": string | null, "audience_segment": string | null, "topic": string, "confidence": number}], "vocabulary": string[], "topic_by_item": [{"index": number, "topic": string}]}.

claims: statements worth making in content. Each is one sentence, concrete, in plain speech. proof: a number or named source from the material when present, else null. audience_segment: who specifically this speaks to, else null. topic: a 1 to 3 word lowercase topic label; reuse the same label for the same topic. confidence: 0 to 1 that this is a real recurring concern, not a one-off. Recurring questions and complaints are the best claims. Skip anything already covered by the existing claims list.
vocabulary: verbatim phrases the audience actually uses, lifted exactly from the material. 5 to 15 phrases, each 2 to 6 words, lowercase. No marketing language.
topic_by_item: assign every input item its dominant topic using the same labels, for saturation counting.`;

  const user = [
    `Audience:\n${audienceDoc.slice(0, 2000)}`,
    existingClaims.length
      ? `Existing claims (do not duplicate):\n${existingClaims.map((c) => `- ${c}`).join('\n')}`
      : null,
    `Corpus:\n${items.map(itemBlock).join('\n\n')}`,
    commentQuestions.length
      ? `Questions from comment sections:\n${commentQuestions.map((q) => `- ${q}`).join('\n')}`
      : null,
  ]
    .filter((s): s is string => s !== null)
    .join('\n\n');
  return { system, user };
}
