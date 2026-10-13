// Text on a slide, drawn with its stored style (SSCanvas textBoxStyle):
// outline (stroke behind the letters), box (solid pill) or none (soft shadow).

import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { color } from '../../../theme/tokens';
import { OutlinedText } from '../../ui/OutlinedText';
import { FONTS, isLight, type ResolvedTextStyle } from './canvas/layout';

export function slideTextStyle(ts: ResolvedTextStyle, fs: number): TextStyle {
  const f = FONTS[ts.font];
  return {
    fontFamily: f.family,
    fontWeight: f.weight,
    fontStyle: f.italic ? 'italic' : 'normal',
    fontSize: fs * f.scale,
    lineHeight: fs * f.scale * 1.2,
    letterSpacing: f.letterSpacing,
    textAlign: ts.align,
  };
}

export function SlideText({
  text,
  ts,
  fs,
  children,
}: {
  text: string;
  ts: ResolvedTextStyle;
  fs: number;
  /** Replaces the visible text with an input sharing the same metrics. */
  children?: ReactNode;
}) {
  const style = slideTextStyle(ts, fs);
  if (ts.bg === 'outline') {
    return (
      <OutlinedText text={text} fontSize={style.fontSize ?? fs} color={ts.color} style={style}>
        {children}
      </OutlinedText>
    );
  }
  if (ts.bg === 'box') {
    const ink = isLight(ts.color) ? color.ink : color.white;
    return (
      <View
        style={[
          styles.box,
          {
            backgroundColor: ts.color,
            borderRadius: fs * 0.35,
            paddingVertical: fs * 0.35,
            paddingHorizontal: fs * 0.55,
            alignSelf: ts.align === 'left' ? 'flex-start' : ts.align === 'right' ? 'flex-end' : 'center',
          },
        ]}
      >
        {children ?? <Text style={[style, { color: ink }]}>{text}</Text>}
      </View>
    );
  }
  return children ? <View>{children}</View> : <Text style={[style, styles.plain, { color: ts.color }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  box: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    shadowOpacity: 0.18,
  },
  plain: {
    textShadowColor: color.scrim,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
});
