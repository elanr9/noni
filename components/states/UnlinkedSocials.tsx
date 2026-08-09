import type { StyleProp, ViewStyle } from 'react-native';

import { EmptyState } from '../ui/EmptyState';

export interface UnlinkedSocialsProps {
  /** Platforms still missing a link. */
  missing: Array<'tiktok' | 'instagram'>;
  onConnect: () => void;
  style?: StyleProp<ViewStyle>;
}

function bodyFor(missing: Array<'tiktok' | 'instagram'>): string {
  if (missing.length >= 2) {
    return 'Connect TikTok and Instagram so we can post for you.';
  }
  if (missing[0] === 'tiktok') {
    return 'Connect TikTok so we can post for you.';
  }
  return 'Connect Instagram so we can post for you.';
}

/** Empty / prompt when socials are not linked. Names the next action. */
export function UnlinkedSocials({
  missing,
  onConnect,
  style,
}: UnlinkedSocialsProps) {
  if (missing.length === 0) return null;
  return (
    <EmptyState
      icon="link"
      title="Accounts not linked"
      body={bodyFor(missing)}
      actionLabel="Connect accounts"
      onAction={onConnect}
      compact
      style={style}
    />
  );
}
