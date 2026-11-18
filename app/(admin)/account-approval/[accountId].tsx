import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ClipCard, ClipPopup, NoteCard, NoteSheet, PlatformGrid, profileUrl } from '../../../components/admin/v2/review/ApprovalParts';
import { ErrorCard } from '../../../components/admin/v2/review/ReviewStates';
import { Avatar, Button, Card, Chip, Icon, Screen, Skeleton } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import { useAuth } from '../../../lib/auth';
import { feedMeta } from '../../../lib/company-copy';
import { useCompanyNiche } from '../../../lib/company-copy-api';
import { formatAge } from '../../../lib/admin-queue-map';
import { creatorAvatars, firstName, useReviewQueue } from '../../../lib/admin-review-queue';
import {
  decideAccount,
  fetchAccountApprovalItem,
  signedVerificationUrl,
  type AccountApprovalItem,
  type AccountDecision,
} from '../../../lib/creator-accounts-api';
import { color, radius, text } from '../../../theme/v2';

type SignedUrls = {
  instagramRecording: string | null;
  tiktokRecording: string | null;
};

const EMPTY_URLS: SignedUrls = { instagramRecording: null, tiktokRecording: null };

/** The creator's two screen recordings, as the clip cards label them. */
const CLIPS = [
  { key: 'tt_clip', label: 'TikTok For You', meta: 'On topic', url: 'tiktokRecording' },
  { key: 'ig_clip', label: 'Instagram feed', meta: 'Home, explore, reels', url: 'instagramRecording' },
] as const;

/** Account approval (design_handoff_v2_review §3.5): profiles, scroll recordings, approve or send notes. */
export default function AccountApprovalScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;
  const company = useCompanyNiche();

  const [account, setAccount] = useState<AccountApprovalItem | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [urls, setUrls] = useState<SignedUrls>(EMPTY_URLS);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState(false);
  const [clip, setClip] = useState<{ uri: string; label: string } | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !accountId) return;
    try {
      const row = await fetchAccountApprovalItem(companyId, accountId);
      setAccount(row);
      setState('ready');
      const sign = (path: string | null) => (path !== null ? signedVerificationUrl(path).catch(() => null) : Promise.resolve(null));
      const [instagramRecording, tiktokRecording, avatars] = await Promise.all([
        sign(row.instagram_recording_path),
        sign(row.tiktok_recording_path),
        creatorAvatars(companyId, [row.creator_id]).catch(() => ({}) as Record<string, string | null>),
      ]);
      setUrls({ instagramRecording, tiktokRecording });
      setPhoto(avatars[row.creator_id] ?? null);
    } catch {
      setState('error');
    }
  }, [companyId, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const creatorName = account?.profiles?.full_name?.trim() || 'Creator';
  const short = firstName(creatorName);
  const sentBack = account?.status === 'needs_changes';
  const decided = account?.status === 'approved';
  const platform = account?.tiktok_handle && account.instagram_handle ? 'TikTok and Instagram' : account?.instagram_handle ? 'Instagram' : 'TikTok';
  const at = (handle: string | null | undefined) => (typeof handle === 'string' && handle.length > 0 ? `@${handle.replace(/^@/, '')}` : 'Handle not set');

  /** Leaves the queue at once and pops; puts it back and says so if the server refuses. */
  const decide = (status: 'approved' | 'needs_changes') => {
    if (!profile || !account) return;
    const decision: AccountDecision =
      status === 'approved'
        ? { instagram_recording_ok: true, tiktok_recording_ok: true, feed_is_niche: true, profile_matches_template: true }
        : { instagram_recording_ok: false, tiktok_recording_ok: false, feed_is_niche: false, profile_matches_template: false };
    const restore = useReviewQueue.getState().removeAccount(account.id);
    router.back();
    void decideAccount({
      companyId: profile.active_company_id,
      accountId: account.id,
      adminId: profile.id,
      status,
      reason: status === 'needs_changes' ? note : null,
      decision,
    })
      .then(() => toast.success(status === 'approved' ? `${short} is approved` : `Sent back to ${short}`))
      .catch((e: unknown) => {
        restore();
        toast.error(`Could not save: ${e instanceof Error ? e.message : 'try again'}`);
      });
  };

  const footer =
    state !== 'ready' || decided ? undefined : note ? (
      <Button label="Request changes" variant="amber" icon="edit_note" onPress={() => decide('needs_changes')} />
    ) : (
      <>
        <Button label="Request changes" variant="secondary" onPress={() => setSheet(true)} />
        <Button label="Approve" icon="check" onPress={() => decide('approved')} />
      </>
    );

  return (
    <Screen back title={account ? `${creatorName} · ${platform}` : 'Account approval'} footer={footer}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}>
        {state === 'loading' ? (
          <>
            <Skeleton h={72} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Skeleton h={118} style={{ flex: 1 }} />
              <Skeleton h={118} style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Skeleton h={200} style={{ flex: 1 }} />
              <Skeleton h={200} style={{ flex: 1 }} />
            </View>
          </>
        ) : state === 'error' || !account ? (
          <ErrorCard
            onRetry={() => {
              setState('loading');
              void load();
            }}
          />
        ) : (
          <Animated.View entering={FadeIn.duration(220)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={creatorName} photo={photo} size={46} tone={sentBack ? 'amber' : 'blue'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={text.row}>
                  {creatorName}
                </Text>
                <Text numberOfLines={1} style={text.meta}>
                  {sentBack ? `Sent back ${formatAge(account.updated_at)}` : `Submitted ${formatAge(account.updated_at)}`}
                </Text>
              </View>
              <Chip small tone={decided ? 'green' : sentBack ? 'amber' : 'grey'} label={decided ? 'Approved' : sentBack ? 'Needs changes' : 'Pending'} />
            </Card>

            {sentBack && account.reason !== null ? (
              <View style={{ flexDirection: 'row', gap: 10, padding: 14, marginBottom: 12, borderRadius: radius.card, backgroundColor: color.amberTint }}>
                <Icon name="info" size={20} color={color.amber} />
                <Text style={[text.body, { flex: 1, color: color.ink }]}>{account.reason}</Text>
              </View>
            ) : null}

            <PlatformGrid
              tiktok={{ sub: at(account.tiktok_handle), url: account.tiktok_handle ? profileUrl('tiktok', account.tiktok_handle) : null }}
              instagram={{ sub: at(account.instagram_handle), url: account.instagram_handle ? profileUrl('instagram', account.instagram_handle) : null }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              {CLIPS.map((c) => {
                const uri = urls[c.url];
                return <ClipCard key={c.key} label={c.label} sub={c.key === 'tt_clip' ? feedMeta(company) : c.meta} uri={uri} onPress={() => uri && setClip({ uri, label: c.label })} />;
              })}
            </View>
            {note ? (
              <Animated.View entering={FadeInDown.duration(220)}>
                <NoteCard note={note} onPress={() => setSheet(true)} />
              </Animated.View>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
      <NoteSheet
        open={sheet}
        creator={short}
        initial={note}
        onClose={() => setSheet(false)}
        onSave={(n) => {
          setNote(n);
          setSheet(false);
        }}
      />
      <ClipPopup clip={clip} onClose={() => setClip(null)} />
    </Screen>
  );
}
