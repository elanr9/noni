// A Slideshow template as editable slides and back. Each template clip is one
// slide; the slide carries the clip's on-screen document (texts and pictures).
// Saving walks the slides in order: a known id keeps its clip (script, CTA,
// green screen fields), a new id becomes a new clip, and clips whose slide was
// deleted drop out. onScreen is rebuilt from the slide's texts.
import { clipOverlays, clipTexts, newClip, uid, type BriefClip, type ClipDoc, type GuidedState } from './brief-library';

export type TemplateSlide = { id: string; doc: ClipDoc };

/** One slide per clip, its texts (or the default text from onScreen) and pictures. */
export function slideshowToSlides(g: Pick<GuidedState, 'clips'>): TemplateSlide[] {
  return g.clips.map((c) => ({ id: c.id, doc: { texts: clipTexts(c).map((t) => ({ ...t, spans: t.spans.slice() })), overlays: clipOverlays(c).slice() } }));
}

/** On-screen line for thumbnails and the creator: the slide's words joined. */
export function slideOnScreen(doc: ClipDoc): string {
  return doc.texts
    .map((t) => t.text.trim())
    .filter(Boolean)
    .join(' · ');
}

/** The edited slides back onto the template's clips, in slide order. */
export function slidesToTemplate(slides: TemplateSlide[], g: Pick<GuidedState, 'clips'>): BriefClip[] {
  return slides.map((s) => {
    const prev = g.clips.find((c) => c.id === s.id) ?? newClip('', { id: s.id });
    const texts = s.doc.texts.filter((t) => t.text.trim().length > 0);
    return { ...prev, doc: { texts, overlays: s.doc.overlays }, onScreen: slideOnScreen({ texts, overlays: [] }) };
  });
}

/** An empty slide for the Add slide tile. */
export function newTemplateSlide(): TemplateSlide {
  return { id: uid(), doc: { texts: [], overlays: [] } };
}

/** Move the slide at `from` to `to`, clamped to the deck. */
export function moveSlide(slides: TemplateSlide[], from: number, to: number): TemplateSlide[] {
  const j = Math.max(0, Math.min(slides.length - 1, to));
  if (from === j || from < 0 || from >= slides.length) return slides;
  const a = slides.slice();
  const [m] = a.splice(from, 1);
  a.splice(j, 0, m);
  return a;
}
