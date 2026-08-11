import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = join(projectRoot, 'android');
const keystorePath = '/Users/lihao/Library/Application Support/HS-FPV/keys/hsfpv-betaflight-release.jks';
const keychainService = 'hsfpv-betaflight-android-signing';
const javaHome = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
const androidReleaseGateway = 'https://bf.hs-fpv.com';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error(`Node 24.x is required; found ${process.version}.`);
}

if (!existsSync(keystorePath)) {
  throw new Error(`Local release keystore is missing: ${keystorePath}`);
}

if (!existsSync(join(javaHome, 'bin', 'java'))) {
  throw new Error(`JDK 21 is required; expected it at ${javaHome}.`);
}

function readKeychainPassword(account) {
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-s', keychainService, '-a', account, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  } catch {
    throw new Error(`Missing ${account} in the macOS Keychain service ${keychainService}.`);
  }
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const storePassword = readKeychainPassword('store-password');
const keyPassword = readKeychainPassword('key-password');
const viteCli = join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const capacitorCli = join(projectRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
const gradlew = join(androidRoot, 'gradlew');
const gradleEnv = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${join(javaHome, 'bin')}:${process.env.PATH}`,
};
const viteEnv = {
    ...process.env,
    VITE_NATIVE_APP: "1",
    // Capacitor runs the bundled app on a local origin. Pin the native release
    // to the public gateway so its /api routes reach the proxy backend.
    VITE_BUILD_API_BASE_URL: androidReleaseGateway,
};

run(process.execPath, [viteCli, 'build'], projectRoot, viteEnv);
run(process.execPath, [join(projectRoot, 'capacitor.config.generator.mjs')], projectRoot);
run(process.execPath, [capacitorCli, 'sync', 'android'], projectRoot);
run(
  gradlew,
  [
    'assembleRelease',
    `-Pandroid.injected.signing.store.file=${keystorePath}`,
    '-Pandroid.injected.signing.store.type=pkcs12',
    `-Pandroid.injected.signing.store.password=${storePassword}`,
    '-Pandroid.injected.signing.key.alias=hsfpv-betaflight',
    `-Pandroid.injected.signing.key.password=${keyPassword}`,
  ],
  androidRoot,
  gradleEnv,
);

console.log('Signed APK: android/app/build/outputs/apk/release/app-release.apk');
