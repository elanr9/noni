import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import {
  Bubble,
  DayDivider,
  VoiceNote,
} from '../../../../components/creator/ChatKit';
import { FormatTag, TypeTag } from '../../../../components/creator/Chips';
import { Screen } from '../../../../components/layout/Screen';
import { Button } from '../../../../components/ui/Button';
import { Icon } from '../../../../components/ui/Icon';
import { PressableScale } from '../../../../components/ui/PressableScale';
import { useAuth } from '../../../../lib/auth';
import { getBrief, type BriefWithType } from '../../../../lib/briefs-api';
import {
  listThread,
  parseMessageMedia,
  signedChatMediaUrl,
} from '../../../../lib/messages-api';
import {
  listAssignmentReviewEvents,
} from '../../../../lib/review-events';
import {
  getAssignment,
  type AssignmentWithBrief,
} from '../../../../lib/tasks-api';
import { color, radius, shadow, space, type } from '../../../../theme/tokens';

type ThreadItem = {
  id: string;
  at: string;
  side: 'manager' | 'creator';
  author: string;
  text: string;
  voice: { uri: string | null; durationLabel: string } | null;
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const h = `${d.getHours()}`.padStart(2, '0');
  const m = `${d.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
}

export default function ChangesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [assignment, setAssignment] = useState<AssignmentWithBrief | null>(null);
  const [briefWithType, setBriefWithType] = useState<BriefWithType | null>(null);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id || !profile?.id || !profile.company_id) return;
    try {
      const row = await getAssignment(id);
      setAssignment(row);
      if (row === null) return;

      const [typed, events, thread] = await Promise.all([
        getBrief(row.brief_id),
        listAssignmentReviewEvents(row.id),
        listThread(row.company_id, profile.id),
      ]);
      setBriefWithType(typed);

      const collected: ThreadItem[] = [];

      for (const e of events) {
        if (e.action !== 'changes_requested' && e.action !== 'comment') continue;
        const note = e.note?.trim();
        if (note === undefined || note === '') continue;
        const mine = e.author_id === profile.id;
        collected.push({
          id: `event-${e.id}`,
          at: e.created_at,
          side: mine ? 'creator' : 'manager',
          author: mine ? 'You' : e.profiles?.full_name?.trim() || 'Your team',
          text: note,
          voice: null,
        });
      }

      const related = thread.filter(
        (m) =>
          m.postRef !== null &&
          (m.postRef.assignmentId === row.id || m.postRef.briefId === row.brief_id),
      );
      for (const m of related) {
        const { media, text } = parseMessageMedia(m.body);
        let voice: ThreadItem['voice'] = null;
        if (media !== null && media.media === 'video') {
          const uri = await signedChatMediaUrl(media.url).catch(() => null);
          voice = { uri, durationLabel: media.len ?? '0:00' };
        }
        const body = text.trim();
        if (body === '' && voice === null) continue;
        collected.push({
          id: `msg-${m.id}`,
          at: m.createdAt,
          side: m.fromCreator ? 'creator' : 'manager',
          author: m.fromCreator ? 'You' : m.authorName,
          text: body,
          voice,
        });
      }

      collected.sort((a, b) => a.at.localeCompare(b.at));
      setItems(collected);
    } catch {
      // Keep whatever loaded; the thread renders what it has.
    } finally {
      setLoading(false);
    }
  }, [id, profile?.id, profile?.company_id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const brief = assignment?.briefs ?? null;
  const isPhoto = brief?.format === 'photo_carousel';
  const typeLabel = useMemo(
    () => briefWithType?.post_types?.label ?? null,
    [briefWithType],
  );
  const typeKey = briefWithType?.post_types?.key;

  const onRecordChanges = () => {
    if (assignment === null) return;
    const usesUpload =
      assignment.briefs.format === 'photo_carousel' &&
      assignment.briefs.post_type_id !== null;
    if (usesUpload) {
      router.push(`/(creator)/upload/${assignment.id}`);
      return;
    }
    router.push(`/(creator)/record/${assignment.id}?assignment=1`);
  };

  if (loading) {
    return (
      <Screen bg={color.offWhite} contentStyle={styles.center}>
        <ActivityIndicator size="large" color={color.accent} />
      </Screen>
    );
  }

  if (assignment === null || brief === null) {
    return (
      <Screen bg={color.offWhite} contentStyle={styles.center}>
        <Text style={styles.missing}>Post not found</Text>
        <PressableScale onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </PressableScale>
      </Screen>
    );
  }

  return (
    <Screen
      scroll={false}
      bg={color.offWhite}
      contentStyle={styles.screenContent}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          icon={isPhoto ? 'images' : 'video'}
          onPress={onRecordChanges}
        >
          Record changes
        </Button>
      }
    >
      <View style={styles.topBar}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <Text style={styles.topTitle}>Changes requested</Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={[styles.summaryCard, shadow.shadowCard]}>
        <View style={styles.summaryThumb}>
          <Icon
            name={isPhoto ? 'images' : 'video'}
            size={18}
            color={color.blue700}
          />
        </View>
        <View style={styles.summaryBody}>
          <Text style={styles.summaryTitle} numberOfLines={2}>
            {brief.title}
          </Text>
          <View style={styles.summaryChips}>
            <FormatTag format={brief.format} />
            {typeLabel !== null && <TypeTag label={typeLabel} typeKey={typeKey} />}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.thread}
        showsVerticalScrollIndicator={false}
      >
        <DayDivider label="Revisions for this post" />
        {items.length === 0 ? (
          <Text style={styles.emptyThread}>
            No notes yet. Your manager&apos;s feedback lands here.
          </Text>
        ) : (
          items.map((item) => (
            <Bubble
              key={item.id}
              side={item.side}
              author={item.side === 'manager' ? item.author : undefined}
              time={timeLabel(item.at)}
            >
              {item.voice !== null ? (
                <View style={styles.bubbleStack}>
                  <VoiceNote
                    uri={item.voice.uri ?? undefined}
                    durationLabel={item.voice.durationLabel}
                    onAccent={item.side === 'creator'}
                  />
                  {item.text !== '' && (
                    <Text
                      style={
                        item.side === 'creator'
                          ? styles.bubbleTextCreator
                          : styles.bubbleTextManager
                      }
                    >
                      {item.text}
                    </Text>
                  )}
                </View>
              ) : (
                item.text
              )}
            </Bubble>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: space[3],
    paddingBottom: 0,
    gap: space[4],
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  missing: {
    fontSize: type.size.body,
    color: color.slate500,
  },
  backLink: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    color: color.blue700,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  topSpacer: {
    width: 40,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
  },
  summaryThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.cell,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBody: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  summaryTitle: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.bold,
    lineHeight: type.size.bodySm * type.leading.snug,
    letterSpacing: -0.2,
    color: color.ink,
  },
  summaryChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  thread: {
    gap: space[4],
    paddingTop: space[1],
    paddingBottom: space[8],
  },
  emptyThread: {
    textAlign: 'center',
    fontSize: type.size.chip,
    color: color.slate400,
    paddingTop: space[4],
  },
  bubbleStack: {
    gap: 8,
  },
  bubbleTextManager: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.ink,
  },
  bubbleTextCreator: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.white,
  },
});
