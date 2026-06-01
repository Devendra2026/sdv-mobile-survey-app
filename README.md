# SDV survey mobile app (Expo)

Field survey capture for Android/iOS. Writes to the **same Convex deployment** as the admin web app in [`../sdv-front-new-app`](../sdv-front-new-app).

## Shared backend (Clerk + Convex)

| Setting               | Mobile (EAS / `.env.local`)         | Web (`sdv-front-new-app/.env.local`) | Convex deployment                            |
| --------------------- | ----------------------------------- | ------------------------------------ | -------------------------------------------- |
| Convex URL            | `EXPO_PUBLIC_CONVEX_URL`            | `NEXT_PUBLIC_CONVEX_URL`             | same `*.convex.cloud`                        |
| Clerk publishable key | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | **must be the same Clerk app**               |
| Clerk JWT issuer      | (from key)                          | `CLERK_JWT_ISSUER_DOMAIN`            | `npx convex env get CLERK_JWT_ISSUER_DOMAIN` |

Development Clerk: `pk_test_…` → `https://organic-halibut-21.clerk.accounts.dev`. Web and mobile must use the **same** Clerk app and issuer (check with `npm run verify:clerk-convex`).

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
   ```

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

`npm run verify:eas-preview` fails if web/mobile/Convex Clerk settings disagree.
