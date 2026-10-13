// Post type peek (SSManager.jsx KindScreen peek sheet): the type's about
// line, an example deck and "Continue with {name}".

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { BriefKind, BriefMediaFormat } from '../../../lib/briefs-api';
import type { PostTypeCopy } from '../../../lib/brief-copy';
import { briefTone, color, type as typeToken } from '../../../theme/tokens';
import { BriefChip, KIND_CHIP_TONE } from '../../shared/briefs';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { SectionLabel, Sheet } from '../shared';
import { SlideCard } from './SlideCard';

const CARD_W = 104;

export function PostTypePeekSheet({
  postType,
  kind,
  format,
  onClose,
  onContinue,
}: {
  postType: PostTypeCopy | null;
  kind: BriefKind;
  format: BriefMediaFormat;
  onClose: () => void;
  onContinue: (postType: PostTypeCopy) => void;
}) {
  const story = kind === 'story';
  const video = format === 'reel';
  return (
    <Sheet
      visible={postType !== null}
      onClose={onClose}
      footer={
        postType ? (
          <Button size="lg" block onPress={() => onContinue(postType)}>
            {`Continue with ${postType.name}`}
          </Button>
        ) : undefined
      }
    >
      {postType ? (
        <View style={styles.body}>
          <View style={styles.head}>
            <BriefChip tone={KIND_CHIP_TONE[kind]} size="lg">
              {postType.name}
            </BriefChip>
            <Text numberOfLines={1} style={styles.line}>
              {postType.line}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
              <View style={styles.closeCircle}>
                <Icon name="x" size={17} color={color.slate500} />
              </View>
            </Pressable>
          </View>
          <Text style={styles.about}>{postType.about}</Text>
          <View style={styles.example}>
            <SectionLabel>Example</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deck} contentContainerStyle={styles.deckContent}>
              <SlideCard w={CARD_W} text={postType.example} tstyle={{ size: 1.15 }} who="mixed" video={video} />
              {postType.slides.map((s, i) => (
                <SlideCard
                  key={i}
                  w={CARD_W}
                  text={story ? undefined : s}
                  label={story ? s : undefined}
                  tstyle={{ size: 1.05 }}
                  who={story ? 'creator' : 'mixed'}
                  video={video}
                />
              ))}
              <SlideCard w={CARD_W} text="Link in bio" insetTone={briefTone.featureTones.sent} tstyle={{ size: 1.1 }} who="mixed" video={video} />
            </ScrollView>
          </View>
        </View>
      ) : (
        <View />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingTop: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 13, color: color.slate500 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -5 },
  closeCircle: { width: 34, height: 34, borderRadius: 999, backgroundColor: color.fillQuiet, alignItems: 'center', justifyContent: 'center' },
  about: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 16, lineHeight: 16 * 1.45, color: color.ink },
  example: { gap: 8 },
  deck: { marginHorizontal: -20 },
  deckContent: { gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
});
