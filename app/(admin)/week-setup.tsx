// Start week — stamps 30 empty posts (20 video / 10 slideshow) from each
// post type's default_week_count. No mix wizard; admins edit types on the grid.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AdminScreen, PushHeader } from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../lib/auth';
import {
  createWeek,
  listCampaigns,
  listPostTypes,
  type PostType,
} from '../../lib/briefs-api';
import { color, type } from '../../theme/tokens';

const VIDEO_TARGET = 20;
const SLIDESHOW_TARGET = 10;

function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((7 - d.getDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

function formatDropDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function mondayOf(iso: string): Date {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

/** "Aug 17–23", or "Aug 30 – Sep 5" across a month boundary. */
function weekRangeLabel(dropDate: string): string {
  const mon = mondayOf(dropDate);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const monMonth = mon.toLocaleDateString(undefined, { month: 'short' });
  if (mon.getMonth() === sun.getMonth()) {
    return `${monMonth} ${mon.getDate()}–${sun.getDate()}`;
  }
  const sunMonth = sun.toLocaleDateString(undefined, { month: 'short' });
  return `${monMonth} ${mon.getDate()} – ${sunMonth} ${sun.getDate()}`;
}

function splitFromTypes(types: PostType[]): Record<string, number> {
  const split: Record<string, number> = {};
  for (const t of types) {
    split[t.key] = t.default_week_count;
  }
  return split;
}

export default function WeekSetupScreen() {
  const { profile } = useAuth();
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const started = useRef(false);

  const dropDate = useMemo(nextSunday, []);

  useEffect(() => {
    void listCampaigns()
      .then((all) => setWeekNumber(all.length + 1))
      .catch(() => setWeekNumber(null));
  }, []);

  const startWeek = useCallback(async () => {
    if (!profile) return;
    setStatus('working');
    setErrorMessage(null);
    try {
      const postTypes = await listPostTypes();
      if (postTypes.length === 0) {
        throw new Error(
          'Post types are missing for this company. Contact support.',
        );
      }
      await createWeek({
        companyId: profile.company_id,
        createdBy: profile.id,
        name: `Week of ${formatDropDate(dropDate)}`,
        dropDate,
        videoTarget: VIDEO_TARGET,
        slideshowTarget: SLIDESHOW_TARGET,
        typeSplit: splitFromTypes(postTypes),
        postTypes,
      });
      router.replace('/(admin)/(tabs)/create');
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not start the week';
      setErrorMessage(message);
      setStatus('error');
      Alert.alert('Could not start the week', message);
    }
  }, [dropDate, profile]);

  useEffect(() => {
    if (!profile || started.current) return;
    started.current = true;
    void startWeek();
  }, [profile, startWeek]);

  return (
    <AdminScreen
      actionBar={
        status === 'error' ? (
          <View style={styles.footerRow}>
            <Button
              variant="ghost"
              size="md"
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="md"
              style={styles.nextBtn}
              onPress={() => void startWeek()}
            >
              Try again
            </Button>
          </View>
        ) : undefined
      }
    >
      <PushHeader
        title={
          weekNumber !== null
            ? `Week ${weekNumber} · ${weekRangeLabel(dropDate)}`
            : weekRangeLabel(dropDate)
        }
        subtitle="Starting week"
        onBack={() => router.back()}
      />

      <View style={styles.center}>
        {status === 'error' ? (
          <>
            <Text style={styles.h1}>Could not start</Text>
            <Text style={styles.intent}>
              {errorMessage ?? 'Try again in a moment.'}
            </Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={color.accent} />
            <Text style={styles.h1}>Setting up 30 posts</Text>
            <Text style={styles.intent}>
              20 videos and 10 slideshows, types already stamped. You can edit
              any post after.
            </Text>
          </>
        )}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  h1: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
    textAlign: 'center',
  },
  intent: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 14 * 1.45,
    color: color.slate500,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  backBtn: {
    flexBasis: '30%',
  },
  nextBtn: {
    flex: 1,
  },
});
