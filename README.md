# SDV survey mobile app (Expo)

Field survey capture for Android/iOS. Writes to the **same Convex deployment** as the admin web app in [`../sdv-front-new-app`](../sdv-front-new-app).

## Shared backend

- **Do not run `convex dev` here.** Start the backend from the web repo: `cd ../sdv-front-new-app && npm run dev`.
- **Do not run `npm run deploy` here** — it exits with instructions; deploy from `sdv-front-new-app`.
- `convex/` in this repo is kept in sync with the web app for TypeScript types (`api.survey.*`, etc.).
- `EXPO_PUBLIC_CONVEX_URL` must match `NEXT_PUBLIC_CONVEX_URL` in the web app.
- Use the **same Clerk application** as the web (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_JWT_ISSUER_DOMAIN`).

## Getting started

1. Ensure the web backend is running (`npm run dev` in `../sdv-front-new-app`).

2. Configure env:

   ```bash
   cp .env.example .env.local
   ```

   Copy `EXPO_PUBLIC_CONVEX_URL` and Clerk values from `../sdv-front-new-app/.env.local`.

3. Install and run Expo:

   ```bash
   npm install
   npm run dev
   ```

## EAS builds

Field APKs must use **Clerk production** keys (`pk_live_…`). Development keys (`pk_test_…`) are capped at 100 emails/month and will block sign-in MFA / password reset in the field.

1. In [Clerk Dashboard](https://dashboard.clerk.com) → your app → **Production** → copy the publishable key (`pk_live_…`) and note the JWT issuer (`https://….clerk.accounts.com`).
2. On Convex (same deployment as `EXPO_PUBLIC_CONVEX_URL`):
   ```bash
   cd ../sdv-front-new-app
   npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://YOUR-INSTANCE.clerk.accounts.com"
   ```
3. On EAS (preview is used for internal APKs today):
   ```bash
   npx eas env:update preview --variable-name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "pk_live_…"
   npx eas env:update preview --variable-name EXPO_PUBLIC_CONVEX_URL --value "https://….convex.cloud"
   ```
4. Rebuild and redistribute:
   ```bash
   npm run eas:build:android:preview
   ```
   Or use `--profile production-apk` once the **production** EAS environment is configured (Play Store uses `production` → AAB).

`npm run verify:eas-preview` fails if preview still points at `pk_test_…`.
