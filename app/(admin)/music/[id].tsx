import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { LinkRow } from '../../../components/admin/approval/LinkRow';
import { SlideshowSurface } from '../../../components/admin/review/SlideshowSurface';
import { AdminScreen, PushHeader } from '../../../components/admin/shared';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import {
  approveMusic,
  listMusicApprovalQueue,
  type MusicApprovalItem,
} from '../../../lib/admin-api';
import { formatAge, slidesFromScript } from '../../../lib/admin-queue-map';
import { getBrief } from '../../../lib/briefs-api';
import { getCreatorAccount, type CreatorAccount } from '../../../lib/creator-accounts-api';
import { useAuth } from '../../../lib/auth';
import { color, radiusAdmin, type } from '../../../theme/tokens';

export default function MusicApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [item, setItem] = useState<MusicApprovalItem | null>(null);
  const [slides, setSlides] = useState<string[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [account, setAccount] = useState<CreatorAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !id) return;
    try {
      const queue = await listMusicApprovalQueue(profile.company_id);
      const found = queue.find((entry) => entry.assignment.id === id) ?? null;
      setItem(found);
      if (found !== null) {
        const [brief, creatorAccount] = await Promise.all([
          getBrief(found.assignment.brief_id).catch(() => null),
          getCreatorAccount(profile.company_id, found.assignment.creator_id).catch(
            () => null,
          ),
        ]);
        setSlides(slidesFromScript(brief?.script));
        setAccount(creatorAccount);
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

  const linkFor = (platform: string): string | null =>
    item?.postLinks.find((link) => link.platform === platform)?.url ?? null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={color.blue500} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.missing}>Nothing waiting here.</Text>
        <Button size="md" variant="outline" onPress={() => router.back()}>
          Back
        </Button>
      </View>
    );
  }

  if (approved) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.checkCircle}>
          <Icon name="check" size={32} color={color.green} strokeWidth={2.5} />
        </View>
        <Text style={styles.confirmTitle}>Song approved</Text>
        <Text style={styles.confirmBody}>
          {`Earnings for this post are unlocked for ${item.creatorName}.`}
        </Text>
        <Button size="md" variant="primary" onPress={() => router.back()}>
          Back to Review
        </Button>
      </View>
    );
  }

  return (
    <AdminScreen
      actionBar={
        <View style={styles.actionBar}>
          <View style={styles.footerRow}>
            <Button
              variant="outline"
              size="md"
              disabled={busy}
              style={styles.footerButton}
              onPress={() => router.back()}
            >
              Not on it yet
            </Button>
            <Button
              variant="approve"
              size="md"
              icon="check"
              disabled={busy}
              style={styles.footerButton}
              onPress={() => void approve()}
            >
              Song is on it
            </Button>
          </View>
          <Text style={styles.footerNote}>
            Approving unlocks this post's earnings. Videos never enter this queue.
          </Text>
        </View>
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
      <PushHeader
        title={item.briefTitle}
        subtitle={`${item.creatorName} \u00b7 Slideshow`}
        onBack={() => router.back()}
      />

      <View style={styles.slideFrame}>
        <SlideshowSurface
          slides={slides}
          index={slideIndex}
          onIndex={setSlideIndex}
          hasScreenshot={[]}
        />
      </View>

      <View style={styles.markedCard}>
        <View style={styles.markedIcon}>
          <Icon name="music-2" size={15} color={color.blue700} />
        </View>
        <View style={styles.markedText}>
          <Text style={styles.markedTitle}>
            {`${item.creatorName} says the song is added`}
          </Text>
          <Text style={styles.markedMeta}>{`Marked ${formatAge(item.markedAt)}`}</Text>
        </View>
      </View>

      <View style={styles.links}>
        <LinkRow
          icon="music-2"
          label="Open on TikTok"
          handle={account?.tiktok_handle ?? null}
          url={linkFor('tiktok')}
        />
        <LinkRow
          icon="at-sign"
          label="Open on Instagram"
          handle={account?.instagram_handle ?? null}
          url={linkFor('instagram')}
        />
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
    backgroundColor: color.offWhite,
  },
  missing: {
    fontSize: type.size.bodySm,
    fontWeight: type.weight.semibold,
    color: color.slate500,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 28,
    fontWeight: type.weight.bold,
    letterSpacing: type.tracking.title,
    color: color.ink,
  },
  confirmBody: {
    fontSize: type.size.bodySm,
    lineHeight: type.size.bodySm * 1.45,
    fontWeight: type.weight.regular,
    color: color.slate500,
    textAlign: 'center',
  },
  slideFrame: {
    height: 340,
    borderRadius: radiusAdmin.xl,
    overflow: 'hidden',
    marginBottom: 12,
  },
  markedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radiusAdmin.lg,
    backgroundColor: color.blue50,
    marginBottom: 12,
  },
  markedIcon: {
    width: 32,
    height: 32,
    borderRadius: radiusAdmin.pill,
    backgroundColor: color.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markedText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  markedTitle: {
    fontSize: type.size.meta,
    fontWeight: type.weight.bold,
    color: color.ink,
  },
  markedMeta: {
    fontSize: type.size.label,
    fontWeight: type.weight.semibold,
    color: color.blue600,
  },
  links: {
    gap: 8,
  },
  actionBar: {
    gap: 8,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
  },
  footerNote: {
    fontSize: type.size.label,
    fontWeight: type.weight.regular,
    color: color.slate400,
    textAlign: 'center',
  },
});
