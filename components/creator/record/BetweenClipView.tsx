// After a take: the clip loops full screen with its on-screen text where the
// render will put it, the creator can rewatch, scrub, fix the text, then
// Redo or move on.
import type { JSX, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { OverlayBox } from '../../../lib/overlay-boxes';
import { color, radius, space, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { ClipVideo, ScrubBar, useClipPlayback } from './ClipPlayback';
import { frameStyle, type StageFrame } from './stageFrame';
import { TextBoxLayer, type BoxPatch } from './TextBoxLayer';

export function BetweenClipView(props: {
  uri: string;
  durationMs: number;
  frame: StageFrame;
  /** Progress segments, close and clip pill, drawn over the video. */
  header: ReactNode;
  /** The segment's picture card, static, inside the frame. */
  shotCard: ReactNode;
  boxes: OverlayBox[];
  canEditText: boolean;
  onChangeBox: (boxId: string, patch: BoxPatch) => void;
  onTapBox: (boxId: string) => void;
  onAddText: () => void;
  title: string;
  subtitle: string;
  primaryLabel: string;
  primaryEnabled: boolean;
  onPrimary: () => void;
  onRedo: () => void;
  bottomInset: number;
  railTop: number;
}): JSX.Element {
  const {
    uri,
    durationMs,
    frame,
    header,
    shotCard,
    boxes,
    canEditText,
    onChangeBox,
    onTapBox,
    onAddText,
    title,
    subtitle,
    primaryLabel,
    primaryEnabled,
    onPrimary,
    onRedo,
    bottomInset,
    railTop,
  } = props;
  const playback = useClipPlayback(uri, durationMs);

  return (
    <View style={StyleSheet.absoluteFill}>
      <ClipVideo playback={playback} />
      {header}
      <View style={frameStyle(frame)} pointerEvents="none">
        {shotCard}
      </View>
      <View style={frameStyle(frame)} pointerEvents="box-none">
        <TextBoxLayer
          boxes={boxes}
          frame={frame}
          editable={canEditText}
          onChangeBox={onChangeBox}
          onTapBox={onTapBox}
          onGestureStart={playback.pause}
        />
      </View>

      {canEditText ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Add text"
          onPress={onAddText}
          style={[styles.addText, { top: railTop }]}
        >
          <View style={styles.addTextCircle}>
            <Icon name="plus" size={22} color={color.white} strokeWidth={2} />
          </View>
          <Text style={styles.addTextLabel}>Text</Text>
        </PressableScale>
      ) : null}

      <View style={[styles.panel, { paddingBottom: Math.max(bottomInset, 14) + 6 }]}>
        <View style={styles.panelText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <ScrubBar playback={playback} />
        <View style={styles.actions}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Redo this clip"
            onPress={onRedo}
            style={styles.redoBtn}
          >
            <Icon name="rotate-ccw" size={18} color={color.white} />
            <Text style={styles.redoText}>Redo</Text>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            onPress={onPrimary}
            disabled={!primaryEnabled}
            style={[styles.nextBtn, !primaryEnabled && styles.nextBtnOff]}
          >
            <Text style={styles.nextText}>{primaryLabel}</Text>
            <Icon name="arrow-right" size={18} color={color.white} />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addText: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 4,
  },
  addTextCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTextLabel: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: color.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space[7],
    paddingTop: space[6],
    gap: 10,
    backgroundColor: color.scrimStrong,
  },
  panelText: {
    gap: 2,
  },
  title: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
  },
  subtitle: {
    color: color.whiteA75,
    fontSize: type.size.chip,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  redoBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.whiteA16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  redoText: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
  },
  nextBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnOff: {
    opacity: 0.5,
  },
  nextText: {
    color: color.white,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.heavy,
  },
});
