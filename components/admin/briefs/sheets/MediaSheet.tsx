// Media sheet (SSCanvas.jsx MediaSheet): the Library's screenshots for
// slideshows, screen recordings for reels. A pick lands on the slide as the
// movable inset, never as the background.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LibraryFeature } from '../../../../lib/library-api';
import { color, type as typeToken } from '../../../../theme/tokens';
import { Sheet } from '../../shared';
import { featureToneFor, Shot } from '../Shot';

export function MediaSheet({
  visible,
  features,
  current,
  video,
  onPick,
  onClose,
}: {
  visible: boolean;
  features: LibraryFeature[];
  current: string | null;
  video: boolean;
  onPick: (feature: LibraryFeature) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      pinnedTop={120}
      header={
        <View style={styles.tabs}>
          <View style={styles.tabOn}>
            <Text style={styles.tabOnText}>{video ? 'Screen recordings' : 'Screenshots'}</Text>
          </View>
        </View>
      }
    >
      <View style={styles.grid}>
        {features.map((it) => {
          const on = current === it.id;
          return (
            <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={it.title} onPress={() => onPick(it)} style={styles.cell}>
              <View style={[styles.thumb, { backgroundColor: featureToneFor(it.title).tone }, on ? styles.thumbOn : null]}>
                <Shot feature={it} w={60} video={video} />
              </View>
              <Text numberOfLines={1} style={styles.title}>
                {it.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  tabOn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.ink },
  tabOnText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 13, color: color.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '30%', flexGrow: 1, gap: 6 },
  thumb: { aspectRatio: 3 / 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumbOn: { borderWidth: 3, borderColor: color.blue500 },
  title: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 13, color: color.ink },
});
