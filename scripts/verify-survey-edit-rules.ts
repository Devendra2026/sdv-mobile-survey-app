/**
 * Ensures saveDraft post-status resolution never downgrades submitted surveys.
 * Run via: npm run verify:survey-edit-rules
 */
import type { Doc } from '../convex/_generated/dataModel';
import { resolvePostSaveStatuses } from '../convex/surveyEditRules';

let failed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[verify-survey-edit-rules] FAIL — ${msg}`);
    failed = true;
  }
}

function survey(partial: Partial<Doc<'surveys'>> & Pick<Doc<'surveys'>, 'status' | 'qcStatus'>): Doc<'surveys'> {
  return partial as Doc<'surveys'>;
}

const submittedPending = survey({ status: 'submitted', qcStatus: 'pending' });
assert(
  resolvePostSaveStatuses(submittedPending).status === 'submitted',
  'submitted+pending must stay submitted after save',
);

const submittedRejected = survey({ status: 'submitted', qcStatus: 'rejected' });
assert(
  resolvePostSaveStatuses(submittedRejected).status === 'submitted',
  'submitted with non-pending qc must not downgrade to draft',
);

const approved = survey({ status: 'approved', qcStatus: 'approved' });
const afterApprovedEdit = resolvePostSaveStatuses(approved);
assert(afterApprovedEdit.status === 'submitted', 'approved edit re-queues as submitted');
assert(afterApprovedEdit.qcStatus === 'pending', 'approved edit resets qc to pending');

const returned = survey({ status: 'draft', qcStatus: 'rejected' });
assert(
  resolvePostSaveStatuses(returned).status === 'draft' && resolvePostSaveStatuses(returned).qcStatus === 'rejected',
  'QC-returned draft stays draft+rejected',
);

if (failed) {
  process.exit(1);
}
console.log('[verify-survey-edit-rules] All checks passed.');
