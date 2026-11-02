// Creator's view of an outline or a Long Text post (V2Library.jsx OutlineScreen):
// hero, direction, beats, the on-screen words for a 7 second post, and the
// record button in the footer.
import { useMemo } from 'react';
import { ScrollView } from 'react-native';

import { varyLongText } from '../../../lib/brief-ai';
import type { Brief } from '../../../lib/brief-library';
import { Button, Screen } from '../../v2';
import { BriefBeats, BriefHero, BriefNotes, LongTextCard } from './BriefParts';

export interface OutlineScreenProps {
  brief: Brief | undefined;
  onBack: () => void;
  onRecord: (mode: 'guided' | 'outline', myText: string) => void;
}

export function OutlineScreen({ brief: b, onBack, onRecord }: OutlineScreenProps) {
  const seven = !!b && b.type === 'Long Text' && b.kind === 'Guided' && !!b.clips?.length;
  const myText = useMemo(() => (seven && b ? varyLongText(b.clips?.[0]?.onScreen || b.lt?.onScreen || b.title) : ''), [seven, b]);
  if (!b) return <Screen back={onBack} title="Outline" />;
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
