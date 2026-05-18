/**
 * Wizard draft state — persisted in AsyncStorage so steps can be filled
 * in over multiple sessions (a surveyor pauses in the field, app closes,
 * comes back later).
 *
 * Why not store the draft in Convex from step 1?
 *   The Convex schema requires every field on `surveys`. A draft has lots
 *   of half-filled fields. Two options:
 *     (a) make every field on `surveys` optional (loses type safety)
 *     (b) keep drafts client-side until "submit"
 *
 *   We pick (b). The wizard writes to AsyncStorage on every step; the
 *   Any step can call `surveys.saveDraft` (partial payload, relaxed rules).
 *   Review calls `surveys.submit` after all steps are complete — full
 *   validation runs server-side at submit time. Idempotency via `localId`
 *   means retries are safe.
 *
 * Lifecycle:
 *   - createNewDraft()   → generates a fresh localId, returns the empty draft
 *   - useWizardDraft(id) → loads the draft for `localId`, exposes update + reset
 *   - clearDraft(id)     → drops the entry from AsyncStorage after successful submit
 */
import { isValidIndianMobile } from '@/utils/format';
import { coerceSanitationType, coerceWaterSource, servicesStepComplete } from '@/utils/services';
import { surveyPhotosComplete } from '@/utils/surveyPhotos';
import { taxationSubcategoryComplete } from '@/utils/taxation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { Id } from '../../convex/_generated/dataModel';

const KEY = (localId: string) => `wizard_draft:${localId}`;

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
  return raw;
}

export interface WizardDraft {
  localId: string;
  /** Convex survey row after first `saveDraft` — used to sync photos on review. */
  serverSurveyId?: Id<'surveys'>;
  createdAt: number;
  updatedAt: number;

  // Step 0 — Survey start
  districtId?: Id<'districts'>;
  assessmentYear?: string;

  // Step 1 — Property
  municipalityId?: Id<'municipalities'>;
  wardNo?: string;
  sectorNo?: string;
  oldPropertyNo?: string;
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
  floors?: Array<{
    clientFloorId: string;
    floorName: string;
    usageType: string;
    constructionType: string;
    isOccupied: boolean;
    areaSqft: number;
  }>;

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
  photos?: Array<{
    slot: 'front' | 'inside' | 'side' | 'document';
    storageId: Id<'_storage'>;
    url?: string;
    sizeKb: number;
    width?: number;
    height?: number;
    capturedAt: number;
  }>;
}

export function newLocalId(): string {
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
  };
  await AsyncStorage.setItem(KEY(draft.localId), JSON.stringify(draft));
  return draft;
}

export async function clearDraft(localId: string): Promise<void> {
  await AsyncStorage.removeItem(KEY(localId));
}

export async function persistDraft(draft: WizardDraft): Promise<void> {
  const next = { ...draft, updatedAt: Date.now() };
  await AsyncStorage.setItem(KEY(next.localId), JSON.stringify(next));
}

/** Hydrate a server survey into a local wizard draft (resume / edit). */
export function surveyToDraft(survey: {
  localId: string;
  districtId?: Id<'districts'>;
  municipalityId: Id<'municipalities'>;
  wardNo: string;
  sectorNo?: string;
  oldPropertyNo?: string;
  parcelNo: string;
  unitNo: string;
  constructedYear?: number;
  isSlum: boolean;
  respondentName?: string;
  relationship?: string;
  owners?: Array<{
    name?: string;
    fatherOrHusbandName?: string;
    mobileNo?: string;
    altMobileNo?: string;
  }>;
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
  floors: Array<{
    clientFloorId: string;
    floorName: string;
    usageType: string;
    constructionType: string;
    isOccupied: boolean;
    areaSqft: number;
  }>;
  photos: Array<{
    slot: 'front' | 'inside' | 'side' | 'document';
    storageId: Id<'_storage'>;
    url?: string | null;
    sizeKb: number;
    width?: number;
    height?: number;
    capturedAt: number;
  }>;
}): WizardDraft {
  const now = Date.now();
  return {
    localId: survey.localId,
    createdAt: now,
    updatedAt: now,
    districtId: survey.districtId,
    municipalityId: survey.municipalityId,
    wardNo: survey.wardNo,
    sectorNo: survey.sectorNo,
    oldPropertyNo: survey.oldPropertyNo,
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
    floors: survey.floors.map((f) => ({
      clientFloorId: f.clientFloorId,
      floorName: f.floorName,
      usageType: f.usageType,
      constructionType: f.constructionType,
      isOccupied: f.isOccupied,
      areaSqft: f.areaSqft,
    })),
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
 * any subset of fields and re-persists synchronously.
 */
export function useWizardDraft(localId: string | undefined) {
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!localId) {
      setDraft(null);
      setLoading(false);
      return;
    }
    AsyncStorage.getItem(KEY(localId))
      .then(async (raw) => {
        if (!alive) return;
        if (raw) {
          setDraft(
            migrateWizardDraft(
              JSON.parse(raw) as WizardDraft & {
                propertyNo?: string;
                ownerName?: string;
                fatherOrHusbandName?: string;
                mobileNo?: string;
                altMobileNo?: string;
              },
            ),
          );
          return;
        }
        const empty: WizardDraft = {
          localId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isSlum: false,
          floors: [],
          photos: [],
        };
        await AsyncStorage.setItem(KEY(localId), JSON.stringify(empty));
        setDraft(empty);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [localId]);

  const update = useCallback(async (patch: Partial<WizardDraft>) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch, updatedAt: Date.now() };
      void AsyncStorage.setItem(KEY(next.localId), JSON.stringify(next));
      return next;
    });
  }, []);

  return { draft, loading, update };
}

