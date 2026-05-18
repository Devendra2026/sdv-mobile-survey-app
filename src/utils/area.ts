/** 1 square foot ≈ 0.092903 square metres (survey standard). */
export const SQM_PER_SQFT = 0.092903;

/** Floor master value — open plot / vacant land (no built-up floors). */
export const OPEN_LAND_FLOOR = 'open_land';

export function isOpenLandFloor(floorName: string | undefined): boolean {
  return floorName === OPEN_LAND_FLOOR;
}

export function sqmFromSqft(sqft: number): number {
  return sqft * SQM_PER_SQFT;
}

export function sqftFromSqm(sqm: number): number {
  if (sqm <= 0) return 0;
  return sqm / SQM_PER_SQFT;
}

export function formatSqmDisplay(sqm: number): string {
  if (sqm <= 0) return '';
  return sqm.toFixed(4);
}

export function parseAreaInput(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function sumFloorSqft(floors: { areaSqft: number }[]): number {
  return floors.reduce((sum, f) => sum + (f.areaSqft > 0 ? f.areaSqft : 0), 0);
}
