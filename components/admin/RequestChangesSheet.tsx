import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { ContentFormat } from '../../lib/admin-review-types';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../theme/tokens';
import { SlideStage } from '../SlideStage';
import { Sheet } from './shared';
import type { SlideshowSurfaceSlide } from './review/SlideshowSurface';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

function formatTime(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`;
}

/**
 * Just this clip, looping in the platform box, the way it will run inside
 * the finished post. Progress line along the bottom, duration bottom right.
 */
function ClipPreview({
  uri,
  playing,
  small,
}: {
  uri: string;
  playing: boolean;
  small: boolean;
}) {
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  useEffect(() => {
    const id = setInterval(() => {
      setPositionSec(player.currentTime);
      if (player.duration > 0) setDurationSec(player.duration);
    }, 250);
    return () => clearInterval(id);
  }, [player]);

  const progress = durationSec > 0 ? Math.min(positionSec / durationSec, 1) : 0;

  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      {durationSec > 0 && (
        <View style={[styles.durationBadge, small && styles.durationBadgeSmall]}>
          <Text style={styles.durationText}>{formatTime(durationSec)}</Text>
        </View>
      )}
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </>
  );
}

function PlaceholderGround({ text, small }: { text: string; small: boolean }) {
  return (
    <>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="noniWatchSheetGround" x1="33%" y1="3%" x2="67%" y2="97%">
            <Stop offset="0" stopColor={color.blue100} />
            <Stop offset="1" stopColor={color.lineStrong} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniWatchSheetGround)" />
      </Svg>
      <View style={[styles.previewCentre, small && styles.previewCentreSmall]}>
        <Text style={[styles.previewText, small && styles.previewTextSmall]}>{text}</Text>
      </View>
    </>
  );
}

export interface RequestChangesSheetProps {
  visible: boolean;
  /** Section label, e.g. "Hook" / "Clip 2" / "Slide 3". Sheet title. */
  label: string;
  /** The spoken line or slide copy, previewed inside the 9:16 box. */
  text: string;
  format: ContentFormat;
  /** Signed URL of the creator's clip for this section (Reels). */
  clipUri?: string | null;
  /** The composed slide for this section (Slideshows). */
  slide?: SlideshowSurfaceSlide;
  /** Creator first name, e.g. "Fabri". */
  creatorShort: string;
  /** Existing note for this section; empty string when there is none. */
  initialNote: string;
  onClose: () => void;
  onSave: (note: string) => void;
}

/**
 * Admin handoff §3 watch sheet — tap a section card and re-watch the clip
 * before deciding. Back / Request changes, then an inline note editor with
 * Save note. The preview shrinks while typing.
 */
export function RequestChangesSheet({
  visible,
  label,
  text,
  format,
  clipUri = null,
  slide,
  creatorShort,
  initialNote,
  onClose,
  onSave,
}: RequestChangesSheetProps) {
  const isReel = format === 'video';
  const hasClip = isReel && clipUri !== null;
  const hasSlideMedia =
    !isReel && slide !== undefined && (slide.photoUri !== undefined || slide.boxes.length > 0);
  const [noteMode, setNoteMode] = useState(false);
  const [note, setNote] = useState('');
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (visible) {
      setNoteMode(false);
      setNote('');
      setPlaying(true);
    }
  }, [visible, clipUri]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={label}
      subtitle={isReel ? `${creatorShort}'s clip` : `${creatorShort}'s slide`}
      footer={
        noteMode ? (
          <View style={styles.footerRow}>
            <Button
              variant="ghost"
              size="lg"
              style={styles.footerBack}
              onPress={() => {
                setNoteMode(false);
                setNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="lg"
              disabled={note.trim().length === 0}
              style={styles.footerMain}
              onPress={() => onSave(note.trim())}
            >
              Save note
            </Button>
          </View>
        ) : (
          <View style={styles.footerRow}>
            <Button variant="ghost" size="lg" style={styles.footerBack} onPress={onClose}>
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon="pencil"
              style={styles.footerMain}
              onPress={() => {
                setNote(initialNote);
                setNoteMode(true);
              }}
            >
              Request changes
            </Button>
          </View>
        )
      }
    >
      <View
        style={[
          styles.preview,
          shadow.shadowMedia,
          noteMode ? styles.previewSmall : null,
        ]}
      >
        {hasClip ? (
          <ClipPreview uri={clipUri} playing={playing} small={noteMode} />
        ) : hasSlideMedia ? (
          <SlideStage
            boxes={slide.boxes}
            photoUri={slide.photoUri}
            inset={slide.inset}
            tint={color.ink800}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <PlaceholderGround text={text} small={noteMode} />
        )}

        {hasClip && (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            hitSlop={10}
            onPress={() => setPlaying((p) => !p)}
            style={[
              styles.playButton,
              shadow.shadowCard,
              noteMode ? styles.playButtonSmall : null,
              playing ? styles.playButtonActive : null,
            ]}
          >
            <Icon
              name={playing ? 'pause' : 'play'}
              size={noteMode ? 12 : 15}
              color={playing ? color.white : color.ink}
            />
          </PressableScale>
        )}
      </View>

      {noteMode && (
        <View style={styles.noteWrap}>
          <TextInput
            autoFocus
            multiline
            value={note}
            onChangeText={setNote}
            placeholder={`What should ${creatorShort} change in this ${isReel ? 'clip' : 'slide'}`}
            placeholderTextColor={color.slate400}
            style={styles.noteInput}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  footerBack: {
    flex: 28,
  },
  footerMain: {
    flex: 72,
  },
  preview: {
    width: 236,
    aspectRatio: 9 / 16,
    alignSelf: 'center',
    borderRadius: radiusAdmin.xl,
    overflow: 'hidden',
    backgroundColor: color.ink900,
  },
  durationBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.inkA55,
  },
  durationBadgeSmall: {
    right: 8,
    bottom: 8,
  },
  durationText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: color.whiteA28,
  },
  progressFill: {
    height: 3,
    backgroundColor: color.blue500,
  },
  previewSmall: {
    width: 160,
  },
  previewCentre: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    paddingHorizontal: 22,
    paddingBottom: 62,
  },
  previewCentreSmall: {
    paddingTop: 28,
    paddingHorizontal: 14,
    paddingBottom: 44,
  },
  previewText: {
    fontSize: 15,
    lineHeight: 15 * 1.3,
    fontWeight: type.weight.heavy,
    letterSpacing: -0.3,
    color: color.ink,
    textAlign: 'center',
  },
  previewTextSmall: {
    fontSize: 12,
    lineHeight: 12 * 1.3,
  },
  playButton: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonSmall: {
    width: 28,
    height: 28,
  },
  playButtonActive: {
    backgroundColor: color.blue500,
  },
  noteWrap: {
    marginTop: 12,
    padding: 11,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.blue50,
  },
  noteInput: {
    minHeight: 70,
    padding: 11,
    borderRadius: radiusAdmin.sm,
    borderWidth: borderWidth.field,
    borderColor: color.blue300,
    backgroundColor: color.white,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.45,
    color: color.ink,
    textAlignVertical: 'top',
  },
});
