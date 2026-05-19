import { TAB_BAR_CONTENT_HEIGHT, tabBarBottomInset } from '@/constants/tabBar';
import { Platform, type FlatListProps, type KeyboardAvoidingViewProps, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Bottom padding so tab-screen lists clear the tab bar on all Android nav modes. */
export function useTabScreenPadding(extra = 16): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_CONTENT_HEIGHT + tabBarBottomInset(insets) + extra;
}

export const scrollViewProps: Pick<
  ScrollViewProps,
  'keyboardShouldPersistTaps' | 'nestedScrollEnabled' | 'showsVerticalScrollIndicator' | 'overScrollMode'
> = {
  keyboardShouldPersistTaps: 'handled',
  nestedScrollEnabled: true,
  showsVerticalScrollIndicator: true,
  overScrollMode: 'always',
};

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
  'keyboardShouldPersistTaps' | 'nestedScrollEnabled' | 'showsVerticalScrollIndicator' | 'overScrollMode'
> = {
  keyboardShouldPersistTaps: 'handled',
  nestedScrollEnabled: true,
  showsVerticalScrollIndicator: true,
  overScrollMode: 'always',
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
