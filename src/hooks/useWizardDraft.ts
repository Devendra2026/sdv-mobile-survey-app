import { validateGpsCapture } from '@/convex/lib/gpsValidation';
import { primaryOwnerMobileFromOwners } from '@/convex/ownerMobile';
import {
  altMobileError,
  isValidConstructedYear,
  isValidParcelNo,
  isValidTenDigitMobile,
  isValidUnitNo,
  primaryMobileError,
} from '../../convex/surveyFieldValidation';
import { isPinValidForUlb } from '@/utils/addressValidation';
import { plinthSqftFromFloors } from '@/utils/area';
import { normalizeFloorFields, usageTypeToOccupied } from '@/utils/floorRow';
import { coerceSanitationType, coerceWaterSource, servicesStepComplete } from '@/utils/services';
import { surveyPhotosComplete } from '@/utils/surveyPhotos';
import { taxationSubcategoryComplete } from '@/utils/taxation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Id } from '../../convex/_generated/dataModel';
import type { StepConfig } from './wizardSteps';

const KEY = (localId: string) => `wizard_draft:${localId}`;

const DRAFT_PERSIST_DEBOUNCE_MS = 300;

const pendingDraftWrites = new Map<string, ReturnType<typeof setTimeout>>();
const pendingDraftPayloads = new Map<string, WizardDraft>();

function scheduleDraftPersist(localId: string, draft: WizardDraft): void {
  pendingDraftPayloads.set(localId, draft);
  const existing = pendingDraftWrites.get(localId);
  if (existing) clearTimeout(existing);
  pendingDraftWrites.set(
    localId,
    setTimeout(() => {
      pendingDraftWrites.delete(localId);
      const toWrite = pendingDraftPayloads.get(localId);
      if (toWrite) {
        pendingDraftPayloads.delete(localId);
        void AsyncStorage.setItem(KEY(localId), JSON.stringify(toWrite));
      }
    }, DRAFT_PERSIST_DEBOUNCE_MS),
  );
}

/** Flush a debounced draft write immediately (e.g. before navigate away or submit). */
export async function flushDraftPersist(localId: string): Promise<void> {
  const timer = pendingDraftWrites.get(localId);
  if (timer) {
    clearTimeout(timer);
    pendingDraftWrites.delete(localId);
  }
  const draft = pendingDraftPayloads.get(localId);
  if (draft) {
    pendingDraftPayloads.delete(localId);
    await AsyncStorage.setItem(KEY(localId), JSON.stringify(draft));
  }
}

export type WizardOwnerRow = {
  clientOwnerId: string;
  name?: string;
  fatherOrHusbandName?: string;
  mobileNo?: string;
  altMobileNo?: string;
};

