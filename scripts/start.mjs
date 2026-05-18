/**
 * Reliable LAN dev server for Expo Go (no ngrok tunnel).
 *
 * - Loads `.env.local` before Metro starts
 * - Sets REACT_NATIVE_PACKAGER_HOSTNAME to the best LAN IPv4 (fixes wrong IP on Windows)
 * - Uses `--lan` explicitly
 *
 * Started by `npm run dev` (with Convex). Use `npm run dev:tunnel` on different networks.
 */
import { spawn } from "node:child_process";
import { loadEnvLocal } from "./load-env-local.mjs";
import { pickLanHost } from "./pick-lan-host.mjs";

const extraArgs = process.argv.slice(2);
const hasHostFlag = extraArgs.some((a) => a === "--tunnel" || a === "--localhost" || a.startsWith("--host"));

loadEnvLocal();

const lanHost = pickLanHost();
if (lanHost && !process.env.REACT_NATIVE_PACKAGER_HOSTNAME) {
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = lanHost;
}

if (lanHost) {
  console.log(`LAN dev host: ${lanHost} (Expo Go must be on the same Wi‑Fi)\n`);
} else {
  console.log("Could not detect a LAN IP — Expo will choose one automatically.\n");
}

if (!process.env.EXPO_PUBLIC_CONVEX_URL || !process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  console.warn(
    "Warning: EXPO_PUBLIC_CONVEX_URL or EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY missing in .env.local\n",
  );
}

console.log("Tips if Expo Go cannot connect:");
console.log("  • Phone and PC on the same Wi‑Fi (not mobile data)");
console.log("  • Allow Node.js through Windows Firewall on port 8081");
console.log("  • Different networks: npm run dev:tunnel\n");

const expoArgs = ["expo", "start", ...(hasHostFlag ? [] : ["--lan"]), ...extraArgs];
const child = spawn("npx", expoArgs, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 1));
