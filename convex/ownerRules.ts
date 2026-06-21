/**
 * Owner-step business rules — respondent relationships and owner list limits.
 * Canonical dropdown values live here (not admin-editable masters).
 */
import { query } from './_generated/server';
import { MAX_SURVEY_OWNERS, RESPONDENT_RELATIONSHIPS, RESPONDENT_RELATIONSHIP_VALUES } from './ownerConstants';
import { primaryOwnerMobileFromOwners } from './ownerMobile';
import { altMobileError, isValidTenDigitMobile, primaryMobileError } from './surveyFieldValidation';

export {
  MAX_SURVEY_OWNERS,
  RESPONDENT_RELATIONSHIPS,
  RESPONDENT_RELATIONSHIP_VALUES,
  type RespondentRelationshipValue,
} from './ownerConstants';

export {
  OWNER_MOBILE_UNKNOWN,
  isAcceptedOwnerMobile,
  isRespondentOwner,
  isValidIndianOwnerMobile,
  primaryOwnerMobileFromOwners,
} from './ownerMobile';

const RELATIONSHIP_SET = new Set<string>(RESPONDENT_RELATIONSHIP_VALUES);

export type OwnerEntry = {
  name?: string;
  fatherOrHusbandName?: string;
  mobileNo?: string;
  altMobileNo?: string;
};

export function isValidRespondentRelationship(value: string): boolean {
  return RELATIONSHIP_SET.has(value);
}

/** @deprecated Use `isValidTenDigitMobile` from `./surveyFieldValidation`. */
export function isValidOwnerMobile(value: string): boolean {
  return isValidTenDigitMobile(value);
}

/** First owner row with an accepted mobile (primary contact for the survey). */
export function primaryOwnerMobile(owners: OwnerEntry[] | undefined, relationship?: string): string | undefined {
  return primaryOwnerMobileFromOwners(owners, relationship);
}

/** Drop blank rows; trim fields. */
export function normalizeOwners(owners: OwnerEntry[] | undefined): OwnerEntry[] | undefined {
  if (!owners?.length) return undefined;
  const trimOpt = (s?: string) => {
    const t = s?.trim();
    return t ? t : undefined;
  };
  const cleaned: OwnerEntry[] = [];
  for (const o of owners) {
    const entry = {
      name: trimOpt(o.name),
      fatherOrHusbandName: trimOpt(o.fatherOrHusbandName),
      mobileNo: trimOpt(o.mobileNo),
      altMobileNo: trimOpt(o.altMobileNo),
    };
    if (entry.name || entry.fatherOrHusbandName || entry.mobileNo || entry.altMobileNo) {
      cleaned.push(entry);
    }
  }
  return cleaned.length ? cleaned : undefined;
}

/** Field-level validation for owner section (merged into survey upsert / submit). */
export function validateOwnerSection(
  input: {
    relationship?: string;
    owners?: OwnerEntry[];
  },
  options?: { requirePrimaryMobile?: boolean },
): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  const requirePrimary = options?.requirePrimaryMobile ?? true;
  if (input.relationship && !isValidRespondentRelationship(input.relationship)) {
    details.relationship = ['Select a valid relationship to owner'];
  }
  const owners = input.owners ?? [];
  if (owners.length > MAX_SURVEY_OWNERS) {
    details.owners = [`At most ${MAX_SURVEY_OWNERS} owners allowed`];
  }
  const firstMobile = owners[0]?.mobileNo;
  if (requirePrimary) {
    const err = primaryMobileError(firstMobile);
    if (err) details.mobileNo = [err];
  } else if (firstMobile?.trim() && !isValidTenDigitMobile(firstMobile)) {
    details.mobileNo = ['Enter a valid 10-digit mobile number'];
  }
  owners.forEach((o, i) => {
    const mobile = o.mobileNo?.trim();
    if (mobile && !isValidTenDigitMobile(mobile)) {
      details[`owners.${i}.mobileNo`] = ['Enter a valid 10-digit mobile number'];
    }
    const altErr = altMobileError(o.altMobileNo, o.mobileNo);
    if (altErr) {
      details[`owners.${i}.altMobileNo`] = [altErr];
    }
  });
  return details;
}

/** Mobile dropdown source — single source of truth for respondent relationship. */
export const respondentRelationships = query({
  args: {},
  handler: async () => ({
    options: RESPONDENT_RELATIONSHIPS,
    maxOwners: MAX_SURVEY_OWNERS,
  }),
});
