/** Client-side PIN checks — mirrors convex/addressRules.ts. */

export function isValidPinFormat(pin: string): boolean {
  const normalized = pin.replace(/\D/g, '').slice(0, 6);
  return normalized.length === 6 && normalized[0] !== '0';
}

export function isPinValidForUlb(pin: string | undefined, configuredPostalCode?: string | null): boolean {
  const normalized = (pin ?? '').replace(/\D/g, '').slice(0, 6);
  if (!isValidPinFormat(normalized)) return false;
  if (configuredPostalCode && normalized !== configuredPostalCode) return false;
  return true;
}
