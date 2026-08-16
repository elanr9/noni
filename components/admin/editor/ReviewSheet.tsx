// Admin handoff §8 step 7 — ScoreDial plus one card per section (ScoreBar,
// score, note), Apply / Ignore per suggestion, checks listed. AI review
// never blocks and never silently edits: confirm is one tap at any score,
// and nothing changes without an explicit Apply.
import { useEffect, useState, type JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BriefReviewResult, ReviewCheck } from '../../../lib/briefs-api';
import { color, radiusAdmin, shadow } from '../../../theme/tokens';
import { Button } from '../../ui/Button';
import { PressableScale } from '../../ui/PressableScale';
import { SheetShell } from '../../ui/SheetShell';
import { ScoreBar, ScoreDial } from '../shared';

const SECTION_ORDER: Array<{ key: ReviewCheck['section']; label: string }> = [
  { key: 'hook', label: 'Hook' },
  { key: 'talking_points', label: 'Talking points' },
  { key: 'cta', label: 'Plug' },
  { key: 'caption', label: 'Caption' },
  { key: 'overall', label: 'Whole post' },
];

function sectionScore(
  result: BriefReviewResult,
  key: ReviewCheck['section'],
): number | null {
  if (key === 'hook') return result.scores.hook;
  if (key === 'talking_points') return result.scores.talking_points;
  if (key === 'cta') return result.scores.cta;
  return null;
}

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

  // Ignore is a reading aid, not a write: the check still logs on save.
  const [ignoredIndexes, setIgnoredIndexes] = useState<ReadonlySet<number>>(
    new Set(),
  );
  useEffect(() => {
    setIgnoredIndexes(new Set());
  }, [result]);

  function ignore(index: number) {
    setIgnoredIndexes((prev) => new Set(prev).add(index));
  }

  const body = (
    <>
      {!hideHeader && <Text style={styles.h2}>AI review</Text>}
      {running || !result ? (
        <Text style={styles.subtitle}>Reading the post…</Text>
      ) : (
        <>
          {!hideHeader && (
            <Text style={styles.subtitle}>
              Suggestions only. Apply what helps, ignore the rest, save when
              it reads right.
            </Text>
          )}

          <View style={[styles.dialCard, shadow.shadowCard]}>
            <ScoreDial score={result.scores.overall} label="Overall" size={76} />
            <Text style={styles.dialNote}>
              {result.checks.length === 0
                ? 'Every check passed.'
                : `${result.checks.length} ${result.checks.length === 1 ? 'check' : 'checks'} fired.`}
            </Text>
          </View>

          {!result.tier3.spoken ? (
            <View style={styles.tier3Card}>
              <Text style={styles.tier3Title}>Reads as written, not spoken</Text>
              {result.tier3.worst_line ? (
                <Text style={styles.tier3Line}>“{result.tier3.worst_line}”</Text>
              ) : null}
            </View>
          ) : null}

          {SECTION_ORDER.map(({ key, label }) => {
            const score = sectionScore(result, key);
            const fired = result.checks
              .map((check, index) => ({ check, index }))
              .filter(({ check }) => check.section === key);
            if (score === null && fired.length === 0) return null;
            return (
              <View key={key} style={[styles.sectionCard, shadow.shadowCard]}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionLabel}>{label}</Text>
                  {score !== null && <Text style={styles.sectionScore}>{score}</Text>}
                </View>
                {score !== null && (
                  <ScoreBar score={score} tone={fired.length === 0 ? 'green' : 'amber'} />
                )}
                {fired.length === 0 ? (
                  <Text style={styles.sectionNote}>Reads clean.</Text>
                ) : (
                  fired.map(({ check, index }) => {
                    const applied = appliedIndexes.has(index);
                    const ignored = ignoredIndexes.has(index);
                    if (applied) {
                      return (
                        <View key={`${check.check_id}-${index}`} style={styles.appliedBlock}>
                          <Text style={styles.appliedText}>
                            Applied. The section will rescore on save.
                          </Text>
                        </View>
                      );
                    }
                    return (
                      <View
                        key={`${check.check_id}-${index}`}
                        style={[styles.check, ignored && styles.checkIgnored]}
                      >
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
                          {ignored && <Text style={styles.ignoredTag}>Ignored</Text>}
                        </View>
                        {check.suggestion && !ignored ? (
                          <View style={styles.suggestion}>
                            <Text style={styles.suggestionText}>
                              “{check.suggestion.replacement}”
                            </Text>
                            <View style={styles.suggestionActions}>
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={busy}
                                onPress={() => onApply(index)}
                              >
                                Apply
                              </Button>
                              <PressableScale
                                accessibilityRole="button"
                                accessibilityLabel="Ignore this suggestion"
                                disabled={busy}
                                onPress={() => ignore(index)}
                                style={styles.ignoreBtn}
                              >
                                <Text style={styles.ignoreText}>Ignore</Text>
                              </PressableScale>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}

          {!hideConfirm && (
            <Button
              size="lg"
              variant="primary"
              block
              disabled={busy}
              onPress={onConfirm}
            >
              {confirming ? 'Saving…' : (confirmLabel ?? 'Confirm review')}
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
  inlineWrap: { gap: 12, paddingBottom: 8 },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    color: color.ink,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '400',
    color: color.slate400,
  },
  dialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  dialNote: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 14 * 1.45,
    color: color.slate500,
  },
  tier3Card: {
    gap: 4,
    padding: 14,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.dangerSoft,
  },
  tier3Title: {
    fontSize: 14,
    fontWeight: '700',
    color: color.danger,
  },
  tier3Line: {
    fontSize: 14,
    fontWeight: '400',
    color: color.ink,
  },
  sectionCard: {
    gap: 10,
    padding: 16,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.white,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: color.ink,
  },
  sectionScore: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ink,
  },
  sectionNote: {
    fontSize: 13,
    fontWeight: '400',
    color: color.slate400,
  },
  appliedBlock: {
    padding: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.greenSoft,
  },
  appliedText: {
    fontSize: 13,
    fontWeight: '600',
    color: color.green,
  },
  check: {
    gap: 8,
  },
  checkIgnored: {
    opacity: 0.45,
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
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 14 * 1.4,
    color: color.ink,
  },
  ignoredTag: {
    fontSize: 11,
    fontWeight: '700',
    color: color.slate400,
  },
  suggestion: {
    gap: 10,
    padding: 12,
    borderRadius: radiusAdmin.md,
    backgroundColor: color.fillQuiet,
  },
  suggestionText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: color.slate500,
  },
  suggestionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ignoreBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  ignoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.slate400,
  },
});
