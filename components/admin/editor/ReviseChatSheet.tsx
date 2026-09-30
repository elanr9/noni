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
  onApply: (result: Exclude<ReviseResult, { kind: 'kill' }>) => void;
}

const STARTERS: readonly string[] = [
  'The product was never mentioned. Add a clear plug.',
  'The talking points are generic. Make every one specific.',
  'The hook is weak. Make it stop the scroll.',
];

const REVISE_STEPS: readonly string[] = [
  'Reading your feedback',
  'Working out what to change',
  'Rewriting that part',
  'Checking it against the rest',
];

const APPLIED_NOTE = 'Applied to the editor. Tap Save when you are happy.';

type ChatTurn = ReviseTurn & { applied?: boolean };

// Sheet chrome outside the scrollable body: grabber, title and two line subtitle.
const SHEET_HEADER_HEIGHT = 125;

export function ReviseChatSheet({
  visible,
  onClose,
  getDraft,
  postTypeKey,
  exampleTranscript,
  onApply,
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

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [turns.length, busy]);

  const panelHeight = Math.min(height * 0.84, height - keyboardHeight - insets.top);
  const panelBottomPad = keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 24);
  const listHeight = Math.max(
    180,
    panelHeight - SHEET_HEADER_HEIGHT - footerHeight - panelBottomPad,
  );

  async function send(feedback: string) {
    const text = feedback.trim();
    if (!text || busy) return;
    const history = turns.map<ReviseTurn>(({ role, text: t }) => ({ role, text: t }));
    setTurns((prev) => [...prev, { role: 'manager', text }]);
    setInput('');
    setError(null);
    setBusy(true);
    try {
      const result = await assistRevise({
        draft: getDraft(),
        feedback: text,
        postTypeKey: postTypeKey ?? undefined,
        history,
        exampleTranscript,
      });
      if (result.kind === 'kill') {
        setTurns((prev) => [...prev, { role: 'ai', text: result.kill_reason }]);
        return;
      }
      onApply(result);
      setTurns((prev) => [
        ...prev,
        { role: 'ai', text: result.revisionNote || 'Applied your feedback.', applied: true },
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
              steps={REVISE_STEPS}
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
                {turn.applied ? <Text style={styles.applied}>{APPLIED_NOTE}</Text> : null}
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
  applied: {
    marginTop: space[1],
    marginLeft: 44,
    fontSize: type.size.label,
    color: color.slate400,
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
