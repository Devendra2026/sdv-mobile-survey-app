/**
 * Email + password sign-in via Clerk Core 3 (`@clerk/expo` v3+).
 *
 *  1. signIn.create({ identifier }) + signIn.password({ password })
 *  2. signIn.finalize() → AuthGate loads Convex user and routes
 */
import { AppButton, AppInput } from "@/components";
import { clerkErrorMessage } from "@/components/auth/field-error";
import { useSignIn } from "@clerk/expo";
import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function incompleteSignInMessage(status: string): string {
  switch (status) {
    case "needs_second_factor":
      return "Two-factor authentication is required for this account.";
    case "needs_first_factor":
      return "Additional verification is required. Check your email.";
    case "needs_new_password":
      return "You must set a new password before signing in.";
    default:
      return "Sign-in could not be completed. Try again.";
  }
}

export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (fetchStatus === "fetching") return;
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

      if (signIn.status !== "complete") {
        setError(incompleteSignInMessage(signIn.status));
        return;
      }

      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        setError(clerkErrorMessage(finalizeError));
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = Boolean(email.trim() && password) && !loading && fetchStatus !== "fetching";

  return (
    <View className="flex-1 bg-brand">
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <SafeAreaView edges={["top"]} className="items-center pt-7 pb-7">
          <View className="w-16 h-16 bg-white rounded-xl items-center justify-center">
            <Text className="text-[22px] font-medium text-brand">SDV</Text>
          </View>
          <Text className="text-white text-h2 font-medium mt-3.5">Property Survey</Text>
          <Text className="text-white/70 text-caption mt-0.5">Nagar Panchayat · GIS field</Text>
        </SafeAreaView>

        <ScrollView
          className="flex-1 bg-surface-light dark:bg-surface-dark rounded-t-3xl"
          contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">
            Sign in
          </Text>
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
            iconRight={showPassword ? "eye-off-outline" : "eye-outline"}
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
            label={loading ? "Signing in…" : "Sign in"}
            loading={loading}
            onPress={onSubmit}
            disabled={!canSubmit}
            fullWidth
          />

          <View className="flex-row justify-center items-center mt-6">
            <Text className="text-caption text-ink-tertiary-light">
              Do not have an account?{" "}
            </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable hitSlop={6}>
                <Text className="text-caption font-medium text-brand">Sign up</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
