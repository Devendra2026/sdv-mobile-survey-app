/**
 * Wizard step config. The order here drives:
 *  - the StepIndicator's left-to-right layout
 *  - back/next navigation routing
 *  - the review screen's progress checklist
 *
 * Add a step → add a row here and a screen file. Nothing else to touch.
 */
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { stepCompletion } from '@/hooks/useWizardDraft';

export interface StepConfig {
  key: keyof ReturnType<typeof stepCompletion>;
  label: string;
  short: string;
  route: string;
}

export const WIZARD_STEPS: StepConfig[] = [
  { key: 'start', label: 'Start', short: '0', route: '/(app)/wizard/start' },
  { key: 'property', label: 'Property', short: 'P', route: '/(app)/wizard/property' },
  { key: 'owner', label: 'Owner', short: 'O', route: '/(app)/wizard/owner' },
  { key: 'address', label: 'Address', short: 'A', route: '/(app)/wizard/address' },
  { key: 'taxation', label: 'Taxation', short: 'T', route: '/(app)/wizard/taxation' },
  { key: 'floors', label: 'Area', short: '5', route: '/(app)/wizard/floors' },
  { key: 'services', label: 'Services', short: 'S', route: '/(app)/wizard/services' },
  { key: 'gps', label: 'GPS', short: 'G', route: '/(app)/wizard/gps' },
  { key: 'photos', label: 'Photos', short: 'C', route: '/(app)/wizard/photos' },
];

export const REVIEW_ROUTE = '/(app)/wizard/review';

/** Last wizard step before review (photos). */
export const STEP_BEFORE_REVIEW_ROUTE = WIZARD_STEPS[WIZARD_STEPS.length - 1]!.route;

export function indicatorSteps(draft: WizardDraft, activeKey: string) {
  const c = stepCompletion(draft);
  return WIZARD_STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    short: s.short,
    completed: c[s.key],
  }));
}

export function nextStep(activeKey: string): string {
  const i = WIZARD_STEPS.findIndex((s) => s.key === activeKey);
  if (i < 0 || i >= WIZARD_STEPS.length - 1) return REVIEW_ROUTE;
  return WIZARD_STEPS[i + 1].route;
}

export function prevStep(activeKey: string): string | null {
  const i = WIZARD_STEPS.findIndex((s) => s.key === activeKey);
  if (i <= 0) return null;
  return WIZARD_STEPS[i - 1].route;
}

/** First wizard screen after entry (survey start). */
export const FIRST_WIZARD_ROUTE = WIZARD_STEPS[0].route;
