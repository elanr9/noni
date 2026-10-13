// The main card on the creator home: format, kind and post type tags, the
// title, then the big Create button, or the In review / Posted state row.
// From SSCreator.jsx CreatorHome.
import type { JSX } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CreatorBriefItem } from '../../../../lib/briefs-api';
import { color, radius, shadow, type as typeToken } from '../../../../theme/tokens';
import { FormatChip, KindChip, PostTypeChip } from '../../../shared/briefs';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { creatorStatus } from '../model';

export function TodayCard({
  item,
  companyName,
  onCreate,
}: {
  item: CreatorBriefItem;
  companyName: string;
  onCreate: () => void;
}): JSX.Element {
  const { brief } = item;
  const status = creatorStatus(item.status);
  const reel = brief.format === 'reel';
  const title = brief.kind === 'open' && !brief.title ? 'Freestyle' : brief.title;
  return (
    <View style={[styles.card, shadow.shadowCard]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsScroll} contentContainerStyle={styles.tags}>
        <FormatChip format={brief.format} size="lg" toned withIcon />
        <KindChip kind={brief.kind} format={brief.format} size="lg" />
        {brief.postTypeName ? <PostTypeChip name={brief.postTypeName} size="lg" toned /> : null}
      </ScrollView>
      <Text style={styles.title}>{title}</Text>
      {status === 'posted' ? (
        <View style={styles.stateRow}>
          <View style={[styles.statePill, { backgroundColor: color.greenSoft }]}>
            <Icon name="circle-check-big" size={14} color={color.green} />
            <Text style={[styles.stateText, { color: color.green }]}>Posted</Text>
          </View>
          <Text style={styles.stateNote}>Counting views</Text>
        </View>
      ) : status === 'review' ? (
        <View style={styles.stateRow}>
          <View style={[styles.statePill, { backgroundColor: color.amberSoft }]}>
            <Icon name="clock" size={14} color={color.amber} />
            <Text style={[styles.stateText, { color: color.amber }]}>In review</Text>
          </View>
          <Text style={styles.stateNote}>{companyName} is looking at it</Text>
        </View>
      ) : (
        <Button size="lg" block icon={reel ? 'video' : 'images'} onPress={onCreate} style={styles.cta}>
          {reel ? 'Record reel now' : 'Create slideshow now'}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 16,
    borderRadius: radius['2xl'],
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.border,
  },
  tagsScroll: { marginHorizontal: -18 },
  tags: { flexDirection: 'row', gap: 6, paddingHorizontal: 18 },
  title: {
    fontFamily: typeToken.font.display,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: color.ink,
  },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill },
  stateText: { fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '700' },
  stateNote: { flex: 1, fontFamily: typeToken.font.ui, fontSize: 13, fontWeight: '600', color: color.slate500 },
  cta: { height: 56 },
});
