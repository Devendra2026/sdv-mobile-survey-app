import { patchExpoKeepAwake } from "./patch-expo-keep-awake.mjs";
import { patchExpoNgrok } from "./patch-expo-ngrok.mjs";
import { patchExpoWsTunnel } from "./patch-expo-ws-tunnel.mjs";
import { patchNgrokClient } from "./patch-ngrok-client.mjs";

const applied = [];

try {
  if (patchExpoKeepAwake()) applied.push("keep-awake (Expo Go Android)");
} catch (err) {
  console.warn(
    "keep-awake patch skipped:",
    err instanceof Error ? err.message : err,
  );
}

try {
  const ws = patchExpoWsTunnel();
  const cli = patchExpoNgrok();
  const client = patchNgrokClient();
  if (ws || cli || client) applied.push("ngrok tunnel fallbacks");
} catch (err) {
  console.warn(
    "ngrok patch skipped:",
    err instanceof Error ? err.message : err,
  );
}

if (applied.length > 0) {
  console.log(`Applied postinstall patches: ${applied.join(", ")}.`);
}
