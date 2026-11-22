import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

function run(cmd) {
  console.log(`\n==> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
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

  const assetsDir = path.join(ROOT, 'assets');
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (item.name !== 'MANIFEST.json') {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        if (!registered.has(rel)) {
          throw new Error(`Unregistered asset file missing from assets/MANIFEST.json: ${rel}`);
        }
      }
    }
  };
  walk(assetsDir);
  console.log('[verify] Asset MANIFEST.json check PASS.');
}

run('node scripts/compile-ink.mjs');
run('npx tsc --noEmit');
run('node scripts/lint-narrative.mjs');
verifyAssetManifest();
run('npx vite build');
console.log('\n[verify] ALL GATES PASSED.');
