/**
 * Owner-step business rules — respondent relationships and owner list limits.
 * Canonical dropdown values live here (not admin-editable masters).
 */
import { query } from './_generated/server';
import { isRespondentOwner, isValidIndianOwnerMobile, primaryOwnerMobileFromOwners } from './ownerMobile';

export {
  isAcceptedOwnerMobile,
  isRespondentOwner,
  isValidIndianOwnerMobile,
  OWNER_MOBILE_UNKNOWN,
  primaryOwnerMobileFromOwners,
} from './ownerMobile';

export const RESPONDENT_RELATIONSHIP_VALUES = [
  'self',
  'father',
  'mother',
  'wife',
  'son',
  'daughter',
  'brother',
  'sister',
  'neighbour',
  'other',
] as const;

export type RespondentRelationshipValue = (typeof RESPONDENT_RELATIONSHIP_VALUES)[number];

export const RESPONDENT_RELATIONSHIPS: { value: RespondentRelationshipValue; label: string }[] = [
  { value: 'self', label: 'Self' },
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'wife', label: 'Wife' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
  { value: 'neighbour', label: 'Neighbour' },
  { value: 'other', label: 'Other' },
];

const RELATIONSHIP_SET = new Set<string>(RESPONDENT_RELATIONSHIP_VALUES);

export const MAX_SURVEY_OWNERS = 10;

export type OwnerEntry = {
  name?: string;
  fatherOrHusbandName?: string;
  mobileNo?: string;
  altMobileNo?: string;
};

export function isValidRespondentRelationship(value: string): boolean {
  return RELATIONSHIP_SET.has(value);
}

/** @deprecated Use `isValidIndianOwnerMobile` from `./ownerMobile`. */
export function isValidOwnerMobile(value: string): boolean {
  return isValidIndianOwnerMobile(value);
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
  const cleaned = owners
    .map((o) => ({
      name: trimOpt(o.name),
      fatherOrHusbandName: trimOpt(o.fatherOrHusbandName),
      mobileNo: trimOpt(o.mobileNo),
      altMobileNo: trimOpt(o.altMobileNo),
    }))
    .filter((o) => o.name || o.fatherOrHusbandName || o.mobileNo || o.altMobileNo);
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
  const relationship = input.relationship?.trim();
  const firstMobile = owners[0]?.mobileNo?.trim() ?? '';
  if (requirePrimary && isRespondentOwner(relationship) && !isValidIndianOwnerMobile(firstMobile)) {
    details.mobileNo = ['Enter a valid 10-digit mobile for the owner (starts 6-9)'];
  } else if (firstMobile && !isValidIndianOwnerMobile(firstMobile)) {
    details.mobileNo = ['Enter a valid 10-digit mobile (starts 6-9)'];
  }
  owners.forEach((o, i) => {
    const mobile = o.mobileNo?.trim();
    if (mobile && !isValidIndianOwnerMobile(mobile)) {
      details[`owners.${i}.mobileNo`] = ['Enter a valid 10-digit mobile (starts 6-9)'];
    }
    const alt = o.altMobileNo?.trim();
    if (alt) {
      if (!isValidIndianOwnerMobile(alt)) {
        details[`owners.${i}.altMobileNo`] = ['Enter a valid 10-digit alternate mobile (starts 6-9)'];
      } else if (alt === mobile) {
        details[`owners.${i}.altMobileNo`] = ['Alternate mobile must differ from primary mobile'];
      }
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
