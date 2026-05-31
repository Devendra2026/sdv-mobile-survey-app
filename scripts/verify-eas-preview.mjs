/**
 * Run before `eas build --profile preview` to catch install/launch crash causes locally.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REQUIRED_REACT = '19.1.0';
const LINUX_OPTIONAL = ['utf-8-validate-5.0.10', 'yaml-2.9.0'];
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

const envLocalPath = '.env.local';
if (existsSync(envLocalPath)) {
  const envLocal = readFileSync(envLocalPath, 'utf8');
  const localPk = envLocal.match(/^EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=(.+)$/m)?.[1]?.trim();
  if (localPk) {
    try {
      const easOut = execSync('npx eas env:list --environment preview', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
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
          `EAS preview Clerk key does not match .env.local (${easHost ?? 'invalid'} vs ${localHost ?? 'invalid'}). ` +
          'Run: npx eas env:update preview --variable-name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value "<from .env.local>"',
        );
      } else {
        ok(`EAS preview Clerk key matches .env.local (${clerkIssuerFromPublishableKey(localPk)})`);
      }
    } catch (err) {
      fail(`Could not read EAS preview env: ${err instanceof Error ? err.message : err}`);
    }
  }
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

for (const id of LINUX_OPTIONAL) {
  if (!lockRaw.includes(id)) {
    fail(`lockfile missing Linux optional dep marker "${id}" — run npm run lockfile:eas`);
  }
}
if (!failed) ok('Linux EAS optional deps present in lockfile');

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

if (failed) {
  console.error('\n[verify-eas-preview] Fix the issues above, then run: npm run eas:build:android:preview\n');
  process.exit(1);
}

console.log('\n[verify-eas-preview] Ready for EAS preview Android build.\n');
