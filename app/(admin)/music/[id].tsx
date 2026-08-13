import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import {
  AdminScreen,
  Card,
  CheckboxReasonRow,
  ConfirmationTakeover,
  EmptyState,
  PushHeader,
  SectionLabel,
  Sheet,
  SkeletonCard,
  SkeletonLine,
} from '../../../components/admin/shared';
import { Button } from '../../../components/ui/Button';
import { FormatPill } from '../../../components/ui/FormatPill';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { PressableScale } from '../../../components/ui/PressableScale';
import {
  approveMusic,
  getAssignmentLiveAt,
  listMusicApprovalQueue,
  requestMusicChanges,
  type MusicApprovalItem,
} from '../../../lib/admin-api';
import { formatAge, slidesFromScript } from '../../../lib/admin-queue-map';
import { getBrief } from '../../../lib/briefs-api';
import { getCreatorAccount, type CreatorAccount } from '../../../lib/creator-accounts-api';
import { useAuth } from '../../../lib/auth';
import { borderWidth, color, radiusAdmin, shadow, type } from '../../../theme/tokens';

const CHANGE_REASONS = [
  'Song is not on the post',
  'Different song than the brief',
  'Only added on one platform',
];

function LivePostRow({
  icon,
  label,
  handle,
  url,
}: {
  icon: IconName;
  label: string;
  handle: string | null;
  url: string | null;
}) {
  const disabled = url === null;
  return (
    <Card
      pad={13}
      onPress={disabled ? undefined : () => void Linking.openURL(url)}
      style={[styles.linkRow, disabled && styles.linkRowDisabled]}
    >
      <Icon name={icon} size={18} color={color.slate500} />
      <Text style={styles.linkLabel}>{label}</Text>
      {handle !== null && <Text style={styles.linkHandle}>{`@${handle}`}</Text>}
      <Icon name="arrow-right" size={16} color={color.slate300} />
    </Card>
  );
}

