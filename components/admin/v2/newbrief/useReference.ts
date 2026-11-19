import { useEffect, useState } from 'react';

import { isSocialLink, warmReference, type ReferenceState } from '../../../../lib/brief-ai';

const IDLE: ReferenceState = { status: 'idle' };

/**
 * Reads the reference post behind `link` as soon as the link is on the brief,
 * so Fill in with AI finds it analysed. `pending` while it runs, `failed`
 * with a reason when the post could not be read.
 */
export function useReference(link: string): ReferenceState {
  const [seen, setSeen] = useState<{ link: string; state: ReferenceState }>({ link: '', state: IDLE });
  const social = isSocialLink(link);
  useEffect(() => {
    if (!social) return;
    let live = true;
    void warmReference(link).then((state) => {
      if (live) setSeen({ link, state });
    });
    return () => {
      live = false;
    };
  }, [link, social]);
  if (!social) return IDLE;
  return seen.link === link ? seen.state : { status: 'pending' };
}
