# Clerk production migration (pk_live) — fleet APK rollout

Use this checklist when moving field APKs off the development Clerk instance (`pk_test_…`, 100 emails/month cap) to production.

## Why migrate

- Development instances cap Clerk-delivered emails at **100/month** (sign-up OTP, Client Trust, password reset).
- Production (`pk_live_…`) has no dev email cap and is required for real field rollout.

## Prerequisites

- Clerk **production** instance created in [Clerk Dashboard](https://dashboard.clerk.com).
- Google OAuth configured on production if field users use social sign-in.
- Clerk → Convex integration activated on **production** instance.

## Steps

### 1. Clerk production instance

1. Create or select production instance in Clerk Dashboard.
2. **Integrations → Convex → Activate** (adds `aud: convex` to session tokens).
3. Copy `pk_live_…` publishable key and production JWT issuer (`https://<instance>.clerk.accounts.com` or `.dev`).

### 2. Convex deployment

```bash
cd ../sdv-front-new-app
npm run sync:clerk:prod
```

Or manually:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://clerk.sdvedutech.in"
npx convex env set CLERK_WEBHOOK_SECRET whsec_xxx
```

(Set `CLERK_WEBHOOK_SECRET` in `sdv-front-new-app/.env.production` first, then `sync:clerk:prod`.)

### 3. Web admin (`sdv-front-new-app`)

In `.env.production` (Dokploy) — **not** `.env.local` for production deploy:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…
CLERK_JWT_ISSUER_DOMAIN=https://clerk.sdvedutech.in
CLERK_SECRET_KEY=sk_live_…
```

Keep `.env.local` on `pk_test_` for local development only.

### 4. Mobile fleet env

In `survey-app/.env.prod`:

```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…
```

Sync to EAS:

```bash
npm run env:sync:preview      # internal fleet APK
npm run env:sync:production   # Play Store build
```

### 5. Verify alignment

```bash
npm run verify:clerk-convex
```

All three sources (`.env.prod`, EAS preview, web `.env.local`) must show the same `pk_live_…` and issuer.

### 6. Rebuild APK

```bash
npm run eas:build:android:preview
```

Distribute new APK to field devices. Existing APKs with `pk_test_…` baked in cannot be switched without rebuild.

### 7. Field user communication

- Users created on dev Clerk do **not** exist on production — re-provision or have users sign up again on production.
- Disable Client Trust on production only if you accept the security tradeoff for internal fleets; prefer `bypass_client_trust` per user via `npm run clerk:unblock-field-user` on dev, or standard MFA on production.

## Rollback

Revert `.env.prod`, web `.env.local`, and Convex `CLERK_JWT_ISSUER_DOMAIN` to dev values; redeploy Convex env; rebuild APK with `pk_test_…`.
