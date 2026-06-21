# GIS field verification checklist (±1 m target)

Use this on Nagar Nigam fleet devices before promoting a production Android build.

## Environment setup

- Set `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` in EAS / `.env.local`
- Enable Maps SDK for Android and iOS in Google Cloud Console
- Use a **development build** or **preview/production APK** for ±1 m field validation — embedded Google Maps keys apply to native builds
- **Expo Go** runs in dev-preview mode: accepts up to ±10 m for wizard flow testing only; dev-preview GPS **cannot be submitted**
- **GIS debug** panel is dev-client only — not shown in Expo Go or fleet preview/production APKs

## Capture accuracy

- [ ] Outdoor open sky: capture completes at ≤ ±1 m or shows retry guidance
- [ ] Indoor / weak GNSS: "Waiting for better GPS signal…" appears; capture rejects above ±1 m
- [ ] Mock location app enabled: capture blocked with explicit error
- [ ] Double-tap Capture: only one sampling session runs

## Map / coordinate sync

- [ ] Map marker latitude/longitude equals on-screen coordinate text (use GIS debug on dev-client builds to audit)
- [ ] Text display (full + 6-decimal) matches `draft.gps`
- [ ] Retake updates marker without stale pin
- [ ] Review screen and survey detail show the same coordinates as wizard GPS step

## Convex

- [ ] After cloud save, Convex `surveys.gps` matches client coordinates (full precision)
- [ ] Submit rejects invalid lat/lng, mock GPS, accuracy > 1 m, or stale capture (> 15 min)

## Permissions

- [ ] Denied permission → actionable Settings message
- [ ] Location services off → "Turn on device location services"
- [ ] Airplane mode → capture fails gracefully (offline GPS may still work if GNSS enabled)

## Scenarios

- [ ] Static outdoor at property boundary
- [ ] Slow walk during capture
- [ ] Poor network (offline capture still works)
- [ ] Fresh install Android production build

## Known risk

Consumer phone GNSS may not report ≤ 1 m in urban canyons or under cover. If failure rate is high on fleet devices, log best accuracy from the debug panel and evaluate hardware or a supervised override policy.
