import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  missingLinuxOptionalMarkers,
  readRootOptionalDependencies,
} from "./eas-lockfile-optional.mjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const optionalDeps = readRootOptionalDependencies();

const result = spawnSync(
  npm,
  [
    "install",
    "--package-lock-only",
    "--os=linux",
    "--libc=glibc",
    "--cpu=x64",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

const lockfile = readFileSync("package-lock.json", "utf8");
const missing = missingLinuxOptionalMarkers(lockfile, optionalDeps);

if (missing.length > 0) {
  console.error(
    "EAS lockfile is still missing Linux optional deps:",
    missing.join(", "),
  );
  console.error("Run: npm run lockfile:eas");
  process.exit(1);
}

console.log("package-lock.json is ready for EAS (Linux npm ci).");
