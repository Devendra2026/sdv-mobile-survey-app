# GIS field verification checklist (±1 m target, ±5 m accept)

Use this on Nagar Nigam fleet devices before promoting a production Android build.

## Environment setup

- Fleet APKs use Clerk **development** (`pk_test_…`) — **100 emails/month** cap. If sign-in shows the email-limit error, run `npm run clerk:unblock-field-user` (requires `CLERK_SECRET_KEY` in web `.env.local`) and/or disable **Client Trust** in Clerk Dashboard → Attack protection. See [README.md](../README.md) § Clerk dev email limit.
- Set `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` in EAS preview/production **and** `.env.local`
- `npm run verify:eas-preview` fails if the EAS Maps key is missing or does not match `.env.local`
- Enable Maps SDK for Android and iOS in Google Cloud Console
- Use a **development build** or **preview/production APK** for field validation — embedded Google Maps keys apply to native builds
- **Expo Go** runs in dev-preview mode: accepts up to ±10 m for wizard flow testing only; dev-preview GPS **cannot be submitted**
- **GIS debug** panel is dev-client only — not shown in Expo Go or fleet preview/production APKs

## Capture accuracy

- GNSS pre-warm starts when the GPS wizard step opens (before tapping Capture) to improve time-to-fix
- Wait **3 s** on the GPS step before first capture (warmup countdown on the Capture button)
- During capture, live progress shows `Best reading: ±X m (need ≤ ±5 m)`
- One tap samples up to **12 s** (no automatic retry) and saves the best reading at or below ±5 m
- Target pinpoint is ±1 m; readings between ±1 m and ±5 m are accepted with success tone (not "Pinpoint" badge)
- Production APK accuracy failures show field guidance (outdoor, hold still, High accuracy mode) — not Expo Go messaging
- Footer shows build fingerprint: `Build 1.0.0 · fleet APK · ±5 m max` — confirm this before field testing; if it says Expo Go or errors mention Expo Go, reinstall the latest fleet APK
- [ ] Outdoor open sky at **property boundary** (not mid-road): capture completes at ≤ ±5 m or shows retry guidance
- [ ] Indoor / weak GNSS: "Waiting for better GPS signal…" appears; capture rejects above ±5 m
- [ ] Mock location app enabled: capture blocked with explicit error
- [ ] Double-tap Capture: only one sampling session runs

## Map / coordinate sync

- [ ] Map marker latitude/longitude equals on-screen coordinate text (use GIS debug on dev-client builds to audit)
- [ ] Text display (full + 6-decimal) matches `draft.gps`
- [ ] Retake updates marker without stale pin
- [ ] Review screen and survey detail show the same coordinates as wizard GPS step

## Convex

- [ ] After cloud save, Convex `surveys.gps` matches client coordinates (full precision)
- [ ] Submit rejects invalid lat/lng, mock GPS, accuracy > 5 m, or stale capture (> 15 min)

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

Consumer phone GNSS may not report ≤ 5 m in urban canyons or under cover. If failure rate is high on fleet devices, log best accuracy from the error banner (`Best reading: ±N m (need ≤ ±5 m)`) and evaluate hardware or moving to open sky at the property boundary.

**Current fleet policy (v3):** target ±1 m pinpoint; accept best single reading up to ±5 m for capture, wizard step, and submit. One-click capture (~12 s max) without automatic retry.
