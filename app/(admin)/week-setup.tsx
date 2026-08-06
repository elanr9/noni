// Week setup: the only stepped flow in the product. It runs once a week so
// it can afford ceremony. Ratio, then video types, then slideshow types.
// The counts are a POOL, not a lock — posts stay retypeable from the grid.
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { StepperRow } from '../../components/admin/setup/StepperRow';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../lib/auth';
import {
  createWeek,
  listPostTypes,
  type PostType,
} from '../../lib/briefs-api';
import { color, radius, shadow, type } from '../../theme/tokens';

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

export default function WeekSetupScreen() {
  const { profile } = useAuth();
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [videoTarget, setVideoTarget] = useState(20);
  const [slideshowTarget, setSlideshowTarget] = useState(10);
  const [split, setSplit] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void listPostTypes()
      .then((types) => {
        setPostTypes(types);
        const defaults: Record<string, number> = {};
        let videos = 0;
        let slideshows = 0;
        for (const t of types) {
          defaults[t.key] = t.default_week_count;
          if (t.family === 'video') videos += t.default_week_count;
          else slideshows += t.default_week_count;
        }
        setSplit(defaults);
        if (videos > 0) setVideoTarget(videos);
        if (slideshows > 0) setSlideshowTarget(slideshows);
      })
      .catch(() =>
        Alert.alert('Could not load post types', 'Pull back and try again.'),
      );
  }, []);

  const videoTypes = useMemo(
    () => postTypes.filter((t) => t.family === 'video'),
    [postTypes],
  );
  const slideshowTypes = useMemo(
    () => postTypes.filter((t) => t.family === 'photo_carousel'),
    [postTypes],
  );

  const sumFor = (types: PostType[]): number =>
    types.reduce((sum, t) => sum + (split[t.key] ?? 0), 0);
  const videoSum = sumFor(videoTypes);
  const slideshowSum = sumFor(slideshowTypes);

  function setCount(key: string, value: number) {
    setSplit((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  }

  async function finish() {
    if (!profile) return;
    setCreating(true);
    try {
      const drop = nextSunday();
      const campaign = await createWeek({
        companyId: profile.company_id,
        createdBy: profile.id,
        name: `Week of ${formatDropDate(drop)}`,
        dropDate: drop,
        videoTarget,
        slideshowTarget,
        typeSplit: split,
        postTypes,
      });
      router.replace(`/(admin)/week/${campaign.id}`);
    } catch (e) {
      Alert.alert(
        'Could not start the week',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setCreating(false);
    }
  }

  const stepTitles = ['How many posts?', 'Video types', 'Slideshow types'];
  const stepNotes = [
    'The week is one shared pool of posts for the whole roster.',
    `Split the ${videoTarget} videos across the five types. Every post stays retypeable later.`,
    `Split the ${slideshowTarget} slideshows. This is a pool, not a lock.`,
  ];

  const sumOk =
    step === 0 ||
    (step === 1 ? videoSum === videoTarget : slideshowSum === slideshowTarget);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.stepLabel}>{`Step ${step + 1} of 3`}</Text>
      <Text style={styles.h1}>{stepTitles[step]}</Text>
      <Text style={styles.note}>{stepNotes[step]}</Text>

      {step === 0 ? (
        <View style={styles.card}>
          <StepperRow
            label="Videos"
            value={videoTarget}
            onChange={(v) => setVideoTarget(Math.max(0, v))}
          />
          <StepperRow
            label="Slideshows"
            value={slideshowTarget}
            onChange={(v) => setSlideshowTarget(Math.max(0, v))}
          />
          <Text style={styles.totalLine}>
            {videoTarget + slideshowTarget} posts this week
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {(step === 1 ? videoTypes : slideshowTypes).map((t) => (
            <StepperRow
              key={t.key}
              label={t.label}
              value={split[t.key] ?? 0}
              onChange={(v) => setCount(t.key, v)}
            />
          ))}
          <Text
            style={[styles.totalLine, !sumOk && styles.totalLineOff]}
          >
            {step === 1
              ? `${videoSum} of ${videoTarget} videos`
              : `${slideshowSum} of ${slideshowTarget} slideshows`}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        {step > 0 ? (
          <Button
            size="md"
            variant="tint"
            onPress={() => setStep((s) => (s === 2 ? 1 : 0))}
          >
            Back
          </Button>
        ) : null}
        {step < 2 ? (
          <Button
            size="md"
            variant="primary"
            disabled={!sumOk || postTypes.length === 0}
            onPress={() => setStep((s) => (s === 0 ? 1 : 2))}
          >
            Next
          </Button>
        ) : (
          <Button
            size="md"
            variant="primary"
            disabled={!sumOk || creating}
            onPress={() => void finish()}
          >
            {creating ? 'Setting up…' : 'Create the week'}
          </Button>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.offWhite },
  content: { padding: 20, paddingBottom: 60 },
  stepLabel: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  h1: {
    marginTop: 6,
    fontSize: type.size.title,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  note: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: type.size.bodySm,
    color: color.slate500,
    lineHeight: type.size.bodySm * type.leading.body,
  },
  card: {
    padding: 16,
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  totalLine: {
    marginTop: 10,
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.green,
  },
  totalLineOff: { color: color.amber },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
