import type { Id } from '@/convex/_generated/dataModel';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { useEffect, useRef } from 'react';

function patchKey(patch: Partial<WizardDraft>): string {
  return Object.entries(patch)
    .map(([field, value]) => `${field}:${value ?? ''}`)
    .sort()
    .join('|');
}

/** Applies a derived draft patch after render (React 19-safe). */
export function useApplyDraftPatch(
  update: (patch: Partial<WizardDraft>) => Promise<void>,
  patch: Partial<WizardDraft> | null | undefined,
) {
  const appliedKey = useRef<string | null>(null);
  const serializedKey = patch && Object.keys(patch).length > 0 ? patchKey(patch) : null;

  useEffect(() => {
    if (!serializedKey || !patch) return;
    if (appliedKey.current === serializedKey) return;
    appliedKey.current = serializedKey;
    void update(patch);
  }, [update, serializedKey, patch]);
}

type WardRow = { wardNo: string };

export function wardAutoPatch(
  municipalityId: Id<'municipalities'> | undefined,
  wardNo: string | undefined,
  liveWards: WardRow[] | undefined,
): Partial<WizardDraft> | null {
  if (!municipalityId || liveWards === undefined) return null;

  let next = wardNo;
  if (!next && liveWards.length === 1) next = liveWards[0]!.wardNo;
  if (next && !liveWards.some((w) => w.wardNo === next)) next = undefined;

  if (next === wardNo) return null;
  return { wardNo: next };
}

export function addressAutoPatch(
  draft: Pick<WizardDraft, 'city' | 'pinCode'>,
  cityName: string,
  fixedPin: string | null,
): Partial<WizardDraft> | null {
  const patch: Partial<WizardDraft> = {};
  if (cityName && cityName !== '—' && draft.city !== cityName) patch.city = cityName;
  if (fixedPin && draft.pinCode !== fixedPin) patch.pinCode = fixedPin;
  return Object.keys(patch).length ? patch : null;
}

type MastersSlice = {
  districts: { _id: Id<'districts'>; code: string }[];
  ulbs: {
    _id: Id<'municipalities'>;
    districtId: Id<'districts'>;
    districtCode: string;
    code: string;
    postalCode?: string | null;
  }[];
};

const convexIdEq = (a?: string | null, b?: string | null) => a != null && b != null && String(a) === String(b);

export function startTenantAutoPatch(
  draft: Pick<WizardDraft, 'districtId' | 'municipalityId'>,
  masters: MastersSlice,
  me: { municipalityId?: Id<'municipalities'>; districtId?: Id<'districts'> },
): Partial<WizardDraft> | null {
  const validDistricts = new Set(masters.districts.map((d) => String(d._id)));
  const validUlbs = new Set(masters.ulbs.map((u) => String(u._id)));

  let districtId = draft.districtId;
  let municipalityId = draft.municipalityId;
  if (districtId && !validDistricts.has(String(districtId))) {
    districtId = undefined;
    municipalityId = undefined;
  }
  if (municipalityId && !validUlbs.has(String(municipalityId))) {
    municipalityId = undefined;
  }

  if (!districtId && !municipalityId) {
    if (me.municipalityId && validUlbs.has(String(me.municipalityId))) {
      municipalityId = me.municipalityId;
      const ulb = masters.ulbs.find((u) => convexIdEq(u._id, me.municipalityId));
      if (ulb) districtId = ulb.districtId;
    } else if (me.districtId && validDistricts.has(String(me.districtId))) {
      districtId = me.districtId;
    } else if (masters.districts.length === 1) {
      districtId = masters.districts[0]!._id;
    }
  }

  if (districtId && !municipalityId) {
    const district = masters.districts.find((d) => convexIdEq(d._id, districtId));
    const inDistrict = masters.ulbs.filter(
      (u) => convexIdEq(u.districtId, districtId) || (district != null && u.districtCode === district.code),
    );
    if (inDistrict.length === 1) municipalityId = inDistrict[0]!._id;
  }

  if (convexIdEq(districtId, draft.districtId) && convexIdEq(municipalityId, draft.municipalityId)) {
    return null;
  }
  const ulb = municipalityId ? masters.ulbs.find((u) => convexIdEq(u._id, municipalityId)) : undefined;
  return {
    districtId,
    municipalityId,
    ulbPostalCode: ulb?.postalCode ?? undefined,
  };
}
