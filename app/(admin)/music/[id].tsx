import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { NoteCard, NoteSheet, PlatformGrid } from '../../../components/admin/v2/review/ApprovalParts';
import { ErrorCard, StateCard } from '../../../components/admin/v2/review/ReviewStates';
import { Avatar, Button, Card, Screen, Skeleton } from '../../../components/v2';
import { toast } from '../../../components/v2/Toast';
import {
  approveMusic,
  getAssignmentLiveAt,
  listMusicApprovalQueue,
  requestMusicChanges,
  type MusicApprovalItem,
} from '../../../lib/admin-api';
import { formatAge } from '../../../lib/admin-queue-map';
import { creatorAvatars, firstName, useReviewQueue } from '../../../lib/admin-review-queue';
import { useAuth } from '../../../lib/auth';
import { getCreatorAccount, type CreatorAccount } from '../../../lib/creator-accounts-api';
import { text } from '../../../theme/v2';

/** Music approval (design_handoff_v2_review §3.4): check the song on the live post, approve or send notes. */
export default function MusicApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const companyId = profile?.active_company_id;

  const cached = useReviewQueue((s) => s.music.find((m) => m.assignment.id === id) ?? null);
  const [item, setItem] = useState<MusicApprovalItem | null>(cached);
  const [photo, setPhoto] = useState<string | null>(useReviewQueue.getState().avatars[cached?.assignment.creator_id ?? ''] ?? null);
  const [account, setAccount] = useState<CreatorAccount | null>(null);
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>(cached ? 'ready' : 'loading');
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !id) return;
    try {
      const fresh = (await listMusicApprovalQueue(companyId)).find((m) => m.assignment.id === id) ?? null;
      if (!fresh) {
        setState('missing');
        return;
      }
      setItem(fresh);
      setState('ready');
      const [acc, live, avatars] = await Promise.all([
        getCreatorAccount(companyId, fresh.assignment.creator_id).catch(() => null),
        getAssignmentLiveAt(fresh.assignment.id).catch(() => null),
        creatorAvatars(companyId, [fresh.assignment.creator_id]).catch(() => ({}) as Record<string, string | null>),
      ]);
      setAccount(acc);
      setLiveAt(live);
      setPhoto(avatars[fresh.assignment.creator_id] ?? null);
    } catch {
      setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, [companyId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const short = firstName(item?.creatorName ?? 'Creator');

  /** Leaves the queue at once and pops; puts it back and says so if the server refuses. */
  const decide = (kind: 'approve' | 'changes') => {
    if (!profile || !item) return;
    const restore = useReviewQueue.getState().removeMusic(item.assignment.id);
    router.back();
    const job =
      kind === 'approve'
        ? approveMusic({ companyId: profile.active_company_id, assignmentId: item.assignment.id, adminId: profile.id })
        : requestMusicChanges({ companyId: profile.active_company_id, assignmentId: item.assignment.id, adminId: profile.id, reasons: [], note });
    void job
      .then(() => toast.success(kind === 'approve' ? `Song approved. We let ${short} know.` : `Notes sent to ${short}.`))
      .catch((e: unknown) => {
        restore();
        toast.error(`${kind === 'approve' ? "Couldn't approve" : "Couldn't send notes"}: ${e instanceof Error ? e.message : 'try again'}`);
      });
  };

  const link = (platform: string) => item?.postLinks.find((l) => l.platform === platform)?.url ?? null;
  const sub = (platform: string) => (link(platform) ? 'Open post' : 'Not live yet');

  const footer =
    state !== 'ready' ? undefined : note ? (
      <Button label="Request changes" variant="amber" icon="edit_note" onPress={() => decide('changes')} />
    ) : (
      <>
        <Button label="Request changes" variant="secondary" onPress={() => setSheet(true)} />
        <Button label="Approve" icon="check" onPress={() => decide('approve')} />
      </>
    );

  return (
    <Screen back title={item?.briefTitle ?? 'Song'} footer={footer}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}>
        {state === 'loading' ? (
          <>
            <Skeleton h={72} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Skeleton h={118} style={{ flex: 1 }} />
              <Skeleton h={118} style={{ flex: 1 }} />
            </View>
          </>
        ) : state === 'error' ? (
          <ErrorCard onRetry={() => {
            setState('loading');
            void load();
          }} />
        ) : state === 'missing' || !item ? (
          <StateCard icon="music_note" tone="purple" title="Nothing waiting here" body="This song is not in the queue anymore. It was approved or sent back already.">
            <View style={{ flexDirection: 'row' }}>
              <Button label="Back to review" variant="secondary" onPress={() => router.back()} />
            </View>
          </StateCard>
        ) : (
          <Animated.View entering={FadeIn.duration(220)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={item.creatorName} photo={photo} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={text.row}>
                  {item.creatorName}
                </Text>
                <Text numberOfLines={1} style={text.meta}>
                  {liveAt ? `Live ${formatAge(liveAt)}` : 'Live'} · song marked added {formatAge(item.markedAt)}
                </Text>
              </View>
            </Card>
            <Text style={[text.meta, { marginBottom: 10 }]}>Open the live post and check the song is on it on both platforms.</Text>
            <PlatformGrid
              tiktok={{ sub: account?.tiktok_handle ? `${sub('tiktok')} · @${account.tiktok_handle.replace(/^@/, '')}` : sub('tiktok'), url: link('tiktok') }}
              instagram={{ sub: account?.instagram_handle ? `${sub('instagram')} · @${account.instagram_handle.replace(/^@/, '')}` : sub('instagram'), url: link('instagram') }}
            />
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
    </Screen>
  );
}
