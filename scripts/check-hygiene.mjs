import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const SRC_DIR = path.join(ROOT, 'src');
const TESTS_DIR = path.join(ROOT, 'tests');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

function walkFiles(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const srcTsFiles = walkFiles(SRC_DIR, ['.ts']).map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
const testTsFiles = walkFiles(TESTS_DIR, ['.ts']).map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
const allTsSet = new Set(srcTsFiles);

let errors = 0;

// 1. Dead / Unimported Source File Check
const importedSrcFiles = new Set();
const IMPORT_RE =
  /(?:import|export)\s+[^'"]*?from\s+['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)|import\s+['"](\.[^'"]+)['"]/g;

for (const relFile of [...srcTsFiles, ...testTsFiles]) {
  const absFile = path.join(ROOT, relFile);
  const srcDir = path.dirname(relFile);
  const content = fs.readFileSync(absFile, 'utf8');
  for (const m of content.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    const resolvedBase = path.posix.normalize(path.posix.join(srcDir, spec));
    for (const candidate of [resolvedBase, `${resolvedBase}.ts`, `${resolvedBase}/index.ts`]) {
      if (allTsSet.has(candidate)) {
        importedSrcFiles.add(candidate);
      }
    }
  }
}

const registrySrc = fs.readFileSync(path.join(ROOT, 'src/engine/minigames/MinigameRegistry.ts'), 'utf8');
const ENTRYPOINT_EXEMPT = new Set(['src/main.ts', 'src/vite-env.d.ts']);

for (const relFile of srcTsFiles) {
  if (ENTRYPOINT_EXEMPT.has(relFile)) continue;
  if (!importedSrcFiles.has(relFile)) {
    console.error(`[check-hygiene] Unimported/orphaned TypeScript module: ${relFile}`);
    errors++;
  }
  if (/^src\/engine\/minigames\/games\/.*Game\.ts$/.test(relFile)) {
    const baseName = path.basename(relFile, '.ts');
    if (!registrySrc.includes(`./games/${baseName}`)) {
      console.error(`[check-hygiene] Minigame file not registered in MinigameRegistry.ts: ${relFile}`);
      errors++;
    }
  }
}

// 2. Orphaned Content JSON Check
const contentDir = path.join(ROOT, 'src', 'content');
const jsonFiles = fs
  .readdirSync(contentDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.posix.join('src/content', f));

const referenceCorpus = [
  ...srcTsFiles.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')),
  ...walkFiles(SCRIPTS_DIR, ['.mjs', '.py']).map((f) => fs.readFileSync(f, 'utf8')),
].join('\n');

for (const relJson of jsonFiles) {
  const base = path.basename(relJson);
  if (!referenceCorpus.includes(base)) {
    console.error(`[check-hygiene] Orphaned content JSON (unreferenced in src/ or scripts/): ${relJson}`);
    errors++;
  }
}

// 3. Zombie Architecture Regression Guard
const ZOMBIE_TOKENS = [
  { token: 'coupled_showcase', allowIn: new Set() },
  { token: 'StuckTimeDirector', allowIn: new Set() },
  { token: 'LatchController', allowIn: new Set() },
  { token: 'requiresRawResidual', allowIn: new Set() },
  { token: 'pareidoliaChance', allowIn: new Set() },
  { token: 'overclockRiskMul', allowIn: new Set() },
  { token: 'choice-affinity-dot', allowIn: new Set() },
  // Only valid in StateStore.ts (v6->v7 save migration) & UIController.ts header doc comment
  { token: 'target_inspect', allowIn: new Set(['src/engine/StateStore.ts', 'src/ui/UIController.ts']) },
];

const scanFiles = walkFiles(SRC_DIR, ['.ts', '.css', '.ink', '.json']).map((f) =>
  path.relative(ROOT, f).replace(/\\/g, '/')
);

for (const relFile of scanFiles) {
  const content = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
  for (const rule of ZOMBIE_TOKENS) {
    if (rule.allowIn.has(relFile)) continue;
    if (content.includes(rule.token)) {
      console.error(`[check-hygiene] Retired zombie architecture token "${rule.token}" found in ${relFile}`);
      errors++;
    }
  }
}

// 4. Dangling unlocksStoryletId & Unused Star/Sky Catalog Check
const anomaliesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/anomalies.json'), 'utf8'));
const storyletsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/storylets.json'), 'utf8'));
const validStoryletIds = new Set((storyletsData.storylets ?? []).map((s) => s.id));

for (const anomaly of anomaliesData.anomalies ?? []) {
  const unlockId = anomaly.postScanEcho?.unlocksStoryletId;
  if (unlockId && !validStoryletIds.has(unlockId)) {
    console.error(
      `[check-hygiene] Dangling postScanEcho.unlocksStoryletId "${unlockId}" on anomaly "${anomaly.id}"`
    );
    errors++;
  }
}

const catalogCandidates = [
  ...walkFiles(path.join(ROOT, 'assets', 'astro'), ['.bin', '.json']),
  ...walkFiles(path.join(ROOT, 'public', 'catalogs'), ['.bin', '.json', '.csv']),
];
for (const catAbs of catalogCandidates) {
  const base = path.basename(catAbs);
  if (!referenceCorpus.includes(base)) {
    console.error(
      `[check-hygiene] Unused astronomy catalog file (unreferenced in src/ or scripts/): ${path.relative(ROOT, catAbs).replace(/\\/g, '/')}`
    );
    errors++;
  }
}

if (errors > 0) {
  console.error(`[check-hygiene] FAILED with ${errors} hygiene issue(s).`);
  process.exit(1);
}

console.log(
  `[check-hygiene] PASS (${srcTsFiles.length} TS modules imported, ${jsonFiles.length} content JSONs active, ${catalogCandidates.length} catalog file(s) active, 0 dangling storylet unlocks, 0 retired zombie symbols).`
);
