/**
 * Run before `eas build --profile preview` to catch install/launch crash causes locally.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  missingLinuxOptionalMarkers,
  readRootOptionalDependencies,
} from './eas-lockfile-optional.mjs';
import { parseEnvFile, resolveFleetEnvPath } from './read-env-file.mjs';

const REQUIRED_REACT = '19.1.0';
const EAS_ENV_LIST = 'npx eas-cli env:list --environment preview';
let failed = false;

function fail(msg) {
  console.error(`[verify-eas-preview] ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`[verify-eas-preview] OK — ${msg}`);
}

function clerkIssuerFromPublishableKey(pk) {
  const match = pk.trim().match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64').toString('utf8').replace(/\$$/, '');
  } catch {
    return null;
  }
}

function readEnvVarFromFile(content, name) {
  const line = content.split('\n').find((l) => l.startsWith(`${name}=`));
  if (!line) return null;
  return line.slice(name.length + 1).trim();
}

function resolveMapsKeyFromEnvContent(content) {
  return (
    readEnvVarFromFile(content, 'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY') ??
    readEnvVarFromFile(content, 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY')
  );
}

function resolveMapsKeyFromEasOutput(output) {
  for (const name of ['EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY', 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY']) {
    const line = output.split('\n').find((l) => l.startsWith(`${name}=`));
    if (line) {
      const value = line.slice(name.length + 1).trim();
      if (value) return { name, value };
    }
  }
  return null;
}

function execErrorMessage(err) {
  if (!(err instanceof Error)) return String(err);
  const stderr = 'stderr' in err && typeof err.stderr === 'string' ? err.stderr.trim() : '';
  const stdout = 'stdout' in err && typeof err.stdout === 'string' ? err.stdout.trim() : '';
  const detail = stderr || stdout;
  return detail ? `${err.message}\n${detail}` : err.message;
}

function readEasPreviewEnv() {
  return execSync(EAS_ENV_LIST, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

const envLocalPath = resolveFleetEnvPath(process.cwd());
const envLocalName = envLocalPath.endsWith('.env.prod') ? '.env.prod' : '.env.local';
if (existsSync(envLocalPath)) {
  const fleetEnv = parseEnvFile(envLocalPath);
  const localPk = fleetEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  const localConvexUrl = fleetEnv.EXPO_PUBLIC_CONVEX_URL?.trim();
  const localMapsKey =
    fleetEnv.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY?.trim() ??
    fleetEnv.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  let easOut = '';
  if (localPk || localMapsKey || localConvexUrl) {
    try {
      easOut = readEasPreviewEnv();
    } catch (err) {
      const detail = execErrorMessage(err);
      if (detail.includes("Cannot find module '@expo/env'")) {
        fail(
          "Could not read EAS preview env: app.config.js requires @expo/env. Run: npm install",
        );
      } else {
        fail(`Could not read EAS preview env: ${detail}`);
      }
    }
  }

  if (localPk && easOut) {
    const easLine = easOut
      .split('\n')
      .find((line) => line.startsWith('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='));
    const easPk = easLine?.slice('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='.length).trim();
    if (!easPk) {
      fail('EAS preview missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
    } else if (easPk !== localPk) {
      const localHost = clerkIssuerFromPublishableKey(localPk);
      const easHost = clerkIssuerFromPublishableKey(easPk);
      fail(
        `EAS preview Clerk key does not match ${envLocalName} (${easHost ?? 'invalid'} vs ${localHost ?? 'invalid'}). ` +
        `Run: npm run env:sync:preview`,
      );
    } else {
      const host = clerkIssuerFromPublishableKey(localPk);
      ok(`EAS preview Clerk key matches ${envLocalName} (${host})`);
      if (easPk.startsWith('pk_test_')) {
        console.warn(
          '[verify-eas-preview] Using Clerk development key (pk_test_…) — 100 emails/month limit on field APKs.',
        );
      }
    }
  }

  if (localConvexUrl && easOut) {
    const easLine = easOut.split('\n').find((line) => line.startsWith('EXPO_PUBLIC_CONVEX_URL='));
    const easConvex = easLine?.slice('EXPO_PUBLIC_CONVEX_URL='.length).trim();
    if (!easConvex) {
      fail('EAS preview missing EXPO_PUBLIC_CONVEX_URL — run: npm run env:sync:preview');
    } else if (easConvex !== localConvexUrl) {
      fail(
        `EAS preview Convex URL (${easConvex}) does not match ${envLocalName} (${localConvexUrl}). Run: npm run env:sync:preview`,
      );
    } else {
      ok(`EAS preview Convex URL matches ${envLocalName}`);
    }
  }

  if (localMapsKey) {
    if (easOut) {
      const easMaps = resolveMapsKeyFromEasOutput(easOut);
      if (!easMaps?.value) {
        fail(
          'EAS preview missing EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY (or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY). ' +
          'Run: npm run env:sync:preview',
        );
      } else if (easMaps.value !== localMapsKey) {
        fail(
          `EAS preview Google Maps key does not match ${envLocalName} (${easMaps.name}). ` +
          'Run: npm run env:sync:preview',
        );
      } else {
        ok(`EAS preview Google Maps key matches ${envLocalName}`);
      }
    }
  } else {
    fail(
      `${envLocalName} missing EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY (or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) — required for GPS map preview in field APKs`,
    );
  }
} else {
  fail('Missing .env.prod — copy .env.prod.example to .env.prod and fill in fleet values.');
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lockRaw = readFileSync('package-lock.json', 'utf8');
const lock = JSON.parse(lockRaw);

if (pkg.dependencies.react !== REQUIRED_REACT) {
  fail(`react must be ${REQUIRED_REACT} (matches react-native-renderer). Got ${pkg.dependencies.react}.`);
} else {
  ok(`react ${REQUIRED_REACT}`);
}

if (pkg.dependencies['react-dom'] !== REQUIRED_REACT) {
  fail(`react-dom must be ${REQUIRED_REACT}. Got ${pkg.dependencies['react-dom']}.`);
}

const lockRoot = lock.packages?.[''] ?? lock.dependencies ?? {};
const lockReact = lockRoot.dependencies?.react ?? lockRoot.react;
if (lockReact !== REQUIRED_REACT) {
  fail(`package-lock.json react is ${lockReact ?? 'missing'}; run npm install && npm run lockfile:eas`);
} else {
  ok('package-lock.json react version matches');
}

const optionalDeps = readRootOptionalDependencies();
const missingOptional = missingLinuxOptionalMarkers(lockRaw, optionalDeps);
for (const id of missingOptional) {
  fail(`lockfile missing Linux optional dep "${id}" — run npm run lockfile:eas`);
}
if (Object.keys(optionalDeps).length > 0 && missingOptional.length === 0) {
  ok('Linux EAS optional deps present in lockfile');
}

try {
  execSync('npm ci', { stdio: 'pipe', encoding: 'utf8' });
  ok('npm ci succeeds with postinstall (matches EAS install phase)');
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  fail(
    `npm ci failed — run npm install, then npm run lockfile:eas if needed:\n${out.slice(-800)}`,
  );
}

try {
  execSync('node ./scripts/verify-no-dev-client.mjs preview', { stdio: 'inherit' });
} catch {
  fail('dev-client packages would be linked in preview APK');
}

const androidDir = path.join(process.cwd(), 'android');
if (existsSync(androidDir)) {
  const resDir = path.join(androidDir, 'app', 'src', 'main', 'res');
  const hasSplashLogo =
    existsSync(resDir) &&
    readdirSync(resDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('drawable'))
      .some((d) =>
        existsSync(path.join(resDir, d.name, 'splashscreen_logo.png')),
      );
  if (!hasSplashLogo) {
    fail(
      'android/ exists but is missing splashscreen_logo drawables. Delete android/ and ios/, or run: npx expo prebuild --clean.',
    );
  } else {
    ok('local android/ has splash assets');
  }
}

const easignore = readFileSync('.easignore', 'utf8');
if (!easignore.includes('/android') || !easignore.includes('/ios')) {
  fail('.easignore must list /android and /ios (EAS uses .easignore instead of .gitignore when present)');
} else {
  ok('.easignore excludes native android/ios from EAS upload');
}

if (!pkg.dependencies['@react-native-async-storage/async-storage']) {
  fail(
    '@react-native-async-storage/async-storage must be in package.json (wizard drafts + native autolinking)',
  );
} else {
  ok('@react-native-async-storage/async-storage in package.json');
}

try {
  const out = execSync(
    'npx expo-modules-autolinking react-native-config --platform android --json',
    { encoding: 'utf8', env: { ...process.env, EAS_BUILD_PROFILE: 'preview', EXCLUDE_DEV_CLIENT: '1' } },
  );
  const config = JSON.parse(out);
  const linked = Object.keys(config.dependencies ?? {});
  if (!linked.includes('@react-native-async-storage/async-storage')) {
    fail('AsyncStorage native module not autolinked for Android preview build');
  } else {
    ok('AsyncStorage autolinked on Android');
  }
} catch (err) {
  fail(`autolinking check failed: ${err instanceof Error ? err.message : err}`);
}

if (!failed) {
  try {
    execSync('npx tsx --tsconfig tsconfig.json ./scripts/verify-gps-error-messages.ts', { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    failed = true;
  }
}

if (!failed) {
  try {
    execSync('node ./scripts/verify-clerk-reachability.mjs', { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    failed = true;
  }
}

if (!failed) {
  try {
    execSync('node ./scripts/verify-clerk-convex.mjs --prod', { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    failed = true;
  }
}

if (failed) {
  console.error('\n[verify-eas-preview] Fix the issues above, then run: npm run eas:build:android:preview\n');
  process.exit(1);
}

console.log('\n[verify-eas-preview] Ready for EAS preview Android build.\n');
