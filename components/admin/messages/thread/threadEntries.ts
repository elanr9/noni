import type { ThreadMessage } from '../../../../lib/messages-api';
import type { PostEvent } from '../../../../lib/post-event-labels';
import type { ThreadRowBase } from './threadRows';

export type ThreadTone = 'brand' | 'quiet';

export type ThreadEntry = ThreadRowBase & { tone: ThreadTone } & (
    | { kind: 'message'; message: ThreadMessage }
    | { kind: 'event'; event: PostEvent }
  );

export function messageEntry(message: ThreadMessage, meId: string): ThreadEntry {
  return {
    kind: 'message',
    id: `msg:${message.id}`,
    at: message.createdAt,
    authorId: message.authorId,
    authorName: message.authorId === meId ? 'You' : message.authorName,
    tone: message.fromCreator ? 'brand' : 'quiet',
    message,
  };
}

export function eventEntry(event: PostEvent, creatorId: string): ThreadEntry {
  return {
    kind: 'event',
    id: `evt:${event.id}`,
    at: event.at,
    authorId: event.authorId,
    authorName: event.authorId === null ? 'Noni' : event.authorName,
    tone: event.authorId === creatorId ? 'brand' : 'quiet',
    event,
  };
}

export function latestCreatorMessageAt(messages: ThreadMessage[]): string | null {
  let latest: string | null = null;
  for (const m of messages) {
    if (m.fromCreator && (latest === null || m.createdAt > latest)) latest = m.createdAt;
  }
  return latest;
}
