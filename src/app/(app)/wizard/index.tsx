/**
 * Wizard entry. Three behaviours:
 *  - `?resume=ls_…` → resume an in-progress draft
 *  - `?localId=ls_…` (carried forward via deep links) → same as resume
 *  - no params → create a fresh draft and route to step 1
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Spinner } from '@/components';
import { createNewDraft } from '@/hooks/useWizardDraft';
import { WIZARD_STEPS } from '@/hooks/wizardSteps';

export default function WizardEntry() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resume?: string }>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      let localId = params.resume;
      if (!localId) {
        const fresh = await createNewDraft();
        localId = fresh.localId;
      }
      router.replace({
        pathname: WIZARD_STEPS[0].route as never,
        params: { localId },
      });
    })().catch(() => undefined);
  }, [params.resume, router]);

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <Spinner label="Preparing draft…" />
    </View>
  );
}
