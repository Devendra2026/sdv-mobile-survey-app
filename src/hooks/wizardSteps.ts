/**
 * Wizard step config. The order here drives:
 *  - the StepIndicator's left-to-right layout
 *  - back/next navigation routing
 *  - the review screen's progress checklist
 *
 * Add a step → add a row here and a screen file. Nothing else to touch.
 */
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { draftCompletionPct, stepCompletion } from '@/hooks/useWizardDraft';
import { stepHasProgress, type StepStatus } from '@/utils/wizardValidation';

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

const REVIEW_ROUTE = '/(app)/wizard/review';

export { REVIEW_ROUTE };

export function stepIndex(targetKey: StepConfig['key']): number {
  return WIZARD_STEPS.findIndex((s) => s.key === targetKey);
}

/** Highest step index the user has opened in this draft session. */
export function resolvedFurthestStepIndex(draft: WizardDraft): number {
  const stored = draft.furthestStepIndex ?? 0;
  const fromActive =
    draft.lastActiveStepKey && draft.lastActiveStepKey !== 'review'
      ? stepIndex(draft.lastActiveStepKey)
      : draft.lastActiveStepKey === 'review'
        ? WIZARD_STEPS.length
        : 0;
  return Math.max(stored, fromActive >= 0 ? fromActive : 0);
}

/** True when every step before `targetKey` is complete (required to advance forward). */
export function canNavigateToStep(draft: WizardDraft, targetKey: StepConfig['key']): boolean {
  const c = stepCompletion(draft);
  const targetIndex = stepIndex(targetKey);
  if (targetIndex < 0) return false;
  for (let i = 0; i < targetIndex; i++) {
    const step = WIZARD_STEPS[i]!;
    if (!c[step.key]) return false;
  }
  return true;
}

/**
 * True when the user may open a step from the header chips.
 * All wizard steps are freely navigable; completion is shown via checkmarks only.
 */
export function canPickStep(_draft: WizardDraft, targetKey: StepConfig['key']): boolean {
  return stepIndex(targetKey) >= 0;
}

export function wizardStepProgress(draft: WizardDraft, activeKey: string) {
  const total = WIZARD_STEPS.length;
  const stepIdx = WIZARD_STEPS.findIndex((s) => s.key === activeKey);
  const current = stepIdx >= 0 ? stepIdx + 1 : total;
  const label = stepIdx >= 0 ? WIZARD_STEPS[stepIdx]!.label : 'Review';
  return {
    current,
    total,
    percent: draftCompletionPct(draft),
    label,
  };
}

/** Patch to record a visited wizard step (call before navigating). */
export function visitedStepPatch(
  draft: WizardDraft,
  key: StepConfig['key'] | 'review',
): Pick<WizardDraft, 'lastActiveStepKey' | 'furthestStepIndex'> {
  const idx = key === 'review' ? WIZARD_STEPS.length : stepIndex(key);
  return {
    lastActiveStepKey: key,
    furthestStepIndex: Math.max(draft.furthestStepIndex ?? 0, idx >= 0 ? idx : 0),
  };
}

export function incompleteStepLabels(draft: WizardDraft): string[] {
  const c = stepCompletion(draft);
  const labels: string[] = [];
  for (const s of WIZARD_STEPS) {
    if (!c[s.key]) labels.push(s.label);
  }
  return labels;
}

export function allStepsComplete(draft: WizardDraft): boolean {
  return Object.values(stepCompletion(draft)).every(Boolean);
}

/** Resolve the wizard route to open when resuming a local draft. */
export function routeForDraftResume(draft: WizardDraft): string {
  const key = draft.lastActiveStepKey ?? 'start';
  if (key !== 'start' && !stepCompletion(draft).start) {
    return FIRST_WIZARD_ROUTE;
  }
  if (key === 'review') return REVIEW_ROUTE;
  return WIZARD_STEPS.find((s) => s.key === key)?.route ?? FIRST_WIZARD_ROUTE;
}

/** Last wizard step before review (photos). */
export const STEP_BEFORE_REVIEW_ROUTE = WIZARD_STEPS[WIZARD_STEPS.length - 1]!.route;

/** Map a wizard route to its step key (or review). */
export function stepKeyFromRoute(route: string): StepConfig['key'] | 'review' | null {
  if (route === REVIEW_ROUTE) return 'review';
  return WIZARD_STEPS.find((s) => s.route === route)?.key ?? null;
}

export function indicatorSteps(draft: WizardDraft, activeKey: string) {
  const c = stepCompletion(draft);
  return WIZARD_STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    short: s.short,
    completed: c[s.key],
    progress: (c[s.key] ? 'complete' : stepHasProgress(draft, s.key) ? 'in_progress' : 'incomplete') as StepStatus,
    /** Field surveyors may jump to any step and fill sections in any order. */
    reachable: true,
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
