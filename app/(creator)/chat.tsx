import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatMediaBlock } from '../../components/admin/chat/MessageBubble';
import { Bubble, DayDivider, PostRefCard } from '../../components/creator/ChatKit';
import { Icon } from '../../components/ui/Icon';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { PressableScale } from '../../components/ui/PressableScale';
import { useAuth } from '../../lib/auth';
import { listCampaignManagers } from '../../lib/briefs-api';
import { useCreatorQueue } from '../../lib/creator-queue';
import { useKeyboardPadding } from '../../lib/keyboard';
import {
  listThread,
  markCreatorThreadRead,
  parseMessageMedia,
  sendMessage,
  type ThreadMessage,
} from '../../lib/messages-api';
import { getCompany } from '../../lib/onboarding';
import type { AssignmentWithBrief } from '../../lib/tasks-api';
import {
  borderWidth,
  color,
  radius,
  shadow,
  space,
  type,
} from '../../theme/tokens';

const POLL_MS = 5000;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function localDayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** "Today", "Yesterday", weekday within the week, else "Jul 29". */
function dayDividerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (localDayKey(d) === localDayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (localDayKey(d) === localDayKey(yesterday)) return 'Yesterday';
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThen = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startToday.getTime() - startThen.getTime()) / 86400000);
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function firstNameOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Manager';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** F5: same route the changes-flow uses to re-record an assignment. */
function pushRecordChanges(assignment: AssignmentWithBrief): void {
  const usesUpload =
    assignment.briefs.format === 'photo_carousel' &&
    assignment.briefs.post_type_id !== null;
  if (usesUpload) {
    router.push(`/(creator)/upload/${assignment.id}`);
    return;
  }
  router.push(`/(creator)/record/${assignment.id}?assignment=1`);
}

