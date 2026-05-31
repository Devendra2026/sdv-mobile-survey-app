/**
 * Email + password sign-in via Clerk Core 3 (`@clerk/expo` v3+).
 *
 *  1. signIn.create({ identifier }) + signIn.password({ password })
 *  2. If MFA required: send code → verify → signIn.finalize()
 *  3. AuthGate loads Convex user and routes
 */
import { AppButton, AppInput } from '@/components';
import { AuthHero } from '@/components/auth/auth-hero';
import { clerkErrorMessage } from '@/components/auth/field-error';
import { retryConvexAuth } from '@/hooks/use-auth-for-convex';
import { useSignIn } from '@clerk/expo';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

type Stage = 'credentials' | 'mfa';
type MfaStrategy = 'email_code' | 'phone_code' | 'totp' | 'backup_code';

function incompleteSignInMessage(status: string): string {
  switch (status) {
    case 'needs_first_factor':
      return 'Additional verification is required. Check your email.';
    case 'needs_new_password':
      return 'You must set a new password before signing in.';
    default:
      return 'Sign-in could not be completed. Try again.';
  }
}

function primaryMfaStrategy(factors: { strategy: string }[] | undefined): MfaStrategy | null {
  const strategies = new Set(factors?.map((f) => f.strategy) ?? []);
  if (strategies.has('email_code')) return 'email_code';
  if (strategies.has('phone_code')) return 'phone_code';
  if (strategies.has('totp')) return 'totp';
  if (strategies.has('backup_code')) return 'backup_code';
  return null;
}

function mfaSubtitle(strategy: MfaStrategy, email: string): string {
  switch (strategy) {
    case 'email_code':
      return `We sent a 6-digit code to ${email}`;
    case 'phone_code':
      return 'We sent a code to your phone number';
    case 'totp':
      return 'Enter the 6-digit code from your authenticator app';
    case 'backup_code':
      return 'Enter one of your backup codes';
  }
}

async function sendMfaCode(signIn: NonNullable<ReturnType<typeof useSignIn>['signIn']>, strategy: MfaStrategy) {
  switch (strategy) {
    case 'email_code':
      return signIn.mfa.sendEmailCode();
    case 'phone_code':
      return signIn.mfa.sendPhoneCode();
    default:
      return { error: null as null };
  }
}

async function verifyMfaCode(
  signIn: NonNullable<ReturnType<typeof useSignIn>['signIn']>,
  strategy: MfaStrategy,
  code: string,
) {
  switch (strategy) {
    case 'email_code':
      return signIn.mfa.verifyEmailCode({ code });
    case 'phone_code':
      return signIn.mfa.verifyPhoneCode({ code });
    case 'totp':
      return signIn.mfa.verifyTOTP({ code });
    case 'backup_code':
      return signIn.mfa.verifyBackupCode({ code });
  }
}

