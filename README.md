# SDV survey mobile app (Expo)

Field survey capture for Android/iOS. Writes to the **same Convex deployment** as the admin web app in [`../sdv-front-new-app`](../sdv-front-new-app).

## Shared backend (Clerk + Convex)

| Setting               | Mobile fleet (`.env.prod` → EAS)      | Web (`sdv-front-new-app/.env.local`) | Convex deployment                              |
| --------------------- | ------------------------------------- | ------------------------------------ | ---------------------------------------------- |
| Convex URL            | `EXPO_PUBLIC_CONVEX_URL`              | `NEXT_PUBLIC_CONVEX_URL`             | same backend (cloud or self-hosted `https://`) |
| Clerk publishable key | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | **must be the same Clerk app**                 |
| Clerk JWT issuer      | (from key)                            | `CLERK_JWT_ISSUER_DOMAIN`            | `npx convex env get CLERK_JWT_ISSUER_DOMAIN`   |
| Google Maps (Android) | `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | —                                    | Maps SDK for Android enabled in GCP            |

Development Clerk: `pk_test_…` → `https://organic-halibut-21.clerk.accounts.dev`. Web and mobile must use the **same** Clerk app and issuer (check with `npm run verify:clerk-convex`).

### Clerk dev email limit (sign-in on fleet APK)

Development instances cap Clerk-delivered emails at **100/month**. Fleet APK installs are **new clients**; with **Client Trust** enabled, password sign-in sends an email verification code and can fail with:

> Clerk development instance email limit reached (100/month)

**Unblock field testers today:**

1. **Dashboard (all users):** [Clerk Dashboard](https://dashboard.clerk.com) → development instance → **Configure → Attack protection → Client Trust → Disable**.
2. **Per user (script):** from `survey-app`, with `CLERK_SECRET_KEY` in `../sdv-front-new-app/.env.local`:

   ```bash
   npm run clerk:unblock-field-user
   npm run clerk:unblock-field-user -- --email tarundkt1984@gmail.com
   npm run clerk:unblock-field-user -- --all-fleet
   ```

   **Provision when sign-up is blocked (dev email quota):**

   ```bash
   npm run clerk:provision-field-user -- --email user@example.com --name "Full Name" --password "secret" --role surveyor
   ```

   User signs in on the existing APK (not Sign Up). See `docs/CLERK_PK_LIVE_MIGRATION.md` for production rollout.

   Sets `bypass_client_trust` so password sign-in on a new device skips email codes.

3. **Retry sign-in** on the installed APK (no rebuild needed).

**Long-term (production rollout):** switch fleet APKs to `pk_live_…`, update EAS preview env, Convex `CLERK_JWT_ISSUER_DOMAIN`, web `.env.local`, activate Clerk → Convex on production, then `npm run verify:clerk-convex` and rebuild.

Before every field APK build:

```bash
npm run verify:clerk-convex   # EAS + Convex + web .env.local alignment
npm run verify:eas-preview    # includes verify:clerk-convex
```

In [Clerk Dashboard](https://dashboard.clerk.com) → **Integrations → Convex → Activate** (adds `aud: convex` to session tokens).

## Getting started

1. Ensure the web backend is running (`npm run dev` in `../sdv-front-new-app`).

2. Configure env:

   **Local Expo dev** — copy keys into `.env.local` (same Clerk + Convex as web).

   **Fleet / production APK** — copy `.env.prod.example` to `.env.prod` (gitignored), fill values, then sync to EAS:

   ```bash
   cp .env.prod.example .env.prod
   npm run verify:env-prod
   npm run env:sync:preview      # internal fleet APK (eas.json profile: preview)
   npm run env:sync:production   # Play Store / production EAS environment
   ```

   Copy `EXPO_PUBLIC_CONVEX_URL` and **the same** `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in the web app.

3. Install and run Expo:

   ```bash
   npm install
   npm run dev
   ```

## EAS builds (internal distribution APK)

Field APKs use the **preview** EAS environment (`eas.json` → `environment: "preview"`). Values are defined in **`.env.prod`** and pushed to EAS — the APK does not read `.env.prod` at runtime.

1. Set EAS preview variables from `.env.prod`:

   ```bash
   npm run env:sync:preview
   ```

   Or set manually (must match `.env.prod`):

   ```bash
   npx eas-cli env:update preview --variable-name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "pk_test_…"
   npx eas-cli env:update preview --variable-name EXPO_PUBLIC_CONVEX_URL --value "https://api.sdvedutech.in"
   npx eas-cli env:update preview --variable-name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY --value "AIza…"
   ```

   Use the same Maps key as `.env.prod`. In Google Cloud Console enable **Maps SDK for Android** and restrict the key to package `com.surveyapp.app`.

2. Align Convex issuer with that Clerk app:

   ```bash
   cd ../sdv-front-new-app
   npm run deploy:backend:dev
   # or: npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://organic-halibut-21.clerk.accounts.dev"
   ```

3. Align the **web** `.env.local` to the same `pk_test_…` and issuer (see table above).

4. Build and install:

   ```bash
   cd ../survey-app
   npm run eas:build:android:preview
   ```

5. **After GPS or auth fixes:** uninstall the old APK from fleet devices and install the new build.

### Fleet GPS capture

- Tap **Capture Coordinate** once location permission is granted — coordinates save immediately with no accuracy gate.
- High-accuracy location mode is used when available; poor reported accuracy does not block capture or submit.
- Disable mock-location apps — simulated GPS is rejected on submit.
- Retake GPS if submit reports the capture is too old (15 min).
- Expo Go captures are tagged for audit but are not blocked on submit.
- `npm run verify:gps-error-messages` guards unavailable-location error text on fleet builds.
- `npm run verify:gps-validation` guards submit validation (coordinates required; no accuracy threshold).

`npm run verify:eas-preview` fails if web/mobile/Convex Clerk settings disagree.