export function newOwnerRow(): WizardOwnerRow {
  return {
    clientOwnerId: `ow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  };
}

/** Migrate legacy draft fields after schema changes. */
function migrateWizardDraft(
  raw: WizardDraft & {
    propertyNo?: string;
    ownerName?: string;
    fatherOrHusbandName?: string;
    mobileNo?: string;
    altMobileNo?: string;
  },
): WizardDraft {
  if (raw.propertyNo && !raw.oldPropertyNo) {
    raw.oldPropertyNo = raw.propertyNo;
  }
  delete raw.propertyNo;
  if (!raw.owners?.length && !raw.ownerName?.trim() && !raw.fatherOrHusbandName?.trim()) {
    raw.owners = [newOwnerRow()];
  }
  if (!raw.owners?.length && (raw.ownerName?.trim() || raw.fatherOrHusbandName?.trim())) {
    raw.owners = [
      {
        clientOwnerId: newOwnerRow().clientOwnerId,
        name: raw.ownerName,
        fatherOrHusbandName: raw.fatherOrHusbandName,
        mobileNo: raw.mobileNo,
        altMobileNo: raw.altMobileNo,
      },
    ];
  } else if (raw.owners?.length && raw.mobileNo && !raw.owners[0]?.mobileNo) {
    raw.owners[0] = {
      ...raw.owners[0]!,
      mobileNo: raw.mobileNo,
      altMobileNo: raw.altMobileNo ?? raw.owners[0]!.altMobileNo,
    };
  }
  delete raw.ownerName;
  delete raw.fatherOrHusbandName;
  delete raw.mobileNo;
  delete raw.altMobileNo;
  if (raw.waterSource) raw.waterSource = coerceWaterSource(raw.waterSource);
  if (raw.sanitationType) raw.sanitationType = coerceSanitationType(raw.sanitationType);
  if (raw.floors?.length) {
    raw.floors = raw.floors.map((f) => {
      const { usageFactor, usageType } = normalizeFloorFields({
        usageFactor: f.usageFactor,
        usageType: f.usageType,
      });
      return {
        ...f,
        usageFactor,
        usageType,
        isOccupied: usageType ? usageTypeToOccupied(usageType) : f.isOccupied,
      };
    });
  }
  return raw;
}

export interface WizardDraft {
  localId: string;
  /** Convex survey row after first `saveDraft` — used to sync photos on review. */
  serverSurveyId?: Id<'surveys'>;
  createdAt: number;
  updatedAt: number;
  /** Last wizard screen visited — used to resume in-progress drafts. */
  lastActiveStepKey?: StepConfig['key'] | 'review';
  /** Highest step index opened — allows returning to in-progress sections. */
  furthestStepIndex?: number;
  /** Cloud sync state — persisted so retries survive app restarts. */
  pendingCloudSync?: boolean;
  lastSyncError?: string;
  lastSyncedAt?: number;

  // Step 0 — Survey start
  districtId?: Id<'districts'>;
  assessmentYear?: string;

  // Step 1 — Property
  municipalityId?: Id<'municipalities'>;
  /** ULB postal code — used for address step completion. */
  ulbPostalCode?: string;
  wardNo?: string;
  sectorNo?: string;
  oldPropertyNo?: string;
  propertyId?: string;
  parcelNo?: string;
  unitNo?: string;
  constructedYear?: number;
  isSlum?: boolean;

  // Step 2 — Owner
  respondentName?: string;
  relationship?: string;
  owners?: WizardOwnerRow[];
  familySize?: number;

  // Step 3 — Address
  houseNo?: string;
  locality?: string;
  colonyName?: string;
  city?: string;
  pinCode?: string;

  // Step 4 — Taxation
  ownershipType?: string;
  propertyType?: string;
  propertyUse?: string;
  situation?: string;
  roadType?: string;
  taxRateZone?: string;
  plotSqft?: number;
  plinthSqft?: number;

  // Step 5 — Floors (client-side IDs; server canonicalises on submit)
  floors?: {
    clientFloorId: string;
    floorName: string;
    usageFactor: string;
    usageType: string;
    constructionType: string;
    isOccupied: boolean;
    areaSqft: number;
  }[];

  // Step 6 — Services
  municipalWaterConnection?: boolean;
  waterSource?: string;
  sanitationType?: string;
  municipalWasteCollection?: boolean;
  electricityNo?: string;

  // Step 7 — GPS
  gps?: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt: number;
    provider?: string;
    isMockLocation?: boolean;
  };

  // Step 8 — Photos.
  // Photos upload to Convex storage as soon as they're captured (we're
  // online); we keep just the metadata + storageId here so the review
  // screen can show thumbnails and the submit call can link them to
  // the new survey.
  photos?: {
    slot: 'front' | 'inside' | 'side' | 'document';
    storageId: Id<'_storage'>;
    url?: string;
    sizeKb: number;
    width?: number;
    height?: number;
    capturedAt: number;
  }[];
}

function newLocalId(): string {
  return `ls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createNewDraft(): Promise<WizardDraft> {
  const draft: WizardDraft = {
    localId: newLocalId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isSlum: false,
    floors: [],
    photos: [],
    owners: [newOwnerRow()],
  };
  await AsyncStorage.setItem(KEY(draft.localId), JSON.stringify(draft));
  return draft;
}

export async function clearDraft(localId: string): Promise<void> {
  const timer = pendingDraftWrites.get(localId);
  if (timer) {
    clearTimeout(timer);
    pendingDraftWrites.delete(localId);
  }
  pendingDraftPayloads.delete(localId);
  await AsyncStorage.removeItem(KEY(localId));
}

export async function persistDraft(draft: WizardDraft): Promise<void> {
  const next = {
    ...draft,
    updatedAt: Date.now(),
  };
  await AsyncStorage.setItem(KEY(next.localId), JSON.stringify(next));
}

type RawWizardDraft = WizardDraft & {
  propertyNo?: string;
  ownerName?: string;
  fatherOrHusbandName?: string;
  mobileNo?: string;
  altMobileNo?: string;
};

function parseStoredDraft(raw: string): WizardDraft {
  return migrateWizardDraft(JSON.parse(raw) as RawWizardDraft);
}

/** Load a single draft from AsyncStorage (returns null if missing). */
export async function getDraft(localId: string): Promise<WizardDraft | null> {
  const raw = await AsyncStorage.getItem(KEY(localId));
  return raw ? parseStoredDraft(raw) : null;
}

/** Hydrate a server survey into a local wizard draft (resume / edit). */
export function surveyToDraft(survey: {
  _id: Id<'surveys'>;
  _creationTime?: number;
  clientUpdatedAt?: number;
  localId: string;
  districtId?: Id<'districts'>;
  municipalityId: Id<'municipalities'>;
  wardNo: string;
  sectorNo?: string;
  oldPropertyNo?: string;
  propertyId?: string;
  parcelNo: string;
  unitNo: string;
  constructedYear?: number;
  isSlum: boolean;
  respondentName?: string;
  relationship?: string;
  owners?: {
    name?: string;
    fatherOrHusbandName?: string;
    mobileNo?: string;
    altMobileNo?: string;
  }[];
  familySize?: number;
  mobileNo: string;
  altMobileNo?: string;
  houseNo?: string;
  locality: string;
  colonyName: string;
  city: string;
  pinCode: string;
  assessmentYear: string;
  ownershipType: string;
  propertyType: string;
  propertyUse: string;
  situation: string;
  roadType: string;
  taxRateZone: string;
  plotSqft: number;
  plinthSqft: number;
  municipalWaterConnection: boolean;
  waterSource: string;
  sanitationType: string;
  municipalWasteCollection: boolean;
  electricityNo?: string;
  gps?: WizardDraft['gps'];
  floors: {
    clientFloorId: string;
    floorName: string;
    usageFactor?: string;
    usageType: string;
    constructionType: string;
    isOccupied: boolean;
    areaSqft: number;
  }[];
  photos: {
    slot: 'front' | 'inside' | 'side' | 'document';
    storageId: Id<'_storage'>;
    url?: string | null;
    sizeKb: number;
    width?: number;
    height?: number;
    capturedAt: number;
  }[];
}): WizardDraft {
  const createdAt = survey._creationTime ?? Date.now();
  const updatedAt = survey.clientUpdatedAt ?? createdAt;
  return {
    localId: survey.localId,
    serverSurveyId: survey._id,
    createdAt,
    updatedAt,
    districtId: survey.districtId,
    municipalityId: survey.municipalityId,
    wardNo: survey.wardNo,
    sectorNo: survey.sectorNo,
    oldPropertyNo: survey.oldPropertyNo,
    propertyId: survey.propertyId,
    parcelNo: survey.parcelNo,
    unitNo: survey.unitNo,
    constructedYear: survey.constructedYear,
    isSlum: survey.isSlum,
    respondentName: survey.respondentName,
    relationship: survey.relationship,
    owners: (() => {
      const rows =
        survey.owners?.map((o, i) => ({
          clientOwnerId: `ow_${i}_${survey.localId}`,
          name: o.name,
          fatherOrHusbandName: o.fatherOrHusbandName,
          mobileNo: o.mobileNo,
          altMobileNo: o.altMobileNo,
        })) ?? [];
      if (rows.length === 0 && survey.mobileNo) {
        return [
          {
            clientOwnerId: newOwnerRow().clientOwnerId,
            mobileNo: survey.mobileNo,
            altMobileNo: survey.altMobileNo,
          },
        ];
      }
      if (rows.length > 0 && survey.mobileNo && !rows[0]!.mobileNo) {
        rows[0] = { ...rows[0]!, mobileNo: survey.mobileNo, altMobileNo: survey.altMobileNo ?? rows[0]!.altMobileNo };
      }
      return rows;
    })(),
    familySize: survey.familySize,
    houseNo: survey.houseNo,
    locality: survey.locality,
    colonyName: survey.colonyName,
    city: survey.city,
    pinCode: survey.pinCode,
    assessmentYear: survey.assessmentYear,
    ownershipType: survey.ownershipType,
    propertyType: survey.propertyType,
    propertyUse: survey.propertyUse,
    situation: survey.situation,
    roadType: survey.roadType,
    taxRateZone: survey.taxRateZone,
    plotSqft: survey.plotSqft,
    plinthSqft: survey.plinthSqft,
    municipalWaterConnection: survey.municipalWaterConnection,
    waterSource: coerceWaterSource(survey.waterSource),
    sanitationType: coerceSanitationType(survey.sanitationType),
    municipalWasteCollection: survey.municipalWasteCollection,
    electricityNo: survey.electricityNo,
    floors: survey.floors.map((f) => {
      const { usageFactor, usageType } = normalizeFloorFields({
        usageFactor: f.usageFactor,
        usageType: f.usageType,
      });
      return {
        clientFloorId: f.clientFloorId,
        floorName: f.floorName,
        usageFactor,
        usageType,
        constructionType: f.constructionType,
        isOccupied: usageType ? usageTypeToOccupied(usageType) : f.isOccupied,
        areaSqft: f.areaSqft,
      };
    }),
    gps: survey.gps,
    photos: survey.photos.map((p) => ({
      slot: p.slot,
      storageId: p.storageId,
      url: p.url ?? undefined,
      sizeKb: p.sizeKb,
      width: p.width,
      height: p.height,
      capturedAt: p.capturedAt,
    })),
  };
}

export async function listDrafts(): Promise<WizardDraft[]> {
  const keys = await AsyncStorage.getAllKeys();
  const wizardKeys = keys.filter((k) => k.startsWith('wizard_draft:'));
  const pairs = await AsyncStorage.multiGet(wizardKeys);
  return pairs
    .map(([, v]) =>
      v
        ? migrateWizardDraft(
            JSON.parse(v) as WizardDraft & {
              propertyNo?: string;
              ownerName?: string;
              fatherOrHusbandName?: string;
              mobileNo?: string;
              altMobileNo?: string;
            },
          )
        : null,
    )
    .filter((d): d is WizardDraft => d !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Reactive draft hook. Reads the row from AsyncStorage; `update` patches
 * any subset of fields and re-persists with a short debounce.
 */
type DraftStore = {
  drafts: Record<string, WizardDraft>;
  /** localId currently being loaded from AsyncStorage, if not yet cached. */
  pendingId: string | null;
};

type DraftStoreAction =
  | { type: 'loadStarted'; localId: string }
  | { type: 'loadFinished'; localId: string; draft: WizardDraft }
  | { type: 'loadFailed'; localId: string }
  | { type: 'patch'; localId: string; patch: Partial<WizardDraft> };

function draftStoreReducer(state: DraftStore, action: DraftStoreAction): DraftStore {
  switch (action.type) {
    case 'loadStarted':
      if (state.drafts[action.localId]) return state;
      return { ...state, pendingId: action.localId };
    case 'loadFinished':
      return {
        drafts: { ...state.drafts, [action.localId]: action.draft },
        pendingId: state.pendingId === action.localId ? null : state.pendingId,
      };
    case 'loadFailed':
      return {
        ...state,
        pendingId: state.pendingId === action.localId ? null : state.pendingId,
      };
    case 'patch': {
      const current = state.drafts[action.localId];
      if (!current) return state;
      const next = { ...current, ...action.patch, updatedAt: Date.now() };
      scheduleDraftPersist(action.localId, next);
      return { drafts: { ...state.drafts, [action.localId]: next }, pendingId: state.pendingId };
    }
    default:
      return state;
  }
}

export function useWizardDraft(localId: string | undefined) {
  const [store, dispatch] = useReducer(draftStoreReducer, { drafts: {}, pendingId: null });
  const draftsRef = useRef(store.drafts);
  draftsRef.current = store.drafts;

  useEffect(() => {
    if (!localId || draftsRef.current[localId]) return;

    let alive = true;
    dispatch({ type: 'loadStarted', localId });

    AsyncStorage.getItem(KEY(localId))
      .then(async (raw) => {
        if (!alive) return;
        if (raw) {
          dispatch({ type: 'loadFinished', localId, draft: parseStoredDraft(raw) });
          return;
        }
        const empty: WizardDraft = {
          localId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isSlum: false,
          floors: [],
          photos: [],
          owners: [newOwnerRow()],
        };
        await AsyncStorage.setItem(KEY(localId), JSON.stringify(empty));
        dispatch({ type: 'loadFinished', localId, draft: empty });
      })
      .catch(() => {
        if (alive) dispatch({ type: 'loadFailed', localId });
      });

    return () => {
      alive = false;
    };
  }, [localId]);

  useEffect(() => {
    if (!localId) return;
    return () => {
      void flushDraftPersist(localId);
    };
  }, [localId]);

  const draft = localId ? (store.drafts[localId] ?? null) : null;
  const loading = Boolean(localId && !store.drafts[localId] && store.pendingId === localId);

  const update = useCallback(
    async (patch: Partial<WizardDraft>) => {
      if (!localId) return;
      dispatch({ type: 'patch', localId, patch });
    },
    [localId],
  );

  return { draft: localId ? draft : null, loading: localId ? loading : false, update };
}

/** Map local draft → `survey.saveDraft` payload (only fields the user has filled). */
function cleanedOwnersFromDraft(owners: WizardDraft['owners'] | undefined) {
  if (!owners) return undefined;
  const cleaned = [];
  for (const o of owners) {
    const row = {
      name: o.name?.trim() || undefined,
      fatherOrHusbandName: o.fatherOrHusbandName?.trim() || undefined,
      mobileNo: o.mobileNo?.trim() || undefined,
      altMobileNo: o.altMobileNo?.trim() || undefined,
    };
    if (row.name || row.fatherOrHusbandName || row.mobileNo || row.altMobileNo) {
      cleaned.push(row);
    }
  }
  return cleaned.length ? cleaned : undefined;
}

export function draftToSaveDraftPayload(d: WizardDraft) {
  if (!d.municipalityId) return null;

  const owners = cleanedOwnersFromDraft(d.owners);

  return {
    localId: d.localId,
    id: d.serverSurveyId,
    municipalityId: d.municipalityId,
    clientUpdatedAt: Date.now(),
    wardNo: d.wardNo?.trim() || undefined,
    sectorNo: d.sectorNo?.trim() || undefined,
    oldPropertyNo: d.oldPropertyNo?.trim() || undefined,
    propertyId: d.propertyId?.trim() || undefined,
    parcelNo: d.parcelNo?.trim() || undefined,
    unitNo: d.unitNo?.trim() || undefined,
    constructedYear: d.constructedYear,
    isSlum: d.isSlum,
    respondentName: d.respondentName?.trim() || undefined,
    relationship: d.relationship?.trim() || undefined,
    owners: owners?.length ? owners : undefined,
    familySize: d.familySize,
    mobileNo: primaryOwnerMobileFromDraft(d),
    altMobileNo: d.owners?.[0]?.altMobileNo?.trim() || undefined,
    houseNo: d.houseNo?.trim() || undefined,
    locality: d.locality?.trim() || undefined,
    colonyName: d.colonyName?.trim() || undefined,
    city: d.city?.trim() || undefined,
    pinCode: d.pinCode?.replace(/\D/g, '').slice(0, 6) || undefined,
    assessmentYear: d.assessmentYear,
    ownershipType: d.ownershipType,
    propertyType: d.propertyType?.trim() || undefined,
    propertyUse: d.propertyUse,
    situation: d.situation,
    roadType: d.roadType,
    taxRateZone: d.taxRateZone,
    plotSqft: d.plotSqft,
    plinthSqft: plinthSqftFromFloors(d.floors ?? []) || d.plinthSqft,
    municipalWaterConnection: d.municipalWaterConnection,
    waterSource: d.waterSource as 'government_tap' | 'dug_well' | 'borewell' | 'other' | undefined,
    sanitationType: d.sanitationType as
      | 'sewer_system'
      | 'septic_tank'
      | 'surface_drain'
      | 'no_toilet'
      | 'other'
      | undefined,
    municipalWasteCollection: d.municipalWasteCollection,
    electricityNo: d.electricityNo,
    gps: d.gps,
  };
}

/** Map an AsyncStorage draft → `survey.upsert` payload (filled-required-fields check). */
export function draftToUpsertArgs(d: WizardDraft) {
  if (
    !d.municipalityId ||
    !d.wardNo ||
    !d.parcelNo?.trim() ||
    !d.unitNo?.trim() ||
    (d.constructedYear != null && !isValidConstructedYear(d.constructedYear)) ||
    !ownerStepComplete(d) ||
    !d.locality?.trim() ||
    !d.colonyName?.trim() ||
    !d.pinCode ||
    !d.assessmentYear ||
    !d.ownershipType ||
    !d.propertyUse ||
    !taxationSubcategoryComplete(d.propertyUse, d.propertyType) ||
    !d.situation ||
    !d.roadType ||
    !d.taxRateZone ||
    typeof d.municipalWaterConnection !== 'boolean' ||
    !d.waterSource ||
    !d.sanitationType ||
    typeof d.municipalWasteCollection !== 'boolean'
  ) {
    return null;
  }
  return {
    localId: d.localId,
    municipalityId: d.municipalityId,
    wardNo: d.wardNo,
    sectorNo: d.sectorNo?.trim() || undefined,
    oldPropertyNo: d.oldPropertyNo?.trim() || undefined,
    propertyId: d.propertyId?.trim() || undefined,
    parcelNo: d.parcelNo.trim(),
    unitNo: d.unitNo.trim(),
    constructedYear: d.constructedYear,
    isSlum: !!d.isSlum,
    respondentName: d.respondentName?.trim() || undefined,
    relationship: d.relationship?.trim() || undefined,
    owners: cleanedOwnersFromDraft(d.owners),
    familySize: d.familySize,
    mobileNo: primaryOwnerMobileFromDraft(d) ?? '',
    altMobileNo: d.owners?.[0]?.altMobileNo?.trim() || undefined,
    houseNo: d.houseNo?.trim() || undefined,
    locality: d.locality.trim(),
    colonyName: d.colonyName.trim(),
    city: d.city?.trim() || '',
    pinCode: d.pinCode,
    assessmentYear: d.assessmentYear,
    ownershipType: d.ownershipType,
    propertyType: d.propertyType?.trim() ?? '',
    propertyUse: d.propertyUse,
    situation: d.situation,
    roadType: d.roadType,
    taxRateZone: d.taxRateZone,
    plotSqft: d.plotSqft ?? 0,
    plinthSqft: plinthSqftFromFloors(d.floors ?? []) || (d.plinthSqft ?? 0),
    municipalWaterConnection: d.municipalWaterConnection,
    waterSource: d.waterSource,
    sanitationType: d.sanitationType,
    municipalWasteCollection: d.municipalWasteCollection,
    electricityNo: d.electricityNo,
    gps: d.gps,
    clientUpdatedAt: Date.now(),
  };
}

function primaryOwnerMobileFromDraft(d: WizardDraft): string | undefined {
  return primaryOwnerMobileFromOwners(d.owners, d.relationship);
}

/** Owner step: valid primary mobile required; optional rows must be valid if set. */
function ownerStepComplete(d: WizardDraft): boolean {
  const owners = d.owners ?? [];
  if (!owners.length) return false;
  if (primaryMobileError(owners[0]?.mobileNo)) return false;
  for (const o of owners) {
    const mobile = o.mobileNo?.trim();
    if (mobile && !isValidTenDigitMobile(mobile)) return false;
    if (altMobileError(o.altMobileNo, o.mobileNo)) return false;
  }
  if (d.familySize != null && (!Number.isInteger(d.familySize) || d.familySize < 1)) return false;
  return true;
}

/**
 * Reports which steps are complete. Drives the StepIndicator's checkmarks
 * and the "Submit" button's enabled state on the review screen.
 */
export function stepCompletion(d: WizardDraft) {
  return {
    start: !!(d.assessmentYear && d.districtId && d.municipalityId),
    property: !!(
      d.wardNo &&
      isValidParcelNo(d.parcelNo ?? '') &&
      isValidUnitNo(d.unitNo ?? '') &&
      (d.constructedYear == null || isValidConstructedYear(d.constructedYear))
    ),
    owner: ownerStepComplete(d),
    address: !!(d.locality?.trim() && d.colonyName?.trim() && isPinValidForUlb(d.pinCode, d.ulbPostalCode)),
    taxation: !!(
      d.ownershipType &&
      d.propertyUse &&
      taxationSubcategoryComplete(d.propertyUse, d.propertyType) &&
      d.situation &&
      d.roadType &&
      d.taxRateZone
    ),
    floors: !!(
      (d.plotSqft ?? 0) > 0 &&
      d.floors &&
      d.floors.length > 0 &&
      d.floors.every((f) => !!(f.floorName && f.areaSqft > 0 && f.usageFactor && f.usageType && f.constructionType))
    ),
    services: servicesStepComplete(d),
    gps: !!d.gps && validateGpsCapture(d.gps, { strict: true }).length === 0,
    photos: surveyPhotosComplete(d.photos),
  };
}

/** Wizard completion % from step checklist (0–100). */
export function draftCompletionPct(d: WizardDraft): number {
  const c = stepCompletion(d);
  const keys = Object.keys(c) as (keyof typeof c)[];
  const done = keys.filter((k) => c[k]).length;
  return Math.round((done / keys.length) * 100);
}
