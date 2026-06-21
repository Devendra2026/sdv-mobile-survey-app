/**
 * Shared checks for Linux EAS optionalDependencies in package-lock.json.
 */
import { readFileSync } from 'node:fs';

/** @returns {Record<string, string>} */
export function readRootOptionalDependencies() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  return pkg.optionalDependencies ?? {};
}

/**
 * Ensure root optionalDependencies are resolved in package-lock.json.
 * @param {string} lockRaw
 * @param {Record<string, string>} optionalDeps
 */
export function missingLinuxOptionalMarkers(lockRaw, optionalDeps) {
  const lock = JSON.parse(lockRaw);
  const missing = [];

  for (const [name, version] of Object.entries(optionalDeps)) {
    const entry = lock.packages?.[`node_modules/${name}`];
    if (!entry?.version) {
      missing.push(`node_modules/${name}`);
      continue;
    }
    if (entry.version !== version) {
      missing.push(`${name}@${version} (lock has ${entry.version})`);
    }
  }

  return missing;
}
