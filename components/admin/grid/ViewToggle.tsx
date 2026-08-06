// Admin handoff §6 — grid/calendar toggle in the Briefs header. 36×32
// pills, active white + card shadow. Calendar is a view, never a tab.
import { LayoutGrid } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';

export type BriefsView = 'grid' | 'calendar';

export interface ViewToggleProps {
  view: BriefsView;
  onChange: (view: BriefsView) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <View style={styles.track}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Grid view"
        accessibilityState={{ selected: view === 'grid' }}
        onPress={() => onChange('grid')}
        style={[styles.pill, view === 'grid' && [styles.pillActive, shadow.shadowCard]]}
      >
        <LayoutGrid
          size={15}
          color={view === 'grid' ? color.ink : color.slate400}
          strokeWidth={2}
        />
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Calendar view"
        accessibilityState={{ selected: view === 'calendar' }}
        onPress={() => onChange('calendar')}
        style={[styles.pill, view === 'calendar' && [styles.pillActive, shadow.shadowCard]]}
      >
        <Icon
          name="calendar-days"
          size={15}
          color={view === 'calendar' ? color.ink : color.slate400}
        />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.fillQuiet,
  },
  pill: {
    width: 36,
    height: 32,
    borderRadius: radiusAdmin.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: color.white,
  },
});
