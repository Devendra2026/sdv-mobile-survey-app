/**
 * Property ID format (ascending lexical order):
 *   {ULB 6 digits}-{Ward 3 digits}-{Parcel 5 digits}-{Unit 3 digits}-{Property use 1 letter}
 * Example: 801262-001-00004-001-R
 */
export const PROPERTY_ID_PATTERN = /^\d{6}-\d{3}-\d{5}-\d{3}-[A-Z]$/;

/** Pre-unit format — accepted for import lookup only. */
export const LEGACY_PROPERTY_ID_PATTERN = /^\d{6}-\d{3}-\d{5}-[A-Z]$/;

/** Single-letter codes for property-use master values. */
export const PROPERTY_USE_CODES: Record<string, string> = {
  residential: "R",
  commercial: "C",
  open_land: "P",
  religious_property: "H",
  mix_property: "M",
  agricultural_land: "A",
};

export function padUlbCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(6, "0").slice(-6);
}

export function padWardNo(wardNo: string): string {
  const digits = wardNo.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(3, "0").slice(-3);
}

export function padParcelNo(parcelNo: string): string {
  const digits = parcelNo.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(5, "0").slice(-5);
}

export function padUnitNo(unitNo: string): string {
  const digits = unitNo.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(3, "0").slice(-3);
}

/** Canonical parcel key for comparisons — `01`, `1`, and `00001` resolve to the same value. */
export function normalizeParcelKey(parcelNo: string): string {
  const digits = parcelNo.replace(/\D/g, "");
  if (!digits) return parcelNo.trim();
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) ? parcelNo.trim() : String(n);
}

export function propertyUseCode(propertyUse: string | undefined): string {
  if (!propertyUse) return "";
  return PROPERTY_USE_CODES[propertyUse] ?? propertyUse.charAt(0).toUpperCase();
}

export function formatPropertyId(parts: {
  ulbCode: string;
  wardNo: string;
  parcelNo: string;
  unitNo: string;
  propertyUse: string;
}): string | undefined {
  const ulb = padUlbCode(parts.ulbCode);
  const ward = padWardNo(parts.wardNo);
  const parcel = padParcelNo(parts.parcelNo);
  const unit = padUnitNo(parts.unitNo);
  const use = propertyUseCode(parts.propertyUse);
  if (!ulb || !ward || !parcel || !unit || !use) return undefined;
  return `${ulb}-${ward}-${parcel}-${unit}-${use}`;
}

/** ULB–ward–parcel–unit slots without the property-use suffix. */
export function formatPropertyIdSlots(parts: {
  ulbCode: string;
  wardNo: string;
  parcelNo: string;
  unitNo: string;
}): string | undefined {
  const ulb = padUlbCode(parts.ulbCode);
  const ward = padWardNo(parts.wardNo);
  const parcel = padParcelNo(parts.parcelNo);
  const unit = padUnitNo(parts.unitNo);
  if (!ulb || !ward || !parcel || !unit) return undefined;
  return `${ulb}-${ward}-${parcel}-${unit}`;
}

export function isNewPropertyIdFormat(id: string): boolean {
  return PROPERTY_ID_PATTERN.test(id.trim().toUpperCase());
}

export function isLegacyPropertyIdFormat(id: string): boolean {
  return LEGACY_PROPERTY_ID_PATTERN.test(id.trim().toUpperCase());
}

/** @deprecated Use isNewPropertyIdFormat */
export function validatePropertyIdFormat(id: string): boolean {
  return isNewPropertyIdFormat(id);
}

/** Sort surveys by property ID ascending (empty IDs last). */
export function comparePropertyIds(a?: string, b?: string): number {
  const ka = (a ?? "").trim().toUpperCase();
  const kb = (b ?? "").trim().toUpperCase();
  if (!ka && !kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;
  return ka.localeCompare(kb, undefined, { numeric: true });
}

/** Sort surveys by ward, then parcel (numeric), then Property ID. */
export function compareWardThenParcel<T extends { wardNo: string; parcelNo: string; propertyId?: string }>(
  a: T,
  b: T,
): number {
  const wardA = Number(a.wardNo);
  const wardB = Number(b.wardNo);
  const wardDiff =
    !Number.isNaN(wardA) && !Number.isNaN(wardB) ? wardA - wardB : String(a.wardNo).localeCompare(String(b.wardNo));
  if (wardDiff !== 0) return wardDiff;

  const parcelA = Number(normalizeParcelKey(a.parcelNo));
  const parcelB = Number(normalizeParcelKey(b.parcelNo));
  const parcelDiff =
    !Number.isNaN(parcelA) && !Number.isNaN(parcelB)
      ? parcelA - parcelB
      : String(a.parcelNo).localeCompare(String(b.parcelNo));
  if (parcelDiff !== 0) return parcelDiff;

  return comparePropertyIds(a.propertyId, b.propertyId);
}

export function resolvePropertyId(
  input: {
    propertyId?: string;
    wardNo?: string;
    parcelNo?: string;
    unitNo?: string;
    propertyUse?: string;
  },
  ulbCode: string,
): string | undefined {
  const generated = formatPropertyId({
    ulbCode,
    wardNo: input.wardNo ?? "",
    parcelNo: input.parcelNo ?? "",
    unitNo: input.unitNo ?? "",
    propertyUse: input.propertyUse ?? "",
  });
  // Prefer slot-derived IDs so parcel / ward / unit / use corrections renumber Property ID.
  if (generated) return generated;

  const manual = input.propertyId?.trim();
  if (manual && isNewPropertyIdFormat(manual)) {
    return manual.toUpperCase();
  }

  return manual ? manual.toUpperCase() : undefined;
}

/** Full property ID when complete; otherwise ULB–ward–parcel–unit slots for live preview. */
export function displayPropertyId(
  input: {
    propertyId?: string;
    wardNo?: string;
    parcelNo?: string;
    unitNo?: string;
    propertyUse?: string;
  },
  ulbCode: string,
): string | undefined {
  const resolved = resolvePropertyId(input, ulbCode);
  if (resolved) return resolved;

  return formatPropertyIdSlots({
    ulbCode,
    wardNo: input.wardNo ?? "",
    parcelNo: input.parcelNo ?? "",
    unitNo: input.unitNo ?? "",
  });
}