/** Map local draft → `surveys.saveDraft` payload (only fields the user has filled). */
export function draftToSaveDraftPayload(d: WizardDraft) {
  if (!d.municipalityId) return null;

  const owners = d.owners
    ?.map((o) => ({
      name: o.name?.trim() || undefined,
      fatherOrHusbandName: o.fatherOrHusbandName?.trim() || undefined,
      mobileNo: o.mobileNo?.trim() || undefined,
      altMobileNo: o.altMobileNo?.trim() || undefined,
    }))
    .filter((o) => o.name || o.fatherOrHusbandName || o.mobileNo || o.altMobileNo);

  return {
    localId: d.localId,
    municipalityId: d.municipalityId,
    clientUpdatedAt: Date.now(),
    wardNo: d.wardNo?.trim() || undefined,
    sectorNo: d.sectorNo?.trim() || undefined,
    oldPropertyNo: d.oldPropertyNo?.trim() || undefined,
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
    plinthSqft: d.plinthSqft,
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

/** Map an AsyncStorage draft → `surveys.upsert` payload (filled-required-fields check). */
export function draftToUpsertArgs(d: WizardDraft) {
  if (
    !d.municipalityId ||
    !d.wardNo ||
    !d.parcelNo?.trim() ||
    !d.unitNo?.trim() ||
    !primaryOwnerMobileFromDraft(d) ||
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
    parcelNo: d.parcelNo.trim(),
    unitNo: d.unitNo.trim(),
    constructedYear: d.constructedYear,
    isSlum: !!d.isSlum,
    respondentName: d.respondentName?.trim() || undefined,
    relationship: d.relationship?.trim() || undefined,
    owners: (() => {
      const cleaned = d.owners
        ?.map((o) => ({
          name: o.name?.trim() || undefined,
          fatherOrHusbandName: o.fatherOrHusbandName?.trim() || undefined,
          mobileNo: o.mobileNo?.trim() || undefined,
          altMobileNo: o.altMobileNo?.trim() || undefined,
        }))
        .filter((o) => o.name || o.fatherOrHusbandName || o.mobileNo || o.altMobileNo);
      return cleaned?.length ? cleaned : undefined;
    })(),
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
    plinthSqft: d.plinthSqft ?? 0,
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
  if (!d.owners?.length) return undefined;
  for (const o of d.owners) {
    const m = o.mobileNo?.trim();
    if (m && isValidIndianMobile(m)) return m;
  }
  return undefined;
}

/** Owner step: first owner mobile required; other rows validated when filled. */
export function ownerStepComplete(d: WizardDraft): boolean {
  const owners = d.owners ?? [];
  if (!owners.length) return false;
  const primary = owners[0]?.mobileNo?.trim();
  if (!primary || !isValidIndianMobile(primary)) return false;
  for (const o of owners) {
    const mobile = o.mobileNo?.trim();
    if (mobile && !isValidIndianMobile(mobile)) return false;
    const alt = o.altMobileNo?.trim();
    if (alt) {
      if (!isValidIndianMobile(alt)) return false;
      if (alt === mobile) return false;
    }
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
    property: !!(d.wardNo && d.parcelNo?.trim() && d.unitNo?.trim()),
    owner: ownerStepComplete(d),
    address: !!(d.locality?.trim() && d.colonyName?.trim() && d.pinCode),
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
      d.floors.every((f) => {
        if (!f.floorName || !(f.areaSqft > 0)) return false;
        if (f.floorName === 'open_land') return true;
        return !!(f.usageType && f.constructionType);
      })
    ),
    services: servicesStepComplete(d),
    gps: !!d.gps,
    photos: surveyPhotosComplete(d.photos),
  };
}
