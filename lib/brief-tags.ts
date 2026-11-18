// Hashtags on a Guided brief's caption. The campaign manager types them
// one at a time (or pastes a few); each lands as a chip.

/** `#word` from whatever was typed: no spaces or stray punctuation, one leading #. Empty when nothing usable is left. */
export function normalizeTag(raw: string): string {
  const body = raw
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_]/gu, '');
  return body ? `#${body}` : '';
}

/** Adds every tag found in `raw` (split on spaces, commas and #), skipping ones already there in any case. */
export function addTags(tags: string[], raw: string): string[] {
  const seen = new Set(tags.map((t) => t.toLowerCase()));
  const out = tags.slice();
  for (const part of raw.split(/[\s,]+|(?=#)/)) {
    const t = normalizeTag(part);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}
