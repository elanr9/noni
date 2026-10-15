// A library feature's media at width w: the real screenshot or screen
// recording at its own aspect (a recording shows its first frame, a play
// badge and its real length), shared with the manager canvas. Features with
// nothing in the Library get a toned card with their name, never fake art.
import type { JSX } from 'react';
import { View } from 'react-native';

import type { LibraryFeature } from '../../../lib/library-api';
import { briefTone } from '../../../theme/tokens';
import { FeatureMediaCard, hasFeatureMedia, NoMediaCard } from '../../admin/briefs/media/FeatureMedia';
import { featureToneKey } from './model';

export function FeatureShot({
  feature,
  w,
  video = false,
  live = false,
}: {
  feature: LibraryFeature;
  w: number;
  video?: boolean;
  /** Play a recording muted on loop instead of its poster. */
  live?: boolean;
}): JSX.Element {
  const tone = briefTone.featureTones[featureToneKey(feature.title, feature.isGeneral)];
  return (
    <View style={{ width: w, alignItems: 'center' }}>
      {hasFeatureMedia(feature, video) ? (
        <FeatureMediaCard feature={feature} w={w} video={video} live={live} tone={tone} />
      ) : (
        <NoMediaCard tone={tone} w={w} video={video} label={feature.title} hint={false} />
      )}
    </View>
  );
}
