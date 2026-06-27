export function resolveTaxRateZoneKey(value?: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");

  const aliases: Record<string, string> = {
    below_9m: "below_9m",
    below_9_meter: "below_9m",
    below_9_metre: "below_9m",
    "9_to_12m": "9_to_12m",
    "9_to_12_meter": "9_to_12m",
    "9_to_12_metre": "9_to_12m",
    "12_to_24m": "12_to_24m",
    "12_to_24_meter": "12_to_24m",
    "12_to_24_metre": "12_to_24m",
    above_24m: "above_24m",
    above_24_meter: "above_24m",
    above_24_metre: "above_24m",
  };

  return aliases[normalized] ?? trimmed;
}
