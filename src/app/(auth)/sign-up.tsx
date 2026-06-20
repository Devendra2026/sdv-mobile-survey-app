/**
 * Sign-up via Clerk Core 3 (`@clerk/expo` v3+).
 *
 *  1. signUp.password({ email, password, name, unsafeMetadata })
 *  2. signUp.verifications.sendEmailCode() → user enters code
 *  3. signUp.verifications.verifyEmailCode() + signUp.finalize()
 *  4. Setup screen → `users.provisionCurrentUser` (webhook also upserts)
 *  5. AuthGate routes to awaiting-approval when `me.status !== "active"`
 */
import { AppButton, AppInput, RadioGroup } from '@/components';
import { AuthHero } from '@/components/auth/auth-hero';
import { clerkErrorMessage } from '@/components/auth/field-error';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { retryConvexAuth } from '@/hooks/use-auth-for-convex';
import { useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useReducer } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

type Stage = 'details' | 'verify';
type RequestedRole = 'surveyor' | 'supervisor';

type SignUpState = {
  stage: Stage;
  name: string;
  email: string;
  password: string;
  showPassword: boolean;
  requestedRole: RequestedRole;
  code: string;
  loading: boolean;
  error: string | null;
};

type SignUpAction =
  | { type: 'patch'; patch: Partial<SignUpState> }
  | { type: 'request_start' }
  | { type: 'request_end' }
  | { type: 'set_error'; error: string }
  | { type: 'toggle_show_password' };

const initialSignUpState: SignUpState = {
  stage: 'details',
  name: '',
  email: '',
  password: '',
  showPassword: false,
  requestedRole: 'surveyor',
  code: '',
  loading: false,
  error: null,
};

function signUpReducer(state: SignUpState, action: SignUpAction): SignUpState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'request_start':
      return { ...state, error: null, loading: true };
    case 'request_end':
      return { ...state, loading: false };
    case 'set_error':
      return { ...state, error: action.error, loading: false };
    case 'toggle_show_password':
      return { ...state, showPassword: !state.showPassword };
    default:
      return state;
  }
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

