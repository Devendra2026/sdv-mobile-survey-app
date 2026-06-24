import { AppButton } from '@/components';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface FloatingSaveBarProps {
  onBack?: () => void;
  onSaveDraft?: () => void;
  saveDraftLabel?: string;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  saveDraftDisabled?: boolean;
  loading?: boolean;
  savingDraft?: boolean;
  /** True when draft has been synced to Convex at least once. */
  cloudSynced?: boolean;
}

export function FloatingSaveBar({
  onBack,
  onSaveDraft,
  saveDraftLabel = 'Save draft',
  onNext,
  nextLabel,
  nextDisabled,
  saveDraftDisabled,
  loading,
  savingDraft,
  cloudSynced,
}: FloatingSaveBarProps) {
  return (
    <SafeAreaView
      edges={['bottom']}
      className="border-t border-line-subtle bg-surface-light dark:bg-surface-dark px-4 pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]"
    >
      {cloudSynced ? (
        <View className="flex-row items-center justify-center gap-1 mb-2">
          <Ionicons name="cloud-done-outline" size={14} color="#16A34A" />
          <Text className="text-caption text-success">Synced to cloud</Text>
        </View>
      ) : null}
      <View className="flex-row gap-2 items-stretch">
        {onBack ? (
          <View className="w-[30%]">
            <AppButton label="Back" variant="outline" onPress={onBack} fullWidth />
          </View>
        ) : null}
        {onSaveDraft ? (
          <View className={onBack ? 'w-[34%]' : 'w-[40%]'}>
            <AppButton
              label={savingDraft ? 'Saving…' : saveDraftLabel}
              variant="outline"
              onPress={onSaveDraft}
              loading={savingDraft}
              disabled={saveDraftDisabled || savingDraft || loading}
              iconLeft="cloud-outline"
              fullWidth
            />
          </View>
        ) : null}
        <View className="flex-1">
          <AppButton
            label={nextLabel}
            onPress={onNext}
            loading={loading}
            disabled={nextDisabled || loading}
            fullWidth
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
