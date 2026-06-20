/** Client-side services step helpers (mirrors convex/serviceMasters rules). */

export const WATER_SOURCES = [
  { value: 'government_tap', label: 'Government Tap' },
  { value: 'dug_well', label: 'Dug well' },
  { value: 'borewell', label: 'Borewell' },
  { value: 'other', label: 'Other.' },
] as const;

export const SANITATION_TYPES = [
  { value: 'sewer_system', label: 'Connect to sewer system' },
  { value: 'septic_tank', label: 'Connected to Septic Tank.' },
  { value: 'surface_drain', label: 'Connected to Surface drain.' },
  { value: 'no_toilet', label: 'No Toilet' },
  { value: 'other', label: 'Other.' },
] as const;

const WATER_SOURCE_SET = new Set<string>(WATER_SOURCES.map((o) => o.value));
const SANITATION_SET = new Set<string>(SANITATION_TYPES.map((o) => o.value));

const WATER_BY_LABEL = new Map(
  WATER_SOURCES.flatMap((o) => [
    [o.label.toLowerCase(), o.value],
    [o.label.replace(/\.$/, '').toLowerCase(), o.value],
  ]),
);
const SANITATION_BY_LABEL = new Map(
  SANITATION_TYPES.flatMap((o) => [
    [o.label.toLowerCase(), o.value],
    [o.label.replace(/\.$/, '').toLowerCase(), o.value],
  ]),
);

export function mergeMasterOptions(
  canonical: { value: string; label: string }[],
  fromBundle?: { value: string; label: string }[],
): { value: string; label: string }[] {
  const byValue = new Map<string, { value: string; label: string }>();
  for (const o of fromBundle ?? []) {
    const value = o.value?.trim();
    if (value) byValue.set(value, { value, label: o.label });
  }
  for (const o of canonical) {
    byValue.set(o.value, o);
  }
  return canonical.map((c) => byValue.get(c.value)!);
}

/** Map legacy draft / DB strings to canonical stored values. */
export function coerceWaterSource(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const v = raw.trim();
  if (WATER_SOURCE_SET.has(v)) return v;
  const byLabel = WATER_BY_LABEL.get(v.toLowerCase());
  if (byLabel) return byLabel;
  const normalized = v.toLowerCase().replace(/[\s.-]+/g, '_');
  if (WATER_SOURCE_SET.has(normalized)) return normalized;
  return v;
}

export function coerceSanitationType(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const v = raw.trim();
  if (SANITATION_SET.has(v)) return v;
  const byLabel = SANITATION_BY_LABEL.get(v.toLowerCase());
  if (byLabel) return byLabel;
  const normalized = v.toLowerCase().replace(/[\s.-]+/g, '_');
  if (SANITATION_SET.has(normalized)) return normalized;
  return v;
}

function isValidWaterSource(value?: string): boolean {
  return Boolean(value?.trim() && WATER_SOURCE_SET.has(value.trim()));
}

function isValidSanitationType(value?: string): boolean {
  return Boolean(value?.trim() && SANITATION_SET.has(value.trim()));
}

export function servicesStepComplete(d: {
  municipalWaterConnection?: boolean;
  waterSource?: string;
  sanitationType?: string;
  municipalWasteCollection?: boolean;
}): boolean {
  return (
    typeof d.municipalWaterConnection === 'boolean' &&
    isValidWaterSource(d.waterSource) &&
    isValidSanitationType(d.sanitationType) &&
    typeof d.municipalWasteCollection === 'boolean'
  );
}

export function yesNoLabel(value?: boolean): string {
  if (value === undefined) return '—';
  return value ? 'Yes' : 'No';
}

export function optionLabel(value: string | undefined, options: { value: string; label: string }[]): string {
  if (!value) return '—';
  return options.find((o) => o.value === value)?.label ?? value.replace(/_/g, ' ');
}