export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn();

  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy>('email_code');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginMfa = async (strategy: MfaStrategy) => {
    setMfaStrategy(strategy);
    setCode('');
    setError(null);

    if (strategy === 'totp' || strategy === 'backup_code') {
      setStage('mfa');
      return;
    }

    const { error: sendError } = await sendMfaCode(signIn, strategy);
    if (sendError) {
      setError(clerkErrorMessage(sendError));
      return;
    }
    setStage('mfa');
  };

  const onSubmit = async () => {
    if (fetchStatus === 'fetching') return;
    setError(null);
    setLoading(true);
    try {
      const { error: createError } = await signIn.create({ identifier: email.trim() });
      if (createError) {
        setError(clerkErrorMessage(createError));
        return;
      }

      const { error: passwordError } = await signIn.password({ password });
      if (passwordError) {
        setError(clerkErrorMessage(passwordError));
        return;
      }

      if (signIn.status === 'complete') {
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) {
          setError(clerkErrorMessage(finalizeError));
        } else {
          retryConvexAuth({ resetPhase: true });
        }
        return;
      }

      if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
        const strategy = primaryMfaStrategy(signIn.supportedSecondFactors) ?? 'email_code';
        await beginMfa(strategy);
        return;
      }

      setError(incompleteSignInMessage(signIn.status));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyMfa = async () => {
    if (fetchStatus === 'fetching') return;
    setError(null);
    setLoading(true);
    try {
      const strategy = useBackupCode ? 'backup_code' : mfaStrategy;
      const { error: verifyError } = await verifyMfaCode(signIn, strategy, code.trim());
      if (verifyError) {
        setError(clerkErrorMessage(verifyError));
        return;
      }

      if (signIn.status !== 'complete') {
        setError('Verification incomplete. Try again.');
        return;
      }

      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        setError(clerkErrorMessage(finalizeError));
      } else {
        retryConvexAuth({ resetPhase: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const resendMfaCode = async () => {
    if (fetchStatus === 'fetching' || mfaStrategy === 'totp' || mfaStrategy === 'backup_code') return;
    setError(null);
    const { error: sendError } = await sendMfaCode(signIn, mfaStrategy);
    if (sendError) setError(clerkErrorMessage(sendError));
  };

  const backToCredentials = () => {
    signIn.reset();
    setStage('credentials');
    setCode('');
    setUseBackupCode(false);
    setError(null);
  };

  const hasBackupFactor = signIn.supportedSecondFactors?.some((f) => f.strategy === 'backup_code');

  const canSubmit = Boolean(email.trim() && password) && !loading && fetchStatus !== 'fetching';

  const canVerify =
    (useBackupCode ? code.trim().length >= 4 : code.length === 6) && !loading && fetchStatus !== 'fetching';

  const activeMfaStrategy = useBackupCode ? 'backup_code' : mfaStrategy;

  return (
    <View className="flex-1 bg-brand">
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <AuthHero />

        <ScrollView
          className="flex-1 bg-surface-light dark:bg-surface-dark rounded-t-3xl"
          contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {stage === 'credentials' ? (
            <>
              <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">Sign in</Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 mb-6">
                Use the email you signed up with
              </Text>

              <AppInput
                label="Email"
                required
                value={email}
                onChangeText={setEmail}
                placeholder="surveyor@ulb.gov.in"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                iconLeft="mail-outline"
                containerClassName="mb-3.5"
              />

              <AppInput
                label="Password"
                required
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                iconLeft="lock-closed-outline"
                iconRight={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onPressRightIcon={() => setShowPassword((v) => !v)}
                errorText={error ?? undefined}
                containerClassName="mb-3"
              />

              <Link href="/(auth)/forgot-password" asChild>
                <Pressable hitSlop={6} className="self-end mb-5">
                  <Text className="text-helper font-medium text-brand">Forgot password?</Text>
                </Pressable>
              </Link>

              <AppButton
                label={loading ? 'Signing in…' : 'Sign in'}
                loading={loading}
                onPress={onSubmit}
                disabled={!canSubmit}
                fullWidth
              />

              <View className="flex-row justify-center items-center mt-6">
                <Text className="text-caption text-ink-tertiary-light">Do not have an account? </Text>
                <Link href="/(auth)/sign-up" asChild>
                  <Pressable hitSlop={6}>
                    <Text className="text-caption font-medium text-brand">Sign up</Text>
                  </Pressable>
                </Link>
              </View>
            </>
          ) : (
            <>
              <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">
                Verify your account
              </Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 mb-6">
                {mfaSubtitle(activeMfaStrategy, email.trim())}
              </Text>

              <AppInput
                label={useBackupCode ? 'Backup code' : 'Verification code'}
                required
                value={code}
                onChangeText={(v) => (useBackupCode ? setCode(v.trim()) : setCode(v.replace(/\D/g, '').slice(0, 6)))}
                placeholder={useBackupCode ? 'Backup code' : '6-digit code'}
                keyboardType={useBackupCode ? 'default' : 'number-pad'}
                autoCapitalize="none"
                autoCorrect={false}
                iconLeft="key-outline"
                autoFocus
                errorText={error ?? undefined}
                containerClassName="mb-5"
              />

              {hasBackupFactor && mfaStrategy !== 'backup_code' ? (
                <Pressable
                  onPress={() => {
                    setUseBackupCode((v) => !v);
                    setCode('');
                    setError(null);
                  }}
                  className="flex-row items-center mb-5"
                  hitSlop={6}
                >
                  <View
                    className={`w-5 h-5 rounded border mr-2.5 items-center justify-center ${
                      useBackupCode ? 'bg-brand border-brand' : 'border-ink-tertiary-light'
                    }`}
                  >
                    {useBackupCode ? <Text className="text-white text-xs font-bold">✓</Text> : null}
                  </View>
                  <Text className="text-helper text-ink-secondary-light">Use backup code</Text>
                </Pressable>
              ) : null}

              <AppButton
                label={loading ? 'Verifying…' : 'Verify'}
                loading={loading}
                onPress={onVerifyMfa}
                disabled={!canVerify}
                fullWidth
              />

              {mfaStrategy === 'email_code' || mfaStrategy === 'phone_code' ? (
                <Pressable onPress={resendMfaCode} className="self-center mt-4" hitSlop={6} disabled={loading}>
                  <Text className="text-helper text-brand font-medium">Resend code</Text>
                </Pressable>
              ) : null}

              <Pressable onPress={backToCredentials} className="self-center mt-4" hitSlop={6} disabled={loading}>
                <Text className="text-helper text-ink-tertiary-light">Back to sign in</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
