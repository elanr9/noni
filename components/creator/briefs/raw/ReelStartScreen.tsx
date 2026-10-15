// What a creator sees when they open a reel: the title, what kind of video
// it is in one line, the brand's note, ideas if the brief has any, and how
// to work in the plug. Then Record, raw, like on TikTok; Noni does the
// editing after.
import type { JSX } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WeekBrief } from '../../../../lib/briefs-api';
import { briefTone, color, radius, type as typeToken } from '../../../../theme/tokens';
import { BriefHeader } from '../../../shared/briefs';
import { Button } from '../../../ui/Button';
import { Icon, type IconName } from '../../../ui/Icon';
import { ctaPlace } from '../model';

export type ReelStartScreenProps = {
  brief: WeekBrief;
  companyName: string;
  /** True when takes are already recorded for this post. */
  resume: boolean;
  onBack: () => void;
  onGo: () => void;
};

type TypeLine = { name: string; how: string; icon: IconName };

/** One plain line per post type, said the way a friend would explain it. */
export function typeLine(brief: Pick<WeekBrief, 'postTypeKey' | 'postTypeName' | 'kind'>): TypeLine {
  switch (brief.postTypeKey) {
    case 'numbered_list':
      return { name: 'Numbered list', how: 'Say the hook, then one tip at a time. Noni numbers them on screen.', icon: 'layout-list' };
    case 'how_to_reel':
      return { name: 'How to', how: 'Walk through the steps in order. Show it if you can.', icon: 'layout-list' };
    case 'talking_head':
      return { name: 'Talking head', how: 'Just you and the camera, like you are telling a friend.', icon: 'video' };
    case 'explainer':
      return { name: 'Explainer', how: 'Explain one thing simply, like you would to a teammate.', icon: 'video' };
    case 'storytime':
      return { name: 'Storytime', how: 'Tell what happened, start with the best part.', icon: 'video' };
    case 'green_screen_react':
      return { name: 'Green screen', how: 'Put the screenshot behind you and react to it. You are the content.', icon: 'image' };
    case 'seven_second':
    case 'long_text':
    case 'replay_bait':
      return { name: '7 second video', how: 'One quick clip, 7 seconds or less. Look at the camera.', icon: 'clock' };
    default:
      if (brief.kind === 'open') return { name: 'Freestyle', how: 'Make whatever you want. Just mention the product in it.', icon: 'sparkles' };
      return { name: brief.postTypeName ?? 'Video', how: 'Record it your way, start with the hook.', icon: 'video' };
  }
}

function plugLine(brief: WeekBrief, companyName: string): string {
  const place = ctaPlace(brief);
  const where = place === 'after_hook' ? 'Say it right after your hook.' : place === 'end' ? 'Say it at the end.' : 'Say it wherever it fits.';
  const what = brief.cta.text.trim() || `Mention ${companyName} and why you use it.`;
  return `${what} ${where}`;
}

export function ReelStartScreen({ brief, companyName, resume, onBack, onGo }: ReelStartScreenProps): JSX.Element {
  const insets = useSafeAreaInsets();
  const tone = briefTone.format.reel;
  const type = typeLine(brief);
  const ideas = brief.slides.filter((s) => s.role === 'point' && s.text.trim()).map((s) => s.text.trim());
  const title = brief.title || (brief.kind === 'open' ? 'Freestyle' : 'Your video');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BriefHeader onBack={onBack} title={companyName} sub="Reel" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
          <Icon name={type.icon} size={14} color={tone.fg} />
          <Text style={[styles.chipText, { color: tone.fg }]}>{type.name}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.how}>{type.how}</Text>

        {brief.creatorNote ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Note from {companyName}</Text>
            <Text style={styles.cardText}>{brief.creatorNote}</Text>
          </View>
        ) : null}

        {ideas.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Ideas to start from</Text>
            {ideas.map((idea, k) => (
              <View key={`${k}-${idea}`} style={styles.idea}>
                <Text style={styles.ideaNum}>{k + 1}</Text>
                <Text style={styles.cardText}>{idea}</Text>
              </View>
            ))}
            <Text style={styles.cardHint}>Say them your way, or use your own.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>The plug</Text>
          <Text style={styles.cardText}>{plugLine(brief, companyName)}</Text>
        </View>
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: Math.max(24, insets.bottom + 10) }]}>
        <View style={styles.magic}>
          <Icon name="sparkles" size={14} color={color.slate500} />
          <Text style={styles.magicText}>Record it raw. Noni cuts it and adds the headers and captions.</Text>
        </View>
        <Button size="lg" block icon="video" onPress={onGo} style={styles.go}>
          {resume ? 'Keep going' : 'Record'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.offWhite },
  scroll: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24, gap: 14 },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  chipText: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700' },
  title: { fontFamily: typeToken.font.display, fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.7, color: color.ink },
  how: { fontFamily: typeToken.font.ui, fontSize: 16, lineHeight: 23, fontWeight: '500', color: color.slate500, marginTop: -4 },
  card: { gap: 8, padding: 16, borderRadius: radius.lg, backgroundColor: color.white, borderWidth: 1, borderColor: color.border },
  cardLabel: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700', color: color.slate400 },
  cardText: { flex: 1, fontFamily: typeToken.font.ui, fontSize: 15.5, lineHeight: 22, fontWeight: '500', color: color.ink },
  cardHint: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '500', color: color.slate400 },
  idea: { flexDirection: 'row', gap: 10 },
  ideaNum: { width: 18, fontFamily: typeToken.font.ui, fontSize: 15.5, lineHeight: 22, fontWeight: '800', color: color.slate400 },
  foot: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  magic: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  magicText: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '600', color: color.slate500, textAlign: 'center' },
  go: { height: 56, shadowOpacity: 0, backgroundColor: color.ink },
});
