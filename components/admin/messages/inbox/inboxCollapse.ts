import { useCallback, useState } from 'react';

export type InboxSectionKey = 'review' | 'dms' | 'channels';

/** Collapse state survives leaving and returning to the tab within a session. */
const collapsed = new Set<InboxSectionKey>();

export function useInboxCollapse(): {
  isOpen: (key: InboxSectionKey) => boolean;
  toggle: (key: InboxSectionKey) => void;
} {
  const [, bump] = useState(0);
  const isOpen = useCallback((key: InboxSectionKey) => !collapsed.has(key), []);
  const toggle = useCallback((key: InboxSectionKey) => {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    bump((n) => n + 1);
  }, []);
  return { isOpen, toggle };
}
