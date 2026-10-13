// Ghosted platform chrome over the slide (SSCanvas.jsx PlatformGhost):
// TikTok slideshow bands, TikTok reel rail and caption, Instagram 4:5 bands.
// Everything sits in fractions of the frame so it scales with the canvas.

import { StyleSheet, Text, View } from 'react-native';

import { color, type as typeToken } from '../../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { IG_BAR, TT_SS, type Platform } from './layout';

const RAIL: IconName[] = ['heart', 'message-circle', 'bookmark', 'share-2'];
const TABS: IconName[] = ['house', 'users', 'plus', 'inbox', 'circle-user-round'];

export function PlatformGhost({
  platform,
  w,
  h,
  reel,
  light = false,
}: {
  platform: Platform;
  w: number;
  h: number;
  reel: boolean;
  light?: boolean;
}) {
  const ink = light ? color.inkA55 : color.whiteA60;
  const band = light ? color.scrim : color.ink900;
  const dim = light ? color.scrim : color.whiteA28;
  const fs = Math.round(w * 0.04);
  const label = { fontFamily: typeToken.font.ui, fontWeight: '700' as const, color: ink };

  if (platform === 'instagram') {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.band, { top: 0, height: IG_BAR * h, backgroundColor: band, justifyContent: 'flex-end', paddingHorizontal: w * 0.04, paddingBottom: w * 0.03 }]}>
          <View style={[styles.row, { gap: w * 0.025 }]}>
            <View style={{ width: w * 0.085, height: w * 0.085, borderRadius: 99, backgroundColor: dim }} />
            <Text style={[label, { fontSize: fs }]}>elan.recruiting</Text>
            <View style={styles.grow} />
            <View style={[styles.row, { gap: 3 }]}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 3, height: 3, borderRadius: 99, backgroundColor: ink }} />
              ))}
            </View>
          </View>
        </View>
        <View style={[styles.band, { bottom: 0, height: IG_BAR * h, backgroundColor: band, paddingVertical: w * 0.03, paddingHorizontal: w * 0.04, gap: w * 0.022 }]}>
          <View style={styles.row}>
            <View style={[styles.row, styles.grow, { gap: w * 0.035 }]}>
              {(['heart', 'message-circle', 'send'] as IconName[]).map((n) => (
                <Icon key={n} name={n} size={Math.round(w * 0.065)} color={ink} />
              ))}
            </View>
            <View style={[styles.row, styles.grow, { gap: 4, justifyContent: 'center' }]}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={{ width: i === 0 ? 6 : 5, height: i === 0 ? 6 : 5, borderRadius: 99, backgroundColor: i === 0 ? color.blue500 : dim }} />
              ))}
            </View>
            <View style={[styles.row, styles.grow, { justifyContent: 'flex-end' }]}>
              <Icon name="bookmark" size={Math.round(w * 0.065)} color={ink} />
            </View>
          </View>
          <Text style={[label, { fontSize: fs * 0.9 }]}>1,204 likes</Text>
          <View style={{ height: fs * 0.7, width: '88%', borderRadius: 99, backgroundColor: dim }} />
          <View style={{ height: fs * 0.7, width: '60%', borderRadius: 99, backgroundColor: dim }} />
        </View>
        <View style={[styles.counter, { right: w * 0.04, top: IG_BAR * h + w * 0.03, paddingVertical: w * 0.012, paddingHorizontal: w * 0.03 }]}>
          <Text style={[styles.counterText, { fontSize: fs }]}>1/7</Text>
        </View>
      </View>
    );
  }

  const rail = (
    <>
      {RAIL.map((n) => (
        <View key={n} style={{ alignItems: 'center', gap: 2 }}>
          <Icon name={n} size={Math.round(w * 0.085)} color={ink} />
          <Text style={[label, { fontSize: fs * 0.8 }]}>12.4K</Text>
        </View>
      ))}
    </>
  );

  if (!reel) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.band, styles.row, { top: 0, height: TT_SS.top * h, backgroundColor: band, justifyContent: 'center', alignItems: 'flex-end', gap: w * 0.06, paddingBottom: w * 0.025 }]}>
          <Text style={[label, { fontSize: fs, color: dim }]}>Following</Text>
          <Text style={[label, { fontSize: fs, borderBottomWidth: 2, borderBottomColor: ink, paddingBottom: 3 }]}>For you</Text>
        </View>
        <View style={{ position: 'absolute', right: w * 0.03, bottom: (TT_SS.bottom + 0.02) * h, alignItems: 'center', gap: w * 0.03 }}>
          <View style={{ width: w * 0.11, height: w * 0.11, borderRadius: 99, backgroundColor: dim, borderWidth: 1.5, borderColor: ink }} />
          {rail}
        </View>
        <View style={[styles.band, { bottom: 0, height: TT_SS.bottom * h, backgroundColor: band, paddingTop: w * 0.025, paddingHorizontal: w * 0.04, gap: w * 0.02 }]}>
          <View style={[styles.row, { justifyContent: 'center', gap: 4 }]}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: i === 1 ? ink : dim }} />
            ))}
          </View>
          <Text style={[label, { fontSize: fs * 1.05 }]}>elan.recruiting</Text>
          <View style={{ height: fs * 0.75, width: '82%', borderRadius: 99, backgroundColor: dim }} />
          <View style={{ height: fs * 0.75, width: '55%', borderRadius: 99, backgroundColor: dim }} />
          <View style={[styles.row, styles.tabs, { height: w * 0.12, borderTopColor: dim, marginHorizontal: -w * 0.04 }]}>
            {TABS.map((n, i) => (
              <Icon key={n} name={n} size={Math.round(w * (i === 2 ? 0.075 : 0.06))} color={i === 0 ? ink : dim} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.band, { bottom: 0, height: 0.34 * h, backgroundColor: color.scrim, opacity: 0.8 }]} />
      <View style={{ position: 'absolute', right: w * 0.03, top: 0.42 * h, height: 0.46 * h, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: w * 0.11, height: w * 0.11, borderRadius: 99, backgroundColor: dim, borderWidth: 1.5, borderColor: ink }} />
        {rail}
        <View style={{ width: w * 0.1, height: w * 0.1, borderRadius: 99, backgroundColor: dim, borderWidth: w * 0.02, borderColor: light ? color.inkA55 : color.scrimStrong }} />
      </View>
      <View style={{ position: 'absolute', left: w * 0.04, width: 0.74 * w, top: 0.7 * h, height: 0.26 * h, justifyContent: 'flex-end', gap: w * 0.025 }}>
        <Text style={[label, { fontSize: fs * 1.1 }]}>@elan.recruiting</Text>
        <View style={{ height: fs * 0.8, width: '95%', borderRadius: 99, backgroundColor: dim }} />
        <View style={{ height: fs * 0.8, width: '88%', borderRadius: 99, backgroundColor: dim }} />
        <View style={{ height: fs * 0.8, width: '55%', borderRadius: 99, backgroundColor: dim }} />
        <View style={[styles.row, { gap: 5 }]}>
          <Icon name="music-2" size={fs} color={ink} />
          <Text style={[label, { fontSize: fs * 0.9, fontWeight: '600' }]}>original sound</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  tabs: { marginTop: 'auto', borderTopWidth: 1, justifyContent: 'space-around' },
  counter: { position: 'absolute', borderRadius: 99, backgroundColor: color.scrimStrong },
  counterText: { color: color.white, fontFamily: typeToken.font.ui, fontWeight: '700' },
});
