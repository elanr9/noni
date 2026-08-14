// Start week — the admin picks the start day and each lane's target,
// then the grid is stamped from the post types' default_week_count
// weights scaled to those targets. Types stay editable on the grid.
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';

import { AdminScreen, PushHeader, SectionLabel } from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { PressableScale } from '../../components/ui/PressableScale';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth';
import {
  briefWeekRangeLabel,
  createWeek,
  listCampaigns,
  listPostTypes,
  type PostType,
} from '../../lib/briefs-api';
import { color, radius, type } from '../../theme/tokens';

const DEFAULT_VIDEO_TARGET = 20;
const DEFAULT_SLIDESHOW_TARGET = 10;
/** Mirrors the publish scheduler: three posts per creator per day. */
const SLOTS_PER_DAY = 3;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The next seven days, starting tomorrow. */
function startDayOptions(): string[] {
  const options: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    options.push(isoDate(d));
  }
  return options;
}

function nextSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((7 - d.getDay()) % 7) || 7));
  return isoDate(d);
}

function dayChipLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDropDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** "Aug 12 to 16" for the days the schedule actually covers from the start day. */
function scheduleRangeLabel(dropDate: string, totalPosts: number): string {
  const days = Math.min(7, Math.max(1, Math.ceil(totalPosts / SLOTS_PER_DAY)));
  const start = new Date(`${dropDate}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  const startMonth = start.toLocaleDateString(undefined, { month: 'short' });
  if (start.getMonth() === end.getMonth()) {
    return `${startMonth} ${start.getDate()} to ${end.getDate()}`;
  }
  const endMonth = end.toLocaleDateString(undefined, { month: 'short' });
  return `${startMonth} ${start.getDate()} to ${endMonth} ${end.getDate()}`;
}

function parseTarget(text: string): number {
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

/**
 * Distribute one family's target across its types, proportional to
 * default_week_count (largest remainder), so the split always sums to
 * the target.
 */
function splitFamily(types: PostType[], target: number): Record<string, number> {
  const split: Record<string, number> = {};
  if (types.length === 0 || target <= 0) return split;
  const totalWeight = types.reduce((sum, t) => sum + t.default_week_count, 0);
  const weightOf = (t: PostType): number =>
    totalWeight > 0 ? t.default_week_count : 1;
  const denominator = totalWeight > 0 ? totalWeight : types.length;
  let assigned = 0;
  const remainders: { key: string; frac: number }[] = [];
  for (const t of types) {
    const exact = (target * weightOf(t)) / denominator;
    const base = Math.floor(exact);
    split[t.key] = base;
    assigned += base;
    remainders.push({ key: t.key, frac: exact - base });
  }
  remainders.sort((a, b) => b.frac - a.frac);
  for (let i = 0; assigned < target; i += 1) {
    split[remainders[i % remainders.length].key] += 1;
    assigned += 1;
  }
  return split;
}

export default function WeekSetupScreen() {
  const { profile } = useAuth();
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [videoText, setVideoText] = useState(String(DEFAULT_VIDEO_TARGET));
  const [slideshowText, setSlideshowText] = useState(
    String(DEFAULT_SLIDESHOW_TARGET),
  );
  const [dropDate, setDropDate] = useState(nextSunday);
  const [submitting, setSubmitting] = useState(false);

  const dayOptions = useMemo(startDayOptions, []);

  useEffect(() => {
    void listCampaigns()
      .then((all) => setWeekNumber(all.length + 1))
      .catch(() => setWeekNumber(null));
  }, []);

  const videoTarget = parseTarget(videoText);
  const slideshowTarget = parseTarget(slideshowText);
  const totalPosts = videoTarget + slideshowTarget;

  async function startWeek() {
    if (!profile || totalPosts === 0) return;
    setSubmitting(true);
    try {
      const postTypes = await listPostTypes();
      if (postTypes.length === 0) {
        throw new Error(
          'Post types are missing for this company. Contact support.',
        );
      }
      const typeSplit = {
        ...splitFamily(
          postTypes.filter((t) => t.family === 'video'),
          videoTarget,
        ),
        ...splitFamily(
          postTypes.filter((t) => t.family === 'photo_carousel'),
          slideshowTarget,
        ),
      };
      const campaign = await createWeek({
        companyId: profile.company_id,
        createdBy: profile.id,
        name: `Week of ${formatDropDate(dropDate)}`,
        dropDate,
        videoTarget,
        slideshowTarget,
        typeSplit,
        postTypes,
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
            disabled={submitting || totalPosts === 0}
            onPress={() => void startWeek()}
          >
            {submitting ? 'Setting up…' : `Start week · ${totalPosts} posts`}
          </Button>
        </View>
      }
    >
      <PushHeader
        title={
          weekNumber !== null
            ? `Week ${weekNumber} · ${briefWeekRangeLabel(dropDate)}`
            : `Week · ${briefWeekRangeLabel(dropDate)}`
        }
        subtitle="Week setup"
        onBack={() => router.back()}
      />

      <View style={styles.body}>
        <SectionLabel>Posts</SectionLabel>
        <View style={styles.targetsRow}>
          <View style={styles.targetField}>
            <Text style={styles.fieldLabel}>Videos</Text>
            <TextField
              value={videoText}
              onChangeText={setVideoText}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Video target"
            />
          </View>
          <View style={styles.targetField}>
            <Text style={styles.fieldLabel}>Slideshows</Text>
            <TextField
              value={slideshowText}
              onChangeText={setSlideshowText}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Slideshow target"
            />
          </View>
        </View>
        <Text style={styles.hint}>
          {totalPosts === 0
            ? 'Set at least one post.'
            : `${totalPosts} posts, up to ${SLOTS_PER_DAY} per creator per day: ${scheduleRangeLabel(dropDate, totalPosts)}. Types are stamped from the usual mix and stay editable on the grid.`}
        </Text>

        <SectionLabel style={styles.startLabel}>Start day</SectionLabel>
        <View style={styles.dayRow}>
          {dayOptions.map((iso) => {
            const selected = iso === dropDate;
            return (
              <PressableScale
                key={iso}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setDropDate(iso)}
                style={[styles.dayChip, selected && styles.dayChipOn]}
              >
                <Text
                  style={[styles.dayChipText, selected && styles.dayChipTextOn]}
                >
                  {dayChipLabel(iso)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
    </AdminScreen>
    </>
  );
}

const styles = StyleSheet.create({
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
  body: {
    marginTop: 8,
    gap: 10,
  },
  targetsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  targetField: {
    flex: 1,
    gap: 6,
  },
  fieldLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
  },
  hint: {
    fontSize: type.size.bodySm,
    fontWeight: '400',
    lineHeight: type.size.bodySm * 1.45,
    color: color.slate500,
  },
  startLabel: {
    marginTop: 10,
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  dayChipOn: {
    backgroundColor: color.blue100,
  },
  dayChipText: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.slate500,
  },
  dayChipTextOn: {
    color: color.blue700,
  },
});
