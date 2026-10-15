// Where "Record" and "Record changes" go for a brief made in the new brief
// editor (it parses with weekBriefFromRow): slideshows run in make/[id];
// reels start there too. Handheld reels record clip by clip in
// make/record/[id] (changes reopen the flagged clips there); Story and
// Freestyle reels record raw in make/raw/[id] and changes reopen them in
// Edit my video (make/cut/[id]). Older briefs return null and keep the
// legacy recorder and upload screens.
import type { Href } from 'expo-router';

import { weekBriefFromRow, type Brief, type BriefWithType } from '../../../../lib/briefs-api';

export function makeHref(
  brief: Brief | BriefWithType,
  assignmentId: string,
  opts: { changes?: boolean; flags?: string[] } = {},
): Href | null {
  const week = weekBriefFromRow({ post_types: null, ...brief });
  if (!week) return null;
  if (week.format === 'slideshow') return { pathname: '/(creator)/make/[id]', params: { id: assignmentId } };
  if (!opts.changes) return { pathname: '/(creator)/make/[id]', params: { id: assignmentId } };
  if (week.kind !== 'handheld') return { pathname: '/(creator)/make/cut/[id]', params: { id: assignmentId, from: 'changes' } };
  const flags = (opts.flags ?? []).map((f) => f.trim()).filter((f) => f !== '');
  return {
    pathname: '/(creator)/make/record/[id]',
    params: { id: assignmentId, from: 'changes', ...(flags.length > 0 ? { flags: flags.join('|') } : {}) },
  };
}
