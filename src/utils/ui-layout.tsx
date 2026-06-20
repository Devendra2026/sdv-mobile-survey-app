import { TAB_BAR_CONTENT_HEIGHT, tabBarBottomInset } from '@/constants/tabBar';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function useTabScreenPadding(extra = 16): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_CONTENT_HEIGHT + tabBarBottomInset(insets) + extra;
}

/** Spacer for tab screens — avoids dynamic paddingBottom on ScrollView/FlatList contentContainerStyle. */
export function TabScreenBottomSpacer() {
  const tabPad = useTabScreenPadding();
  return <View style={{ height: tabPad }} />;
}

/** Clears a fixed bottom action bar without dynamic contentContainerStyle padding. */
export function BottomBarClearance({ height }: { height: number }) {
  return <View style={{ height }} />;
}
