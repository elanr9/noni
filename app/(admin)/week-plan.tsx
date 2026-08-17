// Day planner publish. The campaign manager fills each day with exactly two
// posts and one slideshow, by hand or with Randomize, then sends only the
// days they planned. Creators are notified right away, and the screen can be
// reopened later to plan the rest of the week.
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  AdminScreen,
  Card,
  PushHeader,
  Sheet,
  SkeletonCard,
} from '../../components/admin/shared';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { PressableScale } from '../../components/ui/PressableScale';
import {
  briefRowState,
  listCampaignBriefs,
  listPublishedCampaignDays,
  publishCampaignDays,
  type CampaignBriefItem,
} from '../../lib/briefs-api';
import { color, radiusAdmin, shadow } from '../../theme/tokens';

const PLAN_DAYS = 7;
/** Slot 0 and 1 are posts (videos), slot 2 is the slideshow. */
type DaySlots = [string | null, string | null, string | null];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayTitle(iso: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
  });
}

function daySubtitle(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function familyOf(item: CampaignBriefItem): 'video' | 'photo_carousel' {
  const raw = item.briefs.post_types?.family ?? item.briefs.format;
  return raw === 'photo_carousel' ? 'photo_carousel' : 'video';
}

export default function WeekPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<CampaignBriefItem[]>([]);
  const [sentBriefIds, setSentBriefIds] = useState<Set<string>>(new Set());
  const [sentDates, setSentDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [plan, setPlan] = useState<Record<string, DaySlots>>({});
  const [picker, setPicker] = useState<{
    date: string;
    slot: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [campaignItems, published] = await Promise.all([
        listCampaignBriefs(id),
        listPublishedCampaignDays(id),
      ]);
      setItems(campaignItems);
      setSentBriefIds(published.briefIds);
      setSentDates(published.dates);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const dates = useMemo(() => {
    const today = new Date();
    return Array.from({ length: PLAN_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return isoDate(d);
    });
  }, []);

  // Ready to send: reviewed, not killed, never published on an earlier day.
  const readyItems = useMemo(
    () =>
      items.filter(
        (item) =>
          briefRowState(item.briefs, item.briefs.post_types) === 'complete' &&
          !item.briefs.kill_reason &&
          !sentBriefIds.has(item.brief_id),
      ),
    [items, sentBriefIds],
  );

  const usedIds = useMemo(() => {
    const used = new Set<string>();
    for (const slots of Object.values(plan)) {
      for (const briefId of slots) if (briefId) used.add(briefId);
    }
    return used;
  }, [plan]);

  const availableOf = useCallback(
    (family: 'video' | 'photo_carousel') =>
      readyItems.filter(
        (item) => familyOf(item) === family && !usedIds.has(item.brief_id),
      ),
    [readyItems, usedIds],
  );

  const slotsFor = useCallback(
    (date: string): DaySlots => plan[date] ?? [null, null, null],
    [plan],
  );

  function setSlot(date: string, slot: number, briefId: string | null) {
    setPlan((prev) => {
      const next = [...(prev[date] ?? [null, null, null])] as DaySlots;
      next[slot] = briefId;
      return { ...prev, [date]: next };
    });
  }

  function randomize() {
    const videos = shuffled(
      readyItems.filter((item) => familyOf(item) === 'video'),
    );
    const slides = shuffled(
      readyItems.filter((item) => familyOf(item) === 'photo_carousel'),
    );
    const next: Record<string, DaySlots> = {};
    for (const date of dates) {
      if (sentDates.has(date)) continue;
      const slots: DaySlots = [
        videos.shift()?.brief_id ?? null,
        videos.shift()?.brief_id ?? null,
        slides.shift()?.brief_id ?? null,
      ];
      // Only whole days: 2 posts and 1 slideshow, or nothing.
      if (slots.some((s) => s === null)) break;
      next[date] = slots;
    }
    setPlan(next);
  }

  const plannedDays = dates.filter(
    (date) =>
      !sentDates.has(date) && slotsFor(date).every((briefId) => briefId !== null),
  );
  const partialDays = dates.filter(
    (date) =>
      !sentDates.has(date) &&
      slotsFor(date).some((briefId) => briefId !== null) &&
      slotsFor(date).some((briefId) => briefId === null),
  );

  function confirmPublish() {
    Alert.alert(
      `Send ${plannedDays.length} ${plannedDays.length === 1 ? 'day' : 'days'} to creators?`,
      'Every creator gets these exact posts on these days and is notified right away. You can come back anytime to plan more days.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => void publish() },
      ],
    );
  }

  async function publish() {
    if (!id) return;
    setPublishing(true);
    try {
      const result = await publishCampaignDays(
        id,
        plannedDays.map((date) => ({
          date,
          briefIds: slotsFor(date).filter((b): b is string => b !== null),
        })),
      );
      Alert.alert(
        'Sent to creators',
        `${result.assignments_written} assignments across ${result.creators} creators. Notifications are on the way.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
      setPlan({});
      await load();
    } catch (e) {
      Alert.alert('Publish failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setPublishing(false);
    }
  }

  const briefById = useMemo(() => {
    const map = new Map<string, CampaignBriefItem>();
    for (const item of items) map.set(item.brief_id, item);
    return map;
  }, [items]);

  const pickerFamily: 'video' | 'photo_carousel' =
    picker?.slot === 2 ? 'photo_carousel' : 'video';
  const pickerChoices = picker ? availableOf(pickerFamily) : [];

  const videosLeft = availableOf('video').length;
  const slidesLeft = availableOf('photo_carousel').length;

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Plan days' }} />
      <AdminScreen
        actionBar={
          plannedDays.length > 0 ? (
            <View style={styles.footerStack}>
              <Button
                variant="primary"
                size="md"
                block
                disabled={publishing}
                onPress={confirmPublish}
              >
                {publishing
                  ? 'Sending…'
                  : `Send ${plannedDays.length} ${plannedDays.length === 1 ? 'day' : 'days'} to creators`}
              </Button>
              {partialDays.length > 0 ? (
                <Text style={styles.footerHint}>
                  Days send once they have 2 posts and 1 slideshow. Unfinished
                  days stay here.
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
      >
        <PushHeader
          title="Plan days"
          subtitle="2 posts and 1 slideshow each day"
          onBack={() => router.back()}
        />

        {loading ? (
          <View style={styles.stack}>
            <SkeletonCard height={150} />
            <SkeletonCard height={150} />
            <SkeletonCard height={150} />
          </View>
        ) : (
          <View style={styles.stack}>
            <View style={styles.toolbar}>
              <Text style={styles.poolText}>
                {`${videosLeft} ${videosLeft === 1 ? 'post' : 'posts'} and ${slidesLeft} ${slidesLeft === 1 ? 'slideshow' : 'slideshows'} ready`}
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Randomize the days"
                onPress={randomize}
                style={[styles.randomize, shadow.shadowCard]}
              >
                <Icon name="shuffle" size={14} color={color.blue600} />
                <Text style={styles.randomizeText}>Randomize</Text>
              </PressableScale>
            </View>

            {dates.map((date, dayIndex) => {
              const sent = sentDates.has(date);
              const slots = slotsFor(date);
              return (
                <Card key={date} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayTitle}>{dayTitle(date, dayIndex)}</Text>
                    <Text style={styles.dayDate}>{daySubtitle(date)}</Text>
                    {sent ? (
                      <View style={styles.sentPill}>
                        <Icon name="check" size={12} color={color.green} />
                        <Text style={styles.sentPillText}>With creators</Text>
                      </View>
                    ) : null}
                  </View>

                  {sent ? (
                    <Text style={styles.sentBody}>
                      This day is already published. Creators have their plan.
                    </Text>
                  ) : (
                    [0, 1, 2].map((slot) => {
                      const briefId = slots[slot];
                      const item = briefId ? briefById.get(briefId) : undefined;
                      const label = slot === 2 ? 'Slideshow' : `Post ${slot + 1}`;
                      return item !== undefined ? (
                        <View key={slot} style={styles.slotFilled}>
                          <View style={styles.slotBody}>
                            <Text style={styles.slotLabel}>{label}</Text>
                            <Text style={styles.slotTitle} numberOfLines={1}>
                              {item.briefs.title}
                            </Text>
                            {item.briefs.post_types?.label ? (
                              <Text style={styles.slotType} numberOfLines={1}>
                                {item.briefs.post_types.label}
                              </Text>
                            ) : null}
                          </View>
                          <PressableScale
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${item.briefs.title} from ${dayTitle(date, dayIndex)}`}
                            hitSlop={8}
                            onPress={() => setSlot(date, slot, null)}
                            style={styles.slotRemove}
                          >
                            <Icon name="x" size={14} color={color.slate500} />
                          </PressableScale>
                        </View>
                      ) : (
                        <PressableScale
                          key={slot}
                          accessibilityRole="button"
                          accessibilityLabel={`Add a ${slot === 2 ? 'slideshow' : 'post'} to ${dayTitle(date, dayIndex)}`}
                          onPress={() => setPicker({ date, slot })}
                          style={styles.slotEmpty}
                        >
                          <Icon
                            name={slot === 2 ? 'images' : 'video'}
                            size={14}
                            color={color.slate400}
                          />
                          <Text style={styles.slotEmptyText}>{`Add ${slot === 2 ? 'slideshow' : 'post'}`}</Text>
                          <Text style={styles.slotEmptyLabel}>{label}</Text>
                        </PressableScale>
                      );
                    })
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </AdminScreen>

      <Sheet
        visible={picker !== null}
        onClose={() => setPicker(null)}
        title={pickerFamily === 'photo_carousel' ? 'Pick a slideshow' : 'Pick a post'}
        subtitle={
          pickerChoices.length === 0
            ? 'Nothing ready and unassigned. Finish more posts first.'
            : 'Only finished posts show here.'
        }
      >
        <View style={styles.pickerList}>
          {pickerChoices.map((item) => (
            <PressableScale
              key={item.brief_id}
              accessibilityRole="button"
              accessibilityLabel={`Use ${item.briefs.title}`}
              onPress={() => {
                if (picker) setSlot(picker.date, picker.slot, item.brief_id);
                setPicker(null);
              }}
              style={styles.pickerRow}
            >
              <View style={styles.slotBody}>
                <Text style={styles.slotTitle} numberOfLines={1}>
                  {item.briefs.title}
                </Text>
                {item.briefs.post_types?.label ? (
                  <Text style={styles.slotType} numberOfLines={1}>
                    {item.briefs.post_types.label}
                  </Text>
                ) : null}
              </View>
              <Icon name="plus" size={16} color={color.blue600} />
            </PressableScale>
          ))}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  poolText: {
    flex: 1,
    fontSize: 13,
    color: color.slate500,
  },
  randomize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.white,
  },
  randomizeText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.blue600,
  },
  dayCard: {
    gap: 8,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: color.ink,
  },
  dayDate: {
    flex: 1,
    fontSize: 13,
    color: color.slate400,
  },
  sentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.greenSoft,
  },
  sentPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: color.green,
  },
  sentBody: {
    fontSize: 13,
    color: color.slate500,
  },
  slotFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.fillQuiet,
  },
  slotBody: {
    flex: 1,
    minWidth: 0,
  },
  slotLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  slotTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: color.ink,
  },
  slotType: {
    marginTop: 1,
    fontSize: 12,
    color: color.slate500,
  },
  slotRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  slotEmptyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: color.slate400,
  },
  slotEmptyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: color.slate400,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pickerList: {
    gap: 8,
    paddingBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.fillQuiet,
  },
  footerStack: {
    gap: 8,
  },
  footerHint: {
    fontSize: 12,
    lineHeight: 12 * 1.4,
    color: color.slate500,
    textAlign: 'center',
  },
});
