/**
 * Use Expo's @expo/ws-tunnel when EXPO_USE_WS_TUNNEL=1 (set by `npm run dev:tunnel`).
 * Avoids broken ngrok v2 in @expo/ngrok-bin (error 103 / remote gone away).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PATCH_MARKER = "// @survey-app/ws-tunnel";

export function getBundlerDevServerPath(cwd = process.cwd()) {
  return join(cwd, "node_modules/@expo/cli/build/src/start/server/BundlerDevServer.js");
}

export function patchExpoWsTunnel(cwd = process.cwd()) {
  const path = getBundlerDevServerPath(cwd);
  if (!existsSync(path)) {
    throw new Error("Missing @expo/cli — run `bun install` first.");
  }

  let src = readFileSync(path, "utf8");
  if (src.includes(PATCH_MARKER)) {
    return false;
  }

  const old =
    "        this.tunnel = (0, _env.envIsWebcontainer)() ? new _AsyncWsTunnel.AsyncWsTunnel(this.projectRoot, port) : new _AsyncNgrok.AsyncNgrok(this.projectRoot, port);";
  const neu =
    "        const useWsTunnel = (0, _env.envIsWebcontainer)() || process.env.EXPO_USE_WS_TUNNEL === '1'; " +
    PATCH_MARKER +
    "\n        this.tunnel = useWsTunnel ? new _AsyncWsTunnel.AsyncWsTunnel(this.projectRoot, port) : new _AsyncNgrok.AsyncNgrok(this.projectRoot, port);";

  if (!src.includes(old)) {
    throw new Error("BundlerDevServer.js tunnel line changed — cannot apply ws-tunnel patch.");
  }

  writeFileSync(path, src.replace(old, neu));
  return true;
}
