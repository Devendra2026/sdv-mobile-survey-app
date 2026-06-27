/**
 * Shared survey field validation — importable from Convex backend and Expo client.
 * Parcel/unit values are validated and stored as strings to preserve leading zeros.
 */

const PARCEL_NO_RE = /^\d{5}$/;
const UNIT_NO_RE = /^\d{3}$/;
const TEN_DIGIT_MOBILE_RE = /^\d{10}$/;

export function isValidParcelNo(value: string): boolean {
  return PARCEL_NO_RE.test(value.trim());
}

export function isValidUnitNo(value: string): boolean {
  return UNIT_NO_RE.test(value.trim());
}

export function isValidTenDigitMobile(value: string): boolean {
  return TEN_DIGIT_MOBILE_RE.test(value.trim());
}

export function sanitizeFixedDigits(raw: string, maxLen: number): string {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

export function parcelNoError(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "Parcel number is required";
  if (!isValidParcelNo(trimmed)) return "Enter exactly 5 digits (e.g. 00001)";
  return undefined;
}

export function unitNoError(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "Unit number is required";
  if (!isValidUnitNo(trimmed)) return "Enter exactly 3 digits (e.g. 001)";
  return undefined;
}

export function primaryMobileError(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "Mobile number is required";
  if (!isValidTenDigitMobile(trimmed)) return "Enter a valid 10-digit mobile number";
  return undefined;
}

export function altMobileError(value: string | undefined, primaryMobile?: string): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  if (!isValidTenDigitMobile(trimmed)) return "Enter a valid 10-digit mobile number";
  const primary = primaryMobile?.trim();
  if (primary && isValidTenDigitMobile(primary) && trimmed === primary) {
    return "Must differ from primary mobile";
  }
  return undefined;
}

export function isValidConstructedYear(year: number | undefined, nowYear = new Date().getFullYear()): boolean {
  if (year == null) return false;
  return Number.isInteger(year) && year >= 1800 && year <= nowYear;
}

export function constructedYearError(year: number | undefined, nowYear = new Date().getFullYear()): string | undefined {
  if (year == null) return undefined;
  if (!isValidConstructedYear(year, nowYear)) {
    return `Enter a year between 1800 and ${nowYear}`;
  }
  return undefined;
}
