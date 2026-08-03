import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Brief } from '../../lib/briefs-api';
import { color, radius, type } from '../../theme/tokens';
import { FormatPill } from '../ui/FormatPill';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { SheetShell } from '../ui/SheetShell';

export function BacklogSheet(props: {
  visible: boolean;
  briefs: Brief[];
  addingId: string | null;
  onAdd: (brief: Brief) => void;
  onClose: () => void;
}): JSX.Element {
  const { visible, briefs, addingId, onAdd, onClose } = props;

  return (
    <SheetShell visible={visible} onClose={onClose} pinnedTop={120}>
      <Text style={styles.h2}>From the backlog</Text>
      <Text style={styles.subtitle}>
        Every brief you have written, free to run again this week.
      </Text>

      {briefs.length === 0 ? (
        <Text style={styles.empty}>
          Nothing here yet. Briefs land in the backlog the moment you save them.
        </Text>
      ) : (
        briefs.map((brief) => {
          const adding = addingId === brief.id;
          return (
            <PressableScale
              key={brief.id}
              accessibilityRole="button"
              disabled={adding}
              onPress={() => onAdd(brief)}
              style={styles.row}
            >
              <View style={styles.rowBody}>
                <FormatPill
                  compact
                  format={brief.format === 'photo_carousel' ? 'photo_carousel' : 'video'}
                />
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {brief.title}
                </Text>
                {brief.hook ? (
                  <Text style={styles.rowHook} numberOfLines={2}>
                    {brief.hook}
                  </Text>
                ) : null}
              </View>
              <View style={styles.addBadge}>
                {adding ? (
                  <Text style={styles.addingText}>…</Text>
                ) : (
                  <Icon name="plus" size={16} color={color.blue700} />
                )}
              </View>
            </PressableScale>
          );
        })
      )}
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  h2: {
    fontSize: type.size.titleSm,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  empty: {
    paddingVertical: 32,
    textAlign: 'center',
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: {
    fontSize: type.size.body,
    fontWeight: '700',
    color: color.ink,
  },
  rowHook: {
    fontSize: type.size.meta,
    color: color.slate500,
  },
  addBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addingText: {
    fontSize: type.size.body,
    fontWeight: '700',
    color: color.blue700,
  },
});
