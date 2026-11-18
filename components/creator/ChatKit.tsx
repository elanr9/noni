import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { color, editor, editorType, radius, shadow } from '../../theme/v2';
import { Icon, Press } from '../v2';

/**
 * Chat vocabulary for the manager thread and per-post revision threads
 * (SCREENS §6): day dividers, manager and creator bubbles, quoted replies,
 * post reference cards, voice notes.
 */

export interface DayDividerProps {
  label: string;
}

export function DayDivider({ label }: DayDividerProps) {
  return (
    <View style={styles.dividerWrap}>
      <View style={styles.dividerPill}>
        <Text style={styles.dividerText}>{label}</Text>
      </View>
    </View>
  );
}

export interface BubbleProps {
  side: 'manager' | 'creator';
  /** Manager label, rendered as "Name · time" above the bubble. */
  author?: string;
  time?: string;
  /** Manager avatar initial; falls back to the first letter of author. */
  avatarInitial?: string;
  /** A string gets the default bubble text style; nodes render as-is. */
  children: ReactNode;
}

export function Bubble({ side, author, time, avatarInitial, children }: BubbleProps) {
  const manager = side === 'manager';
  const body =
    typeof children === 'string' ? (
      <Text style={manager ? styles.bubbleTextManager : styles.bubbleTextCreator}>
        {children}
      </Text>
    ) : (
      children
    );

  if (manager) {
    const initial = avatarInitial ?? author?.charAt(0) ?? '';
    const label = [author, time].filter((v) => v !== undefined && v !== '').join(' · ');
    return (
      <View style={styles.managerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.managerCol}>
          {label !== '' && <Text style={styles.bubbleLabel}>{label}</Text>}
          <View style={[styles.bubble, styles.bubbleManager, shadow.card]}>{body}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.creatorCol}>
      {time !== undefined && <Text style={[styles.bubbleLabel, styles.labelRight]}>{time}</Text>}
      <View style={[styles.bubble, styles.bubbleCreator, shadow.glow]}>{body}</View>
    </View>
  );
}

export interface QuotedReplyProps {
  author: string;
  excerpt: string;
  /** Set when rendered inside a creator (accent) bubble. */
  onAccent?: boolean;
}

export function QuotedReply({ author, excerpt, onAccent = false }: QuotedReplyProps) {
  return (
    <View style={[styles.quote, onAccent ? styles.quoteOnAccent : styles.quoteOnWhite]}>
      <View style={[styles.quoteBar, { backgroundColor: onAccent ? editor.w75 : color.blue }]} />
      <View style={styles.quoteBody}>
        <Text style={[styles.quoteAuthor, { color: onAccent ? color.white : color.ink }]}>
          {author}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.quoteExcerpt, { color: onAccent ? editor.w75 : color.grey4 }]}
        >
          {excerpt}
        </Text>
      </View>
    </View>
  );
}

export interface PostRefCardProps {
  title: string;
  /** brief.format — 'photo_carousel' reads Slideshow, anything else Reel. */
  format: string;
  onPress?: () => void;
}

export function PostRefCard({ title, format, onPress }: PostRefCardProps) {
  const slideshow = format === 'photo_carousel';
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`Open post ${title}`}
      onPress={onPress}
      style={styles.postRef}
    >
      <View style={styles.postRefIcon}>
        <Icon name={slideshow ? 'photo_library' : 'videocam'} size={15} color={color.blueDeep} />
      </View>
      <View style={styles.postRefBody}>
        <Text numberOfLines={1} style={styles.postRefTitle}>
          {title}
        </Text>
        <Text style={styles.postRefMeta}>{slideshow ? 'Slideshow' : 'Reel'}</Text>
      </View>
      <Icon name="chevron_right" size={16} color={color.grey4} />
    </Press>
  );
}

/** Hand-drawn 16-bar waveform heights. */
const WAVE_BARS = [8, 13, 9, 17, 11, 18, 7, 15, 10, 16, 12, 8, 14, 9, 13, 7];

