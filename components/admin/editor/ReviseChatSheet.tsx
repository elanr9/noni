import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  assistRevise,
  type RegenDraftPayload,
  type ReviseResult,
  type ReviseTurn,
} from '../../../lib/briefs-api';
import { useKeyboardHeight } from '../../../lib/keyboard';
import { borderWidth, color, radiusAdmin, space, type } from '../../../theme/tokens';
import { Bubble } from '../../creator/ChatKit';
import { Icon } from '../../ui/Icon';
import { AiWorkingCard } from '../AiWorkingCard';
import { Sheet } from '../shared/Sheet';

export interface ReviseChatSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Read at send time so every turn revises the latest editor state. */
  getDraft: () => RegenDraftPayload;
  postTypeKey?: string | null;
  exampleTranscript?: string | null;
  /** A whole rewrite or a single regenerated part; the editor applies either. */
  onApply: (result: Extract<ReviseResult, { kind: 'draft' | 'field' }>) => void;
  /** Puts the editor back to a snapshot taken before an AI change. */
  onRestore: (snapshot: RegenDraftPayload) => void;
}

const STARTERS: readonly string[] = [
  'The product was never mentioned. Add a clear plug.',
  'The talking points are generic. Make every one specific.',
  'The hook is weak. Make it stop the scroll.',
];

const REVISE_STEPS: readonly string[] = [
  'Reading your feedback',
  'Loading the brand brain',
  'Deciding what to change',
  'Writing the new copy',
  'Checking banned words and claims',
  'Checking hook and point length',
  'Fixing anything that failed',
  'Matching clips to the points',
];
const REVISE_STEP_MS = 5000;
const SLOW_AFTER_S = 45;

const APPLIED_NOTE = 'Applied to the editor. Tap Save when you are happy.';

type ChatTurn = ReviseTurn & {
  applied?: boolean;
  /** Editor state before this AI change; Undo puts it back. */
  before?: RegenDraftPayload;
  undone?: boolean;
};

const UNDO_INTENT =
  /\b(undo|revert|put (it|them|that|everything|this)? ?back|go back to what i had|what i had before|restore (it|that|the original|what i had)|back to (the )?original|back to how it was)\b/i;
const ORIGINAL_INTENT = /\b(original|the start|the beginning|first version|before you changed anything)\b/i;

function normalizeTurns(turns: ChatTurn[]): ReviseTurn[] {
  return turns.map(({ role, text }) => ({ role, text }));
}

// Sheet chrome outside the scrollable body: grabber, title and two line subtitle.
const SHEET_HEADER_HEIGHT = 125;