export default function MusicApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [item, setItem] = useState<MusicApprovalItem | null>(null);
  const [slides, setSlides] = useState<string[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [account, setAccount] = useState<CreatorAccount | null>(null);
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !id) return;
    try {
      const queue = await listMusicApprovalQueue(profile.company_id);
      const found = queue.find((entry) => entry.assignment.id === id) ?? null;
      setItem(found);
      if (found !== null) {
        const [brief, creatorAccount, live] = await Promise.all([
          getBrief(found.assignment.brief_id).catch(() => null),
          getCreatorAccount(profile.company_id, found.assignment.creator_id).catch(
            () => null,
          ),
          getAssignmentLiveAt(found.assignment.id).catch(() => null),
        ]);
        setSlides(slidesFromScript(brief?.script));
        setAccount(creatorAccount);
        setLiveAt(live);
      }
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [profile, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const short = item?.creatorName.split(' ')[0] ?? 'Creator';
  const canSend = reasons.length > 0 || note.trim().length > 0;

  const toggleReason = (reason: string) => {
    setReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    );
  };

  const closeRequest = () => {
    setReqOpen(false);
    setReasons([]);
    setNote('');
  };

  const approve = async () => {
    if (!profile || !item) return;
    setBusy(true);
    try {
      await approveMusic({
        companyId: profile.company_id,
        assignmentId: item.assignment.id,
        adminId: profile.id,
      });
      setApproved(true);
    } catch (e) {
      Alert.alert("Couldn't approve", e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    if (!profile || !item) return;
    setBusy(true);
    try {
      await requestMusicChanges({
        companyId: profile.company_id,
        assignmentId: item.assignment.id,
        adminId: profile.id,
        reasons,
        note: note.trim().length > 0 ? note.trim() : null,
      });
      setReqOpen(false);
      setSent(true);
    } catch (e) {
      Alert.alert("Couldn't send back", e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const linkFor = (platform: string): string | null =>
    item?.postLinks.find((link) => link.platform === platform)?.url ?? null;

  if (loading) {
    return (
      <AdminScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.skeletonHeader}>
          <SkeletonLine height={36} width={36} radius={18} />
          <SkeletonLine height={16} width={150} />
        </View>
        <SkeletonCard height={330} radius={radiusAdmin.xl} style={styles.skeletonBlock} />
        <SkeletonLine height={12} width={140} style={styles.skeletonBlock} />
        <SkeletonCard height={52} style={styles.skeletonRow} />
        <SkeletonCard height={52} style={styles.skeletonRow} />
      </AdminScreen>
    );
  }

  if (!item) {
    return (
      <AdminScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <EmptyState
          icon="music-2"
          title="Nothing waiting here"
          body="This post is not in the music queue anymore."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </AdminScreen>
    );
  }

  if (approved) {
    return (
      <View style={styles.takeover}>
        <Stack.Screen options={{ headerShown: false }} />
        <ConfirmationTakeover
          icon="check"
          tone="good"
          title="Song approved"
          body={`Earnings for this post are unlocked. ${short} sees it in their wallet tonight.`}
          actionLabel="Back to Review"
          onAction={() => router.back()}
          onBack={() => setApproved(false)}
        />
      </View>
    );
  }

  if (sent) {
    return (
      <View style={styles.takeover}>
        <Stack.Screen options={{ headerShown: false }} />
        <ConfirmationTakeover
          icon="send"
          tone="brand"
          title="Sent back"
          body={`${short} sees your notes and fixes the song on the live post. It lands back in this queue when they mark it added again.`}
          actionLabel="Back to Review"
          onAction={() => router.back()}
          onBack={() => setSent(false)}
        />
      </View>
    );
  }

  return (
    <AdminScreen
      actionBar={
        <View style={styles.footerRow}>
          <Button
            variant="outline"
            size="md"
            disabled={busy}
            style={styles.footerOutline}
            onPress={() => setReqOpen(true)}
          >
            Request Changes
          </Button>
          <Button
            variant="approve"
            size="md"
            icon="check"
            disabled={busy}
            style={styles.footerApprove}
            onPress={() => void approve()}
          >
            Accept Song
          </Button>
        </View>
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
      <PushHeader
        title="Music approval"
        subtitle={`${item.creatorName} \u00b7 Live ${formatAge(liveAt ?? item.markedAt)}`}
        onBack={() => router.back()}
      />

      <View style={[styles.pager, shadow.shadowMedia]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="noniMusicSlide" x1="0" y1="0" x2="0.4" y2="1">
              <Stop offset="0" stopColor={color.blue100} />
              <Stop offset="1" stopColor={color.lineStrong} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#noniMusicSlide)" />
        </Svg>

        <View style={styles.pagerCentre} pointerEvents="none">
          <Text style={styles.pagerText}>{slides[slideIndex] ?? ''}</Text>
        </View>

        <View style={styles.dots} pointerEvents="none">
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === slideIndex && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.formatChip}>
          <FormatPill format="photo_carousel" />
        </View>

        {slideIndex > 0 && (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            hitSlop={8}
            onPress={() => setSlideIndex(slideIndex - 1)}
            style={[styles.arrow, styles.arrowLeft, shadow.shadowCard]}
          >
            <Icon name="chevron-left" size={17} color={color.ink} />
          </PressableScale>
        )}
        {slideIndex < slides.length - 1 && (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Next slide"
            hitSlop={8}
            onPress={() => setSlideIndex(slideIndex + 1)}
            style={[styles.arrow, styles.arrowRight, shadow.shadowCard]}
          >
            <Icon name="chevron-right" size={17} color={color.ink} />
          </PressableScale>
        )}
      </View>

      <View style={styles.links}>
        <SectionLabel>Check the live post</SectionLabel>
        <LivePostRow
          icon="music-2"
          label="Open on TikTok"
          handle={account?.tiktok_handle ?? null}
          url={linkFor('tiktok')}
        />
        <LivePostRow
          icon="at-sign"
          label="Open on Instagram"
          handle={account?.instagram_handle ?? null}
          url={linkFor('instagram')}
        />
      </View>

      <Text style={styles.footnote}>
        {"Approving unlocks this post's earnings. Videos never enter this queue."}
      </Text>

      <Sheet
        visible={reqOpen}
        onClose={closeRequest}
        title="Request changes"
        subtitle={`Goes to ${short}`}
        footer={
          <View style={styles.sheetFooter}>
            <Button variant="ghost" size="lg" style={styles.sheetCancel} onPress={closeRequest}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon="send"
              disabled={!canSend || busy}
              style={styles.sheetSend}
              onPress={() => void sendBack()}
            >
              Send back
            </Button>
          </View>
        }
      >
        <View style={styles.reasonList}>
          {CHANGE_REASONS.map((reason) => (
            <CheckboxReasonRow
              key={reason}
              label={reason}
              selected={reasons.includes(reason)}
              onToggle={() => toggleReason(reason)}
            />
          ))}
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Anything specific, in your words"
          placeholderTextColor={color.slate400}
          style={styles.noteInput}
        />
      </Sheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    marginBottom: 4,
  },
  skeletonBlock: {
    marginBottom: 14,
  },
  skeletonRow: {
    marginBottom: 8,
  },
  takeover: {
    flex: 1,
    backgroundColor: color.white,
  },
  pager: {
    height: 330,
    borderRadius: radiusAdmin.xl,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 14,
  },
  pagerCentre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 44,
    paddingHorizontal: 34,
    paddingBottom: 52,
  },
  pagerText: {
    fontSize: type.size.action,
    lineHeight: type.size.action * 1.3,
    fontWeight: type.weight.heavy,
    letterSpacing: -0.3,
    color: color.ink,
    textAlign: 'center',
  },
  dots: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.slate300,
  },
  dotActive: {
    width: 18,
    backgroundColor: color.ink,
  },
  formatChip: {
    position: 'absolute',
    bottom: 12,
    left: 12,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: 10,
  },
  arrowRight: {
    right: 10,
  },
  links: {
    gap: 8,
    marginBottom: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 44,
  },
  linkRowDisabled: {
    opacity: 0.55,
  },
  linkLabel: {
    flex: 1,
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.ink,
  },
  linkHandle: {
    fontSize: type.size.chip,
    fontWeight: type.weight.semibold,
    color: color.slate400,
  },
  footnote: {
    marginHorizontal: 2,
    fontSize: type.size.chip,
    lineHeight: type.size.chip * 1.45,
    fontWeight: type.weight.regular,
    color: color.slate400,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerOutline: {
    width: '42%',
  },
  footerApprove: {
    flex: 1,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 8,
  },
  sheetCancel: {
    width: '28%',
  },
  sheetSend: {
    flex: 1,
  },
  reasonList: {
    gap: 7,
  },
  noteInput: {
    marginTop: 11,
    minHeight: 84,
    padding: 13,
    paddingTop: 13,
    borderRadius: radiusAdmin.md,
    borderWidth: borderWidth.field,
    borderColor: color.borderStrong,
    backgroundColor: color.white,
    fontSize: type.size.meta,
    lineHeight: type.size.meta * 1.5,
    fontWeight: type.weight.regular,
    color: color.ink,
    textAlignVertical: 'top',
  },
});
