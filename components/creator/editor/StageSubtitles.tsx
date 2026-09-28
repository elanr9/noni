// The burned in subtitle block at render size: two centred condensed lines,
// 6.2 vmin, 80% of the frame, centred at subtitles_y. Hold and drag moves it
// up or down on an Animated value; the new y is committed on release.
import { memo, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type PanResponderInstance,
} from 'react-native';

import { CLASSIC_TEXT_COLOR, OVERLAY_TEXT_SPEC } from '../../../lib/overlay-boxes';
import { color } from '../../../theme/tokens';
import { OutlinedText } from '../../ui/OutlinedText';
import { PLACE_EDGE, clamp } from '../slides/frame';
import {
  SUBTITLE_FONT_VMIN,
  SUBTITLE_LINES,
  SUBTITLE_PLACEHOLDER,
  SUBTITLE_WIDTH,
} from './subtitles';
import { useEvent } from './useEvent';

const TAP_SLOP_PX = 4;

export type StageSubtitlesProps = {
  y: number;
  /** Line spoken at the playhead; null shows the placeholder. */
  text: string | null;
  stageWidth: number;
  stageHeight: number;
  onDragStart: () => void;
  onMove: (y: number) => void;
};

type Live = { translate: Animated.Value; outline: Animated.Value };

function createSubtitleResponder(
  latest: () => StageSubtitlesProps,
  live: Live,
): PanResponderInstance {
  let origin = 0;
  let current = 0;
  let moved = false;
  const rest = () => {
    const { y, stageHeight } = latest();
    live.translate.setValue((y - 0.5) * stageHeight);
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      origin = latest().y;
      current = origin;
      moved = false;
    },
    onPanResponderMove: (_evt, gs) => {
      const { stageHeight, onDragStart } = latest();
      if (stageHeight <= 0) return;
      if (!moved) {
        if (Math.abs(gs.dy) <= TAP_SLOP_PX) return;
        moved = true;
        live.outline.setValue(1);
        onDragStart();
      }
      current = clamp(origin + gs.dy / stageHeight, PLACE_EDGE, 1 - PLACE_EDGE);
      live.translate.setValue((current - 0.5) * stageHeight);
    },
    onPanResponderRelease: () => {
      live.outline.setValue(0);
      if (moved && current !== origin) latest().onMove(current);
      else rest();
    },
    onPanResponderTerminate: () => {
      live.outline.setValue(0);
      rest();
    },
  });
}

export const StageSubtitles = memo(function StageSubtitles(props: StageSubtitlesProps): JSX.Element {
  const { y, text, stageWidth, stageHeight } = props;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const getLatest = useEvent(() => latest.current);
  const [live] = useState<Live>(() => ({
    translate: new Animated.Value(0),
    outline: new Animated.Value(0),
  }));
  const [pan] = useState(() => createSubtitleResponder(getLatest, live));

  useEffect(() => {
    live.translate.setValue((y - 0.5) * stageHeight);
  }, [live, y, stageHeight]);

  const fontSize = (Math.min(stageWidth, stageHeight) / 100) * SUBTITLE_FONT_VMIN;
  const lineHeight = fontSize * OVERLAY_TEXT_SPEC.condensed.lineHeight;

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
      <Animated.View
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Subtitle position"
        style={{
          width: stageWidth * SUBTITLE_WIDTH,
          height: lineHeight * SUBTITLE_LINES,
          transform: [{ translateY: live.translate }],
        }}
      >
        <View style={styles.block}>
          <OutlinedText
            text={text ?? SUBTITLE_PLACEHOLDER}
            fontSize={fontSize}
            color={CLASSIC_TEXT_COLOR}
            style={{ lineHeight, textAlign: 'center' }}
          />
        </View>
        <Animated.View pointerEvents="none" style={[styles.outline, { opacity: live.outline }]} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  outline: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: color.whiteA75,
    borderStyle: 'dashed',
  },
});
