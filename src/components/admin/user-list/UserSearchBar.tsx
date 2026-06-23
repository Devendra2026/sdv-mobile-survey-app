import { Ionicons } from '@expo/vector-icons';
import { TextInput, View } from 'react-native';

export function UserSearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row items-center bg-page-light dark:bg-page-dark rounded-xl border border-line-default px-3 h-11">
      <Ionicons name="search-outline" size={18} color="#9AA3AF" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search name, email, or ULB"
        placeholderTextColor="#9AA3AF"
        className="flex-1 ml-2 text-[13px] text-ink-primary-light dark:text-ink-primary-dark"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}
