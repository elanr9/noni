// Keeps an overlay mounted while it animates out. `progress` runs 0 to 1 on
// open and back to 0 on close; the overlay unmounts once it reaches 0.
import { useEffect, useState } from 'react';
import { runOnJS, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { motion } from '../../../../theme/v2';

export function usePresence(open: boolean, inMs: number = motion.sheet, outMs: number = 240): { mounted: boolean; progress: SharedValue<number> } {
  const [mounted, setMounted] = useState(open);
  // Opening mounts at once (a render-time update, not an effect).
  if (open && !mounted) setMounted(true);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (open) {
      progress.set(withTiming(1, { duration: inMs, easing: motion.sheetEase }));
    } else {
      progress.set(
        withTiming(0, { duration: outMs, easing: motion.ease }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [open, inMs, outMs, progress]);
  return { mounted: open || mounted, progress };
}