export interface VoiceNoteProps {
  /** Audio source; the play button is inert without one. */
  uri?: string;
  /** Preformatted duration, e.g. "0:18". */
  durationLabel: string;
  /** Set when rendered inside a creator (accent) bubble. */
  onAccent?: boolean;
}

export function VoiceNote({ uri, durationLabel, onAccent = false }: VoiceNoteProps) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);

  const releasePlayer = () => {
    playerRef.current?.remove();
    playerRef.current = null;
  };

  useEffect(() => releasePlayer, []);

  const toggle = async () => {
    if (uri === undefined) return;
    if (playing) {
      playerRef.current?.pause();
      releasePlayer();
      setPlaying(false);
      return;
    }
    try {
      releasePlayer();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const player = createAudioPlayer({ uri });
      playerRef.current = player;
      setPlaying(true);
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setPlaying(false);
          releasePlayer();
        }
      });
      player.play();
    } catch {
      setPlaying(false);
    }
  };

  return (
    <View style={styles.voiceRow}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        onPress={() => void toggle()}
        style={[
          styles.voicePlay,
          { backgroundColor: onAccent ? color.white : color.blue },
        ]}
      >
        <Icon
          name={playing ? 'pause' : 'play_arrow'}
          size={13}
          color={onAccent ? color.blue : color.white}
        />
      </Press>
      <View style={styles.wave}>
        {WAVE_BARS.map((h, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              { height: h, backgroundColor: onAccent ? editor.w75 : color.grey3 },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.voiceDuration, { color: onAccent ? color.white : color.grey4 }]}>
        {durationLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dividerWrap: {
    alignItems: 'center',
  },
  dividerPill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: color.grey1,
  },
  dividerText: {
    fontSize: editorType.size.micro11,
    fontWeight: editorType.weight.bold,
    color: color.grey4,
  },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '82%',
  },
  managerCol: {
    gap: 4,
    flexShrink: 1,
  },
  creatorCol: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    gap: 4,
    maxWidth: '82%',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: color.blueTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: editorType.size.label,
    fontWeight: editorType.weight.heavy,
    color: color.blueDeep,
  },
  bubbleLabel: {
    fontSize: editorType.size.micro11,
    fontWeight: editorType.weight.semibold,
    color: color.grey4,
    paddingHorizontal: 4,
  },
  labelRight: {
    textAlign: 'right',
  },
  bubble: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 8,
  },
  bubbleManager: {
    backgroundColor: color.white,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderBottomRightRadius: radius.card,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: color.grey2,
  },
  bubbleCreator: {
    backgroundColor: color.blue,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: radius.card,
  },
  bubbleTextManager: {
    fontSize: editorType.size.bodySm,
    lineHeight: editorType.size.bodySm * editorType.leading.body,
    color: color.ink,
  },
  bubbleTextCreator: {
    fontSize: editorType.size.bodySm,
    lineHeight: editorType.size.bodySm * editorType.leading.body,
    color: color.white,
  },
  quote: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 10,
  },
  quoteOnWhite: {
    backgroundColor: color.grey1,
  },
  quoteOnAccent: {
    backgroundColor: editor.w16,
  },
  quoteBar: {
    width: 3,
    borderRadius: radius.pill,
  },
  quoteBody: {
    flexShrink: 1,
    gap: 1,
  },
  quoteAuthor: {
    fontSize: editorType.size.micro11,
    fontWeight: editorType.weight.heavy,
  },
  quoteExcerpt: {
    fontSize: editorType.size.label,
    fontWeight: editorType.weight.medium,
  },
  postRef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius.thumb,
    backgroundColor: color.grey1,
  },
  postRefIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: color.blueTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postRefBody: {
    flex: 1,
    gap: 1,
  },
  postRefTitle: {
    fontSize: 13.5,
    fontWeight: editorType.weight.bold,
    color: color.ink,
  },
  postRefMeta: {
    fontSize: editorType.size.micro11,
    fontWeight: editorType.weight.semibold,
    color: color.grey4,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voicePlay: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 18,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  voiceDuration: {
    fontSize: editorType.size.label,
    fontWeight: editorType.weight.bold,
  },
});