export function ReviseChatSheet({
  visible,
  onClose,
  getDraft,
  postTypeKey,
  exampleTranscript,
  onApply,
  onRestore,
}: ReviseChatSheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const listRef = useRef<ScrollView>(null);
  const [elapsedS, setElapsedS] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [turns.length, busy]);

  useEffect(() => {
    if (!busy) {
      setElapsedS(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedS(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [busy]);

  const workingSubtitle =
    elapsedS >= SLOW_AFTER_S ? `Taking longer than usual, still working. ${elapsedS}s` : `${elapsedS}s`;

  const panelHeight = Math.min(height * 0.84, height - keyboardHeight - insets.top);
  const panelBottomPad = keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 24);
  const listHeight = Math.max(
    180,
    panelHeight - SHEET_HEADER_HEIGHT - footerHeight - panelBottomPad,
  );

  /** Snapshots from before each applied AI change, oldest first. */
  const snapshots = useRef<RegenDraftPayload[]>([]);

  function restoreLatest(original: boolean): boolean {
    const stack = snapshots.current;
    if (stack.length === 0) return false;
    const snapshot = original ? stack[0] : stack[stack.length - 1];
    snapshots.current = original ? [] : stack.slice(0, -1);
    onRestore(snapshot);
    return true;
  }

  function undoTurn(index: number) {
    const turn = turns[index];
    if (!turn?.before || turn.undone) return;
    onRestore(turn.before);
    snapshots.current = snapshots.current.filter((s) => s !== turn.before);
    setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, undone: true } : t)));
  }

  async function send(feedback: string) {
    const text = feedback.trim();
    if (!text || busy) return;
    const history = normalizeTurns(turns);
    setTurns((prev) => [...prev, { role: 'manager', text }]);
    setInput('');
    setError(null);

    // Undo never goes through the model: the editor already holds the
    // version the manager wants back.
    if (UNDO_INTENT.test(text)) {
      const restored = restoreLatest(ORIGINAL_INTENT.test(text));
      setTurns((prev) => [
        ...prev,
        {
          role: 'ai',
          text: restored
            ? 'Put back what you had before my last change.'
            : 'There is nothing of mine to undo yet; the post is as you left it.',
          applied: restored,
        },
      ]);
      return;
    }

    setBusy(true);
    const before = getDraft();
    try {
      const result = await assistRevise({
        draft: before,
        feedback: text,
        postTypeKey: postTypeKey ?? undefined,
        history,
        exampleTranscript,
      });
      if (result.kind === 'kill') {
        setTurns((prev) => [...prev, { role: 'ai', text: result.kill_reason }]);
        return;
      }
      if (result.kind === 'undo') {
        const restored = restoreLatest(ORIGINAL_INTENT.test(text));
        setTurns((prev) => [
          ...prev,
          {
            role: 'ai',
            text: restored
              ? result.revisionNote
              : 'There is nothing of mine to undo yet; the post is as you left it.',
            applied: restored,
          },
        ]);
        return;
      }
      if (result.kind === 'none') {
        setTurns((prev) => [...prev, { role: 'ai', text: result.revisionNote }]);
        return;
      }
      onApply(result);
      snapshots.current = [...snapshots.current, before];
      setTurns((prev) => [
        ...prev,
        {
          role: 'ai',
          text: result.revisionNote || 'Applied your feedback.',
          applied: true,
          before,
        },
      ]);
    } catch (e) {
      // Drop the failed turn so a retry does not send it twice in history.
      setTurns((prev) => prev.slice(0, -1));
      setInput(text);
      const detail = e instanceof Error && e.message ? e.message : '';
      setError(detail ? `Could not rewrite: ${detail}` : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const canSend = input.trim().length > 0 && !busy;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Revise with AI"
      subtitle="Say what is wrong. It fixes that part and leaves the rest alone."
      footer={
        <View onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height + 12)}>
          {busy ? (
            <AiWorkingCard
              title="Revising the post"
              subtitle={workingSubtitle}
              steps={REVISE_STEPS}
              stepMs={REVISE_STEP_MS}
              family="video"
              style={styles.working}
            />
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="What should change?"
              placeholderTextColor={color.slate400}
              multiline
              editable={!busy}
              accessibilityLabel="Feedback for the AI"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send feedback"
              disabled={!canSend}
              onPress={() => void send(input)}
              style={[styles.send, !canSend && styles.sendDisabled]}
            >
              <Icon name="send" size={18} color={color.white} />
            </Pressable>
          </View>
        </View>
      }
    >
      <ScrollView
        ref={listRef}
        style={{ height: listHeight }}
        contentContainerStyle={styles.list}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {turns.length === 0 ? (
          <View style={styles.starters}>
            {STARTERS.map((starter) => (
              <Pressable
                key={starter}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void send(starter)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{starter}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          turns.map((turn, index) =>
            turn.role === 'manager' ? (
              <Bubble key={index} side="creator">
                {turn.text}
              </Bubble>
            ) : (
              <View key={index}>
                <Bubble side="manager" author="Noni AI" avatarInitial="N">
                  {turn.text}
                </Bubble>
                {turn.applied ? (
                  <View style={styles.appliedRow}>
                    <Text style={styles.applied}>
                      {turn.undone ? 'Undone.' : APPLIED_NOTE}
                    </Text>
                    {turn.before && !turn.undone ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Undo this change"
                        disabled={busy}
                        onPress={() => undoTurn(index)}
                        hitSlop={8}
                      >
                        <Text style={styles.undo}>Undo</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ),
          )
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: space[3],
    gap: space[3],
  },
  starters: {
    gap: space[2],
    paddingTop: space[1],
  },
  chip: {
    paddingVertical: space[3],
    paddingHorizontal: space[5],
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.surfaceBrandSoft,
  },
  chipText: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * type.leading.snug,
    fontWeight: type.weight.medium,
    color: color.ink,
  },
  appliedRow: {
    marginTop: space[1],
    marginLeft: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  applied: {
    fontSize: type.size.label,
    color: color.slate400,
  },
  undo: {
    fontSize: type.size.label,
    fontWeight: type.weight.medium,
    color: color.accent,
  },
  working: {
    marginBottom: space[3],
  },
  error: {
    marginBottom: space[2],
    fontSize: type.size.label,
    color: color.danger,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[2],
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: space[4],
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: radiusAdmin.lg,
    borderWidth: borderWidth.field,
    borderColor: color.line,
    backgroundColor: color.surfaceSunken,
    fontSize: type.size.body,
    color: color.ink,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    backgroundColor: color.slate300,
  },
});
