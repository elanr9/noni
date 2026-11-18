/**
 * Where an unfinished creator post picks up. Creator-started posts (migration
 * 123) have a weekly brief with no kind, so the v1 make flow cannot open
 * them; this reads the post's format, its saved project and the library
 * brief it came from and answers with the v2 screen that continues it.
 */
import type { Href } from 'expo-router';

import type { Brief } from './brief-library';
import { loadProject } from './projects-api';
import { getAssignment } from './tasks-api';
import type { PostState } from './v2-posts';

export type ResumePlan =
  | { kind: 'editor'; href: Href }
  | { kind: 'record'; href: Href }
  | { kind: 'slides'; href: Href }
  | { kind: 'detail'; href: Href };

/** The detail screen: status, the sent media, the manager's notes. */
export function postDetailHref(assignmentId: string): Href {
  return { pathname: '/(creator)/assignment/[id]', params: { id: assignmentId } };
}

/** Tap target for a post row: live posts show their stats, unfinished ones resume, the rest open the detail. */
export function postTapHref(p: { assignmentId: string | null; state: PostState }): Href | null {
  if (!p.assignmentId) return null;
  if (p.state === 'Posted') return { pathname: '/(creator)/posts/[id]', params: { id: p.assignmentId } };
  if (p.state === 'Recording') return { pathname: '/(creator)/resume/[id]', params: { id: p.assignmentId } };
  return postDetailHref(p.assignmentId);
}

function recordMode(brief: Brief | undefined): 'guided' | 'outline' | 'free' {
  if (!brief) return 'free';
  if (brief.kind === 'Guided') return 'guided';
  return 'outline';
}

/**
 * The screen that continues a post. Reels with an edit in progress open the
 * editor; reels with only clips (or nothing yet) reopen the camera on the
 * same post; slideshows reopen the maker for their library brief.
 */
export async function planResume(params: {
  companyId: string;
  assignmentId: string;
  libraryBrief: (id: string) => Brief | undefined;
}): Promise<ResumePlan> {
  const { companyId, assignmentId } = params;
  const a = await getAssignment(companyId, assignmentId);
  if (!a) throw new Error('This post is no longer available');
  const open = a.status === 'assigned' || a.status === 'recorded' || a.status === 'changes_requested';
  if (!open) return { kind: 'detail', href: postDetailHref(assignmentId) };

  const libId = a.library_brief_id ?? null;
  const lib = libId ? params.libraryBrief(libId) : undefined;
  const slideshow = a.briefs?.format === 'photo_carousel' || lib?.type === 'Slideshow';
  if (slideshow) {
    if (libId && lib) return { kind: 'slides', href: { pathname: '/(creator)/slides/[id]', params: { id: libId, post: assignmentId } } };
    return { kind: 'detail', href: postDetailHref(assignmentId) };
  }

  const project = await loadProject(companyId, assignmentId).catch(() => null);
  if (project && project.document.format === 'video' && project.document.blocks.length > 0) {
    return { kind: 'editor', href: { pathname: '/(creator)/edit/[id]', params: { id: assignmentId } } };
  }
  const mode = recordMode(lib);
  return {
    kind: 'record',
    href: { pathname: '/(creator)/capture', params: { mode, post: assignmentId, ...(lib ? { id: lib.id } : {}) } },
  };
}
