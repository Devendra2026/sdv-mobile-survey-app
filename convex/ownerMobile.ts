/**
 * Owner mobile rules shared with the mobile app (`@/convex/ownerMobile`).
 */

import { isValidTenDigitMobile } from './surveyFieldValidation';

/** @deprecated No longer accepted — kept so old drafts/UI strings can be cleaned up. */
export const OWNER_MOBILE_UNKNOWN = '0000000000';

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export function isRespondentOwner(relationship?: string): boolean {
  return relationship?.trim() === 'self';
}

/** @deprecated Prefer `isValidTenDigitMobile` from `./surveyFieldValidation`. */
export function isValidIndianOwnerMobile(value: string): boolean {
  return INDIAN_MOBILE_RE.test(value.trim());
}

/** @deprecated Use `isValidTenDigitMobile`. */
export function isAcceptedOwnerMobile(mobile: string, _relationship?: string): boolean {
  return isValidTenDigitMobile(mobile);
}

/** Primary contact from owner rows — first valid 10-digit mobile only. */
export function primaryOwnerMobileFromOwners(
  owners: { mobileNo?: string }[] | undefined,
  _relationship?: string,
): string | undefined {
  if (!owners?.length) return undefined;
  for (const o of owners) {
    const m = o.mobileNo?.trim();
    if (m && isValidTenDigitMobile(m)) return m;
  }
  return undefined;
}
