/**
 * Owner mobile rules shared with the mobile app (`@/convex/ownerMobile`).
 *
 * Indian mobiles: 10 digits, first digit 6–9. Placeholders such as `0000000000`
 * are never accepted (surveyors must enter a real number or leave the field empty
 * when the respondent is not the owner).
 */

/** @deprecated No longer accepted — kept so old drafts/UI strings can be cleaned up. */
export const OWNER_MOBILE_UNKNOWN = "0000000000";

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export function isRespondentOwner(relationship?: string): boolean {
  return relationship?.trim() === "self";
}

export function isValidIndianOwnerMobile(value: string): boolean {
  return INDIAN_MOBILE_RE.test(value.trim());
}

/** @deprecated Use `isValidIndianOwnerMobile`. */
export function isAcceptedOwnerMobile(mobile: string, _relationship?: string): boolean {
  return isValidIndianOwnerMobile(mobile);
}

/** Primary contact from owner rows — first valid Indian mobile only. */
export function primaryOwnerMobileFromOwners(
  owners: { mobileNo?: string }[] | undefined,
  _relationship?: string,
): string | undefined {
  if (!owners?.length) return undefined;
  for (const o of owners) {
    const m = o.mobileNo?.trim();
    if (m && isValidIndianOwnerMobile(m)) return m;
  }
  return undefined;
}
