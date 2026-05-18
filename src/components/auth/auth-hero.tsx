import { BrandLogo } from '@/components/brand-logo';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthHeroProps = {
  onBack?: () => void;
};

export function AuthHero({ onBack }: AuthHeroProps) {
  return (
    <SafeAreaView edges={['top']} className="items-center px-6 pt-5 pb-6">
      {onBack ? (
        <View className="absolute left-3 top-3 z-10">
          <Pressable
            onPress={onBack}
            hitSlop={10}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      <BrandLogo width={260} />
      <Text className="mt-4 text-h2 font-medium text-white">Property Survey</Text>
      <Text className="mt-0.5 text-caption text-white/75">Nagar Panchayat · GIS field operations</Text>
    </SafeAreaView>
  );
}
