/**
 * Sign-up via Clerk Core 3 (`@clerk/expo` v3+).
 *
 *  1. signUp.password({ email, password, name, unsafeMetadata })
 *  2. signUp.verifications.sendEmailCode() → user enters code
 *  3. signUp.verifications.verifyEmailCode() + signUp.finalize()
 *  4. Setup screen → `users.provisionCurrentUser` (webhook also upserts)
 *  5. AuthGate routes to awaiting-approval when `me.status !== "active"`
 */
import { AppButton, AppInput, RadioGroup } from "@/components";
import { clerkErrorMessage } from "@/components/auth/field-error";
import { useSignUp } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Stage = "details" | "verify";
type RequestedRole = "surveyor" | "supervisor";

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export default function SignUpScreen() {
  const { signUp, fetchStatus } = useSignUp();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("surveyor");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSignUp = async () => {
    if (fetchStatus === "fetching") return;
    setError(null);
    setLoading(true);
    try {
      const { firstName, lastName } = splitName(name);
      const { error: passwordError } = await signUp.password({
        emailAddress: email.trim(),
        password,
        firstName,
        lastName,
        unsafeMetadata: { requestedRole, requestedReason: reason },
      });
      if (passwordError) {
        setError(clerkErrorMessage(passwordError));
        return;
      }

      if (signUp.isTransferable) {
        setError("An account with this email already exists. Sign in instead.");
        return;
      }

      if (signUp.status === "complete") {
        const { error: finalizeError } = await signUp.finalize();
        if (finalizeError) setError(clerkErrorMessage(finalizeError));
        return;
      }

      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        setError(clerkErrorMessage(sendError));
        return;
      }

      setStage("verify");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (fetchStatus === "fetching") return;
    setError(null);
    setLoading(true);
    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
      if (verifyError) {
        setError(clerkErrorMessage(verifyError));
        return;
      }

      if (signUp.status !== "complete") {
        setError("Verification incomplete. Try again.");
        return;
      }

      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) {
        setError(clerkErrorMessage(finalizeError));
      }
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (fetchStatus === "fetching") return;
    setError(null);
    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) setError(clerkErrorMessage(sendError));
  };

  const canStart =
    Boolean(name.trim() && email.trim() && password.length >= 8) &&
    !loading &&
    fetchStatus !== "fetching";

  const canVerify = code.length === 6 && !loading && fetchStatus !== "fetching";

  return (
    <View className="flex-1 bg-brand">
      <StatusBar style="light" />
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
          {stage === "details" ? (
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
                onChangeText={setName}
                placeholder="Rajesh Kumar"
                iconLeft="person-outline"
                containerClassName="mb-3.5"
              />

              <AppInput
                label="Work email"
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
                helperText="At least 8 characters"
                iconLeft="lock-closed-outline"
                iconRight={showPassword ? "eye-off-outline" : "eye-outline"}
                onPressRightIcon={() => setShowPassword((v) => !v)}
                containerClassName="mb-5"
              />

              <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light mb-2">
                Requested role
              </Text>
              <RadioGroup<RequestedRole>
                items={[
                  { value: "surveyor", label: "Surveyor", helper: "Create and submit property surveys" },
                  { value: "supervisor", label: "Supervisor", helper: "Review and approve surveys (limited access)" },
                ]}
                value={requestedRole}
                onChange={setRequestedRole}
              />

              <AppInput
                label="Why do you need access? (optional)"
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Ward 12 field surveyor for Mathura NP"
                multiline
                containerClassName="mt-4 mb-5"
              />

              {error ? (
                <Text className="text-helper text-danger mb-3">{error}</Text>
              ) : null}

              <AppButton
                label={loading ? "Creating account…" : "Continue"}
                loading={loading}
                onPress={startSignUp}
                disabled={!canStart}
                fullWidth
              />

              <View className="flex-row justify-center items-center mt-6">
                <Text className="text-caption text-ink-tertiary-light">
                  Already have an account?{" "}
                </Text>
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
                We sent a 6-digit code to{" "}
                <Text className="font-medium text-ink-primary-light dark:text-ink-primary-dark">
                  {email}
                </Text>
              </Text>

              <AppInput
                label="Verification code"
                required
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                keyboardType="number-pad"
                iconLeft="key-outline"
                autoFocus
                errorText={error ?? undefined}
                containerClassName="mb-5"
              />

              <AppButton
                label={loading ? "Verifying…" : "Verify"}
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
