/**
 * Password reset via Clerk Core 3 (`@clerk/expo` v3+).
 *
 *  1. signIn.create({ identifier }) + resetPasswordEmailCode.sendCode()
 *  2. verifyCode + submitPassword
 *  3. signIn.finalize() → AuthGate routes via setup / awaiting-approval
 */
import { AppButton, AppInput } from "@/components";
import { clerkErrorMessage } from "@/components/auth/field-error";
import { useSignIn } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Stage = "email" | "reset";

export default function ForgotPasswordScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReset = async () => {
    if (fetchStatus === "fetching") return;
    setError(null);
    setLoading(true);
    try {
      const { error: createError } = await signIn.create({ identifier: email.trim() });
      if (createError) {
        setError(clerkErrorMessage(createError));
        return;
      }

      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        setError(clerkErrorMessage(sendError));
        return;
      }

      setStage("reset");
    } finally {
      setLoading(false);
    }
  };

  const completeReset = async () => {
    if (fetchStatus === "fetching") return;
    setError(null);
    setLoading(true);
    try {
      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verifyError) {
        setError(clerkErrorMessage(verifyError));
        return;
      }

      const { error: passwordError } = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });
      if (passwordError) {
        setError(clerkErrorMessage(passwordError));
        return;
      }

      if (signIn.status !== "complete") {
        setError("Reset incomplete — try again.");
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

  return (
    <View className="flex-1 bg-brand">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <SafeAreaView edges={["top"]}>
          <View className="px-4 py-3 flex-row items-center">
            <Pressable onPress={() => router.back()} hitSlop={8} className="w-9 h-9 items-center justify-center">
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView
          className="flex-1 bg-surface-light dark:bg-surface-dark rounded-t-3xl"
          contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {stage === "email" ? (
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
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                iconLeft="mail-outline"
                errorText={error ?? undefined}
                containerClassName="mb-5"
              />
              <AppButton
                label={loading ? "Sending…" : "Send code"}
                loading={loading}
                onPress={requestReset}
                disabled={!email.trim() || loading || fetchStatus === "fetching"}
                fullWidth
              />
            </>
          ) : (
            <>
              <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">
                Enter new password
              </Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 mb-6">
                Code sent to <Text className="font-medium">{email}</Text>
              </Text>
              <AppInput
                label="Code"
                required
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                iconLeft="key-outline"
                containerClassName="mb-3.5"
              />
              <AppInput
                label="New password"
                required
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                helperText="At least 8 characters"
                iconLeft="lock-closed-outline"
                iconRight={showPassword ? "eye-off-outline" : "eye-outline"}
                onPressRightIcon={() => setShowPassword((v) => !v)}
                errorText={error ?? undefined}
                containerClassName="mb-5"
              />
              <AppButton
                label={loading ? "Resetting…" : "Reset password"}
                loading={loading}
                onPress={completeReset}
                disabled={code.length !== 6 || newPassword.length < 8 || loading || fetchStatus === "fetching"}
                fullWidth
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
