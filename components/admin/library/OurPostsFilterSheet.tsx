import { StyleSheet, Text, View } from 'react-native';

import type { PostType } from '../../../lib/briefs-api';
import { color, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Sheet } from '../shared';
import { ChipRow } from './ChipRow';

export interface OurPostsFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  creators: { id: string; full_name: string | null }[];
  postTypes: PostType[];
  creatorId: string | null;
  postTypeId: string | null;
  onChangeCreator: (id: string | null) => void;
  onChangePostType: (id: string | null) => void;
}

/** Creator and post type filters for the Our posts lane. */
export function OurPostsFilterSheet({
  visible,
  onClose,
  creators,
  postTypes,
  creatorId,
  postTypeId,
  onChangeCreator,
  onChangePostType,
}: OurPostsFilterSheetProps) {
  const anyActive = creatorId !== null || postTypeId !== null;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter posts"
      footer={
        <View style={styles.footer}>
          {anyActive && (
            <Button
              variant="ghost"
              onPress={() => {
                onChangeCreator(null);
                onChangePostType(null);
              }}
            >
              Clear
            </Button>
          )}
          <Button onPress={onClose} style={styles.done}>
            Done
          </Button>
        </View>
      }
    >
      <Text style={styles.label}>Creator</Text>
      <ChipRow<string | null>
        wrap
        options={[
          { id: null, label: 'All creators' },
          ...creators.map((c) => ({ id: c.id, label: c.full_name ?? 'Unnamed' })),
        ]}
        value={creatorId}
        onChange={onChangeCreator}
      />
      <Text style={[styles.label, styles.labelGap]}>Post type</Text>
      <ChipRow<string | null>
        wrap
        options={[
          { id: null, label: 'All types' },
          ...postTypes.map((t) => ({ id: t.id, label: t.label })),
        ]}
        value={postTypeId}
        onChange={onChangePostType}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: type.size.label,
    fontWeight: '700',
    color: color.slate500,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
    marginBottom: 8,
  },
  labelGap: {
    marginTop: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  done: {
    flex: 1,
  },
});
