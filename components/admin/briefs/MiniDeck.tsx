// Four tiny slides on a kind row (SSManager.jsx MiniDeck). Text box = words
// you wrote. Small card = your screenshot. Dashed camera slot = the creator's.

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import type { BriefKind } from '../../../lib/briefs-api';
import { briefTone, color } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';

const N = 4;
const W = 30;
const H = 53;

function TextBox({ lines }: { lines: number }) {
  return (
    <View style={styles.textBox}>
      {Array.from({ length: lines }).map((_, i) => (
        <View key={i} style={[styles.textLine, { width: i === lines - 1 ? '65%' : '100%' }]} />
      ))}
    </View>
  );
}

function ShotBox() {
  return (
    <View style={styles.shotBox}>
      <View style={styles.shotBar} />
      <View style={styles.shotBody} />
    </View>
  );
}

export function MiniDeck({ kind }: { kind: BriefKind }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: N }).map((_, i) => {
        const cta = kind !== 'handheld' && i === N - 1;
        const text = kind === 'handheld' || (kind === 'story' && i === 0) || cta;
        const shot = (kind === 'handheld' && i % 2 === 1) || cta;
        return (
          <View key={i} style={[styles.slide, cta ? styles.slideCta : styles.slideCreator]}>
            {cta ? <LinearGradient colors={briefTone.managerSlide} style={StyleSheet.absoluteFill} /> : null}
            {!text && !shot ? <Icon name="camera" size={14} color={color.slate300} /> : null}
            {shot ? <ShotBox /> : null}
            {text ? <TextBox lines={shot ? 1 : 2} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  slide: {
    width: W,
    height: H,
    borderRadius: 7,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  slideCreator: {
    backgroundColor: briefTone.creatorStripe[0],
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  slideCta: { backgroundColor: briefTone.managerSlide[1] },
  textBox: {
    alignSelf: 'stretch',
    gap: 2,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 3,
    backgroundColor: color.white,
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 1.5,
    shadowOpacity: 0.22,
  },
  textLine: { height: 2.5, borderRadius: 2, backgroundColor: color.ink },
  shotBox: {
    width: '70%',
    borderRadius: 3,
    overflow: 'hidden',
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 1.5,
    shadowOpacity: 0.22,
  },
  shotBar: { height: 4, backgroundColor: briefTone.featureTones.bestfit.bar },
  shotBody: { height: 12, backgroundColor: briefTone.featureTones.bestfit.tone },
});
