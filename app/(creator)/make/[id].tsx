// Make a post from a brief. Slideshows run here start to submit: start,
// (Freestyle) select photos, pick and edit one slide at a time, caption for
// Story and Freestyle, review, submit. Reels show a start screen and hand
// off: Handheld to the clip by clip camera (make/record/[id]), Story and
// Freestyle to the raw camera (make/raw/[id]), or to Edit my video when
// takes are already recorded. The plan lives in a local draft keyed by the
// assignment; submit builds a SlideshowDocument and goes through submitProject.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, View } from 'react-native';

import { DetailsStep } from '../../../components/creator/briefs/DetailsStep';
import { useAvatarUrl } from '../../../components/creator/briefs/FypChrome';
import { ReviewStep } from '../../../components/creator/briefs/ReviewStep';
import { StartScreen } from '../../../components/creator/briefs/StartScreen';
import {
  clearSlideshowDraft,
  deletePickFiles,
  dropMissingPhotos,
  loadSlideshowDraft,
  saveSlideshowDraft,
} from '../../../components/creator/briefs/drafts';
import {
  briefSignature,
  buildSlides,
  ctaMoves,
  ctaPlace,
  isVideoUrl,
  lockCta,
  mergeStaleDraft,
  moveCtaSlide,
  picPlacement,
  hashtagList,
  layoutOf,
  ownSlide,
  ownSlideLimits,
  plugSlide,
  slideBoxes,
  splitCaption,
  type CreatorSlide,
} from '../../../components/creator/briefs/model';
import { ReelStartScreen } from '../../../components/creator/briefs/raw/ReelStartScreen';
import { clipPlan } from '../../../components/creator/briefs/reel/plan';
import { AskAiSheet } from '../../../components/creator/briefs/slides/AskAiSheet';
import { EditStep } from '../../../components/creator/briefs/slides/EditStep';
import { FreestylePicker } from '../../../components/creator/briefs/slides/FreestylePicker';
import { PickStep } from '../../../components/creator/briefs/slides/PickStep';
import { useAuth } from '../../../lib/auth';
import { getCreatorBriefItem, type WeekBrief } from '../../../lib/briefs-api';
import { useCompany } from '../../../lib/company-context';
import {
  emptySlideshowDocument,
  newId,
  type MediaAsset,
  type Slide,
  type SlideCrop,
  type SlideImage,
  type SlideshowDocument,
} from '../../../lib/edit-document';
import { listLibraryFeatures, pickFeature, type LibraryFeature } from '../../../lib/library-api';
import { loadProject, saveProject } from '../../../lib/projects-api';
import { uploadFileToStorage } from '../../../lib/storage-upload';
import { studioAssetPath } from '../../../lib/studio-uploads';
import { submitProject, type PickedPhoto } from '../../../lib/submissions';
import { getAssignment, type AssignmentWithBrief } from '../../../lib/tasks-api';
import { color, radius, space, type } from '../../../theme/tokens';

type Phase = 'start' | 'select' | 'pick' | 'edit' | 'details' | 'review';

const SAVE_DELAY_MS = 600;
const NOTICE_MS = 4500;
/** Photos upload three at a time. */
const UPLOAD_CONCURRENCY = 3;
/** Long edge of an uploaded photo: 2x the 1080 bake keeps text crisp. */
const MAX_UPLOAD_EDGE = 2160;

type Uploaded = { assetId: string; path: string; width: number; height: number };

/** A fractional photo crop in pixels of the uploaded file; the document stores source pixels. */
function cropInPixels(crop: { x: number; y: number; width: number; height: number } | undefined, width: number, height: number): SlideCrop | null {
  if (!crop || width <= 0 || height <= 0) return null;
  return {
    x: Math.round(crop.x * width),
    y: Math.round(crop.y * height),
    width: Math.round(crop.width * width),
    height: Math.round(crop.height * height),
  };
}

