export const MAX_CLIP_MS = 180_000;
/** onCameraReady can fire before AVCaptureSession accepts recordAsync. */
export const RECORD_ARM_MS = 350;
export const HOLD_ARM_MS = 350;
/** Shortest take AVFoundation reliably writes; stop waits this long. */
export const MIN_TAKE_MS = 700;
export const STOP_WATCHDOG_MS = 5_000;
export const VIDEO_BITRATE = 8_000_000;

export type CountdownSeconds = 0 | 3 | 10;
export const COUNTDOWN_OPTIONS: readonly CountdownSeconds[] = [0, 3, 10];

export const WHITE = '#FFFFFF';
export const CHROME_BG = 'rgba(0,0,0,0.35)';
export const CHROME_BORDER = 'rgba(255,255,255,0.15)';
