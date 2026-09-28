import { useCallback, useLayoutEffect, useRef } from 'react';

/** A callback with a stable identity that always runs the latest `fn`, so
 * memoised children do not re-render when the parent re-renders. */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