export default function SignUpScreen() {
  const { signUp, fetchStatus } = useSignUp();
  const router = useRouter();
  const [state, dispatch] = useReducer(signUpReducer, initialSignUpState);
  const { stage, name, email, password, showPassword, requestedRole, code, loading, error } = state;

  const startSignUp = async () => {
    if (fetchStatus === 'fetching') return;
    dispatch({ type: 'request_start' });
    try {
      const { firstName, lastName } = splitName(name);
      const { error: passwordError } = await signUp.password({
        emailAddress: email.trim(),
        password,
        firstName,
        lastName,
        unsafeMetadata: { requestedRole },
      });
      if (passwordError) {
        dispatch({ type: 'set_error', error: clerkErrorMessage(passwordError) });
        return;
      }

      if (signUp.isTransferable) {
        dispatch({ type: 'set_error', error: 'An account with this email already exists. Sign in instead.' });
        return;
      }

      if (signUp.status === 'complete') {
        const { error: finalizeError } = await signUp.finalize();
        if (finalizeError) {
          dispatch({ type: 'set_error', error: clerkErrorMessage(finalizeError) });
        } else {
          retryConvexAuth({ resetPhase: true });
        }
        return;
      }

      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        dispatch({ type: 'set_error', error: clerkErrorMessage(sendError) });
        return;
      }

      dispatch({ type: 'patch', patch: { stage: 'verify' } });
    } finally {
      dispatch({ type: 'request_end' });
    }
  };

  const verify = async () => {
    if (fetchStatus === 'fetching') return;
    dispatch({ type: 'request_start' });
    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
      if (verifyError) {
        dispatch({ type: 'set_error', error: clerkErrorMessage(verifyError) });
        return;
      }

      if (signUp.status !== 'complete') {
        dispatch({ type: 'set_error', error: 'Verification incomplete. Try again.' });
        return;
      }

      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) {
        dispatch({ type: 'set_error', error: clerkErrorMessage(finalizeError) });
      } else {
        retryConvexAuth({ resetPhase: true });
      }
    } finally {
      dispatch({ type: 'request_end' });
    }
  };

  const resendCode = async () => {
    if (fetchStatus === 'fetching') return;
    dispatch({ type: 'patch', patch: { error: null } });
    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) dispatch({ type: 'set_error', error: clerkErrorMessage(sendError) });
  };

  const canStart =
    Boolean(name.trim() && email.trim() && password.length >= 8) && !loading && fetchStatus !== 'fetching';

  const canVerify = code.length === 6 && !loading && fetchStatus !== 'fetching';

  return (
    <View className="flex-1 bg-brand">
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <AuthHero onBack={() => router.back()} />

        <ScrollView
          className="flex-1 bg-surface-light dark:bg-surface-dark rounded-t-3xl"
          contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {stage === 'details' ? (
            <>
              <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">
                Create account
              </Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 mb-6">
                Your account will be reviewed by an administrator before access is granted.
              </Text>

              <AppInput
                label="Full name"
                required
                value={name}
                onChangeText={(v) => dispatch({ type: 'patch', patch: { name: v } })}
                placeholder="Rajesh Kumar"
                iconLeft="person-outline"
                containerClassName="mb-3.5"
              />

              <AppInput
                label="Work email"
                required
                value={email}
                onChangeText={(v) => dispatch({ type: 'patch', patch: { email: v } })}
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
                onChangeText={(v) => dispatch({ type: 'patch', patch: { password: v } })}
                secureTextEntry={!showPassword}
                helperText="At least 8 characters"
                iconLeft="lock-closed-outline"
                iconRight={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onPressRightIcon={() => dispatch({ type: 'toggle_show_password' })}
                containerClassName="mb-5"
              />

              <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light mb-2">
                Requested role
              </Text>
              <View className="mb-5">
                <RadioGroup<RequestedRole>
                  items={[
                    { value: 'surveyor', label: 'Surveyor', helper: 'Create and submit property surveys' },
                    { value: 'supervisor', label: 'Supervisor', helper: 'Review and approve surveys (limited access)' },
                  ]}
                  value={requestedRole}
                  onChange={(v) => dispatch({ type: 'patch', patch: { requestedRole: v } })}
                />
              </View>

              {error ? <Text className="text-helper text-danger mb-3">{error}</Text> : null}

              <AppButton
                label={loading ? 'Creating account…' : 'Continue'}
                loading={loading}
                onPress={startSignUp}
                disabled={!canStart}
                fullWidth
              />

              <OAuthButtons />

              <View className="flex-row justify-center items-center mt-6">
                <Text className="text-caption text-ink-tertiary-light">Already have an account? </Text>
                <Link href="/(auth)/sign-in" asChild>
                  <Pressable hitSlop={6}>
                    <Text className="text-caption font-medium text-brand">Sign in</Text>
                  </Pressable>
                </Link>
              </View>
            </>
          ) : (
            <>
              <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">
                Verify your email
              </Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 mb-6">
                We sent a 6-digit code to{' '}
                <Text className="font-medium text-ink-primary-light dark:text-ink-primary-dark">{email}</Text>
              </Text>

              <AppInput
                label="Verification code"
                required
                value={code}
                onChangeText={(v) => dispatch({ type: 'patch', patch: { code: v.replace(/\D/g, '').slice(0, 6) } })}
                placeholder="6-digit code"
                keyboardType="number-pad"
                iconLeft="key-outline"
                autoFocus
                errorText={error ?? undefined}
                containerClassName="mb-5"
              />

              <AppButton
                label={loading ? 'Verifying…' : 'Verify'}
                loading={loading}
                onPress={verify}
                disabled={!canVerify}
                fullWidth
              />

              <Pressable onPress={resendCode} className="self-center mt-4" hitSlop={6} disabled={loading}>
                <Text className="text-helper text-brand font-medium">Resend code</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
