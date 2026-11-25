// Review root and CreatorQueue cards (design_handoff_v2_review §3.1, §3.2).
import { Text, View } from 'react-native';

import type { MusicApprovalItem } from '../../../../lib/admin-api';
import { formatAge } from '../../../../lib/admin-queue-map';
import type { ReviewCreatorGroup, ReviewPost } from '../../../../lib/admin-review-queue';
import type { AccountApprovalItem } from '../../../../lib/creator-accounts-api';
import { applicantStatLine, type MarketCreator } from '../../../../lib/marketplace';
import { usePostFrame } from '../../../../lib/v2-media';
import { color, radius, text, tone as tones } from '../../../../theme/v2';
import { Avatar, Button, Card, Chip, Icon, Press, Thumb } from '../../../v2';

function PostThumb({ post, w, r, onPress }: { post: ReviewPost; w: number; r: number; onPress?: () => void }) {
  const frame = usePostFrame(post);
  const thumb = <Thumb post={{ frame, title: post.title, format: post.format }} w={w} radius={r} />;
  if (!onPress) return thumb;
  return (
    <Press accessibilityRole="button" accessibilityLabel={`Open ${post.title}`} onPress={onPress} hitSlop={4}>
      {thumb}
    </Press>
  );
}

/** One card per creator with posts waiting: avatar 64, name, "{n} posts" and the thumb strip. */
export function CreatorQueueCard({ group, onPress, onPost }: { group: ReviewCreatorGroup; onPress: () => void; onPost: (id: string) => void }) {
  const n = group.posts.length;
  return (
    <Card onPress={onPress} pad={0} accessibilityLabel={`${group.name}, ${n} ${n === 1 ? 'post' : 'posts'} to review`} style={{ paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Avatar name={group.name} photo={group.photo} size={64} />
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 22, lineHeight: 26, fontWeight: '700', color: color.ink }}>
        {group.name}
      </Text>
      <View style={{ alignItems: 'flex-end', gap: 6, maxWidth: 160 }}>
        <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '600', color: color.blueDeep }}>
          {n} {n === 1 ? 'post' : 'posts'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5 }}>
          {group.posts.slice(0, 10).map((p) => (
            <PostThumb key={p.id} post={p} w={26} r={6} onPress={() => onPost(p.id)} />
          ))}
        </View>
      </View>
      <Icon name="chevron_right" size={20} color={color.grey3} />
    </Card>
  );
}

/** Title steps down with length: 17 / 15 / 14 / 12 past 28 / 40 / 56 characters. */
function titleSize(title: string): number {
  const n = title.length;
  if (n > 56) return 12;
  if (n > 40) return 14;
  if (n > 28) return 15;
  return 17;
}

/** CreatorQueue row: thumb 48 with a retake badge, title, age. */
export function QueuePostCard({ post, onPress }: { post: ReviewPost; onPress: () => void }) {
  const size = titleSize(post.title);
  return (
    <Card onPress={onPress} accessibilityLabel={post.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View>
        <PostThumb post={post} w={48} r={radius.thumb} />
        {post.take > 1 ? (
          <View style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: radius.pill, backgroundColor: color.amber, alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 2px ${color.card}` }}>
            <Icon name="replay" size={13} weight={700} color={color.white} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={3} style={{ fontSize: size, lineHeight: Math.round(size * 1.25), fontWeight: '600', color: color.ink }}>
          {post.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={text.meta}>{post.ageLabel}</Text>
          {post.take > 1 ? <Chip small tone="amber" label={`Take ${post.take}`} /> : null}
          {post.format === 'Slideshow' ? <Chip small tone="purple" label="Slideshow" /> : null}
        </View>
      </View>
      <Icon name="chevron_right" size={20} color={color.grey3} />
    </Card>
  );
}

/** Music lane: note square, post title, creator and age. */
export function MusicCard({ item, photo, onPress }: { item: MusicApprovalItem; photo: string | null; onPress: () => void }) {
  return (
    <Card onPress={onPress} accessibilityLabel={`Song on ${item.briefTitle}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 56, height: 56, borderRadius: radius.option, backgroundColor: tones.blue.tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="music_note" size={28} color={color.blue} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={2} style={text.row}>
          {item.briefTitle}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar name={item.creatorName} photo={photo} size={28} ring={false} />
          <Text numberOfLines={1} style={[text.meta, { fontSize: 15, flexShrink: 1 }]}>
            {item.creatorName} · {formatAge(item.markedAt)}
          </Text>
        </View>
      </View>
      <Icon name="chevron_right" size={20} color={color.grey3} />
    </Card>
  );
}

function platformOf(a: AccountApprovalItem): string {
  if (a.tiktok_handle && a.instagram_handle) return 'TikTok and Instagram';
  if (a.instagram_handle) return 'Instagram';
  return 'TikTok';
}

function handleOf(a: AccountApprovalItem): string {
  const h = a.tiktok_handle ?? a.instagram_handle;
  return h ? `@${h.replace(/^@/, '')}` : 'Handle not set';
}

/** Accounts lane: avatar 56, "{creator} · {platform}", handle, age. Sent-back ones carry an amber chip. */
export function AccountCard({ account, photo, onPress }: { account: AccountApprovalItem; photo: string | null; onPress: () => void }) {
  const name = account.profiles?.full_name?.trim() || 'Creator';
  const sentBack = account.status === 'needs_changes';
  return (
    <Card onPress={onPress} accessibilityLabel={`${name} account`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: sentBack ? 0.8 : 1 }}>
      <Avatar name={name} photo={photo} size={56} tone={sentBack ? 'amber' : 'blue'} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={text.row}>
          {name} · {platformOf(account)}
        </Text>
        <Text numberOfLines={1} style={text.meta}>
          {handleOf(account)}
        </Text>
        {sentBack ? <Chip small tone="amber" label="Sent back, waiting on creator" style={{ marginTop: 4 }} /> : null}
      </View>
      <Text style={text.meta}>{formatAge(account.updated_at)}</Text>
      <Icon name="chevron_right" size={20} color={color.grey3} />
    </Card>
  );
}

/** Creators lane: avatar 56, name, one line of numbers, then Decline and Accept. The card opens the profile. */
export function ApplicantCard({ creator, photo, onPress, onDecide }: { creator: MarketCreator; photo: string | null; onPress: () => void; onDecide: (accept: boolean) => void }) {
  const name = creator.full_name?.trim() || 'Creator';
  return (
    <Card onPress={onPress} accessibilityLabel={`${name}, applied`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={name} photo={photo} size={56} tone="green" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={text.row}>
            {name}
          </Text>
          <Text numberOfLines={1} style={text.meta}>
            {applicantStatLine(creator)}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Button label="Decline" variant="quiet" onPress={() => onDecide(false)} style={{ height: 44 }} />
        <Button label="Accept" icon="check" onPress={() => onDecide(true)} style={{ height: 44 }} />
      </View>
    </Card>
  );
}
