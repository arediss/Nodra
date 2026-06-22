#!/usr/bin/env node
// Build a plugin folder into a self-contained, distributable artifact:
//   plugins/<name>/dist/index.js   (ESM, single file, CSS inlined, no core code)
//   plugins/<name>/dist/manifest.json (+ whitelisted assets)
//   plugins/<name>/plugin.zip      (manifest.json at archive root) + sha256
//
// Shared singletons (React, @xyflow/react, @iconify/react) are provided by the
// host at runtime via window.__nodra, so we mark them external and shim each to
// a CJS module re-exporting globalThis.__nodra.<key> (esbuild adds interop, so
// named exports need not be enumerated). Everything else (dagre, nanoid) is
// inlined; CSS imports are inlined as a self-injecting <style>. Value imports
// from the core (../../src) and subpath imports of shared packages are rejected
// at build time — plugins must reach the core only through the host SDK.
//
// Usage: node scripts/build-plugin.mjs <plugin-dir> [--no-zip] [--dev] [--watch]
//   --watch: rebuild dist/ on every source change (logs "rebuilt <id>"), skip the
//            zip, and keep running — pairs with the in-app "Recharger (dev)" button.
import { build, context } from 'esbuild';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const noZip = argv.includes('--no-zip');
const dev = argv.includes('--dev');
const watch = argv.includes('--watch');
const src = argv.find((a) => !a.startsWith('--'));
if (!src || !existsSync(src)) {
  console.error(
    'usage: node scripts/build-plugin.mjs <plugin-dir> [--no-zip] [--dev] [--watch]',
  );
  process.exit(1);
}
const dir = resolve(src);
const manifestPath = join(dir, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('error: manifest.json not found in', dir);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const entry = ['index.tsx', 'index.ts', 'src/index.tsx', 'src/index.ts']
  .map((p) => join(dir, p))
  .find(existsSync);
if (!entry) {
  console.error('error: no index.ts(x) entry found in', dir);
  process.exit(1);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Specifier -> window.__nodra key (the host's singletons).
const SHARED = {
  react: 'react',
  'react-dom': 'reactDom',
  'react/jsx-runtime': 'jsxRuntime',
  'react/jsx-dev-runtime': 'jsxRuntime',
  '@xyflow/react': 'xyflow',
  '@iconify/react': 'iconify',
};
const SHARED_ROOTS = ['react', 'react-dom', '@xyflow/react', '@iconify/react'];

/** Resolve shared specifiers to a fail-fast CJS shim; forbid core + subpath imports. */
const hostSharedShim = {
  name: 'nodra-host-shared',
  setup(b) {
    const exact = new RegExp('^(' + Object.keys(SHARED).map(esc).join('|') + ')$');
    b.onResolve({ filter: exact }, (a) => ({ path: a.path, namespace: 'nodra-shared' }));
    b.onLoad({ filter: /.*/, namespace: 'nodra-shared' }, (a) => {
      const key = JSON.stringify(SHARED[a.path]);
      return {
        // Fail fast with a clear message rather than exporting undefined.
        contents:
          `const s = globalThis.__nodra && globalThis.__nodra[${key}];` +
          `if (!s) throw new Error('[nodra] host singleton ' + ${key} + ' unavailable — globalThis.__nodra was not set before loading this plugin');` +
          `module.exports = s;`,
        loader: 'js',
      };
    });

    // Subpath of a shared package would bundle a SECOND copy (breaks the single
    // React/@xyflow instance) — reject it (the exact mappings above win first).
    const sub = new RegExp('^(' + SHARED_ROOTS.map(esc).join('|') + ')\\/');
    b.onResolve({ filter: sub }, (a) => {
      if (a.path in SHARED) return undefined;
      return {
        errors: [
          {
            text: `Subpath import "${a.path}" is not allowed — the host provides this package as one shared instance. Import the base package, or use the host SDK.`,
          },
        ],
      };
    });

    // Value imports from the core aren't self-contained (type-only are erased
    // before resolution, so they never reach here).
    b.onResolve({ filter: /\.\.\// }, (a) => {
      if (/(^|\/)src\//.test(a.path)) {
        return {
          errors: [
            {
              text: `Core import "${a.path}" is forbidden in a plugin — reach the core only through the host SDK passed to register(host). (Type-only imports are fine; they are erased.)`,
            },
          ],
        };
      }
      return undefined;
    });
  },
};

// Inline CSS imports as a self-injecting <style>, so the single JS artifact (a
// blob-URL module at runtime) carries its own styles — nothing extra to serve.
const cssInline = {
  name: 'nodra-css-inline',
  setup(b) {
    b.onLoad({ filter: /\.css$/ }, (a) => ({
      contents:
        `(() => { try {` +
        `const s = document.createElement('style');` +
        `s.setAttribute('data-nodra-plugin', ${JSON.stringify(manifest.id)});` +
        `s.textContent = ${JSON.stringify(readFileSync(a.path, 'utf8'))};` +
        `document.head.appendChild(s);` +
        `} catch {} })();`,
      loader: 'js',
    }));
  },
};

const distDir = join(dir, 'dist');

// Write the dist manifest (forcing main: index.js) and copy whitelisted assets.
// Run after EVERY build so dist/ is always a complete, loadable plugin — once for
// a one-shot build, on each rebuild in watch mode.
const ASSET_EXT = /\.(json|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|otf|wasm|txt|md)$/i;
// Repo-management files live next to manifest.json in a standalone plugin repo but
// are NOT plugin assets — never ship them in the loadable dist/ or the zip.
const SKIP = new Set([
  'dist',
  'node_modules',
  'manifest.json',
  'plugin.zip',
  'src',
  'package.json',
  'package-lock.json',
  'README.md',
]);
function writeDistMeta() {
  writeFileSync(
    join(distDir, 'manifest.json'),
    JSON.stringify({ ...manifest, main: 'index.js' }, null, 2),
  );
  // Copy assets by an allow-list of safe types (never ship dotfiles/secrets/source).
  // A flat file must match ASSET_EXT; an `assets/` dir is copied verbatim.
  const skipped = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    if (name === 'index.ts' || name === 'index.tsx') continue;
    if (name === 'assets' || ASSET_EXT.test(name)) {
      cpSync(join(dir, name), join(distDir, name), { recursive: true });
    } else {
      skipped.push(name);
    }
  }
  if (skipped.length) {
    console.warn('skipped (not a whitelisted asset):', skipped.join(', '));
  }
}

// In watch mode, copy meta/assets after each successful rebuild via onEnd, so the
// dist/ folder the app loads from stays complete on every source change.
const distMetaWatch = {
  name: 'nodra-dist-meta',
  setup(b) {
    b.onEnd((result) => {
      if (result.errors.length) return; // a broken build leaves the last good dist
      writeDistMeta();
      console.log(`rebuilt ${manifest.id} -> ${join('dist', 'index.js')}`);
    });
  },
};

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const buildOptions = {
  entryPoints: [entry],
  outfile: join(distDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  plugins: [hostSharedShim, cssInline, ...(watch ? [distMetaWatch] : [])],
};

if (watch) {
  // Watch mode: rebuild on source change, skip the zip, keep running.
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log(`watching ${manifest.id} — Ctrl+C to stop`);
  // Keep the process alive; ctx.watch() does not by itself.
  await new Promise(() => {});
}

// One-shot build (today's behaviour).
await build(buildOptions);
writeDistMeta();

console.log(`built ${manifest.id} -> ${join('dist', 'index.js')}${dev ? ' (dev)' : ''}`);

if (noZip) process.exit(0);

const zip = join(dir, 'plugin.zip');
execFileSync('rm', ['-f', zip]);
execFileSync('zip', ['-r', '-q', zip, '.', '-x', '.DS_Store', '*.swp'], { cwd: distDir });
const sha = createHash('sha256').update(readFileSync(zip)).digest('hex');
console.log(`plugin.zip  sha256: ${sha}`);
