import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

/** Icon + label area, excluding the device safe-area bottom inset. */
export const TAB_BAR_CONTENT_HEIGHT = 56;

/** Bottom padding inside the tab bar (home indicator / gesture bar). */
export function tabBarBottomInset(insets: EdgeInsets): number {
  if (Platform.OS === 'ios') {
    return insets.bottom;
  }
  return Math.max(insets.bottom, 12);
}
