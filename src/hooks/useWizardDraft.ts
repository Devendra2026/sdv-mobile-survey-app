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
 *   review screen calls `surveys.upsert({...filledDraft})` once everything
 *   is complete. That single call creates (or updates) the server row
 *   atomically. Idempotency via `localId` means even retries are safe.
 *
 * Lifecycle:
 *   - createNewDraft()   → generates a fresh localId, returns the empty draft
 *   - useWizardDraft(id) → loads the draft for `localId`, exposes update + reset
 *   - clearDraft(id)     → drops the entry from AsyncStorage after successful submit
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { Id } from '../../convex/_generated/dataModel';

const KEY = (localId: string) => `wizard_draft:${localId}`;

export interface WizardDraft {
  localId: string;
  createdAt: number;
  updatedAt: number;

  // Step 0 — Survey start
  districtId?: Id<'districts'>;
  assessmentYear?: string;

  // Step 1 — Property
  municipalityId?: Id<'municipalities'>;
  wardNo?: string;
  propertyNo?: string;
  isSlum?: boolean;

  // Step 2 — Owner
  ownerName?: string;
  respondentName?: string;
  relationship?: string;
  mobileNo?: string;
  familySize?: number;

  // Step 3 — Address
  houseNo?: string;
  street?: string;
  locality?: string;
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
  waterSource?: string;
  sanitationType?: string;
  solidWasteType?: string;
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
    familySize: 1,
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
  propertyNo: string;
  isSlum: boolean;
  ownerName: string;
  respondentName: string;
  relationship: string;
  mobileNo: string;
  familySize: number;
  houseNo: string;
  street: string;
  locality?: string;
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
  waterSource: string;
  sanitationType: string;
  solidWasteType: string;
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
    propertyNo: survey.propertyNo,
    isSlum: survey.isSlum,
    ownerName: survey.ownerName,
    respondentName: survey.respondentName,
    relationship: survey.relationship,
    mobileNo: survey.mobileNo,
    familySize: survey.familySize,
    houseNo: survey.houseNo,
    street: survey.street,
    locality: survey.locality,
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
    waterSource: survey.waterSource,
    sanitationType: survey.sanitationType,
    solidWasteType: survey.solidWasteType,
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
    .map(([, v]) => (v ? (JSON.parse(v) as WizardDraft) : null))
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
          setDraft(JSON.parse(raw) as WizardDraft);
          return;
        }
        const empty: WizardDraft = {
          localId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isSlum: false,
          familySize: 1,
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

/** Map an AsyncStorage draft → `surveys.upsert` payload (filled-required-fields check). */
export function draftToUpsertArgs(d: WizardDraft) {
  if (
    !d.municipalityId ||
    !d.wardNo ||
    !d.propertyNo ||
    !d.ownerName ||
    !d.respondentName ||
    !d.relationship ||
    !d.mobileNo ||
    !d.houseNo ||
    !d.street ||
    !d.city ||
    !d.pinCode ||
    !d.assessmentYear ||
    !d.ownershipType ||
    !d.propertyType ||
    !d.propertyUse ||
    !d.situation ||
    !d.roadType ||
    !d.taxRateZone ||
    d.plotSqft == null ||
    d.plinthSqft == null ||
    !d.waterSource ||
    !d.sanitationType ||
    !d.solidWasteType
  ) {
    return null;
  }
  return {
    localId: d.localId,
    municipalityId: d.municipalityId,
    wardNo: d.wardNo,
    propertyNo: d.propertyNo,
    isSlum: !!d.isSlum,
    ownerName: d.ownerName,
    respondentName: d.respondentName,
    relationship: d.relationship,
    mobileNo: d.mobileNo,
    familySize: d.familySize ?? 1,
    houseNo: d.houseNo,
    street: d.street,
    locality: d.locality,
    city: d.city,
    pinCode: d.pinCode,
    assessmentYear: d.assessmentYear,
    ownershipType: d.ownershipType,
    propertyType: d.propertyType,
    propertyUse: d.propertyUse,
    situation: d.situation,
    roadType: d.roadType,
    taxRateZone: d.taxRateZone,
    plotSqft: d.plotSqft,
    plinthSqft: d.plinthSqft,
    waterSource: d.waterSource,
    sanitationType: d.sanitationType,
    solidWasteType: d.solidWasteType,
    electricityNo: d.electricityNo,
    gps: d.gps,
    clientUpdatedAt: Date.now(),
  };
}

/**
 * Reports which steps are complete. Drives the StepIndicator's checkmarks
 * and the "Submit" button's enabled state on the review screen.
 */
export function stepCompletion(d: WizardDraft) {
  return {
    start: !!(d.assessmentYear && d.districtId && d.municipalityId),
    property: !!(d.wardNo && d.propertyNo),
    owner: !!(d.ownerName && d.respondentName && d.relationship && d.mobileNo),
    address: !!(d.houseNo && d.street && d.city && d.pinCode),
    taxation: !!(
      d.ownershipType &&
      d.propertyType &&
      d.propertyUse &&
      d.situation &&
      d.roadType &&
      d.taxRateZone &&
      d.plotSqft != null &&
      d.plinthSqft != null
    ),
    floors: !!(d.floors && d.floors.length > 0),
    services: !!(d.waterSource && d.sanitationType && d.solidWasteType),
    gps: !!d.gps,
    photos: !!(
      d.photos &&
      d.photos.length >= 2 &&
      d.photos.some((p) => p.slot === 'front') &&
      d.photos.some((p) => p.slot === 'inside')
    ),
  };
}
