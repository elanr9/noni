// Make a post from a brief. Slideshows run here start to submit: start,
// (Freestyle) select photos, pick and edit one slide at a time, caption for
// Story and Freestyle, review, submit. Reels show the start screen and hand
// off to make/record/[id]. The plan lives in a local draft keyed by the
// assignment; submit builds a SlideshowDocument and goes through submitProject.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, View } from 'react-native';

import { DetailsStep } from '../../../components/creator/briefs/DetailsStep';
import { useAvatarUrl } from '../../../components/creator/briefs/FypChrome';
import { ReviewStep } from '../../../components/creator/briefs/ReviewStep';
import { StartScreen } from '../../../components/creator/briefs/StartScreen';
import { clearSlideshowDraft, loadSlideshowDraft, saveSlideshowDraft } from '../../../components/creator/briefs/drafts';
import {
  buildSlides,
  ownSlide,
  plugSlide,
  slideBoxes,
  splitCaption,
  type CreatorSlide,
} from '../../../components/creator/briefs/model';
import { clipPlan } from '../../../components/creator/briefs/reel/plan';
import { AskAiSheet } from '../../../components/creator/briefs/slides/AskAiSheet';
import { EditStep } from '../../../components/creator/briefs/slides/EditStep';
import { FreestylePicker } from '../../../components/creator/briefs/slides/FreestylePicker';
import { PickStep } from '../../../components/creator/briefs/slides/PickStep';
import { useAuth } from '../../../lib/auth';
import { getCreatorBriefItem, type WeekBrief } from '../../../lib/briefs-api';
import { useCompany } from '../../../lib/company-context';
import { emptySlideshowDocument, newId, type MediaAsset, type Slide, type SlideshowDocument } from '../../../lib/edit-document';
import { listLibraryFeatures, pickFeature, type LibraryFeature } from '../../../lib/library-api';
import { saveProject } from '../../../lib/projects-api';
import { uploadFileToStorage } from '../../../lib/storage-upload';
import { studioAssetPath } from '../../../lib/studio-uploads';
import { submitProject, type PickedPhoto } from '../../../lib/submissions';
import { getAssignment, type AssignmentWithBrief } from '../../../lib/tasks-api';
import { color, space, type } from '../../../theme/tokens';

type Phase = 'start' | 'select' | 'pick' | 'edit' | 'details' | 'review';

