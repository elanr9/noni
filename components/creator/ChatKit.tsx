import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';

import { color, radius, shadow, type } from '../../theme/tokens';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';

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
          <View style={[styles.bubble, styles.bubbleManager, shadow.shadowCard]}>{body}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.creatorCol}>
      {time !== undefined && <Text style={[styles.bubbleLabel, styles.labelRight]}>{time}</Text>}
      <View style={[styles.bubble, styles.bubbleCreator, shadow.shadowAccent]}>{body}</View>
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
      <View style={[styles.quoteBar, { backgroundColor: onAccent ? color.whiteA75 : color.accent }]} />
      <View style={styles.quoteBody}>
        <Text style={[styles.quoteAuthor, { color: onAccent ? color.white : color.ink }]}>
          {author}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.quoteExcerpt, { color: onAccent ? color.whiteA75 : color.slate500 }]}
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open post ${title}`}
      onPress={onPress}
      style={styles.postRef}
    >
      <View style={styles.postRefIcon}>
        <Icon name={slideshow ? 'images' : 'video'} size={15} color={color.blue700} />
      </View>
      <View style={styles.postRefBody}>
        <Text numberOfLines={1} style={styles.postRefTitle}>
          {title}
        </Text>
        <Text style={styles.postRefMeta}>{slideshow ? 'Slideshow' : 'Reel'}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={color.slate400} />
    </PressableScale>
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const toggle = async () => {
    if (uri === undefined) return;
    if (playing) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setPlaying(false);
      return;
    }
    try {
      await soundRef.current?.unloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlaying(false);
          void sound.unloadAsync();
          soundRef.current = null;
        }
      });
      await sound.playAsync();
    } catch {
      setPlaying(false);
    }
  };

  return (
    <View style={styles.voiceRow}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        onPress={() => void toggle()}
        style={[
          styles.voicePlay,
          { backgroundColor: onAccent ? color.white : color.accent },
        ]}
      >
        <Icon
          name={playing ? 'pause' : 'play'}
          size={13}
          color={onAccent ? color.accent : color.white}
        />
      </PressableScale>
      <View style={styles.wave}>
        {WAVE_BARS.map((h, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              { height: h, backgroundColor: onAccent ? color.whiteA75 : color.slate300 },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.voiceDuration, { color: onAccent ? color.white : color.slate500 }]}>
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
    backgroundColor: color.fillQuiet,
  },
  dividerText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.slate500,
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
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: type.size.label,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  bubbleLabel: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: color.slate400,
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
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: color.line,
  },
  bubbleCreator: {
    backgroundColor: color.accent,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: radius.lg,
  },
  bubbleTextManager: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.ink,
  },
  bubbleTextCreator: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.white,
  },
  quote: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 10,
  },
  quoteOnWhite: {
    backgroundColor: color.fillQuiet,
  },
  quoteOnAccent: {
    backgroundColor: color.whiteA16,
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
    fontSize: type.size.micro11,
    fontWeight: type.weight.heavy,
  },
  quoteExcerpt: {
    fontSize: type.size.label,
    fontWeight: type.weight.medium,
  },
  postRef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: color.fillQuiet,
  },
  postRefIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postRefBody: {
    flex: 1,
    gap: 1,
  },
  postRefTitle: {
    fontSize: 13.5,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  postRefMeta: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.semibold,
    color: color.slate500,
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
    fontSize: type.size.label,
    fontWeight: type.weight.bold,
  },
});
