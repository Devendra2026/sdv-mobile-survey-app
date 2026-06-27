import { Platform, type FlatListProps, type KeyboardAvoidingViewProps, type ScrollViewProps } from 'react-native';

export const scrollViewProps: Pick<
  ScrollViewProps,
  'keyboardShouldPersistTaps' | 'nestedScrollEnabled' | 'showsVerticalScrollIndicator' | 'overScrollMode'
> = {
  keyboardShouldPersistTaps: 'handled',
  nestedScrollEnabled: true,
  showsVerticalScrollIndicator: true,
  overScrollMode: 'always',
};

/** Space below wizard form content so fields clear the floating save bar + keyboard. */
export const WIZARD_FOOTER_SCROLL_PADDING = 140;

export const wizardScrollViewProps: Pick<
  ScrollViewProps,
  | 'keyboardShouldPersistTaps'
  | 'nestedScrollEnabled'
  | 'showsVerticalScrollIndicator'
  | 'overScrollMode'
  | 'keyboardDismissMode'
  | 'automaticallyAdjustKeyboardInsets'
> = {
  ...scrollViewProps,
  keyboardDismissMode: 'on-drag',
  automaticallyAdjustKeyboardInsets: Platform.OS === 'ios',
};

export function wizardScrollContentStyle(extraBottom = 0) {
  return {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: WIZARD_FOOTER_SCROLL_PADDING + extraBottom,
  };
}

export const horizontalScrollProps: Pick<
  ScrollViewProps,
  'nestedScrollEnabled' | 'showsHorizontalScrollIndicator' | 'overScrollMode' | 'decelerationRate'
> = {
  nestedScrollEnabled: true,
  showsHorizontalScrollIndicator: false,
  overScrollMode: 'always',
  decelerationRate: 'fast',
};

export const flatListProps: Pick<
  FlatListProps<unknown>,
  | 'keyboardShouldPersistTaps'
  | 'nestedScrollEnabled'
  | 'showsVerticalScrollIndicator'
  | 'overScrollMode'
  | 'initialNumToRender'
  | 'maxToRenderPerBatch'
  | 'windowSize'
  | 'removeClippedSubviews'
> = {
  keyboardShouldPersistTaps: 'handled',
  nestedScrollEnabled: true,
  showsVerticalScrollIndicator: true,
  overScrollMode: 'always',
  initialNumToRender: 10,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  removeClippedSubviews: Platform.OS === 'android',
};

export function keyboardAvoidingProps(
  offset = 0,
): Pick<KeyboardAvoidingViewProps, 'behavior' | 'keyboardVerticalOffset'> {
  if (Platform.OS === 'ios') {
    return { behavior: 'padding', keyboardVerticalOffset: offset };
  }
  return { behavior: undefined, keyboardVerticalOffset: 0 };
}

/** Material ripple on Android pressables; no-op on iOS. */
export function androidRipple(color: string, borderless = false) {
  if (Platform.OS !== 'android') return undefined;
  return { color, borderless };
}
