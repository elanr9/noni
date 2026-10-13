// Title to Library feature, by meaning, then the feature's plug line shaped
// to the post type so it reads as the last slide of that post, not an ad
// (SSFlow.jsx matchFeature). Stand-in until the backend matches features.

import type { LibraryFeature } from '../../../../lib/library-api';
import { pickFeature } from '../../../../lib/library-api';

const RULES: [RegExp, string][] = [
  [/highlight|film|clip|video|footage/, 'hl'],
  [/reply|respond|message|text back|follow.?up/, 'reply'],
  [/inbox|unread|dm/, 'inbox'],
  [/email|outreach|reach out|cold|campaign/, 'sent'],
  [/which school|find school|search|programs? (i|you) can|d1|d2|d3|division|recruited/, 'search'],
  [/one school|chance|acceptance|cost|tuition|scholarship/, 'school'],
  [/plan|priorit|fit|matters/, 'bestfit'],
];

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function byKey(features: LibraryFeature[], key: string): LibraryFeature | undefined {
  return features.find((f) => slugOf(f.title).includes(key));
}

export function matchFeature(
  features: LibraryFeature[],
  title: string,
  postTypeId: string | null | undefined,
  n: number | null,
  forceId?: string | null,
): { feature: LibraryFeature; cta: string } | null {
  const t = title.toLowerCase();
  let feature = pickFeature(features, null);
  for (const [re, key] of RULES) {
    if (re.test(t)) {
      feature = byKey(features, key) ?? feature;
      break;
    }
  }
  if (forceId) feature = pickFeature(features, forceId) ?? feature;
  if (!feature) return null;
  const hook = feature.cta.trim();
  const num = n ? `${n}` : null;
  const shaped =
    postTypeId === 'howto'
      ? `${num ? `Step ${num}` : 'Last step'}: ${hook}`
      : postTypeId === 'tips'
        ? `${num ? `Tip ${num}` : 'Last tip'}: ${hook}`
        : postTypeId === 'start'
          ? `${num ? `Step ${num}` : 'Start here'}: ${hook}`
          : postTypeId === 'myths'
            ? `${num ? `Myth ${num}, busted` : 'Truth'}: ${hook}`
            : postTypeId === 'storytime'
              ? `Then I found it. ${hook}`
              : hook;
  return { feature, cta: shaped };
}
