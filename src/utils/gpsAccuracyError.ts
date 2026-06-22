/** GPS accuracy failure — separate from captureGps so Node verify scripts can import it without React Native. */
export class GpsAccuracyError extends Error {
  readonly accuracyMeters: number;

  constructor(accuracyMeters: number, acceptMaxMeters: number, detail?: string) {
    super(
      detail ??
        `Could not reach ±${acceptMaxMeters} m (best was ±${Math.round(accuracyMeters)} m). Stand at the property boundary in open sky, hold still, then retry.`,
    );
    this.name = 'GpsAccuracyError';
    this.accuracyMeters = accuracyMeters;
  }
}
