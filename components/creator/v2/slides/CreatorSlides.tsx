// Creator side of a slideshow brief (V2CreatorSlides.jsx): add a photo per
// slide, check the text in the Story editor, crop each photo inside the 9:16
// frame, then send. The preview matches TikTok photo mode: full bleed, the
// counter top right, dots at the bottom.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Brief, ClipDoc } from '../../../../lib/brief-library';
import type { PickedPhoto } from '../../../../lib/submissions';
import { color } from '../../../../theme/v2';
import { pickFromLibrary } from '../../briefs/slides/photo-picker';
import { Icon, Press, tap } from '../../../v2';
import { SentOverlay } from '../SentOverlay';
import { StoryEditor } from '../story/StoryEditor';
import { CropFrame } from './CropFrame';
import { clearSlidesDraft, loadSlidesDraft, photosForSubmit, saveSlidesDraft, slideDoc, slidesFromBrief, type Slide } from './model';
import { SlideFrame } from './SlideFrame';

const TITLES = ['Add photos', 'Check text', 'Crop'];

export interface CreatorSlidesProps {
  brief: Brief;
  handle?: string;
  onClose: () => void;
  /** Uploads the photos as a slideshow submission. Resolves when the server has it. */
  onSubmit: (photos: PickedPhoto[], slides: Slide[]) => Promise<void>;
  /** After the Sent moment. */
  onSent: () => void;
}

