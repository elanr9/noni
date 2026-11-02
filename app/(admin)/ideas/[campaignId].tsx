// The idea chat: a campaign manager says what they need ("I need a slideshow
// post idea"), the AI pitches ideas as cards that fit real post types and the
// week's empty slots. "Make it" asks Handheld or Story, then writes the post
// straight into an empty slot in the background while the chat stays put: the
// card shows "Writing into slot 05", then "In slot 05" with Open and Undo. X
// dismisses a card and teaches the AI what this team does not want. Kept per
// campaign on the device, card states included.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { IdeaCard } from '../../../components/admin/ideas/IdeaCard';
import { MakeKindSheet } from '../../../components/admin/ideas/MakeKindSheet';
import { BRIEFS_TAB_HREF, editorHref, parseFormat } from '../../../components/admin/briefs/routes';
import { BriefHeader, InkToast } from '../../../components/shared/briefs';
import { Icon } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { logAiFeedback } from '../../../lib/ai-feedback';
import { listWeekLanes, weekNumber as fetchWeekNumber, type BriefMediaFormat, type WeekLanes } from '../../../lib/briefs-api';
import { useCompany } from '../../../lib/company-context';
import { ideaChatTurn, type ChatIdea } from '../../../lib/deck-ai';
import {
  currentChips,
  dropStaleWriting,
  ideaPostTypeKey,
  ideaPostTypeName,
  ideaStateOf,
  moreLikeText,
  newMessageId,
  openSlotsLabel,
  pickTargetSlot,
  rejectedCovers,
  shownCovers,
  wireTurns,
  withIdeaState,
  writingSlots,
  type ChatMessage,
  type MakeKind,
} from '../../../lib/idea-chat';
import { isMakeRunning, loadIdeaChat, runIdeaMake, saveIdeaChat, subscribeIdeaChat, undoIdeaMake } from '../../../lib/idea-chat-store';
import { useKeyboardPadding } from '../../../lib/keyboard';
import { borderWidth, color, radius, shadow, space, type as typeToken } from '../../../theme/tokens';

type Params = { campaignId: string; briefId?: string; format?: string; week?: string };

/** The card the Make it sheet is open for. */
type MakeTarget = { idea: ChatIdea; messageId: string; index: number };