/** One thread with the campaign manager (SCREENS §6). */
export default function CreatorChat() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const keyboardPadding = useKeyboardPadding();
  const { changesRequested } = useCreatorQueue();

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const didInitialScroll = useRef(false);

  const companyId = profile?.company_id ?? null;
  const creatorId = profile?.id ?? null;

  const threadSeq = useRef(0);

  const load = useCallback(async () => {
    if (companyId === null || creatorId === null) return;
    const seq = ++threadSeq.current;
    try {
      const fresh = await listThread(companyId, creatorId);
      if (seq !== threadSeq.current) return;
      setMessages((prev) => [
        ...fresh,
        ...prev.filter((m) => m.id.startsWith('local-')),
      ]);
    } catch {
      // Poll retries; keep what is on screen.
    } finally {
      setLoading(false);
    }
  }, [companyId, creatorId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    void getCompany(companyId)
      .then((company) => {
        if (!cancelled) setCompanyName(company.name);
      })
      .catch(() => undefined);
    void listCampaignManagers(companyId)
      .then((managers) => {
        if (!cancelled && managers.length > 0) setManagerName(managers[0].name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const markRead = useCallback(() => {
    if (companyId === null || creatorId === null) return;
    void markCreatorThreadRead({ companyId, creatorId, profileId: creatorId }).catch(
      () => undefined,
    );
  }, [companyId, creatorId]);

  useFocusEffect(markRead);

  const managerMessageCount = messages.filter((m) => !m.fromCreator).length;
  useEffect(() => {
    if (!loading && managerMessageCount > 0) markRead();
  }, [loading, managerMessageCount, markRead]);

  useEffect(() => {
    if (loading || didInitialScroll.current) return;
    didInitialScroll.current = true;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 120);
  }, [loading]);

  if (!profile) return null;

  // Fallback: the newest manager-authored message names the manager too.
  const lastManagerMessage = [...messages]
    .reverse()
    .find((m) => !m.fromCreator);
  const manager = managerName ?? lastManagerMessage?.authorName ?? 'Manager';
  const managerFirst = firstNameOf(manager);
  const company = companyName ?? 'Your company';
  const fix = changesRequested[0];

  const send = async () => {
    const body = draft.trim();
    if (body.length === 0 || sending) return;
    setSending(true);
    const optimistic: ThreadMessage = {
      id: `local-${Date.now()}`,
      creatorId: profile.id,
      authorId: profile.id,
      authorName: profile.full_name?.trim() || 'You',
      fromCreator: true,
      body,
      createdAt: new Date().toISOString(),
      postRef: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    try {
      await sendMessage({
        companyId: profile.company_id,
        creatorId: profile.id,
        authorId: profile.id,
        body,
      });
      threadSeq.current += 1;
      setMessages(await listThread(profile.company_id, profile.id));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = (m: ThreadMessage) => {
    const { media, text } = parseMessageMedia(m.body);
    const onAccent = m.fromCreator;
    const body = (
      <View style={styles.bubbleInner}>
        {m.postRef !== null && (
          <PostRefCard
            title={m.postRef.title}
            format={m.postRef.format}
            onPress={
              m.postRef.assignmentId !== null
                ? () =>
                    router.push({
                      pathname: '/(creator)/assignment/[id]',
                      params: { id: m.postRef?.assignmentId ?? '' },
                    })
                : undefined
            }
          />
        )}
        {media !== null && <ChatMediaBlock media={media} />}
        {text.length > 0 && (
          <Text style={onAccent ? styles.bodyCreator : styles.bodyManager}>
            {text}
          </Text>
        )}
      </View>
    );
    if (m.fromCreator) {
      return (
        <Bubble key={m.id} side="creator" time={timeLabel(m.createdAt)}>
          {body}
        </Bubble>
      );
    }
    return (
      <Bubble
        key={m.id}
        side="manager"
        author={firstNameOf(m.authorName)}
        time={timeLabel(m.createdAt)}
        avatarInitial={m.authorName.charAt(0).toUpperCase()}
      >
        {body}
      </Bubble>
    );
  };

  // Interleave day divider pills between day groups.
  const thread: ReactElement[] = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    const day = localDayKey(new Date(m.createdAt));
    if (day !== lastDay) {
      thread.push(<DayDivider key={`day-${day}`} label={dayDividerLabel(m.createdAt)} />);
      lastDay = day;
    }
    thread.push(renderMessage(m));
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Icon name="chevron-left" size={22} color={color.ink} />
        </PressableScale>
        <View style={styles.companyAvatar}>
          <Text style={styles.companyAvatarText}>
            {company.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {company}
          </Text>
          <Text numberOfLines={1} style={styles.headerSub}>
            Campaign manager · {managerFirst}
          </Text>
        </View>
      </View>

      <View style={[styles.flex, { paddingBottom: keyboardPadding }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.skeletons}>
              <SkeletonCard height={56} radius={radius.lg} style={styles.skeletonTheirs} />
              <SkeletonCard height={56} radius={radius.lg} style={styles.skeletonMine} />
              <SkeletonCard height={56} radius={radius.lg} style={styles.skeletonTheirs} />
            </View>
          ) : thread.length === 0 ? (
            <Text style={styles.empty}>No messages yet. Say hello.</Text>
          ) : (
            thread
          )}
        </ScrollView>

        {fix !== undefined && (
          <View style={[styles.fixBar, shadow.shadowRaised]}>
            <View style={styles.fixText}>
              <Text numberOfLines={1} style={styles.fixTitle}>
                {fix.briefs.title}
              </Text>
              <Text style={styles.fixSub}>
                Fix it and it goes back for approval.
              </Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Record changes for ${fix.briefs.title}`}
              onPress={() => pushRecordChanges(fix)}
              style={styles.fixCta}
            >
              <Text style={styles.fixCtaText}>Record changes</Text>
            </PressableScale>
          </View>
        )}

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${managerFirst}`}
            placeholderTextColor={color.slate400}
            multiline
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={draft.trim().length === 0 || sending}
            onPress={() => void send()}
            style={[
              styles.sendBtn,
              (draft.trim().length === 0 || sending) && styles.sendBtnDisabled,
            ]}
          >
            <Icon name="send" size={17} color={color.white} />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.offWhite,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space.gutter,
    paddingTop: space[2],
    paddingBottom: space[3],
    borderBottomWidth: borderWidth.hair,
    borderBottomColor: color.line,
    backgroundColor: color.offWhite,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyAvatarText: {
    fontSize: type.size.body,
    fontWeight: type.weight.heavy,
    color: color.blue700,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  headerTitle: {
    fontSize: type.size.action,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  headerSub: {
    fontSize: type.size.chip,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  thread: {
    paddingHorizontal: space.gutter,
    paddingVertical: space[4],
    gap: 14,
  },
  skeletons: {
    gap: 10,
  },
  skeletonTheirs: {
    width: '72%',
    alignSelf: 'flex-start',
  },
  skeletonMine: {
    width: '60%',
    alignSelf: 'flex-end',
  },
  empty: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.slate500,
    textAlign: 'center',
    marginTop: space[8],
  },
  bubbleInner: {
    gap: 8,
  },
  bodyManager: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.ink,
  },
  bodyCreator: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.body,
    color: color.white,
  },
  fixBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginHorizontal: space.gutter,
    marginBottom: space[2],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
  },
  fixText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  fixTitle: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  fixSub: {
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.slate500,
  },
  fixCta: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
  },
  fixCtaText: {
    fontSize: type.size.chip,
    fontWeight: type.weight.bold,
    color: color.white,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[2],
    paddingHorizontal: space.gutter,
    paddingTop: space[2],
    backgroundColor: color.offWhite,
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.line,
    paddingHorizontal: space[5],
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
