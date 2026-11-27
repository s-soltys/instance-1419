import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

function run(cmd) {
  console.log(`\n==> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

function matchesGlob(relPath, registered) {
  if (registered.has(relPath)) return true;
  for (const pattern of registered) {
    if (pattern.includes('*')) {
      const rx = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$');
      if (rx.test(relPath)) return true;
    }
  }
  return false;
}

function verifyAssetManifest() {
  const manifestPath = path.join(ROOT, 'assets', 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const registered = new Set(manifest.assets.map((a) => a.path));
  const disallowed = new Set(manifest.policy?.disallowed_licenses ?? []);

  for (const entry of manifest.assets) {
    if (disallowed.has(entry.license)) {
      throw new Error(`Disallowed license "${entry.license}" on ${entry.path}`);
    }
  }

  const scanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        scanDir(full);
      } else if (item.name !== 'MANIFEST.json') {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        if (!matchesGlob(rel, registered)) {
          throw new Error(`Unregistered asset file missing from assets/MANIFEST.json: ${rel}`);
        }
      }
    }
  };

  scanDir(path.join(ROOT, 'assets'));
  scanDir(path.join(ROOT, 'public', 'voices'));
  scanDir(path.join(ROOT, 'public', 'music'));
  scanDir(path.join(ROOT, 'public', 'catalogs'));
  console.log('[verify] Asset (incl. astro/*.bin, catalogs), Voice & Music MANIFEST.json check PASS.');
}

const args = new Set(process.argv.slice(2));
const isFast = args.has('--fast');
const isSmoke = args.has('--smoke');
const isRelease = args.has('--release');

run('node scripts/compile-ink.mjs');
run('./node_modules/.bin/tsc --noEmit');
run('./node_modules/.bin/vitest run');
run('node scripts/sim-playthroughs.mjs');
run(isRelease ? 'node scripts/lint-narrative.mjs --release' : 'node scripts/lint-narrative.mjs');
run('node scripts/check-hygiene.mjs');
verifyAssetManifest();
run('./node_modules/.bin/vite build');

if (isFast) {
  console.log('\n[verify] FAST GATES (1–8) PASSED (Playwright E2E deferred to smoke/CI).');
} else if (isSmoke) {
  run('node scripts/e2e-visual.mjs --smoke');
  console.log('\n[verify] SMOKE VERIFY PASSED.');
} else {
  run('node scripts/e2e-visual.mjs');
  console.log('\n[verify] ALL 9 GATES PASSED.');
}