/** Runs task over items, at most limit at once, results in item order. */
async function mapLimit<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await task(items[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export default function MakeScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { active } = useCompany();
  const companyId = profile?.active_company_id ?? null;
  const creatorId = profile?.id ?? null;
  const companyName = active?.name ?? 'Your team';
  const avatarUri = useAvatarUrl(profile?.avatar_path);
  const handle = `@${(profile?.full_name?.split(' ')[0] ?? 'you').toLowerCase()}`;

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [brief, setBrief] = useState<WeekBrief | null>(null);
  const [features, setFeatures] = useState<LibraryFeature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** A reel with takes already recorded opens Edit my video instead of the camera. */
  const [reelStarted, setReelStarted] = useState(false);

  const [slides, setSlides] = useState<CreatorSlide[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('start');
  const [fromReview, setFromReview] = useState(false);
  const [justPicked, setJustPicked] = useState(false);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState('');
  const [search, setSearch] = useState('');
  const [ai, setAi] = useState(false);
  const [picker, setPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hydrated = useRef(false);
  const briefSig = useRef<string | null>(null);
  /** Photos already in storage this session, by local uri, so a retry only sends what is missing. */
  const uploaded = useRef(new Map<string, Uploaded>());

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!companyId || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const [a, item, feats, draft] = await Promise.all([
          getAssignment(companyId, id),
          getCreatorBriefItem({ companyId, assignmentId: id }),
          listLibraryFeatures(companyId).catch(() => [] as LibraryFeature[]),
          loadSlideshowDraft(id),
        ]);
        if (cancelled) return;
        if (!a || !item) {
          setError('Post not found.');
          return;
        }
        if (item.brief.format === 'reel' && item.brief.kind !== 'handheld') {
          const project = await loadProject(companyId, id).catch(() => null);
          if (cancelled) return;
          setReelStarted(project?.document.format === 'video' && project.document.blocks.length > 0);
        }
        setAssignment(a);
        setBrief(item.brief);
        setFeatures(feats);
        if (item.brief.format === 'slideshow') {
          const sig = briefSignature(item.brief);
          briefSig.current = sig;
          // The draft lives through review and changes requested; once the
          // post is approved or posted it is done, files and all.
          let live = draft;
          if (live && (a.status === 'approved' || a.status === 'posted')) {
            deletePickFiles(live.slides);
            void clearSlideshowDraft(id);
            live = null;
          }
          if (live) {
            const draft = live;
            let restored = draft.slides;
            let note: string | null = null;
            // Drafts saved before the signature existed carry none; for the
            // same brief they are current and only get the sig stamped (the
            // save effect writes it). A real mismatch (another brief, a
            // manager edit, a variant that landed later) would post stale text.
            const legacy = draft.sig === undefined && (draft.briefId === undefined || draft.briefId === item.brief.id);
            if (!legacy && (draft.briefId !== item.brief.id || draft.sig !== sig)) {
              if (item.brief.kind === 'open') {
                const it = item.brief.cta;
                restored = restored
                  .filter((s) => s.own || s.role === 'cta')
                  .map((s) => (s.role === 'cta' && !s.own && it.text ? { ...s, text: it.text, insetFeatureId: it.featureId ?? s.insetFeatureId } : s));
                note = 'Your brief was updated, so your plug has the latest text.';
              } else {
                const merged = mergeStaleDraft(buildSlides(item.brief, id), restored, {
                  kind: item.brief.kind,
                  sameBrief: draft.briefId === item.brief.id,
                  place: ctaPlace(item.brief),
                });
                restored = merged.slides;
                note =
                  merged.lost === 0
                    ? 'Your brief was updated, so the slides now have the latest text. Your photos stayed.'
                    : 'Your brief was updated, so the slides now have the latest text. Pick photos for the empty slides.';
                if (merged.lost > 0) {
                  const first = restored.findIndex((s) => !s.photo);
                  setI(Math.max(0, first));
                  setPhase('pick');
                }
              }
            }
            // A CTA the manager locked since the draft was saved goes back to its place.
            restored = lockCta(restored, ctaPlace(item.brief));
            const checked = dropMissingPhotos(restored);
            restored = checked.slides;
            if (checked.missing > 0) {
              const first = restored.findIndex((s) => !s.photo);
              setI(Math.max(0, first));
              setPhase('pick');
              note = checked.missing === 1 ? 'One photo is no longer on this phone. Pick it again.' : `${checked.missing} photos are no longer on this phone. Pick them again.`;
            }
            setSlides(restored);
            setCaption(draft.caption);
            setTags(draft.tags);
            setSearch(draft.search);
            if (note) setNotice(note);
          } else {
            setSlides(buildSlides(item.brief, id));
          }
        }
        hydrated.current = true;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this post.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, id]);

  // Local draft: the plan, photos and caption survive leaving the screen.
  useEffect(() => {
    if (!hydrated.current || !id || !brief || brief.format !== 'slideshow') return;
    const briefId = brief.id;
    const sig = briefSig.current ?? undefined;
    const t = setTimeout(() => void saveSlideshowDraft(id, { briefId, sig, slides, caption, tags, search }), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [id, brief, slides, caption, tags, search]);

  const story = brief?.kind === 'story';
  const open = brief?.kind === 'open';
  const flexible = Boolean(story || open);
  const ownDetails = Boolean(story || open);
  const n = slides.length;
  const cur = slides[i];
  const limits = brief ? ownSlideLimits(brief) : { min: 1, max: 0, maxTotal: 20 };
  // Where the plug goes: locked after the hook or at the end, or the creator moves it.
  const place = brief ? ctaPlace(brief) : 'any';
  const ownCount = slides.filter((s) => s.own).length;
  const feature = cur?.insetFeatureId ? pickFeature(features, cur.insetFeatureId) : null;
  const ownLines = useMemo(() => slides.filter((s) => s.own).map((s) => s.text), [slides]);

  const patchAt = useCallback((at: number, patch: Partial<CreatorSlide>) => {
    setSlides((arr) => arr.map((s, k) => (k === at ? { ...s, ...patch } : s)));
  }, []);

  const setPhoto = (photo: PickedPhoto) => {
    patchAt(i, { photo });
    setJustPicked(true);
    setPhase('edit');
  };

  const addPhotos = (photos: PickedPhoto[]) => {
    // Freestyle keeps one place for the plug; Story and Freestyle cap own slides.
    const room = Math.max(0, Math.min(limits.max - ownCount, limits.maxTotal - n - (open && !slides.some((s) => s.role === 'cta') ? 1 : 0)));
    const take = photos.slice(0, room);
    if (take.length < photos.length) {
      setNotice(room === 0 ? `This post is full at ${limits.max} of your slides.` : `Only ${room} more fit, so the rest were left out.`);
    }
    setSlides((arr) => {
      const base = arr.filter((s) => s.role !== 'cta');
      const cta = arr.find((s) => s.role === 'cta');
      const add = take.map((photo, k) => ({ ...ownSlide(base.length + k === 0 ? 'cover' : 'point'), photo }));
      // New slides go before a closing CTA; a CTA placed earlier (Story, right
      // after the hook) stays where it is and they go at the end.
      if (cta && arr[arr.length - 1] !== cta) return lockCta([...arr, ...add], place);
      return cta ? [...base, ...add, cta] : [...base, ...add];
    });
    setPicker(false);
    setJustPicked(false);
    setPhase('edit');
  };

  const next = () => {
    setJustPicked(false);
    if (i === n - 1) {
      // Freestyle's plug slide is the only product mention; it needs its own
      // photo, so adding it goes straight to picking one.
      if (open && ensurePlug()) {
        setI(n);
        setPhase('pick');
        return;
      }
      setPhase(ownDetails ? 'details' : 'review');
      return;
    }
    setI(i + 1);
    setPhase(slides[i + 1].photo ? 'edit' : 'pick');
  };
  const prev = () => {
    setJustPicked(false);
    if (i === 0) {
      // Select again would append the whole set a second time.
      setPhase(open && slides.length === 0 ? 'select' : 'start');
      return;
    }
    setI(i - 1);
    setPhase('edit');
  };
  const addSlide = () => {
    if (ownCount >= limits.max || n >= limits.maxTotal) {
      Alert.alert('No room for another slide', `This post takes up to ${Math.min(limits.max, limits.maxTotal)} of your slides.`);
      return;
    }
    // A locked CTA keeps its place, so the new slide lands next to it instead.
    const added = ownSlide();
    const a = [...slides];
    a.splice(i + 1, 0, added);
    const placed = lockCta(a, place);
    setSlides(placed);
    setI(placed.indexOf(added));
    setJustPicked(false);
    setPhase('pick');
  };
  const removeSlide = () => {
    if (!cur?.own) return;
    setSlides((arr) => arr.filter((_, k) => k !== i).map((s, k) => (k === 0 && s.own ? { ...s, role: 'cover' } : s)));
    setI(Math.max(0, i - 1));
    setJustPicked(false);
    setPhase('edit');
  };
  /** The creator moves a plug they place one slide earlier or later; it stays selected. */
  const moveCta = (dir: -1 | 1) => {
    const moved = moveCtaSlide(slides, dir);
    if (moved === slides) return;
    setSlides(moved);
    setI(moved.findIndex((s) => s.role === 'cta'));
    setJustPicked(false);
  };
  const ctaCan = ctaMoves(slides);

  /** Adds the Freestyle plug slide when there is none; true when it added one. */
  const ensurePlug = (): boolean => {
    if (!brief || slides.some((s) => s.role === 'cta')) return false;
    const it = pickFeature(features, brief.cta.featureId);
    const text = brief.cta.text || (it ? it.cta : `${companyName} makes it easier. Link in bio.`);
    const plug = plugSlide(text, it?.id ?? brief.cta.featureId);
    setSlides((arr) => (arr.some((s) => s.role === 'cta') ? arr : [...arr, plug]));
    return true;
  };

  const backFromReview = () => {
    setFromReview(false);
    if (ownDetails) setPhase('details');
    else {
      setI(n - 1);
      setPhase('edit');
    }
  };
  const editFromReview = (k: number) => {
    setI(k);
    setJustPicked(false);
    setFromReview(true);
    setPhase('edit');
  };

  /** Sends the creator back to pick the photo for slide k, then back to review. */
  const pickFromReview = (k: number) => {
    setI(k);
    setJustPicked(false);
    setFromReview(true);
    setPhase('pick');
  };

  /** Uploads the photo (long edge 2160, JPEG) once; a retry reuses the stored path. */
  const uploadPhoto = async (photo: PickedPhoto, companyId: string, assignmentId: string): Promise<Uploaded> => {
    const hit = uploaded.current.get(photo.uri);
    if (hit) return hit;
    const src = photo.source;
    const long = src ? Math.max(src.width, src.height) : 0;
    const actions: ImageManipulator.Action[] =
      src && long > MAX_UPLOAD_EDGE ? [{ resize: src.width >= src.height ? { width: MAX_UPLOAD_EDGE } : { height: MAX_UPLOAD_EDGE } }] : [];
    const jpeg = await ImageManipulator.manipulateAsync(photo.uri, actions, { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
    const asset: MediaAsset = { id: newId('a'), kind: 'image', localUri: photo.uri, storagePath: null, durationMs: null, width: jpeg.width, height: jpeg.height };
    const path = studioAssetPath(companyId, assignmentId, asset);
    await uploadFileToStorage({ bucket: 'videos', path, localUri: jpeg.uri, contentType: 'image/jpeg', upsert: true });
    const done: Uploaded = { assetId: asset.id, path, width: jpeg.width, height: jpeg.height };
    uploaded.current.set(photo.uri, done);
    return done;
  };

  /** The feature screenshot and the manager's stickers, placed for both feeds. */
  const slidePictures = (s: CreatorSlide): { inset?: SlideImage; pics?: SlideImage[] } => {
    const out: { inset?: SlideImage; pics?: SlideImage[] } = {};
    const shot = s.insetFeatureId ? pickFeature(features, s.insetFeatureId)?.screenshotUrl : null;
    // Only still screenshots bake; a clip URL stays off the slide like the legacy path.
    if (shot && !isVideoUrl(shot)) {
      const t = layoutOf(s, 'tiktok').inset;
      const g = layoutOf(s, 'instagram').inset;
      out.inset = { path: shot, x: t.x, y: t.y, width: t.w, ig: { x: g.x, y: g.y, width: g.w } };
    }
    if (s.pics?.length) {
      out.pics = s.pics.map((p) => {
        const g = picPlacement(p.box, 'instagram');
        return { path: p.src, x: p.box.x, y: p.box.y, width: p.box.w, ig: { x: g.x, y: g.y, width: g.w } };
      });
    }
    return out;
  };

  const submit = async () => {
    if (!assignment || !brief || !companyId || !creatorId || !id || submitting) return;
    if (slides.length === 0) {
      Alert.alert('Add at least one photo');
      return;
    }
    // Every slide posts, so every slide needs its photo; the plug most of all.
    const missing = slides.findIndex((s) => !s.photo);
    if (missing >= 0) {
      const plug = slides[missing].role === 'cta';
      Alert.alert(
        `Slide ${missing + 1} needs a photo`,
        plug ? 'Your plug slide is the one that mentions the product. Add a photo so it posts.' : 'Every slide needs a photo before you send.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Add photo', onPress: () => pickFromReview(missing) },
        ],
      );
      return;
    }
    setSubmitting(true);
    const total = slides.length;
    let done = 0;
    setProgress({ done: 0, total });
    try {
      const ups = await mapLimit(slides, UPLOAD_CONCURRENCY, async (s) => {
        const up = await uploadPhoto(s.photo as PickedPhoto, companyId, id);
        done += 1;
        setProgress({ done, total });
        return up;
      });
      const assets: MediaAsset[] = ups.map((u, k) => ({
        id: u.assetId,
        kind: 'image',
        localUri: slides[k].photo?.uri ?? null,
        storagePath: u.path,
        durationMs: null,
        width: u.width,
        height: u.height,
      }));
      const docSlides: Slide[] = slides.map((s, k) => {
        const photo = s.photo as PickedPhoto;
        const u = ups[k];
        return {
          id: newId('s'),
          assetId: u.assetId,
          crop: cropInPixels(photo.crop, u.width, u.height),
          instagramCrop: cropInPixels(photo.cropInstagram, u.width, u.height),
          boxes: slideBoxes(s, 'tiktok'),
          instagramBoxes: slideBoxes(s, 'instagram'),
          ...slidePictures(s),
        };
      });
      const doc: SlideshowDocument = { ...emptySlideshowDocument('9:16'), assets, slides: docSlides };
      setProgress(null);
      const projectId = await saveProject({ companyId, creatorId, assignmentId: id, document: doc });
      await submitProject({
        assignment,
        companyId,
        creatorId,
        projectId,
        document: doc,
        ...(ownDetails ? { caption: caption.trim(), hashtags: hashtagList(tags) } : {}),
      });
      // The draft and the picked files stay until the post is approved or
      // posted, so changes requested opens on the same slides and photos.
      router.replace({
        pathname: '/(creator)/make/sent',
        params: { assignmentId: id, title: open && !brief.title ? 'Your freestyle post' : brief.title },
      });
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  if (loading || !brief) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={color.blue500} />}
      </View>
    );
  }

  if (brief.format === 'reel' && brief.kind === 'handheld') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <StartScreen
          brief={brief}
          companyName={companyName}
          clipCount={clipPlan(brief).length}
          onBack={() => router.back()}
          onGo={() => router.replace({ pathname: '/(creator)/make/record/[id]', params: { id } })}
        />
      </>
    );
  }

  if (brief.format === 'reel') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ReelStartScreen
          brief={brief}
          companyName={companyName}
          resume={reelStarted}
          onBack={() => router.back()}
          onGo={() => router.replace({ pathname: reelStarted ? '/(creator)/make/cut/[id]' : '/(creator)/make/raw/[id]', params: { id } })}
        />
      </>
    );
  }

  // Handheld posts go out with this creator's varied caption when vary-copy wrote one.
  const varied = assignment?.caption ? splitCaption(assignment.caption) : null;
  const capText = ownDetails ? caption : varied ? varied.text : splitCaption(brief.caption).text;
  const tagText = ownDetails
    ? tags
    : varied
      ? varied.tags
      : brief.hashtags.length
        ? brief.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')
        : splitCaption(brief.caption).tags;

  let body: JSX.Element;
  if (phase === 'start') {
    body = (
      <StartScreen
        brief={brief}
        companyName={companyName}
        onBack={() => router.back()}
        onGo={() => {
          if (open) setPhase(slides.length ? 'edit' : 'select');
          else {
            setI(0);
            setPhase(slides[0]?.photo ? 'edit' : 'pick');
          }
        }}
      />
    );
  } else if (phase === 'select') {
    body = (
      <FreestylePicker
        min={limits.min}
        onDone={(photos) => {
          setI(0);
          addPhotos(photos);
        }}
        onClose={() => setPhase('start')}
      />
    );
  } else if (phase === 'details') {
    body = (
      <DetailsStep
        brief={brief}
        lines={ownLines}
        caption={caption}
        tags={tags}
        search={search}
        onChange={(v) => {
          setCaption(v.caption);
          setTags(v.tags);
          setSearch(v.search);
        }}
        onBack={() => {
          setI(n - 1);
          setPhase('edit');
        }}
        onReview={() => setPhase('review')}
      />
    );
  } else if (phase === 'review') {
    body = (
      <ReviewStep
        format="slideshow"
        slides={slides}
        feature={pickFeature(features, slides.find((s) => s.role === 'cta')?.insetFeatureId ?? brief.cta.featureId)}
        features={features}
        caption={capText}
        tags={tagText}
        handle={handle}
        avatarUri={avatarUri}
        initial={i}
        submitting={submitting}
        submitLabel={progress ? `Uploading ${Math.min(progress.total, progress.done + 1)} of ${progress.total}` : undefined}
        onBack={backFromReview}
        onEdit={editFromReview}
        onSubmit={() => void submit()}
      />
    );
  } else if (phase === 'edit' && cur) {
    body = (
      <EditStep
        key={i}
        slides={slides}
        index={i}
        feature={feature}
        flexible={flexible}
        open={Boolean(open)}
        ownDetails={ownDetails}
        fromReview={fromReview}
        autoCrop={justPicked}
        minOwn={flexible ? limits.min : 1}
        onBack={fromReview ? () => { setFromReview(false); setPhase('review'); } : prev}
        onNext={next}
        onDone={() => {
          setFromReview(false);
          setPhase('review');
        }}
        onChangePhoto={() => setPhase('pick')}
        onAddSlide={addSlide}
        onRemoveSlide={removeSlide}
        ctaMove={place === 'any' && cur.role === 'cta' && (ctaCan.earlier || ctaCan.later) ? { earlier: ctaCan.earlier, later: ctaCan.later, onMove: moveCta } : undefined}
        onPatch={(s) => patchAt(i, s)}
        onSelect={(k) => {
          setJustPicked(false);
          setI(k);
        }}
        onAskAi={() => setAi(true)}
        onAddPhotos={() => setPicker(true)}
      />
    );
  } else if (cur) {
    body = (
      <PickStep
        slides={slides}
        index={i}
        title={brief.title}
        feature={feature}
        flexible={flexible}
        onBack={fromReview ? () => { setFromReview(false); setPhase('review'); } : prev}
        onPhoto={setPhoto}
      />
    );
  } else {
    body = (
      <StartScreen brief={brief} companyName={companyName} onBack={() => router.back()} onGo={() => setPhase(open ? 'select' : 'pick')} />
    );
  }

  const ownIndex = cur?.own ? slides.filter((s) => s.own).findIndex((s) => s.id === cur.id) : -1;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {body}
      {notice ? (
        <View pointerEvents="none" style={styles.noticeWrap}>
          <Text style={styles.notice}>{notice}</Text>
        </View>
      ) : null}
      <AskAiSheet
        visible={ai}
        brief={brief}
        lines={ownLines}
        lineIndex={ownIndex}
        targetId={cur?.own ? cur.id : undefined}
        onApplyHook={(t) => {
          const at = slides.findIndex((s) => s.role === 'cover');
          patchAt(at >= 0 ? at : 0, { text: t });
        }}
        onApplyLine={(t, target) => {
          if (!target) return;
          setSlides((arr) => arr.map((s) => (s.id === target ? { ...s, text: t } : s)));
        }}
        onApplyAll={(items) =>
          setSlides((arr) => {
            let j = 0;
            return arr.map((s) => (s.own ? { ...s, text: items[j++] ?? s.text } : s));
          })
        }
        onAddSlides={() => setPicker(true)}
        onClose={() => setAi(false)}
      />
      <Modal visible={picker} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setPicker(false)}>
        <FreestylePicker title="Add photos" onDone={addPhotos} onClose={() => setPicker(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.offWhite },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.offWhite },
  error: { fontSize: type.size.body, color: color.ink, textAlign: 'center', paddingHorizontal: space[8] },
  noticeWrap: { position: 'absolute', top: 64, left: space[4], right: space[4], alignItems: 'center' },
  notice: {
    overflow: 'hidden',
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: color.ink,
    color: color.white,
    fontSize: type.size.body,
    textAlign: 'center',
  },
});
