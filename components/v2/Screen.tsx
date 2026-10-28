import type { ReactNode } from 'react';
import { ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, shadow, space, text } from '../../theme/v2';
import { Icon } from './Icon';
import { Press } from './Press';
import { useTabBarInset } from './TabBar';

export interface ScreenProps {
  /** Root: t-h title above the content. Pushed (back): 700 17 centred in the header row. */
  title?: string;
  /** Show the 52px header row with a back chevron; a function replaces the default pop. */
  back?: boolean | (() => void);
  /** Close icon in place of the back chevron. */
  close?: boolean;
  /** Replaces the title in a pushed header (step dots, tabs). */
  center?: ReactNode;
  right?: ReactNode;
  /** Pinned footer row: white, hairline above, buttons gap 8. */
  footer?: ReactNode;
  /** Wrap children in a ScrollView with 20px side padding. Off when the screen owns its list. */
  scroll?: boolean;
  /** Tab root: keep the bottom clear of the tab bar. */
  tabRoot?: boolean;
  white?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Back chevron 32 in a 44 square at left 4; title 700 17 ellipsised, max 230 wide; right slot at right 12. */
export function PushHeader({ title, onBack, close, center, right }: { title?: string; onBack: () => void; close?: boolean; center?: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 12 }}>
      <Press accessibilityRole="button" accessibilityLabel={close ? 'Close' : 'Back'} onPress={onBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={close ? 'close' : 'chevron_left'} size={close ? 26 : 32} color={color.ink} />
      </Press>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
        {center ?? (title ? (
          <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: color.ink, maxWidth: 230, textAlign: 'center' }}>
            {title}
          </Text>
        ) : null)}
      </View>
      <View style={{ minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>{right}</View>
    </View>
  );
}

/** Pinned footer: white, hairline on top, padding 12 20 and the home indicator inset. */
export function Footer({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingTop: 12, paddingHorizontal: space.screen, paddingBottom: Math.max(insets.bottom, 20) + 0, backgroundColor: color.card, ...shadow.footer }}>
      {children}
    </View>
  );
}

/** Screen scaffold: status bar space, optional header or t-h title, content, pinned footer. */
export function Screen({ title, back, close, center, right, footer, scroll = false, tabRoot = false, white = false, children, style }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const barInset = useTabBarInset();
  const pushed = !!back || !!close;
  const onBack = typeof back === 'function' ? back : () => router.back();
  const padBottom = tabRoot ? barInset : footer ? 24 : Math.max(insets.bottom, 24) + 16;

  const body = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: padBottom }}
    >
      {!pushed && title ? <RootTitle title={title} right={right} /> : null}
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, minHeight: 0, paddingBottom: tabRoot ? barInset : 0 }}>
      {!pushed && title ? (
        <View style={{ paddingHorizontal: space.screen }}>
          <RootTitle title={title} right={right} />
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <View style={[{ flex: 1, backgroundColor: white ? color.card : color.bg, paddingTop: insets.top }, style]}>
      {pushed ? <PushHeader title={title} onBack={onBack} close={close} center={center} right={right} /> : null}
      {body}
      {footer ? <Footer>{footer}</Footer> : null}
    </View>
  );
}

/** t-h title with 8 above and 16 below, optional right slot. */
export function RootTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingTop: 8, paddingBottom: 16 }}>
      <Text style={[text.title, { flexShrink: 1 }]}>{title}</Text>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: -4 }}>{right}</View> : null}
    </View>
  );
}
