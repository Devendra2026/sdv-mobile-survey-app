import { StyleSheet } from "react-native";

const authColors = {
  background: "#F5F7FA",
  primary: "#003B8E",
  text: "#1A1A2E",
  muted: "#6B7280",
  border: "#D1D5DB",
  error: "#DC2626",
  white: "#FFFFFF",
};

export const authStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: authColors.background,
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: authColors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: authColors.muted,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: authColors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: authColors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: authColors.white,
    marginBottom: 12,
  },
  button: {
    backgroundColor: authColors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: authColors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryButtonText: {
    color: authColors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  error: {
    color: authColors.error,
    fontSize: 13,
    marginTop: -8,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    gap: 4,
  },
  linkMuted: {
    color: authColors.muted,
    fontSize: 15,
  },
  link: {
    color: authColors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
});
