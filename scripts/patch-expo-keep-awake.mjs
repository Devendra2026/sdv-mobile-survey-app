/**
 * Expo Go on Android: withDevTools() calls useKeepAwake before the Activity exists,
 * which rejects with "Unable to activate keep awake". Swallow that race in dev only.
 * @see https://github.com/expo/expo/issues/23390
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PATCH_MARKER = "// @survey-app/keep-awake-activate-catch";

export function getKeepAwakeIndexPath(cwd = process.cwd()) {
  return join(cwd, "node_modules/expo-keep-awake/src/index.ts");
}

export function patchExpoKeepAwake(cwd = process.cwd()) {
  const file = getKeepAwakeIndexPath(cwd);
  if (!existsSync(file)) return false;

  let src = readFileSync(file, "utf8");
  if (src.includes(PATCH_MARKER)) return false;

  const needle = "    activateKeepAwakeAsync(tagOrDefault).then(() => {";
  const replacement = `    activateKeepAwakeAsync(tagOrDefault).catch(() => {}).then(() => { ${PATCH_MARKER}`;

  if (!src.includes(needle)) {
    throw new Error(
      "expo-keep-awake src/index.ts changed; update scripts/patch-expo-keep-awake.mjs",
    );
  }

  src = src.replace(needle, replacement);
  writeFileSync(file, src);
  return true;
}
