import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { InboxScreen, type InboxData } from '../../../components/shared/messages';

const m = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const SAMPLE: InboxData = {
  review: { count: 8, names: ['Fabrizio', 'Elan', 'Jacob'] },
  dms: [
    { id: 'd-fab', kind: 'creator', name: 'Fabrizio', photo: 'https://i.pravatar.cc/160?img=12', tone: 'blue', online: true, last: 'Sent take 2, moved the plug earlier', lastAt: m(12), unread: 2 },
    { id: 'd-team', kind: 'team', name: 'Sam (FieldVision)', photo: 'https://i.pravatar.cc/160?img=68', tone: 'pink', online: false, last: 'Can we push the tripod post to Thursday?', lastAt: m(60), unread: 1 },
    { id: 'd-jacob', kind: 'creator', name: 'Jacob', photo: 'https://i.pravatar.cc/160?img=59', tone: 'green', online: true, last: 'You: Approved, posts at 6', lastAt: m(180), unread: 0 },
    { id: 'd-maya', kind: 'creator', name: 'Maya', photo: 'https://i.pravatar.cc/160?img=47', tone: 'amber', online: false, last: 'Is a 9 slide ok or too long?', lastAt: m(300), unread: 0 },
    { id: 'd-elan', kind: 'creator', name: 'Elan', photo: 'https://i.pravatar.cc/160?img=33', tone: 'purple', online: false, last: 'You: Looks great, send it', lastAt: m(1440), unread: 0 },
  ],
  channels: [
    { id: 'c-all', name: '#everyone', last: 'Sam: Week 4 briefs are live', lastAt: m(2880), unread: 0 },
    { id: 'c-wins', name: '#wins', last: 'Fabrizio: 41k on the sprint video', lastAt: m(4320), unread: 0 },
  ],
};

export default function Preview() {
  const router = useRouter();
  const [data, setData] = useState<InboxData | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setData(SAMPLE), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <InboxScreen
      data={data}
      filters={['All', 'Unread', 'Creators', 'Team', 'Channels']}
      onOpenReview={() => router.navigate('/dev-preview/review')}
      onOpenDm={() => router.push('/dev-preview/chat')}
      onOpenChannel={() => router.push('/dev-preview/chat')}
      onNew={() => router.push('/dev-preview/chat')}
    />
  );
}
