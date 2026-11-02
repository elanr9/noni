import { useState } from 'react';
import { useRouter } from 'expo-router';

import { ChatScreen } from '../../components/shared/messages';
import type { ChatMessage } from '../../lib/chat-thread';

const at = (h: number, min: number) => {
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d.toISOString();
};
const post = { assignmentId: 'a1', title: 'The pass map that got me a trial', format: 'Reel' as const, typeLabel: 'Talking head', attempt: 2, mediaPath: null, mediaFormat: 'video' as const, status: 'submitted' };
const SAMPLE: ChatMessage[] = [
  { id: '1', authorId: 'fab', authorName: 'Fabrizio', mine: false, text: 'Hey, take 2 is up. Moved the FieldVision plug to point 3 like you said.', at: at(9, 12), media: null, post: null, eventLabel: null },
  { id: '2', authorId: 'me', authorName: 'You', mine: true, text: 'Saw it. Hook is way better.', at: at(9, 14), media: null, post: null, eventLabel: null },
  { id: '3', authorId: 'fab', authorName: 'Fabrizio', mine: false, text: 'Should I film the recovery speed one tomorrow or wait for the tripod?', at: at(9, 15), media: null, post: null, eventLabel: null },
  { id: '4', authorId: 'me', authorName: 'You', mine: true, text: 'Film it tomorrow. Handheld is fine for that one.', at: at(9, 16), media: null, post: null, eventLabel: null },
  { id: '5', authorId: 'fab', authorName: 'Fabrizio', mine: false, text: 'Sent take 2, moved the plug earlier', at: at(9, 20), media: null, post, eventLabel: null },
];

export default function PreviewChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(SAMPLE);
  return (
    <ChatScreen
      header={{ name: 'Fabrizio', meta: '@fabri.fv', photo: 'https://i.pravatar.cc/160?img=12', tone: 'blue', online: true }}
      messages={messages}
      onBack={() => router.back()}
      onHeaderPress={() => undefined}
      onSend={(text) => setMessages((m) => [...m, { id: String(Date.now()), authorId: 'me', authorName: 'You', mine: true, text, at: new Date().toISOString(), media: null, post: null, eventLabel: null }])}
      onOpenPost={() => undefined}
      onAttach={() => undefined}
    />
  );
}
