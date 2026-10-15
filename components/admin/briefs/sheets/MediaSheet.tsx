// Media sheet (SSCanvas.jsx MediaSheet): the Library's screenshots for
// slideshows, screen recordings for reels. A pick lands on the slide as the
// movable inset, never as the background. Tiles show the real media at its
// own aspect; features with nothing in the Library sit after the rest.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LibraryFeature } from '../../../../lib/library-api';
import { color, type as typeToken } from '../../../../theme/tokens';
import { Sheet } from '../../shared';
import { FeatureThumb, hasFeatureMedia } from '../media/FeatureMedia';
import { featureToneFor } from '../Shot';

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
  const withMedia = features.filter((f) => hasFeatureMedia(f, video));
  const ordered = [...withMedia, ...features.filter((f) => !hasFeatureMedia(f, video))];
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
      {withMedia.length === 0 ? (
        <Text style={styles.empty}>{video ? 'No screen recordings yet. Add them in Library and they show up here.' : 'No screenshots yet. Add them in Library and they show up here.'}</Text>
      ) : null}
      <View style={styles.grid}>
        {ordered.map((it) => {
          const on = current === it.id;
          return (
            <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={it.title} onPress={() => onPick(it)} style={styles.cell}>
              <FeatureThumb feature={it} video={video} tone={featureToneFor(it.title)} style={[styles.thumb, on ? styles.thumbOn : null]} />
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
  thumb: { aspectRatio: 9 / 16, borderRadius: 12 },
  thumbOn: { borderWidth: 3, borderColor: color.blue500 },
  empty: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 14, lineHeight: 20, color: color.slate500, paddingBottom: 12 },
  title: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 13, color: color.ink },
});
