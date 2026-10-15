// Deterministic checks on what the model wrote. index.ts patches what code
// can (dashes, semicolons, numbering, cover colons, hedges, hashtag count);
// what still fails goes back to the model once, failing slides only.

import type { Format, Shape } from './specs.ts';

export type Role = 'cover' | 'point' | 'cta';

/** Where the CTA goes: locked right after the hook, locked last, or any (each creator places it). */
export type CtaPlace = 'after_hook' | 'end' | 'any';
export type InSlide = { role: Role; text: string; shot: string; inset_feature_id: string | null; own?: boolean; place?: CtaPlace };
export type OutSlide = { text: string; shot: string; feature_id: string | null; changed: boolean };

/** Lines that read as machine written, ad copy, or manufactured insider bait. */
export const SLOP: [RegExp, string][] = [
  [/won'?t tell you/i, 'manufactured villain'],
  [/(don'?t|do not) want you to (know|see)/i, 'conspiracy framing'],
  [/what they don'?t/i, 'conspiracy framing'],
  [/the truth about/i, 'bait framing'],
  [/here'?s the (truth|thing|deal)/i, 'throat clearing'],
  [/let that sink in/i, 'filler'],
  [/game ?changer/i, 'marketing word'],
  [/level up/i, 'marketing word'],
  [/\bunlock/i, 'marketing word'],
  [/\belite\b/i, 'marketing word'],
  [/\bultimate\b/i, 'marketing word'],
  [/\bsecrets?\b/i, 'bait word'],
  [/\bhacks?\b/i, 'bait word'],
  [/\bseamless/i, 'marketing word'],
  [/\bleverag/i, 'marketing word'],
  [/\bjourney\b/i, 'marketing word'],
  [/\bcrucial\b/i, 'marketing word'],
  [/\bessential\b/i, 'marketing word'],
  [/\bunleash/i, 'marketing word'],
  [/\bsupercharge/i, 'marketing word'],
  [/\bstreamlin/i, 'marketing word'],
  [/\bdive (in|into)\b/i, 'filler'],
  [/\bin today'?s\b/i, 'filler'],
  [/\bstand out\b/i, 'marketing phrase'],
  [/\bperfect\b/i, 'marketing word'],
  [/\bnot just\b[^.]*\bit'?s\b/i, 'negation then correction'],
  [/\bisn'?t about\b[^.]*\bit'?s about\b/i, 'negation then correction'],
  [/\bin this (video|post)\b/i, 'throat clearing'],
  [/\bfollow for more\b/i, 'engagement bait'],
  [/\blet me know in the comments\b/i, 'engagement bait'],
  [/\bhere'?s why\b|\bhere is why\b/i, 'setup line'],
  [/\bthe real (problem|issue|reason|secret|truth)\b/i, 'fake reveal'],
  [/\bsay you used to\b/i, 'instruction instead of an idea'],
  [/\bsay what your\b/i, 'instruction instead of an idea'],
  [/\band it\b[^.!?\n]{0,60}\bevery time\b/i, 'stacked list'],
  [/\band it\b[^.!?\n]*\band it\b/i, 'stacked list'],
  [/^(so|okay|ok|look|listen|alright),\s/im, 'generic opener'],
  [/\b(hey guys|what'?s up guys)\b/i, 'generic opener'],
  [/\blet'?s talk about\b/i, 'generic opener'],
  [/\bi want to talk about\b/i, 'generic opener'],
  [/\bhave you ever (wondered|noticed|thought)\b/i, 'generic opener'],
];

/** The ad read; allowed only when the brand docs' CTA mechanic is the bio. */
export const BIO_READ = /\b(it'?s|it is) in my bio\b|\blink (is )?in (my )?bio\b|\bcheck (out )?my bio\b/i;

/** A reel cue that instructs the creator instead of giving the idea. */
export const CUE_LEAD = /^\s*(say|talk about|talk through|mention|explain|describe|tell (them|the viewer|people|everyone))\b/i;

/** Sentences in a line; a number like 3.5 is not a stop. */
export const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=\S)/).map((x) => x.trim()).filter((x) => /[a-z0-9]/i.test(x)).length;

export const HEDGES = /\b(really|truly|actually|honestly|simply|literally)\b/i;

export const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Colons out of a cover; times like 7:30 stay. */
export const dropColons = (t: string) => t.replace(/(?<!\d):|:(?!\d)/g, ' ').replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').trim();

export function slopHits(text: string): string[] {
  const out: string[] = [];
  for (const [re, why] of SLOP) {
    const m = text.match(re);
    if (m) out.push(`"${m[0]}" (${why})`);
  }
  return out;
}

const normalize = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Word set overlap; 1 means the same words. */
export function overlap(a: string, b: string): number {
  const x = new Set(normalize(a).split(' ').filter((w) => w.length > 2));
  const y = new Set(normalize(b).split(' ').filter((w) => w.length > 2));
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.min(x.size, y.size);
}

export function checkDeck(args: {
  out: OutSlide[];
  slides: InSlide[];
  writable: Set<number>;
  shape: Shape;
  productName: string;
  banned: string[];
  numbered: boolean;
  details: { caption: string; hashtags: string[] } | null;
  /** Freestyle posts with no CTA slide may name the product inside one slide. */
  plugInBody?: boolean;
  /** Turns on the one line cue and one sentence slide rules. */
  format?: Format;
  /** The brand docs' CTA mechanic is the bio, so "in my bio" is allowed. */
  allowBio?: boolean;
}): string[] {
  const { out, slides, writable, shape, productName, banned, numbered, details, plugInBody = false, format, allowBio = false } = args;
  const fails: string[] = [];
  const name = productName.toLowerCase();
  let n = 0;
  out.forEach((s, i) => {
    const role = slides[i].role;
    if (role !== 'cover') n++;
    if (!writable.has(i) || (!s.changed && s.text.trim())) return;
    const [tmin, tmax] = role === 'cover' ? shape.coverText : role === 'cta' ? shape.ctaText : shape.pointText;
    const shotRange = role === 'cover' ? shape.coverShot : role === 'cta' ? shape.ctaShot : shape.pointShot;
    const w = words(s.text);
    if (!s.text.trim()) fails.push(`[${i}] text is empty; write it`);
    else if (w < tmin || w > tmax) fails.push(`[${i}] text is ${w} words; it must be ${tmin} to ${tmax}`);
    if (shotRange) {
      const sw = words(s.shot);
      if (!s.shot.trim()) fails.push(`[${i}] shot is empty; write it`);
      else if (sw > shotRange[1] || sw < shotRange[0]) fails.push(`[${i}] shot is ${sw} words; it must be ${shotRange[0]} to ${shotRange[1]}`);
      if (format === 'reel' && s.shot.trim()) {
        if (/\n/.test(s.shot.trim())) fails.push(`[${i}] the cue runs over more than one line; one line only`);
        const lead = s.shot.match(CUE_LEAD);
        if (lead) fails.push(`[${i}] the cue starts with "${lead[1]}"; write the idea itself, not an instruction about what to say`);
      }
    }
    if (format === 'slideshow' && role !== 'cover' && s.text.trim()) {
      const lines = s.text.trim().split('\n').filter((l) => l.trim());
      if (lines.length > 2) fails.push(`[${i}] text is ${lines.length} lines; a header and at most one short sentence`);
      else if (lines.length === 2 && sentences(lines[1]) > 1) fails.push(`[${i}] line two has ${sentences(lines[1])} sentences; keep one short sentence`);
    }
    if (format === 'reel' && role !== 'cover' && /\n/.test(s.text.trim())) fails.push(`[${i}] the on screen label runs over one line; one line only`);
    const both = `${s.text}\n${s.shot}`;
    if (!allowBio && BIO_READ.test(both)) fails.push(`[${i}] reads like an ad ("in my bio"); make the CTA a tip with ${productName} in it`);
    for (const hit of slopHits(both)) fails.push(`[${i}] uses ${hit}; say it plainly`);
    const hedge = both.match(HEDGES);
    if (hedge) fails.push(`[${i}] has the hedge word "${hedge[0]}"; cut it`);
    for (const b of banned) if (b && both.toLowerCase().includes(b.toLowerCase())) fails.push(`[${i}] uses the banned phrase "${b}"`);
    if (role === 'cover' && s.text.includes(':')) fails.push(`[${i}] the cover has a colon; covers are said, not written`);
    if (role === 'cta') {
      if (!both.toLowerCase().includes(name)) fails.push(`[${i}] the CTA never names ${productName}; name it`);
      if (!/\b(i|i'm|i've|i'd|my|me)\b/i.test(both)) fails.push(`[${i}] the CTA is not first person; the creator says it as their own tool`);
    } else if (!plugInBody && both.toLowerCase().includes(name)) {
      fails.push(`[${i}] names ${productName} outside the CTA slide; only the CTA names it`);
    }
    if (numbered && role !== 'cover' && !new RegExp(`^\\s*${n}[.)]`).test(s.text)) {
      fails.push(`[${i}] must start with its number "${n}."`);
    }
  });
  // Repeats across the whole deck, typed slides included.
  for (let a = 0; a < out.length; a++) {
    for (let b = a + 1; b < out.length; b++) {
      if (!(writable.has(a) || writable.has(b))) continue;
      if (!out[a].text.trim() || !out[b].text.trim()) continue;
      if (slides[a].role === 'cover' || slides[b].role === 'cover') continue;
      const head = (t: string) => (t.split('\n')[0] ?? '').replace(/^\s*\d+[.)]\s*/, '');
      const body = (t: string) => t.replace(/^\s*\d+[.)]\s*/, '');
      if (overlap(head(out[a].text), head(out[b].text)) > 0.75 || overlap(body(out[a].text), body(out[b].text)) > 0.7) {
        fails.push(`[${writable.has(b) ? b : a}] makes the same point as [${writable.has(b) ? a : b}]; make a different point`);
      }
    }
  }
  if (details) {
    if (!details.caption.trim()) fails.push('caption is empty');
    if (details.caption.length > 220) fails.push(`caption is ${details.caption.length} characters; keep it under 180`);
    if (/#\w/.test(details.caption)) fails.push('caption has hashtags inside it; move them to hashtags');
    for (const hit of slopHits(details.caption)) fails.push(`caption uses ${hit}`);
    if (!details.caption.toLowerCase().includes(name)) fails.push(`caption never mentions ${productName}`);
    if (details.hashtags.length < 3 || details.hashtags.length > 5) fails.push(`hashtags has ${details.hashtags.length}; give 3 to 5`);
  }
  return fails;
}
