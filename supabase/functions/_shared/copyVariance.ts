export type DistinctOptions = {
  maxJaccard: number;
  /** A phrase every caption must carry (the search phrase); it never counts toward similarity. */
  ignorePhrase?: string | null;
};

const DEFAULT_DISTINCT: DistinctOptions = { maxJaccard: 0.6 };

/** The caption body that similarity is judged on: no hashtags, no mandatory phrase. */
export function comparableBody(text: string, ignorePhrase?: string | null): string {
  let body = text.replace(/#[\p{L}\p{N}_]+/gu, ' ');
  const phrase = ignorePhrase?.trim();
  if (phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    body = body.replace(new RegExp(escaped, 'gi'), ' ');
  }
  return body;
}

export function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function jaccard(a: string, b: string): number {
  const setA = new Set(normalizeTokens(a));
  const setB = new Set(normalizeTokens(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

export function openingWords(text: string, n = 4): string {
  return normalizeTokens(text).slice(0, n).join(' ');
}

export function collisions(
  candidate: string,
  others: string[],
  options: DistinctOptions = DEFAULT_DISTINCT,
): string[] {
  const body = comparableBody(candidate, options.ignorePhrase);
  const opening = openingWords(body);
  return others.filter((other) => {
    const otherBody = comparableBody(other, options.ignorePhrase);
    return (
      jaccard(body, otherBody) > options.maxJaccard ||
      (opening.length > 0 && openingWords(otherBody) === opening)
    );
  });
}

export function isDistinct(
  candidate: string,
  others: string[],
  options: DistinctOptions = DEFAULT_DISTINCT,
): boolean {
  return collisions(candidate, others, options).length === 0;
}

function squash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function containsPhrase(text: string, phrase: string): boolean {
  const needle = squash(phrase);
  return needle.length === 0 || squash(text).includes(needle);
}

export function phraseInFirstSentence(text: string, phrase: string): boolean {
  const needle = squash(phrase);
  if (needle.length === 0) return true;
  const haystack = squash(text);
  const at = haystack.indexOf(needle);
  return at >= 0 && !/[.!?]/.test(haystack.slice(0, at));
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

export function extractHashtags(text: string): string[] {
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(tags.map(normalizeTag))];
}

export type HashtagRules = {
  allowed: string[];
  original: string[];
  min: number;
  max: number;
  maxOverlap: number | null;
};

export function hashtagRules(bank: string[], originalCaption: string): HashtagRules {
  const original = extractHashtags(originalCaption);
  const fromBank = [...new Set(bank.map(normalizeTag).filter((tag) => tag.length > 0))];
  const allowed = fromBank.length > 0 ? fromBank : original;
  const min = Math.min(3, allowed.length);
  const max = Math.min(5, allowed.length);
  // The overlap cap only holds when the bank has enough tags outside the original to still reach min.
  const outsideOriginal = allowed.filter((tag) => !original.includes(tag)).length;
  const maxOverlap = fromBank.length > 0 && outsideOriginal + 2 >= min ? 2 : null;
  return { allowed, original, min, max, maxOverlap };
}

export function hashtagProblems(candidate: string, rules: HashtagRules): string[] {
  const tags = extractHashtags(candidate);
  const problems: string[] = [];
  const outside = tags.filter((tag) => !rules.allowed.includes(tag));
  if (outside.length > 0) {
    problems.push(`hashtags not in the allowed list: ${outside.map((tag) => `#${tag}`).join(' ')}`);
  }
  if (tags.length < rules.min || tags.length > rules.max) {
    problems.push(`needs ${rules.min} to ${rules.max} hashtags, got ${tags.length}`);
  }
  if (rules.maxOverlap !== null) {
    const shared = tags.filter((tag) => rules.original.includes(tag)).length;
    if (shared > rules.maxOverlap) {
      problems.push(`shares ${shared} hashtags with the original, at most ${rules.maxOverlap} allowed`);
    }
  }
  return problems;
}
