import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  briefWeekRangeLabel,
  type BriefFormat,
  type BriefWeekSummary,
  type PostType,
} from '../../../lib/briefs-api';
import {
  currentPlanningWeek,
  listEmptyWeekSlots,
  type EmptyWeekSlot,
} from '../../../lib/post-fill';
import { borderWidth, color, radiusAdmin, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PressableScale } from '../../ui/PressableScale';
import { PostTypeChip, Sheet, TypeChip } from '../shared';
import { SubTabs } from './SubTabs';

/** The slot and type the post is generated into. */
export type MakeTarget = {
  week: BriefWeekSummary;
  slot: EmptyWeekSlot;
  postType: PostType;
};

export interface MakePostSheetProps {
  visible: boolean;
  /** "“The one note editors leave…”" or "@handle · TikTok". */
  sourceLabel: string;
  /** The source's own type, when known, so a typed slot is the only choice left. */
  preferredFamily: BriefFormat | null;
  postTypes: PostType[];
  /** True while the post generates; the sheet locks until it finishes. */
  busy: boolean;
  onPick: (target: MakeTarget) => void;
  onOpenWeek: (campaignId: string) => void;
  onClose: () => void;
}

function formatChip(family: BriefFormat) {
  return family === 'photo_carousel' ? (
    <TypeChip tone="brand" icon="images">
      Slideshow
    </TypeChip>
  ) : (
    <TypeChip tone="brand" icon="video">
      Reel
    </TypeChip>
  );
}

/**
 * Make a post from a library item. Loads the week being planned, lists its
 * empty slots by lane, and a tap on a slot generates straight into it. Slots
 * that have no type yet ask for one first, limited to the slot's lane.
 */