export function CreatorSlides({ brief, handle, onClose, onSubmit, onSent }: CreatorSlidesProps) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [step, setStep] = useState(0);
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const slidesRef = useRef<Slide[]>([]);

  useEffect(() => {
    let live = true;
    void loadSlidesDraft(brief.id).then((d) => {
      if (!live) return;
      const fresh = slidesFromBrief(brief);
      // A draft keeps its photos and crops; text comes from the template unless the creator edited it.
      setSlides(d && d.length === fresh.length ? d : fresh);
    });
    return () => {
      live = false;
    };
  }, [brief]);

  useEffect(() => {
    if (slides) {
      slidesRef.current = slides;
      saveSlidesDraft(brief.id, slides);
    }
  }, [slides, brief.id]);

  const patch = useCallback((id: string, p: Partial<Slide>) => setSlides((ss) => (ss ?? []).map((s) => (s.id === id ? { ...s, ...p } : s))), []);

  const pickFor = useCallback(
    async (id: string) => {
      if (picking) return;
      setPicking(true);
      try {
        const [photo] = await pickFromLibrary(1);
        if (!photo) return;
        patch(id, { photo, crop: null });
        // Reopen on the next empty slide so a set of photos goes in one pass.
        const next = slidesRef.current.find((s) => !s.photo && s.id !== id);
        if (next) setTimeout(() => void pickFor(next.id), 240);
      } finally {
        setPicking(false);
      }
    },
    [patch, picking],
  );

  if (!slides) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  const n = slides.length;
  const filled = slides.filter((s) => s.photo).length;
  const cur = slides[Math.min(idx, n - 1)];
  const canNext = step === 0 ? filled === n && n > 0 : true;

  const finish = async () => {
    if (sending) return;
    tap();
    setSending(true);
    try {
      await onSubmit(photosForSubmit(slides), slides);
      clearSlidesDraft(brief.id);
      setSent(true);
      setTimeout(onSent, 1500);
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };
  const nextStep = () => {
    tap();
    setStep(step + 1);
    setIdx(0);
  };

  // Stage frame: as tall as the space allows, 9:16.
  const fh = Math.max(100, stage.h - 8);
  const fw = Math.min(W - 32, (fh * 9) / 16);
  const fH = (fw * 16) / 9;
  const counter = (
    <View pointerEvents="none" style={{ position: 'absolute', top: 12, right: 14, height: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, lineHeight: 26, fontWeight: '600', color: '#fff' }}>{`${idx + 1} / ${n}`}</Text>
    </View>
  );
  const dots = (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
      {slides.map((s, i) => (
        <View key={s.id} style={{ width: i === idx ? 14 : 5, height: 5, borderRadius: 3, backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.45)' }} />
      ))}
    </View>
  );
  const strip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 96, flexGrow: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: 16 }}>
      {slides.map((s, i) => (
        <Press key={s.id} onPress={() => setIdx(i)} style={{ width: 48, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1A1A1F', boxShadow: i === idx ? '0 0 0 2.5px #fff' : 'none' }}>
          <SlideFrame slide={s} width={48} height={72} texts={false} />
        </Press>
      ))}
    </ScrollView>
  );
  const tile = (W - 32 - 20) / 3;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ paddingTop: insets.top, height: insets.top + 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <Press accessibilityLabel={step ? 'Back' : 'Close'} onPress={() => (step ? setStep(step - 1) : onClose())} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={step ? 'chevron_left' : 'close'} size={step ? 30 : 24} color="#fff" />
        </Press>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: '#fff' }}>{TITLES[step]}</Text>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: 'rgba(255,255,255,0.6)' }}>{step === 0 ? `${filled} of ${n} photos` : `Slide ${idx + 1} of ${n}`}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {step === 0 ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {slides.map((s, i) => (
            <Press key={s.id} accessibilityLabel={s.photo ? `Replace photo ${i + 1}` : `Add photo ${i + 1}`} onPress={() => void pickFor(s.id)} style={{ width: tile, height: (tile * 16) / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1A1A1F' }}>
              <SlideFrame slide={s} width={tile} height={(tile * 16) / 9} />
              {!s.photo ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} /> : null}
              <View style={{ position: 'absolute', left: 6, top: 6, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 999, backgroundColor: s.photo ? '#fff' : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, lineHeight: 18, fontWeight: '700', color: s.photo ? '#000' : '#fff' }}>{i + 1}</Text>
              </View>
              {s.photo ? (
                <View style={{ position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="swap_horiz" size={14} color="#fff" />
                </View>
              ) : (
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: color.blue, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="add_photo_alternate" size={18} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: '#fff' }}>Add photo</Text>
                </View>
              )}
            </Press>
          ))}
        </ScrollView>
      ) : (
        <>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }} onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {stage.h > 0 ? (
              step === 1 ? (
                <Press onPress={() => setEditing(cur.id)} style={{ width: fw, height: fH, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
                  <SlideFrame slide={cur} width={fw} height={fH} />
                  <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center' }}>
                    <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="edit" size={14} color="#fff" />
                      <Text style={{ fontSize: 12, lineHeight: 30, fontWeight: '600', color: '#fff' }}>Tap to edit text</Text>
                    </View>
                  </View>
                  {counter}
                  {dots}
                </Press>
              ) : (
                <View style={{ width: fw, height: fH, borderRadius: 14, overflow: 'hidden' }}>
                  <CropFrame slide={cur} width={fw} height={fH} onChange={(crop) => patch(cur.id, { crop })} />
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <SlideFrame slide={{ ...cur, photo: null }} width={fw} height={fH} style={{ backgroundColor: 'transparent' }} />
                  </View>
                  {counter}
                  {dots}
                </View>
              )
            ) : null}
          </View>
          {strip}
        </>
      )}

      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 10, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) + 14 }}>
        {step === 2 && cur.crop ? (
          <Press onPress={() => patch(cur.id, { crop: null })} style={{ height: 52, paddingHorizontal: 18, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Reset</Text>
          </Press>
        ) : null}
        <Press disabled={!canNext || sending} onPress={() => (step < 2 ? nextStep() : void finish())} style={{ flex: 1, height: 52, borderRadius: 999, backgroundColor: canNext ? color.blue : 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: sending ? 0.6 : 1 }}>
          {step === 2 ? <Icon name="send" size={20} color="#fff" /> : null}
          <Text style={{ fontSize: 17, fontWeight: '700', color: canNext ? '#fff' : 'rgba(255,255,255,0.4)' }}>{step === 2 ? 'Send for review' : step === 0 && filled < n ? `Add ${n - filled} more` : 'Next'}</Text>
        </Press>
      </View>

      {editing ? (() => {
        const i = slides.findIndex((s) => s.id === editing);
        const sl = slides[i];
        if (!sl) return null;
        const onDoc = (d: ClipDoc) => patch(sl.id, { doc: d, text: d.texts.map((x) => x.text).join(' · ') });
        return (
          <StoryEditor
            doc={slideDoc(sl)}
            onChange={onDoc}
            photo={sl.photo?.uri ?? null}
            title={`Slide ${i + 1}`}
            handle={handle}
            onDone={() => setEditing(null)}
            onBack={() => setEditing(null)}
            onPrev={i > 0 ? () => { setEditing(slides[i - 1].id); setIdx(i - 1); } : null}
            onNext={i < n - 1 ? () => { setEditing(slides[i + 1].id); setIdx(i + 1); } : null}
          />
        );
      })() : null}
      {sent ? <SentOverlay /> : null}
    </View>
  );
}
