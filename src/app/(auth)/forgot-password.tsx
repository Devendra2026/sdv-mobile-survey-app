/**
 * Password reset via Clerk Core 3 (`@clerk/expo` v3+).
 *
 *  1. signIn.create({ identifier }) + resetPasswordEmailCode.sendCode()
 *  2. verifyCode + submitPassword
 *  3. signIn.finalize() → AuthGate routes via setup / awaiting-approval
 */
import { AppButton, AppInput } from '@/components';
import { AuthHero } from '@/components/auth/auth-hero';
import { clerkErrorMessage } from '@/components/auth/field-error';
import { retryConvexAuth } from '@/hooks/use-auth-for-convex';
import { useSignIn } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useReducer } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

type Stage = 'email' | 'reset';

type ForgotPasswordState = {
  stage: Stage;
  email: string;
  code: string;
  newPassword: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
};

type ForgotPasswordAction =
  | { type: 'setStage'; stage: Stage }
  | { type: 'setEmail'; email: string }
  | { type: 'setCode'; code: string }
  | { type: 'setNewPassword'; newPassword: string }
  | { type: 'toggleShowPassword' }
  | { type: 'setLoading'; loading: boolean }
  | { type: 'setError'; error: string | null };

const initialForgotPasswordState: ForgotPasswordState = {
  stage: 'email',
  email: '',
  code: '',
  newPassword: '',
  showPassword: false,
  loading: false,
  error: null,
};

function forgotPasswordReducer(state: ForgotPasswordState, action: ForgotPasswordAction): ForgotPasswordState {
  switch (action.type) {
    case 'setStage':
      return { ...state, stage: action.stage };
    case 'setEmail':
      return { ...state, email: action.email };
    case 'setCode':
      return { ...state, code: action.code };
    case 'setNewPassword':
      return { ...state, newPassword: action.newPassword };
    case 'toggleShowPassword':
      return { ...state, showPassword: !state.showPassword };
    case 'setLoading':
      return { ...state, loading: action.loading };
    case 'setError':
      return { ...state, error: action.error };
    default:
      return state;
  }
}

export default function ForgotPasswordScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();
  const [state, dispatch] = useReducer(forgotPasswordReducer, initialForgotPasswordState);

  const requestReset = async () => {
    if (fetchStatus === 'fetching') return;
    dispatch({ type: 'setError', error: null });
    dispatch({ type: 'setLoading', loading: true });
    try {
      const { error: createError } = await signIn.create({ identifier: state.email.trim() });
      if (createError) {
        dispatch({ type: 'setError', error: clerkErrorMessage(createError) });
        return;
      }

      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        dispatch({ type: 'setError', error: clerkErrorMessage(sendError) });
        return;
      }

      dispatch({ type: 'setStage', stage: 'reset' });
    } finally {
      dispatch({ type: 'setLoading', loading: false });
    }
  };

  const completeReset = async () => {
    if (fetchStatus === 'fetching') return;
    dispatch({ type: 'setError', error: null });
    dispatch({ type: 'setLoading', loading: true });
    try {
      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code: state.code });
      if (verifyError) {
        dispatch({ type: 'setError', error: clerkErrorMessage(verifyError) });
        return;
      }

      const { error: passwordError } = await signIn.resetPasswordEmailCode.submitPassword({
        password: state.newPassword,
        signOutOfOtherSessions: true,
      });
      if (passwordError) {
        dispatch({ type: 'setError', error: clerkErrorMessage(passwordError) });
        return;
      }

      if (signIn.status !== 'complete') {
        dispatch({ type: 'setError', error: 'Reset incomplete — try again.' });
        return;
      }

      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        dispatch({ type: 'setError', error: clerkErrorMessage(finalizeError) });
      } else {
        retryConvexAuth({ resetPhase: true });
      }
    } finally {
      dispatch({ type: 'setLoading', loading: false });
    }
  };

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
          {state.stage === 'email' ? (
            <>
              <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">
                Reset password
              </Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 mb-6">
                We will send a code to your email.
              </Text>
              <AppInput
                label="Email"
                required
                value={state.email}
                onChangeText={(v) => dispatch({ type: 'setEmail', email: v })}
                keyboardType="email-address"
                autoCapitalize="none"
                iconLeft="mail-outline"
                errorText={state.error ?? undefined}
                containerClassName="mb-5"
              />
              <AppButton
                label={state.loading ? 'Sending…' : 'Send code'}
                loading={state.loading}
                onPress={requestReset}
                disabled={!state.email.trim() || state.loading || fetchStatus === 'fetching'}
                fullWidth
              />
            </>
          ) : (
            <>
              <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">
                Enter new password
              </Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 mb-6">
                Code sent to <Text className="font-medium">{state.email}</Text>
              </Text>
              <AppInput
                label="Code"
                required
                value={state.code}
                onChangeText={(v) => dispatch({ type: 'setCode', code: v.replace(/\D/g, '').slice(0, 6) })}
                keyboardType="number-pad"
                iconLeft="key-outline"
                containerClassName="mb-3.5"
              />
              <AppInput
                label="New password"
                required
                value={state.newPassword}
                onChangeText={(v) => dispatch({ type: 'setNewPassword', newPassword: v })}
                secureTextEntry={!state.showPassword}
                helperText="At least 8 characters"
                iconLeft="lock-closed-outline"
                iconRight={state.showPassword ? 'eye-off-outline' : 'eye-outline'}
                onPressRightIcon={() => dispatch({ type: 'toggleShowPassword' })}
                errorText={state.error ?? undefined}
                containerClassName="mb-5"
              />
              <AppButton
                label={state.loading ? 'Resetting…' : 'Reset password'}
                loading={state.loading}
                onPress={completeReset}
                disabled={
                  state.code.length !== 6 || state.newPassword.length < 8 || state.loading || fetchStatus === 'fetching'
                }
                fullWidth
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
