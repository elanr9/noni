// creator_projects: the studio's saved work in progress, one row per
// assignment. The document is parsed on the way in so a stale or hand
// edited row degrades to an empty document instead of a crash.
import {
  emptySlideshowDocument,
  emptyVideoDocument,
  parseEditDocument,
  serializeEditDocument,
  type EditDocument,
  type SlideAspect,
} from './edit-document';
import { supabase } from './supabase';

export type CreatorProject = {
  id: string;
  companyId: string;
  creatorId: string;
  assignmentId: string;
  document: EditDocument;
  updatedAt: string;
};

export async function loadProject(companyId: string, assignmentId: string): Promise<CreatorProject | null> {
  const { data, error } = await supabase
    .from('creator_projects')
    .select('id, company_id, creator_id, assignment_id, format, document, updated_at')
    .eq('company_id', companyId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.assignment_id) return null;
  const parsed = parseEditDocument(data.document);
  const document =
    parsed ?? (data.format === 'slideshow' ? emptySlideshowDocument() : emptyVideoDocument());
  return {
    id: data.id,
    companyId: data.company_id,
    creatorId: data.creator_id,
    assignmentId: data.assignment_id,
    document,
    updatedAt: data.updated_at,
  };
}

export async function saveProject(params: {
  companyId: string;
  creatorId: string;
  assignmentId: string;
  document: EditDocument;
}): Promise<string> {
  const { companyId, creatorId, assignmentId, document } = params;
  const { data, error } = await supabase
    .from('creator_projects')
    .upsert(
      {
        company_id: companyId,
        creator_id: creatorId,
        assignment_id: assignmentId,
        format: document.format,
        document: serializeEditDocument(document),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id' },
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteProject(companyId: string, assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from('creator_projects')
    .delete()
    .eq('company_id', companyId)
    .eq('assignment_id', assignmentId);
  if (error) throw error;
}

export function startingDocument(format: 'video' | 'photo_carousel', aspect: SlideAspect): EditDocument {
  return format === 'photo_carousel' ? emptySlideshowDocument(aspect) : emptyVideoDocument();
}
