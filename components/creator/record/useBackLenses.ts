import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { CameraType, CameraView } from 'expo-camera';

export interface BackLenses {
  hasUltraWide: boolean;
  ultraWideLens: string | null;
  wideLens: string | null;
}

const NONE: BackLenses = { hasUltraWide: false, ultraWideLens: null, wideLens: null };

function isUltraWide(name: string): boolean {
  return name.toLowerCase().includes('ultra wide');
}

function isCompositeOrTele(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('telephoto') || lower.includes('dual') || lower.includes('triple');
}

function pickLenses(names: string[]): BackLenses {
  const ultraWideLens = names.find(isUltraWide) ?? null;
  const wideLens =
    names.find((n) => n === 'Back Camera') ??
    names.find((n) => !isUltraWide(n) && !isCompositeOrTele(n) && !n.toLowerCase().includes('front')) ??
    null;
  return { hasUltraWide: ultraWideLens !== null, ultraWideLens, wideLens };
}

/** Reads iOS back lenses once the camera is ready. Android/unsupported resolves to all null. */
export function useBackLenses(
  cameraRef: RefObject<CameraView | null>,
  facing: CameraType,
  cameraReady: boolean,
): BackLenses {
  const [lenses, setLenses] = useState<BackLenses>(NONE);

  useEffect(() => {
    if (!cameraReady || facing !== 'back') return;
    let cancelled = false;
    (async () => {
      try {
        const names = await cameraRef.current?.getAvailableLensesAsync();
        if (!cancelled) setLenses(pickLenses(names ?? []));
      } catch {
        if (!cancelled) setLenses(NONE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cameraRef, facing, cameraReady]);

  return facing === 'back' ? lenses : NONE;
}

/** Lens name for `selectedLens`; undefined at 1x so the default wide camera is used. */
export function lensForZoom(zoom: 0.5 | 1, lenses: BackLenses): string | undefined {
  if (zoom === 0.5 && lenses.ultraWideLens) return lenses.ultraWideLens;
  return undefined;
}
