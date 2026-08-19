import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { borderWidth, color, radius, radiusAdmin, shadow, type } from '../../../theme/tokens';
import { Icon, type IconName } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type PartKey = 'ig_account' | 'tt_account' | 'ig_clip' | 'tt_clip';
export type PartKind = 'account' | 'clip';
export type PartPlatform = 'instagram' | 'tiktok';

/** One inspectable slice of an account submission. */
export interface AccountPart {
  key: PartKey;
  label: string;
  meta: string;
  kind: PartKind;
  platform: PartPlatform;
  /** Profile screenshot for account cards; clip cards show the play disc. */
  thumbUri: string | null;
}

/** PostThumb's 160deg light-blue media gradient (blue100 to mediaGradEnd). */
export function MediaGradient() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="noniAccountPart" x1="33%" y1="3%" x2="67%" y2="97%">
          <Stop offset="0" stopColor={color.blue100} />
          <Stop offset="1" stopColor={color.mediaGradEnd} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniAccountPart)" />
    </Svg>
  );
}

export const PLATFORM_ICON: Record<PartPlatform, IconName> = {
  instagram: 'at-sign',
  tiktok: 'music-2',
};

export interface PartCardProps {
  part: AccountPart;
  /** A change note exists for this part: blue border and the Changes tag. */
  noted: boolean;
  width: number;
  onPress: () => void;
}

/** Grid cell of the account review: thumb top-left, check or Changes top-right. */
export function PartCard({ part, noted, width, onPress }: PartCardProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={part.label}
      onPress={onPress}
      style={[
        styles.card,
        shadow.shadowCard,
        { width, borderColor: noted ? color.blue500 : color.line },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.thumb}>
          {part.thumbUri !== null ? (
            <Image
              source={{ uri: part.thumbUri }}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <MediaGradient />
          )}
          {part.kind === 'clip' ? (
            <View style={[styles.playDisc, shadow.shadowCard]}>
              <Icon name="play" size={10} color={color.ink} />
            </View>
          ) : part.thumbUri === null ? (
            <Icon name={PLATFORM_ICON[part.platform]} size={16} color={color.blue300} />
          ) : null}
        </View>
        {noted ? (
          <View style={styles.changesTag}>
            <Icon name="pencil" size={12} color={color.blue700} />
            <Text style={styles.changesText}>Changes</Text>
          </View>
        ) : (
          <Icon name="circle-check-big" size={17} color={color.green} />
        )}
      </View>

      <View>
        <Text style={styles.label}>{part.label}</Text>
        <Text style={styles.meta}>{part.meta}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 122,
    padding: 12,
    gap: 9,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    backgroundColor: color.white,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  thumb: {
    width: 40,
    height: 52,
    borderRadius: radiusAdmin.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playDisc: {
    width: 22,
    height: 22,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.whiteA90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changesTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changesText: {
    fontSize: type.size.micro11,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  label: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
    color: color.ink,
  },
  meta: {
    marginTop: 3,
    fontSize: type.size.label,
    lineHeight: type.size.label * 1.35,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
});
