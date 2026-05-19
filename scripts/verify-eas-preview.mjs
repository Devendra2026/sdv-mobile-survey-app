/**
 * Run before `eas build --profile preview` to catch install/launch crash causes locally.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
  execSync('npm ci --ignore-scripts', { stdio: 'pipe', encoding: 'utf8' });
  ok('npm ci succeeds (package.json + lockfile in sync)');
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  fail(`npm ci failed — fix lockfile before EAS build:\n${out.slice(-800)}`);
}

try {
  execSync('node ./scripts/verify-no-dev-client.mjs preview', { stdio: 'inherit' });
} catch {
  fail('dev-client packages would be linked in preview APK');
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
