/**
 * Verifies unified draft merge and stale-local detection logic.
 * Run via: npm run verify:unified-drafts
 */
import type { Id } from '../convex/_generated/dataModel';
import { isStaleLinkedLocalDraft, mergeDraftLists } from '../src/utils/unifiedDraftMerge';

let failed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[verify-unified-drafts] FAIL — ${msg}`);
    failed = true;
  }
}

const serverId = 'survey123' as Id<'surveys'>;

const localOnly = {
  localId: 'ls_local_only',
  createdAt: 1000,
  updatedAt: 2000,
  completionPct: 10,
};

const localSynced = {
  localId: 'ls_synced',
  serverSurveyId: serverId,
  createdAt: 1000,
  updatedAt: 3000,
  parcelNo: 'P-1',
  unitNo: 'U-1',
  wardNo: '12',
  ownerName: 'Test Owner',
  completionPct: 55,
};

const serverDraft = {
  _id: serverId,
  localId: 'ls_synced',
  parcelNo: 'P-1',
  unitNo: 'U-1',
  wardNo: '12',
  _creationTime: 900,
  clientUpdatedAt: 2500,
  completionPct: 40,
};

const merged = mergeDraftLists([localOnly, localSynced], [serverDraft]);
assert(merged.length === 2, 'should list local-only and merged server draft');

const mergedItem = merged.find((i) => i.localId === 'ls_synced');
assert(mergedItem?.source === 'merged', 'synced local+server should merge');
assert(mergedItem?.resumeLocal === true, 'merged item should resume via local draft');
assert((mergedItem?.completionPct ?? 0) >= 55, 'merged completion uses max of local/server');

const staleLocal = {
  ...localSynced,
  localId: 'ls_stale',
  serverSurveyId: 'survey999' as Id<'surveys'>,
};
assert(isStaleLinkedLocalDraft(staleLocal, [serverDraft]), 'stale linked local must be detected');

if (failed) {
  process.exit(1);
}
console.log('[verify-unified-drafts] All checks passed.');
