import { AppButton } from '@/components';
import { View } from 'react-native';
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
}: FloatingSaveBarProps) {
  return (
    <SafeAreaView
      edges={['bottom']}
      className="border-t border-line-subtle bg-surface-light dark:bg-surface-dark px-4 pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]"
    >
      <View className="flex-row gap-2">
        {onBack ? (
          <View className="flex-1">
            <AppButton label="Previous" variant="outline" onPress={onBack} fullWidth />
          </View>
        ) : null}
        {onSaveDraft ? (
          <View className="flex-1">
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
        <View className={onBack || onSaveDraft ? 'flex-[2]' : 'flex-1'}>
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
