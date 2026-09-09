// Week setup is one screen: how many videos and slideshows each creator
// posts a day. Rows are stamped by format only; the kind of post is chosen
// inside the editor.
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';

import { AdminScreen, PushHeader, SectionLabel } from '../../components/admin/shared';
import { RatioCard } from '../../components/admin/setup/RatioCard';
import { StartDayCalendar } from '../../components/admin/StartDayCalendar';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../lib/auth';
import {
  BRIEF_WEEK_DAYS,
  briefWeekRangeLabel,
  createWeek,
  listCampaigns,
} from '../../lib/briefs-api';
import { color, radiusAdmin } from '../../theme/tokens';

const DEFAULT_VIDEOS_PER_DAY = 2;
const DEFAULT_SLIDESHOWS_PER_DAY = 1;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((7 - d.getDay()) % 7) || 7));
  return isoDate(d);
}

function formatDropDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function WeekSetupScreen() {
  const { profile } = useAuth();
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [videosPerDay, setVideosPerDay] = useState(DEFAULT_VIDEOS_PER_DAY);
  const [slideshowsPerDay, setSlideshowsPerDay] = useState(
    DEFAULT_SLIDESHOWS_PER_DAY,
  );
  const [dropDate, setDropDate] = useState(nextSunday);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void listCampaigns()
      .then((all) => setWeekNumber(all.length + 1))
      .catch(() => setWeekNumber(null));
  }, []);

  const perDay = videosPerDay + slideshowsPerDay;
  const videosWeekly = videosPerDay * BRIEF_WEEK_DAYS;
  const slideshowsWeekly = slideshowsPerDay * BRIEF_WEEK_DAYS;
  const totalRows = videosWeekly + slideshowsWeekly;

  async function startWeek() {
    if (!profile || totalRows === 0) return;
    setSubmitting(true);
    try {
      const campaign = await createWeek({
        companyId: profile.company_id,
        createdBy: profile.id,
        name: `Week of ${formatDropDate(dropDate)}`,
        dropDate,
        videosPerDay,
        slideshowsPerDay,
      });
      router.replace(`/(admin)/week/${campaign.id}`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not start the week';
      Alert.alert('Could not start the week', message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Week setup' }} />
      <AdminScreen
        actionBar={
          <Button
            variant="primary"
            size="md"
            block
            disabled={submitting || totalRows === 0}
            onPress={() => void startWeek()}
          >
            {submitting ? 'Creating rows' : `Create ${plural(totalRows, 'row', 'rows')}`}
          </Button>
        }
      >
        <PushHeader
          title={
            weekNumber !== null
              ? `Week ${weekNumber} · ${briefWeekRangeLabel(dropDate)}`
              : briefWeekRangeLabel(dropDate)
          }
          subtitle="Week setup"
          onBack={() => router.back()}
        />

        <View style={styles.body}>
          <Text style={styles.h1}>Posts a day</Text>
          <Text style={styles.intent}>
            How many should each creator post a day? That is the whole setup.
          </Text>

          <View style={styles.cards}>
            <RatioCard
              icon="video"
              label="Videos a day"
              sub="Reels"
              value={videosPerDay}
              onChange={setVideosPerDay}
            />
            <RatioCard
              icon="images"
              label="Slideshows a day"
              sub="Photo carousels"
              value={slideshowsPerDay}
              onChange={setSlideshowsPerDay}
            />
          </View>

          <View style={styles.summary}>
            <Icon name="sparkles" size={16} color={color.blue700} />
            <Text style={styles.summaryText}>
              {totalRows === 0
                ? 'Pick at least one post a day.'
                : `${plural(perDay, 'post', 'posts')} a day, ${totalRows} this week: ${plural(videosWeekly, 'video', 'videos')} and ${plural(slideshowsWeekly, 'slideshow', 'slideshows')}. Each post suggests its kind when you open it.`}
            </Text>
          </View>

          <SectionLabel style={styles.startLabel}>Start day</SectionLabel>
          <StartDayCalendar value={dropDate} onChange={setDropDate} />
          <Text style={styles.hint}>
            {`Runs ${briefWeekRangeLabel(dropDate)}. The clock starts when the first post goes live.`}
          </Text>
        </View>
      </AdminScreen>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    marginTop: 8,
    gap: 12,
  },
  h1: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: color.ink,
  },
  intent: {
    marginTop: -4,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 14 * 1.45,
    color: color.slate500,
  },
  cards: {
    gap: 10,
    marginTop: 4,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue50,
  },
  summaryText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 13.5 * 1.4,
    color: color.blue700,
  },
  startLabel: {
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 13 * 1.45,
    color: color.slate500,
  },
});
