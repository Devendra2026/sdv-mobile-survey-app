# SDV survey mobile app (Expo)

Field survey capture for Android/iOS. Writes to the **same Convex deployment** as the admin web app in [`../sdv-front-new-app`](../sdv-front-new-app).

## Shared backend (Clerk + Convex)

| Setting               | Mobile (EAS / `.env.local`)           | Web (`sdv-front-new-app/.env.local`) | Convex deployment                            |
| --------------------- | ------------------------------------- | ------------------------------------ | -------------------------------------------- |
| Convex URL            | `EXPO_PUBLIC_CONVEX_URL`              | `NEXT_PUBLIC_CONVEX_URL`             | same `*.convex.cloud`                        |
| Clerk publishable key | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | **must be the same Clerk app**               |
| Clerk JWT issuer      | (from key)                            | `CLERK_JWT_ISSUER_DOMAIN`            | `npx convex env get CLERK_JWT_ISSUER_DOMAIN` |
| Google Maps (Android) | `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | —                                    | Maps SDK for Android enabled in GCP          |

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

   ```bash
   cp .env.example .env.local
   ```

   Copy `EXPO_PUBLIC_CONVEX_URL` and **the same** `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in the web app.

3. Install and run Expo:

   ```bash
   npm install
   npm run dev
   ```

## EAS builds (internal distribution APK)

Field APKs use the **preview** EAS environment (`eas.json` → `environment: "preview"`).

1. Set EAS preview variables (match `.env.local`):

   ```bash
   npx eas env:update preview --variable-name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "pk_test_…"
   npx eas env:update preview --variable-name EXPO_PUBLIC_CONVEX_URL --value "https://basic-shark-848.convex.cloud"
   npx eas env:update preview --variable-name EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY --value "AIza…"
   ```

   Use the same Maps key as `.env.local`. In Google Cloud Console enable **Maps SDK for Android** and restrict the key to package `com.surveyapp.app`.

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

5. **After GPS or auth fixes:** uninstall the old APK from fleet devices, install the new build, and confirm the GPS step footer shows `Build … · fleet APK · ±1 m max`. Accuracy errors must **not** mention Expo Go; they should mention **High accuracy location**. If you still see Expo Go text, the device has an outdated APK (built before the `9ecee25` message fix).

### Fleet GPS accuracy (±1 m government standard)

- Fleet APKs use strict ±1 m capture (not Expo Go’s ±10 m dev preview).
- Wait for the **8 s GNSS warmup** countdown on the GPS step before tapping Capture.
- First capture samples up to **20 s** + **10 s** retry; hold still at the property boundary in open sky.
- Enable Android **High accuracy** location; disable mock-location apps.
- `npm run verify:gps-error-messages` guards against inverted Expo Go error text on fleet builds.

`npm run verify:eas-preview` fails if web/mobile/Convex Clerk settings disagree.
