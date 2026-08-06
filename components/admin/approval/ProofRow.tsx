import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export interface ProofRowProps {
  /** "Instagram scroll" / "TikTok For You". */
  label: string;
  /** The required length, e.g. "Home, explore and reels · 20s required". */
  requirement: string;
  /** Signed recording URL; quiet placeholder when missing. */
  uri: string | null;
  /** Recorded length as a media badge; omitted when the data has no duration. */
  badge?: string;
}

/**
 * Admin handoff §5 warm-up proof row — thumb with the recorded length as a
 * media badge; tap expands the full recording.
 */
export function ProofRow({ label, requirement, uri, badge }: ProofRowProps) {
  const [expanded, setExpanded] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });

  return (
    <View style={styles.card}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${label} recording`}
        disabled={uri === null}
        onPress={() => setExpanded((e) => !e)}
        style={styles.row}
      >
        <View style={styles.thumb}>
          {uri !== null ? (
            <>
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
              />
              <View style={styles.thumbGlyph} pointerEvents="none">
                <Icon name="play" size={14} color={color.whiteA90} />
              </View>
              {badge !== undefined && (
                <Text style={styles.badge} numberOfLines={1}>
                  {badge}
                </Text>
              )}
            </>
          ) : (
            <View style={styles.thumbGlyph}>
              <Icon name="video" size={14} color={color.slate300} />
            </View>
          )}
        </View>

        <View style={styles.column}>
          <Text style={styles.label}>{label}</Text>
          <Text numberOfLines={2} style={styles.requirement}>
            {requirement}
          </Text>
          {uri === null && <Text style={styles.missing}>Not uploaded</Text>}
        </View>

        {uri !== null && (
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={color.slate300}
          />
        )}
      </PressableScale>

      {expanded && uri !== null && (
        <VideoView player={player} style={styles.full} contentFit="cover" nativeControls />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 54,
    height: 72,
    borderRadius: radiusAdmin.sm,
    backgroundColor: color.fillQuiet,
    overflow: 'hidden',
  },
  thumbGlyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: radiusAdmin.pill,
    fontSize: type.size.micro,
    fontWeight: type.weight.bold,
    color: color.white,
    backgroundColor: color.scrimStrong,
    overflow: 'hidden',
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  requirement: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  missing: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.amber,
  },
  full: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.ink900,
    overflow: 'hidden',
  },
});
