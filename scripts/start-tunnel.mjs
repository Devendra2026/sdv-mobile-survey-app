/**
 * Start Expo with --tunnel using Expo's WS proxy (no ngrok account required).
 *
 * Ngrok in @expo/ngrok-bin v2.3.41 no longer works with ngrok cloud (error 103).
 * We set EXPO_USE_WS_TUNNEL=1 so @expo/cli uses @expo/ws-tunnel instead.
 */
import { execSync, spawn } from "node:child_process";
import { loadEnvLocal } from "./load-env-local.mjs";
import { patchExpoNgrok } from "./patch-expo-ngrok.mjs";
import { patchExpoWsTunnel } from "./patch-expo-ws-tunnel.mjs";
import { patchNgrokClient } from "./patch-ngrok-client.mjs";

loadEnvLocal();

try {
  patchExpoWsTunnel();
  patchExpoNgrok();
  patchNgrokClient();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

process.env.EXPO_USE_WS_TUNNEL = "1";

try {
  if (process.platform === "win32") {
    execSync("taskkill /F /IM ngrok.exe", { stdio: "ignore" });
  }
} catch {
  /* none running */
}

console.log("Starting Expo with WebSocket tunnel (no ngrok token needed).\n");
console.log("Same Wi‑Fi without tunnel:  npm run dev\n");

const child = spawn("npx", ["expo", "start", "--tunnel"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 1));
