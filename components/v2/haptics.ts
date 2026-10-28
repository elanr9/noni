import * as Haptics from 'expo-haptics';

/** Light haptic on every tap. */
export function tap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