export function MakePostSheet({
  visible,
  sourceLabel,
  preferredFamily,
  postTypes,
  busy,
  onPick,
  onOpenWeek,
  onClose,
}: MakePostSheetProps) {
  const [week, setWeek] = useState<BriefWeekSummary | null>(null);
  const [slots, setSlots] = useState<EmptyWeekSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lane, setLane] = useState<BriefFormat>('video');
  const [typeFor, setTypeFor] = useState<EmptyWeekSlot | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Fresh state on every open, without an effect: reset when visible flips on.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setLoading(true);
      setError(null);
      setTypeFor(null);
      setBusyKey(null);
    }
  }

  useEffect(() => {
    if (!visible) return;
    let live = true;
    currentPlanningWeek()
      .then(async (found) => {
        if (!live) return;
        setWeek(found);
        const open = found ? await listEmptyWeekSlots(found.campaign.id) : [];
        if (!live) return;
        setSlots(open);
        const hasVideo = open.some((s) => s.family === 'video');
        const hasSlides = open.some((s) => s.family === 'photo_carousel');
        setLane(
          preferredFamily && open.some((s) => s.family === preferredFamily)
            ? preferredFamily
            : hasVideo || !hasSlides
              ? 'video'
              : 'photo_carousel',
        );
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load this week.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [visible, preferredFamily]);

  const activeBusyKey = busy ? busyKey : null;

  function pickSlot(slot: EmptyWeekSlot) {
    if (!week || busy) return;
    if (slot.postType) {
      setBusyKey(slot.briefId);
      onPick({ week, slot, postType: slot.postType });
      return;
    }
    setTypeFor(slot);
  }

  function pickType(postType: PostType) {
    if (!week || !typeFor || busy) return;
    setBusyKey(postType.id);
    onPick({ week, slot: typeFor, postType });
  }

  const laneSlots = slots.filter((s) => s.family === lane);
  const videoCount = slots.filter((s) => s.family === 'video').length;
  const slideCount = slots.filter((s) => s.family === 'photo_carousel').length;
  const laneTypes = postTypes.filter(
    (t) => (t.family === 'photo_carousel' ? 'photo_carousel' : 'video') === lane,
  );

  const weekLabel = week
    ? `Week ${week.weekNumber}, ${
        week.campaign.drop_date ? briefWeekRangeLabel(week.campaign.drop_date) : 'not scheduled'
      }`
    : null;

  const subtitle =
    typeFor !== null
      ? `${lane === 'photo_carousel' ? 'Slideshow' : 'Reel'} ${String(typeFor.laneIndex).padStart(2, '0')} has no type yet. Pick one and the post generates.`
      : weekLabel
        ? `From ${sourceLabel}. Goes into ${weekLabel}. Pick the empty slot it fills.`
        : `From ${sourceLabel}.`;

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        if (busy) return;
        if (typeFor !== null) {
          setTypeFor(null);
          return;
        }
        onClose();
      }}
      title="Make a post"
      subtitle={subtitle}
    >
      {loading ? (
        <ActivityIndicator style={styles.spinner} color={color.blue500} />
      ) : error !== null ? (
        <Text style={styles.empty}>{error}</Text>
      ) : week === null ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No week to fill yet</Text>
          <Text style={styles.empty}>Start a week in Briefs, then make posts into it from here.</Text>
        </View>
      ) : slots.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>This week is full</Text>
          <Text style={styles.empty}>Every slot already has a post. Add a slot in Briefs.</Text>
          <Button variant="tint" size="sm" onPress={() => onOpenWeek(week.campaign.id)}>
            Open the week
          </Button>
        </View>
      ) : typeFor !== null ? (
        <View style={styles.card}>
          {laneTypes.map((t, i) => {
            const isBusy = activeBusyKey === t.id;
            return (
              <PressableScale
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                disabled={busy}
                onPress={() => pickType(t)}
                style={[
                  styles.row,
                  i < laneTypes.length - 1 && styles.rowDivider,
                  isBusy && styles.rowBusy,
                  busy && !isBusy && styles.rowDim,
                ]}
              >
                <PostTypeChip typeKey={t.key} label={t.label} />
                <View style={styles.flex} />
                {formatChip(lane)}
                {isBusy && <ActivityIndicator size="small" color={color.blue600} />}
              </PressableScale>
            );
          })}
          {laneTypes.length === 0 && (
            <Text style={[styles.empty, styles.padded]}>No post types set up for this lane.</Text>
          )}
        </View>
      ) : (
        <>
          <SubTabs<BriefFormat>
            items={[
              { id: 'video', label: 'Reels', count: videoCount },
              { id: 'photo_carousel', label: 'Slideshows', count: slideCount },
            ]}
            value={lane}
            onChange={(next) => {
              if (!busy) setLane(next);
            }}
          />
          <View style={[styles.card, styles.cardSpaced]}>
            {laneSlots.map((slot, i) => {
              const isBusy = activeBusyKey === slot.briefId;
              return (
                <PressableScale
                  key={slot.briefId}
                  accessibilityRole="button"
                  accessibilityLabel={`Slot ${slot.laneIndex}`}
                  disabled={busy}
                  onPress={() => pickSlot(slot)}
                  style={[
                    styles.row,
                    i < laneSlots.length - 1 && styles.rowDivider,
                    isBusy && styles.rowBusy,
                    busy && !isBusy && styles.rowDim,
                  ]}
                >
                  <Text style={styles.index}>{String(slot.laneIndex).padStart(2, '0')}</Text>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>Empty slot</Text>
                    <Text style={styles.rowSub}>
                      {slot.postType ? 'Type set, generates on tap' : 'Pick a type next'}
                    </Text>
                  </View>
                  {slot.postType ? (
                    <PostTypeChip typeKey={slot.postType.key} label={slot.postType.label} />
                  ) : (
                    formatChip(slot.family)
                  )}
                  {isBusy ? (
                    <ActivityIndicator size="small" color={color.blue600} />
                  ) : (
                    <Icon name="chevron-right" size={16} color={color.slate300} />
                  )}
                </PressableScale>
              );
            })}
            {laneSlots.length === 0 && (
              <Text style={[styles.empty, styles.padded]}>
                {lane === 'photo_carousel'
                  ? 'No empty slideshow slots this week.'
                  : 'No empty reel slots this week.'}
              </Text>
            )}
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  spinner: {
    paddingVertical: 32,
  },
  flex: {
    flex: 1,
  },
  card: {
    backgroundColor: color.white,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    overflow: 'hidden',
    marginBottom: 8,
  },
  cardSpaced: {
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
  },
  rowBusy: {
    backgroundColor: color.blue50,
  },
  rowDim: {
    opacity: 0.45,
  },
  index: {
    width: 26,
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    fontVariant: ['tabular-nums'],
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.ink,
  },
  rowSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: color.slate400,
  },
  emptyWrap: {
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },
  empty: {
    fontSize: 13.5,
    lineHeight: 13.5 * 1.45,
    fontWeight: '500',
    color: color.slate500,
  },
  padded: {
    padding: 14,
  },
});
