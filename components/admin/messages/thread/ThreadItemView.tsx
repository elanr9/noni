import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { parseMessageMedia, signedChatMediaUrl, type ThreadMessage } from '../../../../lib/messages-api';
import type { PostEvent } from '../../../../lib/post-event-labels';
import { DayDivider } from '../DayDivider';
import { MediaBlock } from '../MediaBlock';
import { MsgBody, MsgRow } from '../MsgRow';
import type { ThreadEntry } from './threadEntries';
import type { ThreadListItem } from './threadRows';

export type ThreadItemViewProps = {
  item: ThreadListItem<ThreadEntry>;
  renderEvent: (event: PostEvent) => ReactNode;
  renderPostRef?: (message: ThreadMessage) => ReactNode;
};

function copyMessage(text: string) {
  Alert.alert('Message', undefined, [
    { text: 'Copy', onPress: () => void Clipboard.setStringAsync(text) },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function MessageContent({ message }: { message: ThreadMessage }) {
  const { media, text } = parseMessageMedia(message.body);
  return (
    <>
      {text.length > 0 && <MsgBody text={text} />}
      {media !== null && (
        <MediaBlock
          kind={media.media}
          cacheKey={media.url}
          resolveUrl={() => signedChatMediaUrl(media.url)}
          lenLabel={media.len}
        />
      )}
    </>
  );
}

export function ThreadItemView({ item, renderEvent, renderPostRef }: ThreadItemViewProps) {
  if (item.type === 'divider') return <DayDivider label={item.label} />;
  const entry = item.item;
  const copyText = entry.kind === 'message' ? parseMessageMedia(entry.message.body).text : '';
  return (
    <MsgRow
      authorName={entry.authorName}
      tone={entry.tone}
      timeLabel={item.timeLabel}
      collapsed={item.collapsed}
      onLongPress={copyText.length > 0 ? () => copyMessage(copyText) : undefined}
    >
      {entry.kind === 'message' ? (
        <>
          <MessageContent message={entry.message} />
          {renderPostRef?.(entry.message)}
        </>
      ) : entry.event.kind === 'comment' ? (
        <MsgBody text={entry.event.label} />
      ) : (
        renderEvent(entry.event)
      )}
    </MsgRow>
  );
}
