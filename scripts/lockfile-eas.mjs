import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

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
const required = ["utf-8-validate-5.0.10", "yaml-2.9.0"];
const missing = required.filter((id) => !lockfile.includes(id));

if (missing.length > 0) {
  console.error(
    "EAS lockfile is still missing Linux optional deps:",
    missing.join(", "),
  );
  console.error("Run: node scripts/lockfile-eas.mjs");
  process.exit(1);
}

console.log("package-lock.json is ready for EAS (Linux npm ci).");
