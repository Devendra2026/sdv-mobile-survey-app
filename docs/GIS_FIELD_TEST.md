# GIS field verification checklist

Use this on Nagar Nigam fleet devices before promoting a production Android build.

## Environment setup

- Fleet APKs use Clerk **development** (`pk_test_…`) — **100 emails/month** cap. If sign-in shows the email-limit error, run `npm run clerk:unblock-field-user` or `npm run clerk:provision-field-user` (requires `CLERK_SECRET_KEY` in web `.env.local`) and/or disable **Client Trust** in Clerk Dashboard → Attack protection. See [README.md](../README.md) § Clerk dev email limit and [CLERK_FIELD_UNBLOCK.md](./CLERK_FIELD_UNBLOCK.md).
- Set `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` in EAS preview/production **and** `.env.local`
- `npm run verify:eas-preview` fails if the EAS Maps key is missing or does not match `.env.local`
- Enable Maps SDK for Android and iOS in Google Cloud Console
- Use a **development build** or **preview/production APK** for field validation — embedded Google Maps keys apply to native builds
- **Expo Go** can complete the full wizard including submit for dev testing; captures are tagged `expo-go-dev-preview` for audit. Use a **fleet APK** for field validation before production rollout.
- **GIS debug** panel is dev-client only — not shown in Expo Go or fleet preview/production APKs

## Capture

- Tap **Capture Coordinate** once location permission is granted — no warmup countdown or accuracy gate
- One tap fetches the current device location and saves latitude, longitude, and timestamp immediately
- High-accuracy location mode is used when available; poor reported accuracy does not block capture
- [ ] Outdoor at **property boundary**: capture completes and wizard Next is enabled
- [ ] Indoor / weak GNSS: capture still saves coordinates (no accuracy rejection)
- [ ] Mock location app enabled: capture blocked with explicit error
- [ ] Double-tap Capture Coordinate: only one capture runs at a time

## Map / coordinate sync

- [ ] Map marker latitude/longitude equals on-screen coordinate text (use GIS debug on dev-client builds to audit)
- [ ] Text display (full + 6-decimal) matches `draft.gps`
- [ ] Retake updates marker without stale pin
- [ ] Review screen and survey detail show the same coordinates as wizard GPS step

## Photos and cloud sync

- [ ] Capture front + side on photos step — previews show immediately after capture
- [ ] Force-close app after capture, reopen wizard — photo previews load from cloud (not blank)
- [ ] Toggle airplane mode after capture — photo saved locally; link completes when back online
- [ ] Partial sync toast shows specific error (e.g. locked survey), not generic "photos failed"
- [ ] Tap Next on photos step only after sync bar shows saved (no pending cloud sync)
- [ ] Review submit blocked when save incomplete; retry sync from sync bar tap

## Convex

- [ ] After cloud save, Convex `surveys.gps` matches client coordinates (full precision)
- [ ] Submit rejects invalid lat/lng, mock GPS, or stale capture (> 15 min)

## Permissions

- [ ] Denied permission → actionable Settings message
- [ ] Location services off → "Unable to get location. Please enable Location Services."
- [ ] Airplane mode → capture fails gracefully (offline GPS may still work if GNSS enabled)

## Scenarios

- [ ] Static outdoor at property boundary
- [ ] Slow walk during capture
- [ ] Poor network (offline capture still works)
- [ ] Fresh install Android production build

**Current fleet policy:** single-shot coordinate capture with no accuracy validation. Mock location is blocked; capture freshness is enforced on submit (15 min).
