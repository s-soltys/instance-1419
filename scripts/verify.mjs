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
  console.log('[verify] Asset & Public Voice MANIFEST.json check PASS.');
}

run('node scripts/compile-ink.mjs');
run('npx tsc --noEmit');
run('npx vitest run');
run('node scripts/sim-playthroughs.mjs');
run('node scripts/lint-narrative.mjs');
verifyAssetManifest();
run('npx vite build');
run('node scripts/e2e-visual.mjs');
console.log('\n[verify] ALL 8 GATES PASSED.');
