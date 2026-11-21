import { ScrollView, Text, View } from 'react-native';

import { StTextView } from '../../components/v2/StTextView';
import { stText, type StTextStyle } from '../../lib/brief-library';
import { ST_FONT_FACES } from '../../lib/st-text';

const STYLES: StTextStyle[] = ['outline', 'inv-bg', 'bg', 'none'];
const W = 170;
const H = 96;

/** Dev only: every editor font in every text style, as a post draws it. */
export default function Preview() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#17181C' }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      {ST_FONT_FACES.map((face, font) => (
        <View key={face.name} style={{ gap: 6 }}>
          <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600' }}>{face.name}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {STYLES.map((style) => (
              <View key={style} style={{ width: W, height: H, borderRadius: 12, backgroundColor: '#3B4252', overflow: 'hidden' }}>
                <StTextView x={stText('Stop scrolling if you play soccer', { font, style, color: style === 'outline' || style === 'none' ? '#FFFFFF' : '#3496F0', x: 50, y: 50, w: 92, size: 26 })} width={W} height={H} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
