#!/usr/bin/env node
// Dev helper: build a plugin and install it into the app-data plugins dir, so a
// running app (desktop reads it from disk; `nodra -serve` serves it over HTTP)
// picks it up after a reload — the local test loop before pushing to a registry.
//
// The app-data dir mirrors Tauri's app_data_dir(): dirs::data_dir()/<identifier>,
// with <identifier> read from src-tauri/tauri.conf.json (single source of truth,
// no hand-kept constant). Same dir plugin_install/-serve use.
//
// Usage:
//   node scripts/dev-install.mjs plugins/aws-icons      # one plugin
//   node scripts/dev-install.mjs --all                  # every plugins/* with a manifest
//   node scripts/dev-install.mjs --list                 # show the install dir + installed ids
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  mkdirSync,
  cpSync,
  statSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function bundleIdentifier() {
  const conf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  if (!conf.identifier) throw new Error('no identifier in tauri.conf.json');
  return conf.identifier;
}

// Mirror Rust `dirs::data_dir()` per-OS so the path matches the app exactly.
function osDataDir() {
  const p = platform();
  if (p === 'darwin') return join(homedir(), 'Library', 'Application Support');
  if (p === 'win32') return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  return process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
}

const pluginsDir = join(osDataDir(), bundleIdentifier(), 'plugins');

const hasSource = (abs) =>
  ['index.tsx', 'index.ts', 'src/index.tsx', 'src/index.ts'].some((p) =>
    existsSync(join(abs, p)),
  );

function installOne(dir) {
  const abs = resolve(dir);
  if (!existsSync(join(abs, 'manifest.json'))) {
    console.error('skip (no manifest.json):', dir);
    return false;
  }
  if (!hasSource(abs)) {
    console.error('skip (no index.ts(x) source):', dir);
    return false;
  }
  // Build (no zip needed for a local install).
  execFileSync(process.execPath, [join(root, 'scripts/build-plugin.mjs'), abs, '--no-zip'], {
    stdio: 'inherit',
  });
  const dist = join(abs, 'dist');
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
  const dest = join(pluginsDir, manifest.id);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(dist, dest, { recursive: true });
  console.log(`installed ${manifest.id} -> ${dest}`);
  return true;
}

const args = process.argv.slice(2);

if (args.includes('--list')) {
  console.log('plugins dir:', pluginsDir);
  if (existsSync(pluginsDir)) {
    for (const id of readdirSync(pluginsDir)) {
      if (statSync(join(pluginsDir, id)).isDirectory()) console.log('  -', id);
    }
  } else {
    console.log('  (none installed yet)');
  }
  process.exit(0);
}

let targets;
if (args.includes('--all')) {
  const pluginsRoot = join(root, 'plugins');
  targets = readdirSync(pluginsRoot)
    .map((n) => join(pluginsRoot, n))
    .filter(
      (d) =>
        statSync(d).isDirectory() &&
        existsSync(join(d, 'manifest.json')) &&
        hasSource(d),
    );
} else {
  targets = args.filter((a) => !a.startsWith('--'));
}

if (!targets.length) {
  console.error('usage: node scripts/dev-install.mjs <plugin-dir> | --all | --list');
  process.exit(1);
}

mkdirSync(pluginsDir, { recursive: true });
let ok = 0;
for (const t of targets) {
  try {
    if (installOne(t)) ok++;
  } catch (e) {
    console.error('failed:', t, '-', e.message);
  }
}
console.log(`\n${ok}/${targets.length} plugin(s) installed into ${pluginsDir}`);
console.log('Reload the app (or restart `nodra -serve`) to activate.');
