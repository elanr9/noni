import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { color, shadow } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { CreatorAvatar } from '../shared';

const WAVE_BARS = [6, 12, 9, 16, 11, 18, 8, 14, 10, 16, 7, 13, 9, 15, 6, 11, 8, 13];

export type ChatReaction = {
  icon: IconName;
  count: number;
};

export function ChatBubble({
  who,
  time,
  me = false,
  quote,
  forward,
  reactions,
  onPress,
  onLongPress,
  children,
}: {
  who: string;
  time: string;
  me?: boolean;
  quote?: [string, string];
  forward?: string;
  reactions?: ChatReaction[];
  onPress?: () => void;
  onLongPress?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={[styles.row, me ? styles.rowMe : undefined]}>
      {!me ? <CreatorAvatar name={who} size={28} tone="quiet" /> : null}
      <View style={[styles.col, me ? styles.colMe : styles.colThem]}>
        <Text style={styles.meta} numberOfLines={1}>
          {me ? time : `${who} · ${time}`}
        </Text>
        <PressableScale
          accessibilityRole="button"
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={350}
          style={[
            styles.bubble,
            me ? styles.bubbleMe : styles.bubbleThem,
            me ? shadow.shadowAccent : shadow.shadowCard,
          ]}
        >
          {forward ? (
            <View style={styles.forwardRow}>
              <Icon
                name="share-2"
                size={12}
                color={me ? color.whiteA75 : color.slate400}
              />
              <Text
                style={[
                  styles.forwardLabel,
                  { color: me ? color.whiteA75 : color.slate400 },
                ]}
              >
                {forward}
              </Text>
            </View>
          ) : null}
          {quote ? (
            <View
              style={[
                styles.quote,
                { backgroundColor: me ? color.whiteA16 : color.fillQuiet },
              ]}
            >
              <View
                style={[
                  styles.quoteBar,
                  { backgroundColor: me ? color.whiteA60 : color.blue300 },
                ]}
              />
              <View style={styles.quoteBody}>
                <Text
                  style={[
                    styles.quoteWho,
                    { color: me ? color.white : color.blue700 },
                  ]}
                >
                  {quote[0]}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.quoteSnippet,
                    { color: me ? 'rgba(255,255,255,0.8)' : color.slate500 },
                  ]}
                >
                  {quote[1]}
                </Text>
              </View>
            </View>
          ) : null}
          {typeof children === 'string' ? (
            <Text style={[styles.bodyText, me ? styles.bodyMe : styles.bodyThem]}>
              {children}
            </Text>
          ) : (
            children
          )}
        </PressableScale>
        {reactions && reactions.length > 0 ? (
          <View style={styles.reactions}>
            {reactions.map((r) => (
              <View key={r.icon} style={[styles.reactionPill, shadow.shadowCard]}>
                <Icon name={r.icon} size={11} color={color.blue600} />
                <Text style={styles.reactionCount}>{r.count}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function VoiceNote({
  me = false,
  duration,
  playing = false,
  onPress,
}: {
  me?: boolean;
  duration: string;
  playing?: boolean;
  onPress?: () => void;
}) {
  const fg = me ? color.white : color.blue600;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
      onPress={onPress}
      hitSlop={6}
      style={styles.voiceRow}
    >
      <View
        style={[
          styles.playDisc,
          { backgroundColor: me ? 'rgba(255,255,255,0.22)' : color.blue100 },
        ]}
      >
        <Icon name={playing ? 'pause' : 'play'} size={13} color={fg} />
      </View>
      <View style={styles.wave}>
        {WAVE_BARS.map((h, i) => (
          <View
            key={i}
            style={{
              width: 3,
              height: h,
              borderRadius: 999,
              backgroundColor: me
                ? i < 8
                  ? color.white
                  : 'rgba(255,255,255,0.4)'
                : i < 8
                  ? color.blue500
                  : color.blue100,
            }}
          />
        ))}
      </View>
      <Text
        style={[
          styles.voiceDur,
          { color: me ? 'rgba(255,255,255,0.85)' : color.slate500 },
        ]}
      >
        {duration}
      </Text>
    </PressableScale>
  );
}

export function UploadThumbs({
  uri,
  caption,
  video = false,
  me = false,
}: {
  uri?: string | null;
  caption?: string;
  video?: boolean;
  me?: boolean;
}) {
  return (
    <View style={styles.thumbsCol}>
      <View style={styles.thumbsRow}>
        <View style={styles.thumb}>
          {uri && !video ? (
            <Image source={{ uri }} resizeMode="cover" style={styles.thumbImage} />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Icon
                name={video ? 'video' : 'images'}
                size={22}
                color={color.blue300}
              />
            </View>
          )}
        </View>
      </View>
      {caption ? (
        <Text style={[styles.caption, me ? styles.bodyMe : styles.bodyThem]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export function PostRef({
  me = false,
  label,
  onPress,
}: {
  me?: boolean;
  label: string;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.postRef,
        { backgroundColor: me ? color.whiteA16 : color.fillQuiet },
      ]}
    >
      <Icon name="video" size={14} color={me ? color.white : color.blue700} />
      <Text
        numberOfLines={1}
        style={[styles.postRefLabel, { color: me ? color.white : color.ink }]}
      >
        {label}
      </Text>
      <Icon
        name="chevron-right"
        size={13}
        color={me ? 'rgba(255,255,255,0.7)' : color.slate400}
      />
    </PressableScale>
  );
}

export function ChatDivider({ children }: { children: string }) {
  return <Text style={styles.divider}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-end',
  },
  rowMe: {
    flexDirection: 'row-reverse',
  },
  col: {
    maxWidth: '82%',
    gap: 3,
  },
  colMe: {
    alignItems: 'flex-end',
  },
  colThem: {
    alignItems: 'flex-start',
  },
  meta: {
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate400,
    paddingHorizontal: 4,
  },
  bubble: {
    flexDirection: 'column',
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 18,
    gap: 8,
  },
  bubbleMe: {
    backgroundColor: color.blue500,
    borderBottomRightRadius: 6,
  },
  bubbleThem: {
    backgroundColor: color.white,
    borderBottomLeftRadius: 6,
  },
  bodyText: {
    fontSize: 14.5,
    lineHeight: 14.5 * 1.45,
    fontWeight: '400',
  },
  bodyMe: {
    color: color.white,
  },
  bodyThem: {
    color: color.ink,
  },
  forwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  forwardLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  quote: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  quoteBar: {
    width: 3,
    borderRadius: 999,
  },
  quoteBody: {
    minWidth: 0,
    flex: 1,
  },
  quoteWho: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  quoteSnippet: {
    marginTop: 1,
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 17,
    maxWidth: 210,
  },
  reactions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -1,
    paddingHorizontal: 4,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: color.white,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: color.slate500,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playDisc: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  voiceDur: {
    fontSize: 12,
    fontWeight: '700',
  },
  thumbsCol: {
    gap: 7,
  },
  thumbsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  thumb: {
    width: 96,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: color.blue100,
  },
  thumbImage: {
    width: 96,
    height: 120,
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    backgroundColor: color.blue100,
  },
  caption: {
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '400',
  },
  postRef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
  },
  postRefLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
  },
  divider: {
    alignSelf: 'center',
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: color.slate400,
    paddingVertical: 5,
    paddingHorizontal: 12,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: color.fillQuiet,
  },
});
