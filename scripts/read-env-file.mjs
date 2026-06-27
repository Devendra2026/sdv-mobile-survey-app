import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Remove ` # comment` suffix; preserves `#` inside quoted values. */
function stripInlineComment(value) {
  let inQuote = false;
  let quote = '';
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (!inQuote && (c === '"' || c === "'")) {
      inQuote = true;
      quote = c;
    } else if (inQuote && c === quote) {
      inQuote = false;
    } else if (!inQuote && c === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value.trim();
}

function unquote(value) {
  let val = value.trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  return val.trim();
}

/**
 * Parse a dotenv file into a plain object (does not mutate process.env).
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
export function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = unquote(stripInlineComment(trimmed.slice(eq + 1)));
    if (!val) continue;
    out[key] = val;
  }
  return out;
}

/**
 * Load a dotenv file into process.env (does not override existing vars).
 * @param {string} fileName e.g. `.env.prod`
 * @param {string} [cwd]
 */
export function loadEnvFile(fileName, cwd = process.cwd()) {
  const filePath = join(cwd, fileName);
  const parsed = parseEnvFile(filePath);
  if (Object.keys(parsed).length === 0) return false;
  for (const [key, val] of Object.entries(parsed)) {
    if (!process.env[key]) process.env[key] = val;
  }
  return true;
}

/** @param {string} filePath @param {string} key */
export function readEnvVarFromFile(filePath, key) {
  return parseEnvFile(filePath)[key] ?? null;
}

/** Canonical env file for fleet APK builds (falls back to .env.local). */
export function resolveFleetEnvPath(cwd = process.cwd()) {
  const prod = join(cwd, '.env.prod');
  if (existsSync(prod)) return prod;
  return join(cwd, '.env.local');
}

/** @param {string} cwd */
export function readFleetEnv(cwd = process.cwd()) {
  return parseEnvFile(resolveFleetEnvPath(cwd));
}

/**
 * Env for `npx convex` child processes. When a dotenv file has self-hosted URL + admin
 * key, applies them and unsets CONVEX_DEPLOYMENT (Convex CLI forbids both).
 * @param {string} [envFilePath]
 * @returns {NodeJS.ProcessEnv}
 */
export function buildConvexCliEnv(envFilePath) {
  const convexEnv = { ...process.env };
  if (!envFilePath) return convexEnv;

  const parsed = parseEnvFile(envFilePath);
  const url = parsed.CONVEX_SELF_HOSTED_URL?.trim();
  const adminKey = parsed.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim();

  if (url && adminKey) {
    convexEnv.CONVEX_SELF_HOSTED_URL = url;
    convexEnv.CONVEX_SELF_HOSTED_ADMIN_KEY = adminKey;
    delete convexEnv.CONVEX_DEPLOYMENT;
    return convexEnv;
  }

  const deployment = parsed.CONVEX_DEPLOYMENT?.trim();
  if (deployment) {
    convexEnv.CONVEX_DEPLOYMENT = deployment;
  }

  return convexEnv;
}
