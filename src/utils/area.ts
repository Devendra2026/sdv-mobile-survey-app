/** 1 square foot ≈ 0.092903 square metres (survey standard). */
const SQM_PER_SQFT = 0.092903;

/** Floor master value — open plot / vacant land (no built-up floors). */
const OPEN_LAND_FLOOR = 'open_land';

/** Floor master value — plinth is taken from this row only. */
const GROUND_FLOOR_NAME = 'ground_floor';

function isOpenLandFloor(floorName: string | undefined): boolean {
  return floorName === OPEN_LAND_FLOOR;
}

function isGroundFloor(floorName: string | undefined): boolean {
  return floorName === GROUND_FLOOR_NAME;
}

/** Plinth area = ground floor row area only. */
export function plinthSqftFromFloors(floors: { floorName: string; areaSqft: number }[]): number {
  const ground = floors.find((f) => isGroundFloor(f.floorName));
  return ground && ground.areaSqft > 0 ? ground.areaSqft : 0;
}

/** Built-up area = sum of floor rows, excluding open-land plot rows. */
export function builtUpSqftFromFloors(floors: { floorName: string; areaSqft: number }[]): number {
  return floors.reduce((sum, f) => {
    if (isOpenLandFloor(f.floorName)) return sum;
    return sum + (f.areaSqft > 0 ? f.areaSqft : 0);
  }, 0);
}

/** Open land area = sum of open_land floor rows only. */
export function openLandSqftFromFloors(floors: { floorName: string; areaSqft: number }[]): number {
  return floors.reduce((sum, f) => {
    if (!isOpenLandFloor(f.floorName)) return sum;
    return sum + (f.areaSqft > 0 ? f.areaSqft : 0);
  }, 0);
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

/** @deprecated Prefer {@link builtUpSqftFromFloors} when floor names are available. */
function sumFloorSqft(floors: { areaSqft: number }[]): number {
  return floors.reduce((sum, f) => sum + (f.areaSqft > 0 ? f.areaSqft : 0), 0);
}