export default function IdeasScreen() {
  const params = useLocalSearchParams<Params>();
  const campaignId = params.campaignId ?? '';
  // Opened from one empty slot: ideas lean to its format and "Make it" fills it.
  const slotBriefId = params.briefId ?? null;
  const formatHint: BriefMediaFormat | null = slotBriefId && params.format ? parseFormat(params.format) : null;
  const { active } = useCompany();
  const insets = useSafeAreaInsets();
  const keyboardPadding = useKeyboardPadding();
  const scrollRef = useRef<ScrollView | null>(null);
  const req = useRef(0);
  const animateScroll = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [draft, setDraft] = useState('');
  const [lanes, setLanes] = useState<WeekLanes | null>(null);
  const [week, setWeek] = useState<string | null>(params.week ?? null);
  const [sheet, setSheet] = useState<MakeTarget | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastScroll = useRef('');

  // The saved chat. A turn left mid answer comes back as a retry; a card left
  // "writing" by a run that is gone (the app was closed) is a fresh pitch again.
  useEffect(() => {
    if (!campaignId) return;
    let live = true;
    void loadIdeaChat(campaignId).then((stored) => {
      if (!live) return;
      const list = dropStaleWriting(stored, (id, i) => isMakeRunning(campaignId, id, i));
      const last = list[list.length - 1];
      setMessages(last?.role === 'user' ? [...list, { id: newMessageId(), role: 'error', text: 'That answer did not finish.' }] : list);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [campaignId]);

  useEffect(() => {
    if (loaded && campaignId) void saveIdeaChat(campaignId, messages);
  }, [loaded, campaignId, messages]);

  const refreshLanes = useCallback(() => {
    if (!campaignId) return;
    void listWeekLanes(campaignId)
      .then(setLanes)
      .catch(() => undefined);
  }, [campaignId]);

  // Card changes from makes running in the background land here once the chat is loaded.
  useEffect(() => {
    if (!loaded || !campaignId) return;
    return subscribeIdeaChat(campaignId, (e) => {
      setMessages(e.patch);
      if (e.notice) setNotice(e.notice);
      refreshLanes();
    });
  }, [loaded, campaignId, refreshLanes]);

  // The week, fresh on every focus: slots fill while the manager is in the editor.
  useFocusEffect(
    useCallback(() => {
      if (!campaignId) return;
      let live = true;
      void listWeekLanes(campaignId)
        .then(async (next) => {
          if (!live) return;
          setLanes(next);
          if (!params.week) {
            const n = await fetchWeekNumber(next.campaign);
            if (live) setWeek(String(n));
          }
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, [campaignId, params.week]),
  );

  const ask = useCallback(
    async (list: ChatMessage[]) => {
      const id = ++req.current;
      setWaiting(true);
      try {
        const res = await ideaChatTurn({
          campaignId,
          messages: wireTurns(list),
          formatHint,
          shown: shownCovers(list),
          rejected: rejectedCovers(list),
        });
        if (id !== req.current) return;
        setMessages((cur) => [...cur, { id: newMessageId(), role: 'assistant', text: res.reply, ideas: res.ideas, chips: res.chips }]);
      } catch (e) {
        if (id !== req.current) return;
        setMessages((cur) => [...cur, { id: newMessageId(), role: 'error', text: e instanceof Error ? e.message : 'Something went wrong. Try again.' }]);
      } finally {
        if (id === req.current) setWaiting(false);
      }
    },
    [campaignId, formatHint],
  );

  /** Optimistic: the message shows at once, the typing dots right after it. */
  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || waiting || !loaded || !campaignId) return;
      const next: ChatMessage[] = [...messages.filter((m) => m.role !== 'error'), { id: newMessageId(), role: 'user', text: t }];
      animateScroll.current = true;
      setMessages(next);
      setDraft('');
      void ask(next);
    },
    [waiting, loaded, campaignId, messages, ask],
  );

  /** The error bubble's retry: the same chat again, without the error. */
  const retry = useCallback(() => {
    if (waiting) return;
    const next = messages.filter((m) => m.role !== 'error');
    if (next[next.length - 1]?.role !== 'user') return;
    animateScroll.current = true;
    setMessages(next);
    void ask(next);
  }, [waiting, messages, ask]);

  const newChat = useCallback(() => {
    Alert.alert('Start a new chat?', 'This conversation is cleared. Posts already in slots stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'New chat',
        style: 'destructive',
        onPress: () => {
          // An answer still on its way lands nowhere.
          req.current++;
          setWaiting(false);
          setDraft('');
          setMessages([]);
        },
      },
    ]);
  }, []);

  const companyId = lanes?.campaign.company_id ?? active?.companyId ?? '';

  /**
   * After Handheld or Story is picked: the slot the chat came from if still
   * empty, else the first empty one of the idea's format, never one another
   * card is writing into. The card flips to "Writing into slot 05" at once
   * and the post is written in the background.
   */
  const make = useCallback(
    async (target: MakeTarget, kind: MakeKind) => {
      if (!campaignId) return;
      try {
        // The lanes from the last focus are fresh enough to start now; the
        // run checks the slot is still empty before it saves.
        const current = lanes ?? (await listWeekLanes(campaignId));
        if (!lanes) setLanes(current);
        const picked = pickTargetSlot(current, target.idea.format, slotBriefId, writingSlots(messages));
        if (!picked.ok) {
          setNotice(picked.message);
          return;
        }
        runIdeaMake({
          campaignId,
          companyId: current.campaign.company_id,
          messageId: target.messageId,
          index: target.index,
          idea: target.idea,
          kind,
          slot: picked.slot,
        });
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Could not load this week. Try again.');
      }
    },
    [campaignId, lanes, slotBriefId, messages],
  );

  /** X: the card leaves, and the AI hears this team did not want it. */
  const dismiss = useCallback(
    (messageId: string, index: number, idea: ChatIdea) => {
      setMessages((cur) => withIdeaState(cur, messageId, index, { status: 'dismissed' }));
      logAiFeedback({
        kind: 'dismiss',
        surface: 'ideas',
        companyId,
        before: idea.cover,
        format: idea.format,
        postType: ideaPostTypeName(idea) || idea.postTypeId,
      });
    },
    [companyId],
  );

  const undo = useCallback(
    async (messageId: string, index: number, briefId: string) => {
      const k = `${messageId}:${index}`;
      if (undoing) return;
      setUndoing(k);
      try {
        await undoIdeaMake(campaignId, messageId, index, briefId);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Could not clear the slot. Try again.');
      } finally {
        setUndoing(null);
      }
    },
    [undoing, campaignId],
  );

  const open = useCallback(
    (idea: ChatIdea, slot: number, briefId: string, kind: MakeKind) => {
      router.push(
        editorHref({
          campaignId,
          briefId,
          slot: String(slot),
          format: idea.format,
          week: week ?? undefined,
          kind,
          postTypeKey: ideaPostTypeKey(idea),
        }),
      );
    },
    [campaignId, week],
  );

  const chips = currentChips(messages);
  const canSend = draft.trim().length > 0 && !waiting && loaded;
  const sub = [week ? `Week ${week}` : null, lanes ? openSlotsLabel(lanes) : null].filter(Boolean).join(' · ');
  const empty = loaded && !messages.length && !waiting;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={[styles.fill, { paddingBottom: keyboardPadding }]}>
        <BriefHeader
          title="Ideas"
          sub={sub || undefined}
          onBack={() => (campaignId ? router.dismissTo(BRIEFS_TAB_HREF) : router.back())}
          right={
            messages.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New chat"
                onPress={newChat}
                hitSlop={2}
                style={({ pressed }) => [styles.newChat, pressed ? styles.pressed : null]}
              >
                <Icon name="plus" size={16} color={color.ink} />
                <Text style={styles.newChatText}>New chat</Text>
              </Pressable>
            ) : null
          }
        />
        <ScrollView
          ref={scrollRef}
          style={styles.fill}
          contentContainerStyle={[styles.list, empty ? styles.listEmpty : null]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            // The saved chat jumps to the end; new turns glide there. A card
            // changing (writing, made, dismissed) never moves the list.
            const k = `${messages.length}:${waiting}`;
            if (k === lastScroll.current) return;
            lastScroll.current = k;
            scrollRef.current?.scrollToEnd({ animated: animateScroll.current });
            if (loaded) animateScroll.current = true;
          }}
        >
          {empty ? (
            <Animated.View entering={FadeIn.duration(240)} style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="sparkles" size={26} color={color.white} />
              </View>
              <Text style={styles.emptyTitle}>What are we posting?</Text>
              <Text style={styles.emptyLine}>Ask for a slideshow or reel idea. I pitch a few, you tap Make it and I write it into an empty slot.</Text>
            </Animated.View>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <Animated.View key={m.id} entering={FadeInUp.duration(200)} style={styles.userBubble}>
                  <Text style={styles.userText}>{m.text}</Text>
                </Animated.View>
              ) : m.role === 'error' ? (
                <Animated.View key={m.id} entering={FadeIn.duration(200)} style={styles.errorBubble}>
                  <View style={styles.errorRow}>
                    <Icon name="circle-alert" size={16} color={color.danger} />
                    <Text style={styles.errorText}>{m.text}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Retry"
                    disabled={waiting}
                    onPress={retry}
                    style={({ pressed }) => [styles.retry, pressed ? styles.pressed : null, waiting ? styles.dim : null]}
                  >
                    <Icon name="rotate-ccw" size={14} color={color.danger} />
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </Animated.View>
              ) : (
                <Animated.View key={m.id} entering={FadeInUp.duration(240)} layout={LinearTransition.duration(220)} style={styles.aiTurn}>
                  <View style={styles.aiBubble}>
                    <Text style={styles.aiText}>{m.text}</Text>
                  </View>
                  {m.ideas.map((idea, i) => {
                    const state = ideaStateOf(m, i);
                    if (state?.status === 'dismissed') return null;
                    const key = `${m.id}:${i}`;
                    return (
                      <Animated.View key={key} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(220)}>
                        <IdeaCard
                          idea={idea}
                          state={state}
                          moreLocked={waiting}
                          undoing={undoing === key}
                          onMake={() => setSheet({ idea, messageId: m.id, index: i })}
                          onMore={() => send(moreLikeText(idea))}
                          onDismiss={() => dismiss(m.id, i, idea)}
                          onOpen={() => (state && state.status === 'made' ? open(idea, state.slot, state.briefId, state.kind) : undefined)}
                          onUndo={() => (state && state.status === 'made' ? void undo(m.id, i, state.briefId) : undefined)}
                        />
                      </Animated.View>
                    );
                  })}
                </Animated.View>
              ),
            )
          )}
          {waiting ? <TypingDots /> : null}
        </ScrollView>

        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          {chips.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
              {chips.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={c}
                  disabled={waiting}
                  onPress={() => send(c)}
                  style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null, waiting ? styles.dim : null]}
                >
                  <Text style={styles.chipText}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.inputRow}>
            <View style={styles.pill}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="I need a slideshow post idea"
                placeholderTextColor={color.slate400}
                multiline
                maxLength={600}
                submitBehavior="submit"
                returnKeyType="send"
                onSubmitEditing={() => send(draft)}
              />
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={() => send(draft)}
              style={[styles.send, shadow.shadowAccent, !canSend ? styles.sendDisabled : null]}
            >
              <Icon name="send" size={18} color={color.white} />
            </PressableScale>
          </View>
        </View>
      </View>
      <MakeKindSheet
        idea={sheet?.idea ?? null}
        onClose={() => setSheet(null)}
        onPick={(kind) => {
          const target = sheet;
          setSheet(null);
          if (target) void make(target, kind);
        }}
      />
      <InkToast visible={notice !== null} message={notice ?? ''} icon="circle-alert" onHide={() => setNotice(null)} />
    </SafeAreaView>
  );
}

