/**
 * Property ID format (ascending lexical order):
 *   {ULB 6 digits}-{Ward 3 digits}-{Parcel 5 digits}-{Property use 1 letter}
 * Example: 800828-001-00001-P
 */
export const PROPERTY_ID_PATTERN = /^\d{6}-\d{3}-\d{5}-[A-Z]$/;

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

export function propertyUseCode(propertyUse: string | undefined): string {
  if (!propertyUse) return "";
  return PROPERTY_USE_CODES[propertyUse] ?? propertyUse.charAt(0).toUpperCase();
}

export function formatPropertyId(parts: {
  ulbCode: string;
  wardNo: string;
  parcelNo: string;
  propertyUse: string;
}): string | undefined {
  const ulb = padUlbCode(parts.ulbCode);
  const ward = padWardNo(parts.wardNo);
  const parcel = padParcelNo(parts.parcelNo);
  const use = propertyUseCode(parts.propertyUse);
  if (!ulb || !ward || !parcel || !use) return undefined;
  return `${ulb}-${ward}-${parcel}-${use}`;
}

export function validatePropertyIdFormat(id: string): boolean {
  return PROPERTY_ID_PATTERN.test(id.trim().toUpperCase());
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

export function resolvePropertyId(
  input: {
    propertyId?: string;
    wardNo?: string;
    parcelNo?: string;
    propertyUse?: string;
  },
  ulbCode: string,
): string | undefined {
  const manual = input.propertyId?.trim();
  if (manual && validatePropertyIdFormat(manual)) {
    return manual.toUpperCase();
  }
  const generated = formatPropertyId({
    ulbCode,
    wardNo: input.wardNo ?? "",
    parcelNo: input.parcelNo ?? "",
    propertyUse: input.propertyUse ?? "",
  });
  return generated ?? (manual || undefined);
}
