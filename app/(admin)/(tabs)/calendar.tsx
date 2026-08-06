// Hidden route: the calendar lives in Briefs as a view toggle now. This
// stays navigable (same pattern as Trends and Settings) for deep links.
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalendarView } from '../../../components/admin/CalendarView';
import { color, space, type } from '../../../theme/tokens';

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setRefreshToken((t) => t + 1);
            }}
          />
        }
      >
        <Text style={styles.h1}>Calendar</Text>
        <CalendarView
          refreshToken={refreshToken}
          onRefreshed={() => setRefreshing(false)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  scrollContent: { paddingHorizontal: space.gutter, paddingBottom: 116 },
  h1: {
    fontSize: type.size.titleXl,
    lineHeight: type.size.titleXl * type.leading.title,
    fontWeight: '800',
    letterSpacing: type.tracking.title,
    color: color.ink,
    marginTop: 10,
    marginBottom: 12,
  },
});
