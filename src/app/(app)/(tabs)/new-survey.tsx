import { View } from 'react-native';

/**
 * Placeholder tab — navigation is handled by `tabPress` in `(tabs)/_layout.tsx`
 * so Android/iOS open the wizard without a blank-screen flash.
 */
export default function NewSurveyTab() {
  return <View className="flex-1 bg-page-light dark:bg-page-dark" />;
}
