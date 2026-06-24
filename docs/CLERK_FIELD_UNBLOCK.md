# Field user unblock runbook (Clerk dev email limit)

When fleet APK sign-up shows:

> Clerk development instance email limit reached (100/month)

## Immediate fix (no APK rebuild)

### A. Instance-wide — disable Client Trust (Dashboard only)

Clerk has **no API** for this setting. An admin must:

1. Open https://dashboard.clerk.com
2. Select **development** instance (`organic-halibut-21`)
3. **Configure → Attack protection → Client Trust → Disable**

This reduces email usage when **existing** users sign in on new devices. It does not fix new sign-up OTP while the monthly quota is exhausted.

### B. Per user — admin provision + sign in

```bash
cd survey-app
npm run clerk:provision-field-user -- \
  --email gulshankumarw92gk@gmail.com \
  --name "Bharat" \
  --password "morning@9090" \
  --role surveyor

npm run clerk:unblock-field-user -- --email gulshankumarw92gk@gmail.com
```

Tell the field user:

1. Open the **installed fleet APK** (no reinstall).
2. Tap **Sign In** (not Sign Up).
3. Email: `gulshankumarw92gk@gmail.com`
4. Password: (as set by admin)
5. Complete setup if prompted; wait on **Awaiting approval** until web admin approves.

### C. Web admin approval

1. Open web admin → **Approvals**
2. Find Bharat / `gulshankumarw92gk@gmail.com` (`status: pending_approval`)
3. Approve as **Surveyor** and assign ward/ULB as needed

If the user does not appear, confirm Clerk webhook → Convex `/clerk-webhook` is active.

### D. Alternative — Google sign-up

On sign-up screen, **Continue with Google** avoids Clerk email OTP (if Google OAuth is enabled in Clerk).

## Bharat — completed 2026-06-23

| Step                                                    | Status                    |
| ------------------------------------------------------- | ------------------------- |
| Clerk user created (`user_3FX652LAwFVklhJ6penFKSLD9HE`) | Done                      |
| Email verified, password enabled                        | Done                      |
| `unsafe_metadata.requestedRole: surveyor`               | Done                      |
| `bypass_client_trust: true`                             | Done                      |
| Client Trust disabled (Dashboard)                       | **Admin action required** |
| Bharat signs in on APK                                  | **User action required**  |
| Web admin approval                                      | **Admin action required** |

## Long-term

See [CLERK_PK_LIVE_MIGRATION.md](./CLERK_PK_LIVE_MIGRATION.md) — migrate fleet to `pk_live_…` and rebuild APK before wide production rollout.
