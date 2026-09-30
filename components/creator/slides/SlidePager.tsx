// Native horizontal paging for a slideshow: the OS scroll view drives the
// swipe (same feel as TikTok's photo mode), React only hears about the
// settled page. Items that claim the touch first (text box drags, the crop
// layer) block the scroll for that gesture through the responder system.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

export function SlidePager(props: {
  count: number;
  index: number;
  onIndex: (index: number) => void;
  /** Off while a gesture layer (crop) owns the stage. */
  scrollEnabled?: boolean;
  renderPage: (index: number, width: number, height: number) => ReactNode;
}): JSX.Element {
  const { count, index, onIndex, scrollEnabled = true, renderPage } = props;
  const scroll = useRef<ScrollView>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** Page the scroll view is resting on, so a prop change only scrolls when it differs. */
  const settled = useRef(index);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
  }, []);

  useEffect(() => {
    if (size.w <= 0 || index === settled.current) return;
    settled.current = index;
    scroll.current?.scrollTo({ x: index * size.w, animated: true });
  }, [index, size.w]);

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (size.w <= 0) return;
    const page = Math.max(
      0,
      Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / size.w)),
    );
    if (page === settled.current) return;
    settled.current = page;
    onIndex(page);
  };

  return (
    <View style={styles.root} onLayout={onLayout}>
      {size.w > 0 ? (
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          bounces={false}
          scrollEnabled={scrollEnabled && count > 1}
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
          scrollEventThrottle={16}
          decelerationRate="fast"
          contentOffset={{ x: index * size.w, y: 0 }}
          onMomentumScrollEnd={onSettle}
          style={styles.root}
        >
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={{ width: size.w, height: size.h }}>
              {renderPage(i, size.w, size.h)}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
