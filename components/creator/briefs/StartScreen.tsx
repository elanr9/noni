// First screen of a brief: a fan of three slides, the kind headline, one
// line of what is set and what is the creator's, the note from the company
// and the Let's go button. From SSCreator.jsx CreatorHandheld phase start and
// RLCreator.jsx CreatorReel phase start.
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WeekBrief } from '../../../lib/briefs-api';
import { FORMAT_LABEL } from '../../../lib/brief-copy';
import { briefTone, color, radius, type as typeToken } from '../../../theme/tokens';
import { BriefHeader } from '../../shared/briefs';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { MiniSlide } from './MiniSlide';

export type StartScreenProps = {
  brief: WeekBrief;
  companyName: string;
  /** Point count for the reel sub line. */
  clipCount?: number;
  onBack: () => void;
  onGo: () => void;
};

function copyFor(brief: WeekBrief, companyName: string, clipCount: number): { head: string; sub: string; cta: string } {
  const reel = brief.format === 'reel';
  if (reel) {
    if (brief.postTypeKey === 'long_text') {
      return {
        head: 'This is a Long text reel!',
        sub: 'One 6 second clip. The text is already on it, you just look at the camera.',
        cta: 'Open camera',
      };
    }
    if (brief.kind === 'handheld') {
      return { head: 'This is a Handheld reel!', sub: `${clipCount} clips. Each one tells you what to say. Just record.`, cta: 'Open camera' };
    }
    if (brief.kind === 'story') {
      return { head: 'This is a Story reel!', sub: 'Record the hook we wrote, then tell it your way. The plug is the last clip.', cta: 'Open camera' };
    }
    return { head: 'This is a Freestyle reel!', sub: `Record whatever you want. Make sure to mention ${companyName} in the video!`, cta: 'Open camera' };
  }
  if (brief.kind === 'handheld') {
    return { head: 'This is a Handheld post!', sub: "Everything's ready, just add your pictures and send for approval!", cta: "Let's go" };
  }
  if (brief.kind === 'story') {
    return {
      head: 'This is a Story post!',
      sub: 'The cover and plug are set. The middle is yours: your photos, your words if you want them.',
      cta: "Let's go",
    };
  }
  return { head: 'This is a Freestyle post!', sub: `No brief. Make whatever you want. Mention ${companyName} somewhere in it.`, cta: 'Pick your photos' };
}

type FanCard = { text?: string; who?: 'creator' | 'mixed'; label?: string };

function fanFor(brief: WeekBrief): FanCard[] {
  if (brief.format === 'reel') {
    return [0, 1, 2].map((k) => ({ text: k === 1 && brief.kind !== 'open' ? brief.title : undefined, who: 'mixed' }));
  }
  if (brief.kind === 'handheld') {
    const points = brief.slides.filter((s) => s.role === 'point').map((s) => s.text);
    return [{ text: points[0] ?? 'Best plays first' }, { text: brief.title }, { text: points[1] ?? 'No music' }];
  }
  if (brief.kind === 'story') {
    return [{ who: 'creator', label: 'Your photo' }, { text: brief.title }, { who: 'creator', label: 'Your words' }];
  }
  return [
    { who: 'creator', label: 'Anything' },
    { who: 'creator', label: 'You decide' },
    { who: 'creator', label: 'Go wild' },
  ];
}

export function StartScreen({ brief, companyName, clipCount = 0, onBack, onGo }: StartScreenProps): JSX.Element {
  const insets = useSafeAreaInsets();
  const tone = briefTone.kind[brief.kind];
  const open = brief.kind === 'open';
  const reel = brief.format === 'reel';
  const { head, sub, cta } = copyFor(brief, companyName, clipCount);
  const fan = fanFor(brief);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BriefHeader onBack={onBack} title={open && !brief.title ? 'Freestyle' : brief.title} sub={FORMAT_LABEL[brief.format]} />
      <View style={[styles.body, { paddingBottom: Math.max(30, insets.bottom + 12) }]}>
        <View style={styles.center}>
          <View style={styles.fanWrap}>
            <View style={[styles.halo, { backgroundColor: tone.bg }]} />
            {fan.map((f, k) => (
              <View
                key={k}
                style={[
                  styles.fanCard,
                  {
                    zIndex: k === 1 ? 2 : 1,
                    transform: [{ translateX: (k - 1) * 78 }, { rotate: `${(k - 1) * 12}deg` }, { translateY: k === 1 ? -6 : 10 }],
                  },
                ]}
              >
                <MiniSlide w={k === 1 ? 108 : 94} text={f.text} who={f.who ?? 'mixed'} label={f.label} textScale={0.95}>
                  {reel ? (
                    <View style={styles.playWrap} pointerEvents="none">
                      <View style={styles.play}>
                        <Icon name="play" size={14} color={color.ink} />
                      </View>
                    </View>
                  ) : null}
                </MiniSlide>
              </View>
            ))}
          </View>
          <View style={styles.copy}>
            <Text style={styles.head}>{head}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </View>
          {brief.creatorNote ? (
            <View style={styles.note}>
              <View style={[styles.noteIcon, { backgroundColor: tone.bg }]}>
                <Icon name="message-circle" size={16} color={tone.fg} />
              </View>
              <View style={styles.noteBody}>
                <Text style={styles.noteLabel}>Note from {companyName}</Text>
                <Text style={styles.noteText}>{brief.creatorNote}</Text>
              </View>
            </View>
          ) : null}
        </View>
        <Button size="lg" block icon={reel ? 'video' : undefined} onPress={onGo} style={[styles.go, { backgroundColor: tone.accent }]}>
          {cta}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.offWhite },
  body: { flex: 1, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 },
  fanWrap: { width: 280, height: 250, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 240, height: 240, borderRadius: 999 },
  fanCard: { position: 'absolute' },
  playWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  play: { width: 30, height: 30, borderRadius: 999, backgroundColor: color.whiteA90, alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'center', gap: 8 },
  head: { fontFamily: typeToken.font.display, fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6, color: color.ink, textAlign: 'center' },
  sub: { fontFamily: typeToken.font.ui, fontSize: 16, lineHeight: 23, fontWeight: '500', color: color.slate500, textAlign: 'center', maxWidth: 300 },
  note: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.border,
  },
  noteIcon: { width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  noteBody: { flex: 1, gap: 2 },
  noteLabel: { fontFamily: typeToken.font.ui, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: color.slate400 },
  noteText: { fontFamily: typeToken.font.ui, fontSize: 14.5, lineHeight: 20, fontWeight: '500', color: color.ink },
  go: { height: 56, shadowOpacity: 0 },
});
