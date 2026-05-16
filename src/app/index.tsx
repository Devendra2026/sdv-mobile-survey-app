import { Redirect } from "expo-router";

/** Entry route — AuthGate sends signed-in users to the right group. */
export default function Index() {
  return <Redirect href="/(auth)/sign-in" />;
}
