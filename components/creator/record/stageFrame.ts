// The 9:16 frame the camera preview and clip playback show. The whole frame
// is always on screen (letterboxed on tall phones), so what the creator sees
// is exactly the 1080x1920 video that gets posted; text boxes are placed as
// fractions of this frame.
export type StageFrame = { width: number; height: number; left: number; top: number };

export const FRAME_ASPECT = 9 / 16;

/** Largest 9:16 frame that fits the stage, centred. */
export function fitFrame(screenWidth: number, screenHeight: number): StageFrame {
  if (screenWidth / screenHeight > FRAME_ASPECT) {
    const width = screenHeight * FRAME_ASPECT;
    return { width, height: screenHeight, left: (screenWidth - width) / 2, top: 0 };
  }
  const height = screenWidth / FRAME_ASPECT;
  return { width: screenWidth, height, left: 0, top: (screenHeight - height) / 2 };
}

export function coverFrame(screenWidth: number, screenHeight: number): StageFrame {
  if (screenWidth / screenHeight > FRAME_ASPECT) {
    const height = screenWidth / FRAME_ASPECT;
    return { width: screenWidth, height, left: 0, top: (screenHeight - height) / 2 };
  }
  const width = screenHeight * FRAME_ASPECT;
  return { width, height: screenHeight, left: (screenWidth - width) / 2, top: 0 };
}

export function frameStyle(frame: StageFrame): {
  position: 'absolute';
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    position: 'absolute',
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
  };
}
