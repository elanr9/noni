import type { JSX } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { BriefReviewResult, ReviewCheck } from '../../../lib/briefs-api';
import { color, radius, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { SheetShell } from '../../ui/SheetShell';

const SECTION_ORDER: Array<{ key: ReviewCheck['section']; label: string }> = [
  { key: 'hook', label: 'Hook' },
  { key: 'talking_points', label: 'Talking points' },
  { key: 'cta', label: 'Plug' },
  { key: 'caption', label: 'Caption' },
  { key: 'overall', label: 'Whole post' },
];

function scoreColor(score: number): string {
  if (score >= 85) return color.green;
  if (score >= 60) return color.amber;
  return color.danger;
}

/**
 * The AI review step. Scores per section, every fired check listed with its
 * suggestion when one exists. Review never blocks: Confirm is one tap no
 * matter the score, and nothing is ever applied without an explicit Apply.
 */
export function ReviewSheet(props: {
  visible: boolean;
  running: boolean;
  confirming: boolean;
  result: BriefReviewResult | null;
  appliedIndexes: ReadonlySet<number>;
  onApply: (checkIndex: number) => void;
  onClose: () => void;
  onConfirm: () => void;
  /** Render as a page section instead of a bottom sheet. */
  inline?: boolean;
  confirmLabel?: string;
  /** The wizard shell owns the h1 and intent line. */
  hideHeader?: boolean;
  /** The wizard shell's pinned footer owns the confirm button. */
  hideConfirm?: boolean;
}): JSX.Element {
  const {
    visible,
    running,
    confirming,
    result,
    appliedIndexes,
    onApply,
    onClose,
    onConfirm,
    inline = false,
    confirmLabel,
    hideHeader = false,
    hideConfirm = false,
  } = props;
  const busy = running || confirming;

  const body = (
    <>
      {!hideHeader && <Text style={styles.h2}>AI review</Text>}
      {running || !result ? (
        <Text style={styles.subtitle}>Reading the post…</Text>
      ) : (
        <>
          {!hideHeader && (
            <Text style={styles.subtitle}>
              Suggestions only. Apply what helps, ignore the rest, confirm
              when it reads right.
            </Text>
          )}

          <View style={styles.scoreRow}>
            <View style={styles.overallScore}>
              <Text style={[styles.overallValue, { color: scoreColor(result.scores.overall) }]}>
                {result.scores.overall}
              </Text>
              <Text style={styles.scoreLabel}>Overall</Text>
            </View>
            {(
              [
                ['Hook', result.scores.hook],
                ['Points', result.scores.talking_points],
                ['Plug', result.scores.cta],
              ] as const
            ).map(([label, score]) => (
              <View key={label} style={styles.sectionScore}>
                <Text style={[styles.sectionValue, { color: scoreColor(score) }]}>{score}</Text>
                <Text style={styles.scoreLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {!result.tier3.spoken ? (
            <View style={styles.tier3Card}>
              <Text style={styles.tier3Title}>Reads as written, not spoken</Text>
              {result.tier3.worst_line ? (
                <Text style={styles.tier3Line}>“{result.tier3.worst_line}”</Text>
              ) : null}
            </View>
          ) : null}

          <ScrollView style={styles.checksScroll} showsVerticalScrollIndicator={false}>
            {result.checks.length === 0 ? (
              <Text style={styles.cleanText}>Every check passed. Ship it.</Text>
            ) : (
              SECTION_ORDER.map(({ key, label }) => {
                const fired = result.checks
                  .map((check, index) => ({ check, index }))
                  .filter(({ check }) => check.section === key);
                if (fired.length === 0) return null;
                return (
                  <View key={key} style={styles.group}>
                    <Text style={styles.groupLabel}>{label}</Text>
                    {fired.map(({ check, index }) => {
                      const applied = appliedIndexes.has(index);
                      return (
                        <View key={`${check.check_id}-${index}`} style={styles.check}>
                          <View style={styles.checkHead}>
                            <View
                              style={[
                                styles.severityDot,
                                {
                                  backgroundColor:
                                    check.severity === 'fail' ? color.danger : color.amber,
                                },
                              ]}
                            />
                            <Text style={styles.checkMessage}>{check.message}</Text>
                          </View>
                          {check.suggestion ? (
                            <View style={styles.suggestion}>
                              <Text style={styles.suggestionText}>
                                “{check.suggestion.replacement}”
                              </Text>
                              <Button
                                size="sm"
                                variant={applied ? 'tint' : 'primary'}
                                disabled={applied || busy}
                                onPress={() => onApply(index)}
                              >
                                {applied ? 'Applied' : 'Apply'}
                              </Button>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </ScrollView>

          {!hideConfirm && (
            <Button
              size="lg"
              variant="primary"
              block
              disabled={busy}
              onPress={onConfirm}
            >
              {confirming
                ? 'Saving…'
                : (confirmLabel ?? 'Confirm review')}
            </Button>
          )}
        </>
      )}
    </>
  );

  if (inline) {
    if (!visible) return <View />;
    return <View style={styles.inlineWrap}>{body}</View>;
  }

  return (
    <SheetShell visible={visible} onClose={busy ? () => undefined : onClose} pinnedTop={80}>
      {body}
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  inlineWrap: { gap: 0, paddingBottom: 8 },
  h2: {
    fontSize: type.size.titleSm,
    fontWeight: '800',
    color: color.ink,
    letterSpacing: type.tracking.title,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: type.size.bodySm,
    color: color.slate400,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 14,
  },
  overallScore: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.fillQuiet,
  },
  overallValue: {
    fontSize: 30,
    fontWeight: '800',
  },
  sectionScore: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.fillQuiet,
  },
  sectionValue: {
    fontSize: type.size.titleSm,
    fontWeight: '800',
  },
  scoreLabel: {
    marginTop: 2,
    fontSize: type.size.meta,
    fontWeight: '700',
    color: color.slate400,
  },
  tier3Card: {
    gap: 4,
    padding: 12,
    marginBottom: 12,
    borderRadius: radius.sm,
    backgroundColor: color.dangerSoft,
  },
  tier3Title: {
    fontSize: type.size.bodySm,
    fontWeight: '800',
    color: color.danger,
  },
  tier3Line: {
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  checksScroll: {
    maxHeight: 380,
    marginBottom: 14,
  },
  cleanText: {
    paddingVertical: 20,
    textAlign: 'center',
    fontSize: type.size.bodySm,
    fontWeight: '700',
    color: color.green,
  },
  group: {
    marginBottom: 12,
  },
  groupLabel: {
    marginBottom: 6,
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  check: {
    gap: 8,
    padding: 12,
    marginBottom: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.white,
  },
  checkHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  checkMessage: {
    flex: 1,
    fontSize: type.size.bodySm,
    color: color.ink,
  },
  suggestion: {
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    backgroundColor: color.fillQuiet,
  },
  suggestionText: {
    fontSize: type.size.bodySm,
    fontStyle: 'italic',
    color: color.slate500,
  },
});
