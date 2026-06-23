import { describe, expect, it } from "vitest";
import { GPS_CAPTURE_MAX_AGE_SUBMIT_MS, GPS_DEV_PREVIEW_PROVIDER } from "../gpsAccuracy";
import { validateGps } from "./gpsValidation";

const now = Date.now();
const validGps = {
  latitude: 28.6139,
  longitude: 77.209,
  accuracyMeters: 50,
  capturedAt: now,
  provider: "device",
};

describe("validateGps", () => {
  it("accepts valid GPS regardless of accuracy", () => {
    expect(validateGps(validGps)).toBeNull();
    expect(validateGps(validGps, { strict: true, now })).toBeNull();
  });

  it("rejects out-of-range latitude", () => {
    expect(validateGps({ ...validGps, latitude: 91 })).toMatch(/Latitude/);
    expect(validateGps({ ...validGps, latitude: -91 })).toMatch(/Latitude/);
  });

  it("rejects out-of-range longitude", () => {
    expect(validateGps({ ...validGps, longitude: 181 })).toMatch(/Longitude/);
    expect(validateGps({ ...validGps, longitude: -181 })).toMatch(/Longitude/);
  });

  it("rejects mock GPS", () => {
    expect(validateGps({ ...validGps, isMockLocation: true })).toMatch(/Mock/);
  });

  it("rejects stale capture on strict submit", () => {
    expect(
      validateGps({ ...validGps, capturedAt: now - GPS_CAPTURE_MAX_AGE_SUBMIT_MS - 1 }, { strict: true, now }),
    ).toMatch(/too old/i);
  });

  it("accepts Expo Go dev-preview provider on strict submit", () => {
    expect(validateGps({ ...validGps, provider: GPS_DEV_PREVIEW_PROVIDER }, { strict: true, now })).toBeNull();
  });
});