function Dot({ v }: { v: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + v.value * 0.65, transform: [{ translateY: -3 * v.value }] }));
  return <Animated.View style={[styles.dot, style]} />;
}

/** Three dots that rise in turn while the AI writes. */
function TypingDots() {
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const c = useSharedValue(0);
  useEffect(() => {
    const bounce = () =>
      withRepeat(withSequence(withTiming(1, { duration: 280 }), withTiming(0, { duration: 280 }), withTiming(0, { duration: 280 })), -1, false);
    a.value = bounce();
    b.value = withDelay(140, bounce());
    c.value = withDelay(280, bounce());
  }, [a, b, c]);
  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.typing} accessibilityLabel="Thinking">
      <Dot v={a} />
      <Dot v={b} />
      <Dot v={c} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.offWhite },
  fill: { flex: 1 },
  pressed: { opacity: 0.8 },
  dim: { opacity: 0.45 },
  newChat: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.white,
    ...shadow.shadowCard,
  },
  newChatText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 14, color: color.ink },
  list: { paddingHorizontal: space.gutterAdmin, paddingTop: 4, paddingBottom: 20, gap: 12 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 40 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: color.blue500,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    ...shadow.shadowAccent,
  },
  emptyTitle: { fontFamily: typeToken.font.display, fontWeight: '700', fontSize: 22, letterSpacing: -0.4, color: color.ink, textAlign: 'center' },
  emptyLine: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 15, lineHeight: 15 * 1.45, color: color.slate500, textAlign: 'center' },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '84%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderBottomRightRadius: 6,
    backgroundColor: color.blue500,
  },
  userText: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 15, lineHeight: 15 * 1.4, color: color.white },
  aiTurn: { gap: 10 },
  aiBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.border,
  },
  aiText: { fontFamily: typeToken.font.ui, fontWeight: '500', fontSize: 15, lineHeight: 15 * 1.45, color: color.ink },
  errorBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    backgroundColor: color.dangerSoft,
  },
  errorRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  errorText: { flexShrink: 1, fontFamily: typeToken.font.ui, fontWeight: '600', fontSize: 14, lineHeight: 14 * 1.4, color: color.danger },
  retry: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.white,
  },
  retryText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 13, color: color.danger },
  typing: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    backgroundColor: color.white,
    borderWidth: borderWidth.hair,
    borderColor: color.border,
  },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: color.slate400 },
  bar: {
    gap: 10,
    paddingTop: 10,
    backgroundColor: color.white,
    borderTopWidth: borderWidth.hair,
    borderTopColor: color.line,
  },
  chips: { gap: 8, paddingHorizontal: space.gutterAdmin },
  chip: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: borderWidth.hair,
    borderColor: color.blue200,
    backgroundColor: color.blue50,
  },
  chipText: { fontFamily: typeToken.font.ui, fontWeight: '700', fontSize: 13.5, color: color.blue700 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: space.gutterAdmin },
  pill: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    maxHeight: 120,
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: color.fillQuiet,
  },
  input: { fontFamily: typeToken.font.ui, fontSize: 15, lineHeight: 20, color: color.ink, padding: 0, margin: 0 },
  send: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: color.blue500 },
  sendDisabled: { opacity: 0.4 },
});
