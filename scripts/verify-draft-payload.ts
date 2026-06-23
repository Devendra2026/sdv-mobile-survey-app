/**
 * Ensures wizard draft → saveDraft payload mapping preserves filled fields.
 * Run via: npm run verify:draft-payload
 */
import { draftToSaveDraftPayload, type WizardDraft } from '../src/hooks/useWizardDraft';

let failed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[verify-draft-payload] FAIL — ${msg}`);
    failed = true;
  }
}

const draft: WizardDraft = {
  localId: 'ls_payload_test',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  municipalityId: 'muni1' as WizardDraft['municipalityId'],
  wardNo: '12',
  parcelNo: '00123',
  unitNo: '045',
  assessmentYear: '2024-25',
  locality: 'Civil Lines',
  colonyName: 'Block A',
  pinCode: '282001',
  plotSqft: 1200,
  floors: [],
  photos: [],
  owners: [{ clientOwnerId: 'ow_1', mobileNo: '9876543210', name: 'Test Owner' }],
  gps: {
    latitude: 27.17,
    longitude: 78.01,
    accuracyMeters: 8,
    capturedAt: Date.now(),
  },
};

const payload = draftToSaveDraftPayload(draft);
assert(payload !== null, 'payload generated when municipalityId set');
assert(payload?.localId === draft.localId, 'localId preserved');
assert(payload?.wardNo === '12', 'ward preserved');
assert(payload?.parcelNo === '00123', 'parcel preserved');
assert(payload?.locality === 'Civil Lines', 'locality preserved');
assert(payload?.mobileNo === '9876543210', 'primary mobile preserved');
assert(payload?.gps?.latitude === 27.17, 'gps latitude preserved');
assert(typeof payload?.clientUpdatedAt === 'number', 'clientUpdatedAt set');

const noMuni = draftToSaveDraftPayload({ ...draft, municipalityId: undefined });
assert(noMuni === null, 'no payload without municipalityId');

if (failed) {
  process.exit(1);
}

console.log('[verify-draft-payload] OK — draftToSaveDraftPayload round-trip fields intact.');