const SAVE_DELAY_MS = 600;

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
  const hydrated = useRef(false);

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
        setAssignment(a);
        setBrief(item.brief);
        setFeatures(feats);
        if (item.brief.format === 'slideshow') {
          if (draft) {
            setSlides(draft.slides);
            setCaption(draft.caption);
            setTags(draft.tags);
            setSearch(draft.search);
          } else {
            setSlides(buildSlides(item.brief));
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
    if (!hydrated.current || !id || brief?.format !== 'slideshow') return;
    const t = setTimeout(() => void saveSlideshowDraft(id, { slides, caption, tags, search }), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [id, brief?.format, slides, caption, tags, search]);

  const story = brief?.kind === 'story';
  const open = brief?.kind === 'open';
  const flexible = Boolean(story || open);
  const ownDetails = Boolean(story || open);
  const n = slides.length;
  const cur = slides[i];
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
    setSlides((arr) => {
      const base = arr.filter((s) => s.role !== 'cta');
      const cta = arr.find((s) => s.role === 'cta');
      const add = photos.map((photo, k) => ({ ...ownSlide(base.length + k === 0 ? 'cover' : 'point'), photo }));
      return cta ? [...base, ...add, cta] : [...base, ...add];
    });
    setPicker(false);
    setJustPicked(false);
    setPhase('edit');
  };

  const next = () => {
    setJustPicked(false);
    if (i === n - 1) {
      if (open) ensurePlug();
      setPhase(ownDetails ? 'details' : 'review');
      return;
    }
    setI(i + 1);
    setPhase(slides[i + 1].photo ? 'edit' : 'pick');
  };
  const prev = () => {
    setJustPicked(false);
    if (i === 0) {
      setPhase(open ? 'select' : 'start');
      return;
    }
    setI(i - 1);
    setPhase('edit');
  };
  const addSlide = () => {
    setSlides((arr) => {
      const a = [...arr];
      a.splice(i + 1, 0, ownSlide());
      return a;
    });
    setI(i + 1);
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
  const ensurePlug = () => {
    if (!brief) return;
    setSlides((arr) => {
      if (arr.some((s) => s.role === 'cta')) return arr;
      const it = pickFeature(features, brief.cta.featureId);
      const text = brief.cta.text || (it ? it.cta : `${companyName} makes it easier. Link in bio.`);
      return [...arr, plugSlide(text, it?.id ?? brief.cta.featureId)];
    });
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

  const submit = async () => {
    if (!assignment || !brief || !companyId || !creatorId || !id || submitting) return;
    const ready = slides.filter((s) => s.photo);
    if (ready.length === 0) {
      Alert.alert('Add at least one photo');
      return;
    }
    setSubmitting(true);
    try {
      let doc: SlideshowDocument = emptySlideshowDocument('9:16');
      const assets: MediaAsset[] = [];
      const docSlides: Slide[] = [];
      for (const s of ready) {
        const photo = s.photo as PickedPhoto;
        const asset: MediaAsset = {
          id: newId('a'),
          kind: 'image',
          localUri: photo.uri,
          storagePath: null,
          durationMs: null,
          width: photo.source?.width ?? null,
          height: photo.source?.height ?? null,
        };
        const path = studioAssetPath(companyId, id, asset);
        const jpeg = await ImageManipulator.manipulateAsync(photo.uri, [], { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
        await uploadFileToStorage({ bucket: 'videos', path, localUri: jpeg.uri, contentType: 'image/jpeg' });
        assets.push({ ...asset, storagePath: path });
        docSlides.push({
          id: newId('s'),
          assetId: asset.id,
          crop: photo.crop ?? null,
          instagramCrop: photo.cropInstagram ?? null,
          boxes: slideBoxes(s, 'tiktok'),
        });
      }
      doc = { ...doc, assets, slides: docSlides };
      const projectId = await saveProject({ companyId, creatorId, assignmentId: id, document: doc });
      await submitProject({ assignment, companyId, creatorId, projectId, document: doc });
      await clearSlideshowDraft(id);
      router.replace({
        pathname: '/(creator)/make/sent',
        params: { assignmentId: id, title: open && !brief.title ? 'Your freestyle post' : brief.title },
      });
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSubmitting(false);
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

  if (brief.format === 'reel') {
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

  const capText = ownDetails ? caption : splitCaption(brief.caption).text;
  const tagText = ownDetails ? tags : brief.hashtags.length ? brief.hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ') : splitCaption(brief.caption).tags;

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
        min={2}
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
        caption={capText}
        tags={tagText}
        handle={handle}
        avatarUri={avatarUri}
        initial={i}
        submitting={submitting}
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
        minOwn={open ? 2 : 1}
        onBack={fromReview ? () => { setFromReview(false); setPhase('review'); } : prev}
        onNext={next}
        onDone={() => {
          setFromReview(false);
          setPhase('review');
        }}
        onChangePhoto={() => setPhase('pick')}
        onAddSlide={addSlide}
        onRemoveSlide={removeSlide}
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
        onBack={prev}
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
      <AskAiSheet
        visible={ai}
        brief={brief}
        lines={ownLines}
        lineIndex={ownIndex}
        onApplyHook={(t) => {
          const at = slides.findIndex((s) => s.role === 'cover');
          patchAt(at >= 0 ? at : 0, { text: t });
        }}
        onApplyLine={(t) => patchAt(i, { text: t })}
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
});
