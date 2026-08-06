import { useState, type JSX } from 'react';
import { Image, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { BriefSegment } from '../../../lib/briefs-api';
import { color, radius, type } from '../../../theme/tokens';
import { Button } from '../../ui/Button';

function kindLabel(segment: BriefSegment): string {
  switch (segment.kind) {
    case 'hook':
      return 'Hook';
    case 'outro':
      return 'Outro';
    case 'slide':
      return `Slide ${segment.slot_index + 1}`;
    default:
      return `Point ${(segment.talking_point_index ?? segment.slot_index) + 1}`;
  }
}

/**
 * The render manifest: one row per clip or slide, including hook and outro.
 * Overlay text, the on-screen toggle, and screenshots are DIRECT updates to
 * the brief_segments row; the sync RPC preserves them across re-derives.
 */
export function SegmentsSection(props: {
  segments: BriefSegment[];
  screenshotUrls: Record<string, string>;
  busySegmentId: string | null;
  onSaveOverlayText: (segment: BriefSegment, text: string) => void;
  onToggleShow: (segment: BriefSegment, value: boolean) => void;
  onAttachScreenshot: (segment: BriefSegment) => void;
  onRemoveScreenshot: (segment: BriefSegment) => void;
}): JSX.Element {
  const {
    segments,
    screenshotUrls,
    busySegmentId,
    onSaveOverlayText,
    onToggleShow,
    onAttachScreenshot,
    onRemoveScreenshot,
  } = props;
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (segments.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.label}>On screen</Text>
        <Text style={styles.empty}>
          Save the post to derive its clips and slides. On-screen text and
          screenshots attach here, not to talking points.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>On screen</Text>
      <Text style={styles.hint}>
        One row per clip or slide. Toggles and screenshots stick across
        re-derives.
      </Text>
      {segments.map((segment) => {
        const busy = busySegmentId === segment.id;
        const draft = drafts[segment.id] ?? segment.overlay_text ?? '';
        const url = segment.screenshot_url
          ? screenshotUrls[segment.id]
          : undefined;
        return (
          <View key={segment.id} style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.kind}>{kindLabel(segment)}</Text>
              <View style={styles.toggleWrap}>
                <Text style={styles.toggleLabel}>On screen</Text>
                <Switch
                  value={segment.show_on_screen}
                  disabled={busy}
                  onValueChange={(value) => onToggleShow(segment, value)}
                />
              </View>
            </View>
            <TextInput
              multiline
              value={draft}
              onChangeText={(text) =>
                setDrafts((prev) => ({ ...prev, [segment.id]: text }))
              }
              onEndEditing={() => {
                if (draft !== (segment.overlay_text ?? '')) {
                  onSaveOverlayText(segment, draft);
                }
              }}
              placeholder="No on-screen text"
              placeholderTextColor={color.slate400}
              style={styles.overlayInput}
            />
            <View style={styles.shotRow}>
              {url ? (
                <Image source={{ uri: url }} style={styles.thumb} />
              ) : null}
              {segment.screenshot_url ? (
                <Button
                  size="sm"
                  variant="tint"
                  disabled={busy}
                  onPress={() => onRemoveScreenshot(segment)}
                >
                  Remove screenshot
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="tint"
                  disabled={busy}
                  onPress={() => onAttachScreenshot(segment)}
                >
                  {busy ? 'Attaching…' : 'Attach screenshot'}
                </Button>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 16 },
  label: {
    fontSize: type.size.label,
    fontWeight: '800',
    color: color.slate400,
    letterSpacing: type.tracking.label,
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: type.size.meta,
    color: color.slate400,
  },
  empty: {
    fontSize: type.size.meta,
    color: color.slate400,
  },
  card: {
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    backgroundColor: color.white,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kind: {
    fontSize: type.size.meta,
    fontWeight: '800',
    color: color.slate500,
    textTransform: 'uppercase',
    letterSpacing: type.tracking.label,
  },
  toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: {
    fontSize: type.size.micro,
    fontWeight: '700',
    color: color.slate400,
  },
  overlayInput: {
    fontSize: type.size.bodySm,
    color: color.ink,
    minHeight: 36,
    textAlignVertical: 'top',
    paddingVertical: 0,
  },
  shotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: color.fillQuiet,
  },
});
