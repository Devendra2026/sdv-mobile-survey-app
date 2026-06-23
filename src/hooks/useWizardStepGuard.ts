/**
 * Soft guard: only redirects when the user lands on a step they cannot open.
 * Completed and previously visited steps remain accessible for review/edit.
 */
import { getDraft, type WizardDraft } from '@/hooks/useWizardDraft';
import { canPickStep, FIRST_WIZARD_ROUTE, type StepConfig } from '@/hooks/wizardSteps';
import { firstIncompleteStepRoute } from '@/utils/wizardValidation';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

export function useWizardStepGuard(localId: string | undefined, activeKey: StepConfig['key'] | 'review') {
  const router = useRouter();
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [checking, setChecking] = useState(true);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!localId) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    void getDraft(localId).then((d) => {
      if (cancelled) return;
      setDraft(d);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [localId]);

  useEffect(() => {
    if (!localId || !draft || checking || redirectedRef.current) return;
    // Review is always reachable — submit stays gated on the review screen.
    if (activeKey === 'review') return;

    if (!canPickStep(draft, activeKey)) {
      const route = firstIncompleteStepRoute(draft) ?? FIRST_WIZARD_ROUTE;
      redirectedRef.current = true;
      router.replace({ pathname: route as never, params: { localId } });
    }
  }, [activeKey, checking, draft, localId, router]);

  return { draft, checking };
}
