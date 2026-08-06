// Week setup — admin handoff §7. Three screens, once a week: the mix,
// video types, slideshow types. The counts are a POOL, not a lock; posts
// stay retypeable from the grid. This screen is the only way a week
// starts — publishing never creates the next one.
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { RatioCard } from '../../components/admin/setup/RatioCard';
import { StepBars } from '../../components/admin/setup/StepBars';
import { SumBanner } from '../../components/admin/setup/SumBanner';
import { TypeRow } from '../../components/admin/setup/TypeRow';
import { AdminScreen, PushHeader } from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAuth } from '../../lib/auth';
import {
  createWeek,
  listCampaigns,
  listPostTypes,
  type PostType,
} from '../../lib/briefs-api';
import { color, radiusAdmin, type } from '../../theme/tokens';

/** Kit structure lines by type key; clip_structure fallback for new types. */
const STRUCTURE: Record<string, string> = {
  numbered_list: 'Hook, N points, outro',
  talking_head: '3 to 5 points, one speaker',
  explainer: 'One idea, taken apart',
  contrast: 'Two sides, one speaker',
  replay_bait: 'One clip, built to loop',
  numbered_tips: 'One slide per point',
  how_to: 'Steps in order',
  getting_started: 'For someone on day one',
};

function structureLine(t: PostType): string {
  if (t.key in STRUCTURE) return STRUCTURE[t.key];
  if (t.clip_structure === 'single_clip') return 'One clip';
  if (t.clip_structure === 'slide_per_point') return 'One slide per point';
  return 'Hook, N points, outro';
}

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

export default function WeekSetupScreen() {
  const { profile } = useAuth();
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [videoTarget, setVideoTarget] = useState(20);
  const [slideshowTarget, setSlideshowTarget] = useState(10);
  const [split, setSplit] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);

  const dropDate = useMemo(nextSunday, []);

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
    void listCampaigns()
      .then((all) => setWeekNumber(all.length + 1))
      .catch(() => setWeekNumber(null));
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
  const total = videoTarget + slideshowTarget;

  function setCount(key: string, value: number) {
    setSplit((prev) => ({ ...prev, [key]: Math.max(0, value) }));
  }

  function goBack() {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((s) => (s === 2 ? 1 : 0));
  }

  async function finish() {
    if (!profile) return;
    setCreating(true);
    try {
      await createWeek({
        companyId: profile.company_id,
        createdBy: profile.id,
        name: `Week of ${formatDropDate(dropDate)}`,
        dropDate,
        videoTarget,
        slideshowTarget,
        typeSplit: split,
        postTypes,
      });
      router.replace('/(admin)/(tabs)/create');
    } catch (e) {
      Alert.alert(
        'Could not start the week',
        e instanceof Error ? e.message : 'Try again',
      );
    } finally {
      setCreating(false);
    }
  }

  const titles = ["This week's mix", 'Video types', 'Slideshow types'];
  const intents = [
    'Thirty posts is the week. Change the ratio if the roster is short.',
    `The ${videoTarget} videos split across five types. Numbered list carries the week.`,
    `The ${slideshowTarget} slideshows split across three types.`,
  ];

  const sumOk =
    step === 0
      ? total > 0
      : step === 1
        ? videoSum === videoTarget
        : slideshowSum === slideshowTarget;

  return (
    <AdminScreen
      actionBar={
        <View style={styles.footer}>
          <Text style={styles.poolLine}>
            This is a pool, not a lock. Any post&apos;s type stays editable.
          </Text>
          <View style={styles.footerRow}>
            <Button variant="ghost" size="md" style={styles.backBtn} onPress={goBack}>
              Back
            </Button>
            {step < 2 ? (
              <Button
                variant="primary"
                size="md"
                style={styles.nextBtn}
                disabled={!sumOk || postTypes.length === 0}
                onPress={() => setStep((s) => (s === 0 ? 1 : 2))}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                style={styles.nextBtn}
                disabled={!sumOk || creating}
                onPress={() => void finish()}
              >
                {creating ? 'Setting up…' : 'Create the week'}
              </Button>
            )}
          </View>
        </View>
      }
    >
      <PushHeader
        title={
          weekNumber !== null
            ? `Week ${weekNumber} · ${weekRangeLabel(dropDate)}`
            : weekRangeLabel(dropDate)
        }
        subtitle={`Step ${step + 1} of 3`}
        onBack={goBack}
      />

      <View style={styles.bars}>
        <StepBars step={step} total={3} />
      </View>

      <Text style={styles.h1}>{titles[step]}</Text>
      <Text style={styles.intent}>{intents[step]}</Text>

      {step === 0 ? (
        <View style={styles.stack}>
          <RatioCard
            icon="video"
            label="Videos"
            sub="Reels"
            value={videoTarget}
            onChange={setVideoTarget}
          />
          <RatioCard
            icon="images"
            label="Slideshows"
            sub="Photo carousels"
            value={slideshowTarget}
            onChange={setSlideshowTarget}
          />
          <View style={styles.note}>
            <Icon name="layout-list" size={16} color={color.blue600} />
            <Text style={styles.noteText}>
              {total} rows will be stamped and ready to fill
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          <SumBanner
            assigned={step === 1 ? videoSum : slideshowSum}
            target={step === 1 ? videoTarget : slideshowTarget}
            noun={step === 1 ? 'videos' : 'slideshows'}
          />
          {(step === 1 ? videoTypes : slideshowTypes).map((t) => (
            <TypeRow
              key={t.key}
              label={t.label}
              structure={structureLine(t)}
              value={split[t.key] ?? 0}
              onChange={(v) => setCount(t.key, v)}
            />
          ))}
        </View>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  bars: {
    marginTop: 4,
    marginBottom: 18,
  },
  h1: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  intent: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 14 * 1.45,
    color: color.slate500,
  },
  stack: {
    gap: 10,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.blue50,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: color.blue700,
  },
  footer: {
    gap: 10,
  },
  poolLine: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '400',
    color: color.slate400,
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
