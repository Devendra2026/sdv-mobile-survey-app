# GIS field verification checklist (±1 m target)

Use this on Nagar Nigam fleet devices before promoting a production Android build.

## Environment setup

- Fleet APKs use Clerk **development** (`pk_test_…`) — **100 emails/month** cap. If sign-in shows the email-limit error, run `npm run clerk:unblock-field-user` (requires `CLERK_SECRET_KEY` in web `.env.local`) and/or disable **Client Trust** in Clerk Dashboard → Attack protection. See [README.md](../README.md) § Clerk dev email limit.
- Set `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` in EAS preview/production **and** `.env.local`
- `npm run verify:eas-preview` fails if the EAS Maps key is missing or does not match `.env.local`
- Enable Maps SDK for Android and iOS in Google Cloud Console
- Use a **development build** or **preview/production APK** for ±1 m field validation — embedded Google Maps keys apply to native builds
- **Expo Go** runs in dev-preview mode: accepts up to ±10 m for wizard flow testing only; dev-preview GPS **cannot be submitted**
- **GIS debug** panel is dev-client only — not shown in Expo Go or fleet preview/production APKs

## Capture accuracy

- GNSS pre-warm starts when the GPS wizard step opens (before tapping Capture) to improve time-to-±1 m
- Wait **5–10 s** on the GPS step before first capture so warmup can lock satellites
- During capture, live progress shows `Pinpoint readings: N/2 at ≤ ±1 m` plus best accuracy
- First capture samples up to **20 s** plus one **10 s** retry (30 s total) before rejecting weak signal
- Production APK accuracy failures show field guidance (outdoor, hold still, High accuracy mode) — not Expo Go messaging
- Footer shows build fingerprint: `Build 1.0.0 · fleet APK · ±1 m max` — confirm this before field testing; if it says Expo Go or errors mention Expo Go, reinstall the latest fleet APK
- Wait for **8 s GNSS warmup** on the GPS step before Capture (button enables after countdown)
- [ ] Outdoor open sky at **property boundary** (not mid-road): capture completes at ≤ ±1 m or shows retry guidance
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

Consumer phone GNSS may not report ≤ 1 m in urban canyons or under cover. If failure rate is high on fleet devices, log best accuracy from the error banner (`Pinpoint readings: 0/2 · best ±N m`) and evaluate hardware or a supervised override policy.

**Current fleet policy (v1):** keep ±1 m submit requirement; extended sampling (20 s + 10 s retry) improves odds without relaxing municipal standard. Do not relax accuracy for production submit without stakeholder sign-off.
