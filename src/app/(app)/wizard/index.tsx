/**
 * Wizard entry. Three behaviours:
 *  - `?resume=ls_…` or `?localId=ls_…` → resume an in-progress local draft at saved step
 *  - `?surveyId=<id>` → load a server survey into a local draft and edit
 *  - no params → create a fresh draft and route to Survey Start (step 0)
 */
import { Spinner } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { createNewDraft, getDraft, persistDraft, surveyToDraft } from '@/hooks/useWizardDraft';
import { FIRST_WIZARD_ROUTE, routeForDraftResume } from '@/hooks/wizardSteps';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

export default function WizardEntry() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resume?: string; localId?: string; surveyId?: string }>();
  const surveyId = params.surveyId as Id<'surveys'> | undefined;
  const survey = useQuery(api.survey.get, surveyId ? { id: surveyId } : 'skip');
  const started = useRef(false);

  useEffect(() => {
    if (surveyId && survey === undefined) return;
    if (started.current) return;
    started.current = true;

    (async () => {
      let localId = params.resume ?? params.localId;

      if (surveyId) {
        if (!survey) {
          router.replace('/surveys');
          return;
        }
        if (survey.status !== 'draft') {
          router.replace({ pathname: '/(app)/survey/[id]', params: { id: surveyId } });
          return;
        }
        const draft = surveyToDraft(survey);
        await persistDraft(draft);
        localId = draft.localId;
      } else if (!localId) {
        const fresh = await createNewDraft();
        localId = fresh.localId;
      }

      const draft = await getDraft(localId!);
      const route = draft ? routeForDraftResume(draft) : FIRST_WIZARD_ROUTE;

      router.replace({
        pathname: route as never,
        params: { localId: localId! },
      });
    })().catch(() => undefined);
  }, [params.resume, params.localId, surveyId, survey, router]);

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <Spinner label={surveyId ? 'Loading survey…' : 'Preparing draft…'} />
    </View>
  );
}
