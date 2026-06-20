/**
 * Clerk OAuth sign-in buttons (Google + Apple).
 */
import { AppButton } from '@/components';
import { clerkErrorMessage } from '@/components/auth/field-error';
import { retryConvexAuth } from '@/hooks/use-auth-for-convex';
import { useSSO } from '@clerk/expo';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

type OAuthButtonsProps = {
  isSignUp?: boolean;
};

export function OAuthButtons({ isSignUp: _isSignUp = false }: OAuthButtonsProps) {
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onOAuth = async (strategy: 'oauth_google' | 'oauth_apple') => {
    setError(null);
    setLoading(strategy === 'oauth_google' ? 'google' : 'apple');
    try {
      const { createdSessionId, setActive, signUp, signIn } = await startSSOFlow({ strategy });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        retryConvexAuth({ resetPhase: true });
      }
    } catch (e) {
      setError(clerkErrorMessage(e, 'Social sign-in failed'));
    } finally {
      setLoading(null);
    }
  };

  return (
    <View className="gap-2 mt-4">
      <Text className="text-helper text-ink-tertiary-light text-center">Or continue with</Text>
      <AppButton
        label="Continue with Google"
        variant="outline"
        iconLeft="logo-google"
        loading={loading === 'google'}
        disabled={loading !== null}
        onPress={() => void onOAuth('oauth_google')}
        fullWidth
      />
      {Platform.OS === 'ios' ? (
        <AppButton
          label="Continue with Apple"
          variant="outline"
          iconLeft="logo-apple"
          loading={loading === 'apple'}
          disabled={loading !== null}
          onPress={() => void onOAuth('oauth_apple')}
          fullWidth
        />
      ) : null}
      {error ? <Text className="text-helper text-danger text-center">{error}</Text> : null}
    </View>
  );
}
