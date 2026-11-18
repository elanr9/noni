// Creator's view of an outline or a Long Text post (V2Library.jsx OutlineScreen):
// hero, direction, beats, the on-screen words for a 7 second post, and the
// record button in the footer.
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { varyLongText } from '../../../lib/brief-ai';
import type { Brief } from '../../../lib/brief-library';
import { color, text } from '../../../theme/v2';
import { Button, Card, Icon, Screen, Skeleton } from '../../v2';
import { BriefBeats, BriefHero, BriefNotes, LongTextCard } from './BriefParts';

export interface OutlineScreenProps {
  brief: Brief | undefined;
  /** The library finished loading; a missing brief then means it is gone. */
  loaded?: boolean;
  onBack: () => void;
  onRecord: (mode: 'guided' | 'outline', myText: string) => void;
}

export function OutlineScreen({ brief: b, loaded = true, onBack, onRecord }: OutlineScreenProps) {
  const seven = !!b && b.type === 'Long Text' && b.kind === 'Guided' && !!b.clips?.length;
  const myText = useMemo(() => (seven && b ? varyLongText(b.clips?.[0]?.onScreen || b.lt?.onScreen || b.title) : ''), [seven, b]);
  if (!b && !loaded) {
    return (
      <Screen back={onBack} title="Outline">
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          <Skeleton h={180} />
          <Skeleton h={96} />
          <Skeleton h={120} />
        </View>
      </Screen>
    );
  }
  if (!b) {
    return (
      <Screen back={onBack} title="Outline" footer={<Button label="Back" variant="quiet" onPress={onBack} />}>
        <Animated.View entering={FadeIn.duration(220)} style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
            <View style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: color.grey1, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="search" size={22} color={color.grey4} />
            </View>
            <Text style={[text.row, { textAlign: 'center' }]}>This brief is no longer available</Text>
            <Text style={[text.meta, { textAlign: 'center' }]}>Your team may have removed it. Pick another brief or record your own post.</Text>
          </Card>
        </Animated.View>
      </Screen>
    );
  }
  return (
    <Screen
      back={onBack}
      title={seven ? 'Long Text' : 'Outline'}
      footer={<Button icon="videocam" label={seven ? 'Record 7 seconds' : 'Start recording'} onPress={() => onRecord(seven ? 'guided' : 'outline', myText)} />}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}>
        <BriefHero b={b} />
        <BriefNotes notes={b.notes} />
        {!seven && b.clips?.length ? <BriefBeats clips={b.clips} /> : null}
        {seven ? <LongTextCard text={myText} /> : null}
      </ScrollView>
    </Screen>
  );
}
