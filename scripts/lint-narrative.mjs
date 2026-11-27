import fs from 'node:fs';
import path from 'node:path';
import { dedupeEntries, extractLinesFromInk, sha256File, walkInkFiles } from './voice-extract.mjs';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const COMPILED_DIR = path.join(DIALOGUE_DIR, 'compiled');
const VOICE_SCRIPT = path.join(COMPILED_DIR, 'voice_script.json');
const VOICE_RUNTIME = path.join(COMPILED_DIR, 'voice_runtime.json');
const VOICE_PROFILES_PATH = path.join(ROOT, 'src', 'content', 'voice_profiles.json');
const CHARACTERS_PATH = path.join(ROOT, 'src', 'content', 'characters.json');
const ANOMALIES_PATH = path.join(ROOT, 'src', 'content', 'anomalies.json');
const SHIFTS_PATH = path.join(ROOT, 'src', 'content', 'shifts.json');
const STORYLETS_PATH = path.join(ROOT, 'src', 'content', 'storylets.json');
const UI_COPY_PATH = path.join(ROOT, 'src', 'content', 'ui_copy.json');
const MINIGAMES_DIR = path.join(ROOT, 'src', 'engine', 'minigames');
const UI_DIR = path.join(ROOT, 'src', 'ui');

const charactersJson = JSON.parse(fs.readFileSync(CHARACTERS_PATH, 'utf8'));
const anomaliesJson = JSON.parse(fs.readFileSync(ANOMALIES_PATH, 'utf8'));
const shiftsJson = JSON.parse(fs.readFileSync(SHIFTS_PATH, 'utf8'));
const storyletsJson = JSON.parse(fs.readFileSync(STORYLETS_PATH, 'utf8'));
const uiCopyJson = fs.existsSync(UI_COPY_PATH) ? JSON.parse(fs.readFileSync(UI_COPY_PATH, 'utf8')) : null;

const VALID_SCALE_CLASSES = new Set([
  'planet',
  'star_system',
  'nebula',
  'galaxy',
  'galaxy_cluster',
  'horizon_anomaly',
]);
const VALID_ANOMALY_ROLES = new Set(['baseline', 'boundary_bleed', 'direct_anomaly']);

function extractMinigameCatalogMeta() {
  const registryPath = path.join(MINIGAMES_DIR, 'MinigameRegistry.ts');
  const src = fs.readFileSync(registryPath, 'utf8');
  const scalesById = new Map();
  const entryRx =
    /\b([a-z0-9_]+)\s*:\s*entry\(\s*'([a-z0-9_]+)'[\s\S]*?\[([^\]]+)\]\s*,\s*(?:true|false)\s*,\s*\[[^\]]+\]\s*,\s*\[[^\]]+\]\s*\)/g;
  for (const m of src.matchAll(entryRx)) {
    const id = m[2];
    const rawScales = m[3];
    const scales = new Set(
      [...rawScales.matchAll(/'([a-z0-9_]+)'/g)].map((s) => s[1])
    );
    scalesById.set(id, scales);
  }
  return scalesById;
}

const minigameSupportedScales = extractMinigameCatalogMeta();
const validSpeakers = new Set(Object.keys(charactersJson.characters));
const validMinigames = new Set(minigameSupportedScales.keys());
const validAnomalyIds = new Set(anomaliesJson.anomalies.map((a) => a.id));

const DISALLOWED_IP_TERMS = [/\bMMAcevedo\b/i, /\bqntm\b/i, /\bLena\b/];
const SPEAKER_TAG = /# *speaker:([a-zA-Z0-9_-]+)/g;
const PORTRAIT_TAG = /# *portrait:([a-zA-Z0-9_-]+)/g;
const ID_TAG = /# *id:([a-zA-Z0-9_-]+)/g;
const CHOICE_KIND_TAG = /# *kind:([a-zA-Z0-9_-]+)/g;
const CHOICE_WEIGHT_TAG = /# *weight:([a-zA-Z0-9_-]+)/g;

const VALID_CHOICE_KINDS = new Set(['ask', 'reply', 'action', 'prune']);
const VALID_CHOICE_WEIGHTS = new Set(['explore', 'consequential', 'permanent']);
const INK_WORD_FLOOR = 150;
const INK_WORD_CEILING = 8000;
const TOTAL_INK_WORD_WARNING_CEILING = 45000;
const STRUCTURAL_INK_FILES = new Set(['main.ink', 'shared/vars.ink']);
const VO_CHAR_WARN = 160;
const VO_CHAR_HARD_CAP = 190;

let errors = 0;
const seenLineIds = new Map();

function countInkProseWords(rawInk) {
  const cleanedLines = [];
  for (const rawLine of rawInk.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('===') ||
      trimmed.startsWith('VAR ') ||
      trimmed.startsWith('EXTERNAL ') ||
      trimmed.startsWith('~') ||
      trimmed.startsWith('->') ||
      trimmed.startsWith('<-') ||
      trimmed.startsWith('#') ||
      trimmed === '{' ||
      trimmed === '}' ||
      trimmed.startsWith('- else:') ||
      /^-\s+[a-zA-Z0-9_]+\s*(==|!=|>=|<=|>|<)/.test(trimmed)
    ) {
      continue;
    }
    const noTags = trimmed
      .replace(/#.*$/, '')
      .replace(/^[\*\+]+\s*(\{[^}]*\})?\s*/, '')
      .replace(/->\s*[a-zA-Z0-9_]+\s*$/, '')
      .replace(/\[\[target:[a-z0-9_]+(?:::|\|)([^\]]+)\]\]/gi, '$1')
      .replace(/\[\[(?:warm|cold):([^\]]+)\]\]/gi, '$1');
    cleanedLines.push(noTags);
  }
  const words = cleanedLines.join(' ').match(/\b[a-zA-Z0-9'’-]+\b/g);
  return words ? words.length : 0;
}

// 1. Ink dialogue lint (IP guardrails, valid speakers/portraits, unique line IDs, word budgets, choice enums)
let totalInkWords = 0;
const allInkPaths = walkInkFiles(DIALOGUE_DIR, { includeStructural: true });
for (const fullPath of allInkPaths) {
  const file = path.relative(DIALOGUE_DIR, fullPath).replace(/\\/g, '/');
  const text = fs.readFileSync(fullPath, 'utf8');

  for (const rx of DISALLOWED_IP_TERMS) {
    if (rx.test(text)) {
      console.error(`[lint-narrative] IP boundary violation (${rx}) in ${file}`);
      errors++;
    }
  }

  for (const match of text.matchAll(SPEAKER_TAG)) {
    const id = match[1];
    if (!validSpeakers.has(id)) {
      console.error(`[lint-narrative] Unregistered speaker "${id}" in ${file}`);
      errors++;
    }
  }

  for (const match of text.matchAll(PORTRAIT_TAG)) {
    const id = match[1];
    if (!validSpeakers.has(id)) {
      console.error(`[lint-narrative] Unregistered portrait "${id}" in ${file}`);
      errors++;
    }
  }

  for (const m of text.matchAll(/\[\[target:([a-zA-Z0-9_]+)(?:::|\|)([^\]]+)\]\]/g)) {
    const targetId = m[1];
    if (!validAnomalyIds.has(targetId)) {
      console.error(`[lint-narrative] Invalid [[target:${targetId}|...]] link in ${file}`);
      errors++;
    }
  }

  for (const match of text.matchAll(ID_TAG)) {
    const id = match[1];
    if (seenLineIds.has(id)) {
      console.error(`[lint-narrative] Duplicate # id:${id} in ${file} (already used in ${seenLineIds.get(id)})`);
      errors++;
    } else {
      seenLineIds.set(id, file);
    }
  }

  // Check 8: Per-file Ink word budget (floor & ceiling) — skip structural hubs (main.ink, shared/vars.ink)
  if (!STRUCTURAL_INK_FILES.has(file)) {
    const wordCount = countInkProseWords(text);
    totalInkWords += wordCount;
    if (wordCount < INK_WORD_FLOOR || wordCount > INK_WORD_CEILING) {
      console.error(
        `[lint-narrative] Word budget violation in ${file}: ${wordCount} words (expected ${INK_WORD_FLOOR}..${INK_WORD_CEILING})`
      );
      errors++;
    }
  }

  // Check 9: Choice tag enum integrity (# kind:, # weight:)
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*[\*\+]\s/.test(line)) continue;
    for (const m of line.matchAll(CHOICE_KIND_TAG)) {
      if (!VALID_CHOICE_KINDS.has(m[1])) {
        console.error(`[lint-narrative] Invalid choice # kind:${m[1]} in ${file}`);
        errors++;
      }
    }
    for (const m of line.matchAll(CHOICE_WEIGHT_TAG)) {
      if (!VALID_CHOICE_WEIGHTS.has(m[1])) {
        console.error(`[lint-narrative] Invalid choice # weight:${m[1]} in ${file}`);
        errors++;
      }
    }
  }
}

// 2. Cross-JSON referential integrity & Checks 13–19
if (validMinigames.size === 0) {
  console.error('[lint-narrative] Failed to extract MINIGAME_CATALOG entries from MinigameRegistry.ts');
  errors++;
}

for (const a of anomaliesJson.anomalies) {
  if (!validMinigames.has(a.minigameId)) {
    console.error(`[lint-narrative] Anomaly "${a.id}" references uncurated/unknown minigameId "${a.minigameId}"`);
    errors++;
  }
}

if (!Array.isArray(shiftsJson.shifts) || shiftsJson.shifts.length !== 6) {
  console.error(`[lint-narrative] shifts.json must define exactly 6 shifts (found ${shiftsJson.shifts?.length ?? 0})`);
  errors++;
}

const shiftByAnomalyId = new Map();
const shiftAssignedAnomalies = new Set();
for (const shift of shiftsJson.shifts ?? []) {
  const targets = shift.targetAnomalies ?? [];
  if (targets.length < 2) {
    console.error(`[lint-narrative] Shift ${shift.shift} must define >= 2 targetAnomalies (found ${targets.length})`);
    errors++;
  }
  for (const targetId of targets) {
    if (!validAnomalyIds.has(targetId)) {
      console.error(`[lint-narrative] Shift ${shift.shift} references unknown targetAnomaly "${targetId}"`);
      errors++;
    }
    if (shiftAssignedAnomalies.has(targetId)) {
      console.error(`[lint-narrative] Duplicate shift assignment for anomaly "${targetId}"`);
      errors++;
    }
    shiftAssignedAnomalies.add(targetId);
    shiftByAnomalyId.set(targetId, shift.shift);
  }
}

for (const anomalyId of validAnomalyIds) {
  if (!shiftAssignedAnomalies.has(anomalyId)) {
    console.error(`[lint-narrative] Anomaly "${anomalyId}" is not assigned to any Shift in shifts.json`);
    errors++;
  }
}

const assignedMinigames = new Set(anomaliesJson.anomalies.map((a) => a.minigameId));
for (const mgId of validMinigames) {
  if (!assignedMinigames.has(mgId)) {
    console.error(`[lint-narrative] Minigame "${mgId}" has no anomaly mapping in anomalies.json`);
    errors++;
  }
}

// Multi-file compiled Ink discovery
const compiledInkFiles = fs.existsSync(COMPILED_DIR)
  ? fs.readdirSync(COMPILED_DIR).filter((f) => f.endsWith('.ink.json')).sort()
  : [];
const unionCompiledKnots = new Set();
const compiledStoryTexts = [];
for (const f of compiledInkFiles) {
  const raw = fs.readFileSync(path.join(COMPILED_DIR, f), 'utf8');
  compiledStoryTexts.push(raw);
  const compiled = JSON.parse(raw);
  const rootDict = compiled?.root?.[2] ?? {};
  for (const knotName of Object.keys(rootDict)) {
    unionCompiledKnots.add(knotName);
  }
}
const rawInkCorpus = allInkPaths
  .map((fullPath) => fs.readFileSync(fullPath, 'utf8'))
  .join('\n');

if (compiledInkFiles.length > 0) {
  for (const st of storyletsJson.storylets) {
    if (!unionCompiledKnots.has(st.knot)) {
      console.error(`[lint-narrative] Storylet "${st.id}" points to missing Ink knot "${st.knot}"`);
      errors++;
    }
  }
}

// 3. Anti-HTML rule enforcement in minigames (recursive scan across games/, core/, render/: zero raw <input type="range">)
function scanMinigamesTs(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      scanMinigamesTs(full);
    } else if (item.name.endsWith('.ts')) {
      const src = fs.readFileSync(full, 'utf8');
      if (/type\s*=\s*['"]range['"]/i.test(src)) {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        console.error(`[lint-narrative] Disallowed raw HTML <input type="range"> found in ${rel}`);
        errors++;
      }
    }
  }
}
scanMinigamesTs(MINIGAMES_DIR);

// 4. Codex content canon, IP hygiene, plate manifest & anomaly cross-references
const CODEX_PATH = path.join(ROOT, 'src', 'content', 'codex.json');
const MANIFEST_PATH = path.join(ROOT, 'assets', 'MANIFEST.json');
if (fs.existsSync(CODEX_PATH)) {
  const codexRaw = fs.readFileSync(CODEX_PATH, 'utf8');
  for (const rx of DISALLOWED_IP_TERMS) {
    if (rx.test(codexRaw)) {
      console.error(`[lint-narrative] IP boundary violation (${rx}) in codex.json`);
      errors++;
    }
  }
  const codexJson = JSON.parse(codexRaw);
  const manifestAssets = new Set(
    JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).assets.map((a) => a.path)
  );
  const validCategories = new Set((codexJson.categories ?? []).map((c) => c.id));
  const seenCodexIds = new Set();
  const validCodexUnlockKeys = new Set();

  for (const entry of codexJson.entries ?? []) {
    if (seenCodexIds.has(entry.id)) {
      console.error(`[lint-narrative] Duplicate codex entry id "${entry.id}"`);
      errors++;
    }
    seenCodexIds.add(entry.id);

    if (!validCategories.has(entry.category)) {
      console.error(`[lint-narrative] Codex entry "${entry.id}" uses unknown category "${entry.category}"`);
      errors++;
    }
    if (entry.targetId && !validAnomalyIds.has(entry.targetId)) {
      console.error(`[lint-narrative] Codex entry "${entry.id}" references unknown targetId "${entry.targetId}"`);
      errors++;
    }
    if (entry.plateAsset && !manifestAssets.has(entry.plateAsset)) {
      console.error(`[lint-narrative] Codex entry "${entry.id}" references unmanifested plateAsset "${entry.plateAsset}"`);
      errors++;
    }
    for (const stage of entry.stages ?? []) {
      const cond = stage.unlock ?? {};
      if (cond.codexUnlock) {
        validCodexUnlockKeys.add(cond.codexUnlock);
      }
      if (cond.always && /\b41,802\b|\b93 billion\b|simulation dome|synthetic sky/i.test(stage.text ?? '')) {
        console.error(`[lint-narrative] Codex "always" stage "${entry.id}.${stage.id}" leaks late-game Shift 3–6 spoiler`);
        errors++;
      }
      if (cond.scannedAnomaly && !validAnomalyIds.has(cond.scannedAnomaly)) {
        console.error(`[lint-narrative] Codex stage "${entry.id}.${stage.id}" references unknown scannedAnomaly "${cond.scannedAnomaly}"`);
        errors++;
      }
      if (cond.decodedTarget && !validAnomalyIds.has(cond.decodedTarget)) {
        console.error(`[lint-narrative] Codex stage "${entry.id}.${stage.id}" references unknown decodedTarget "${cond.decodedTarget}"`);
        errors++;
      }
    }
  }

  for (const m of rawInkCorpus.matchAll(/# *codex:([a-zA-Z0-9_-]+)/g)) {
    const codexId = m[1];
    if (!seenCodexIds.has(codexId) && !validCodexUnlockKeys.has(codexId)) {
      console.error(`[lint-narrative] Ink # codex:${codexId} references unknown codex.json entry or codexUnlock key`);
      errors++;
    }
  }
}

// 5. Anti-HTML rule enforcement on player-facing SettingsView & CodexView + Check 10: Zero Warm/Cold spoiler dots in UI
for (const relView of ['src/ui/views/SettingsView.ts', 'src/ui/views/CodexView.ts']) {
  const fullView = path.join(ROOT, relView);
  if (fs.existsSync(fullView)) {
    const viewSrc = fs.readFileSync(fullView, 'utf8');
    if (/type\s*=\s*['"]range['"]/i.test(viewSrc)) {
      console.error(`[lint-narrative] Disallowed raw HTML <input type="range"> found in ${relView}`);
      errors++;
    }
  }
}

function scanUiForSpoilerDots(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      scanUiForSpoilerDots(full);
    } else if (item.name.endsWith('.ts') || item.name.endsWith('.css')) {
      const src = fs.readFileSync(full, 'utf8');
      if (/choice-affinity-dot/.test(src)) {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        console.error(`[lint-narrative] Disallowed Warm/Cold spoiler dot ("choice-affinity-dot") found in ${rel}`);
        errors++;
      }
    }
  }
}
scanUiForSpoilerDots(UI_DIR);

// 6. Voice script audio file coverage + Check 11 (VO length & unvoiced isolation) + Check 12 (1420/1406 voice parity)
let voiceProfiles = null;
if (fs.existsSync(VOICE_PROFILES_PATH)) {
  voiceProfiles = JSON.parse(fs.readFileSync(VOICE_PROFILES_PATH, 'utf8'));
  const profiles = voiceProfiles.profiles ?? {};
  const sib = profiles.sibling_primary;
  const arch = profiles.archive_echo;
  if (!sib || !arch) {
    console.error('[lint-narrative] voice_profiles.json missing sibling_primary or archive_echo');
    errors++;
  } else {
    const sec = profiles.sibling_secondary;
    if (
      sib.voxcpm2?.anchorFile !== arch.voxcpm2?.anchorFile ||
      sib.voxcpm2?.seed !== arch.voxcpm2?.seed
    ) {
      console.error(
        `[lint-narrative] Biological-original VoxCPM2 voice parity broken: sibling_primary (${sib.voxcpm2?.anchorFile}/${sib.voxcpm2?.seed}) != archive_echo (${arch.voxcpm2?.anchorFile}/${arch.voxcpm2?.seed})`
      );
      errors++;
    }
    if (
      sec &&
      (sib.voxcpm2?.anchorFile !== sec.voxcpm2?.anchorFile ||
        sib.voxcpm2?.seed !== sec.voxcpm2?.seed)
    ) {
      console.error(
        `[lint-narrative] Biological-original VoxCPM2 voice parity broken: sibling_primary (${sib.voxcpm2?.anchorFile}/${sib.voxcpm2?.seed}) != sibling_secondary (${sec.voxcpm2?.anchorFile}/${sec.voxcpm2?.seed})`
      );
      errors++;
    }
    if (sib.qwen3?.anchorFile !== arch.qwen3?.anchorFile || sib.qwen3?.seed !== arch.qwen3?.seed) {
      console.error(
        `[lint-narrative] Biological-original Qwen3 voice parity broken: sibling_primary (${sib.qwen3?.anchorFile}/${sib.qwen3?.seed}) != archive_echo (${arch.qwen3?.anchorFile}/${arch.qwen3?.seed})`
      );
      errors++;
    }
    if (sib.kokoroVoice !== arch.kokoroVoice) {
      console.error(
        `[lint-narrative] Biological-original Kokoro fallback mismatch: ${sib.kokoroVoice} != ${arch.kokoroVoice}`
      );
      errors++;
    }
  }
}

const strictVoiceSync =
  process.argv.includes('--release') ||
  process.argv.includes('--strict-voice-sync') ||
  process.env.VOICE_SYNC_STRICT === '1' ||
  process.env.GITHUB_BASE_REF === 'main' ||
  process.env.GITHUB_REF_NAME === 'main' ||
  process.env.GITHUB_EVENT_NAME === 'release';

const BAD_COLLOCATIONS = [
  { rx: /\b(?<!a\s)full\s+(?:100\s*%|hundred\s+percent)\b/i, msg: 'missing article before "full hundred percent / 100%"' },
  { rx: /\ba\s+(?:surface\s+|forgotten\s+)?warmth\b/i, msg: 'uncountable "warmth" used with indefinite article "a"' },
  { rx: /\ba\s+(?:\[\[cold:)?preventive\s+memory\s+compression\b/i, msg: 'uncountable "compression" used with indefinite article "a"' },
  { rx: /\brest\s+cleanly\b/i, msg: 'unidiomatic "Rest cleanly"' },
  { rx: /\b([a-z]{3,})\s+\1\b/i, msg: 'accidental doubled word', allow: new Set(['had', 'that']) },
];

const warnings = [];
function warn(msg) {
  warnings.push(msg);
  console.warn(`[lint-narrative] WARN: ${msg}`);
}

function countWords(text) {
  if (typeof text !== 'string') return 0;
  const tokens = text.trim().match(/\S+/g);
  return tokens ? tokens.length : 0;
}

function checkTextHygiene(label, text) {
  for (const rx of DISALLOWED_IP_TERMS) {
    if (rx.test(text)) {
      console.error(`[lint-narrative] IP boundary violation (${rx}) in ${label}`);
      errors++;
    }
  }
  for (const rule of BAD_COLLOCATIONS) {
    const hit = text.match(rule.rx);
    if (hit && !(rule.allow && rule.allow.has(hit[1]?.toLowerCase()))) {
      console.error(`[lint-narrative] Prose error in ${label}: ${rule.msg} ("${hit[0]}")`);
      errors++;
    }
  }
}

// Check 14 & Check 15: Scale/Role/Plate/SupportedScales + preScanBrief/postScanEcho/proofContribution
const seenStoryFlags = new Set();
for (const a of anomaliesJson.anomalies) {
  // Check 14
  if (!VALID_SCALE_CLASSES.has(a.scaleClass)) {
    console.error(`[lint-narrative] Check 14: Anomaly "${a.id}" has invalid scaleClass "${a.scaleClass}"`);
    errors++;
  }
  if (!VALID_ANOMALY_ROLES.has(a.anomalyRole)) {
    console.error(`[lint-narrative] Check 14: Anomaly "${a.id}" has invalid anomalyRole "${a.anomalyRole}"`);
    errors++;
  }
  if (typeof a.plateId !== 'string' || !a.plateId.trim()) {
    console.error(`[lint-narrative] Check 14: Anomaly "${a.id}" missing non-empty plateId`);
    errors++;
  }
  const supported = minigameSupportedScales.get(a.minigameId);
  if (!supported || !supported.has(a.scaleClass)) {
    console.error(
      `[lint-narrative] Check 14: Anomaly "${a.id}" (${a.scaleClass}) incompatible with minigame "${a.minigameId}" supportedScales=[${[...(supported ?? [])].join(',')}]`
    );
    errors++;
  }

  // Check 15
  const brief = a.preScanBrief ?? {};
  for (const field of ['objective', 'instrumentAction', 'whyNow']) {
    const val = brief[field];
    if (typeof val !== 'string' || !val.trim()) {
      console.error(`[lint-narrative] Check 15: Anomaly "${a.id}" missing preScanBrief.${field}`);
      errors++;
    } else {
      const wc = countWords(val);
      if (wc > 18) {
        console.error(`[lint-narrative] Check 15: Anomaly "${a.id}" preScanBrief.${field} exceeds 18 words (${wc})`);
        errors++;
      }
      checkTextHygiene(`anomalies.${a.id}.preScanBrief.${field}`, val);
    }
  }

  const echo = a.postScanEcho ?? {};
  if (typeof echo.dossierFinding !== 'string' || !echo.dossierFinding.trim()) {
    console.error(`[lint-narrative] Check 15: Anomaly "${a.id}" missing postScanEcho.dossierFinding`);
    errors++;
  } else {
    if (echo.dossierFinding.length > 110) {
      console.error(
        `[lint-narrative] Check 15: Anomaly "${a.id}" postScanEcho.dossierFinding exceeds 110 chars (${echo.dossierFinding.length})`
      );
      errors++;
    }
    checkTextHygiene(`anomalies.${a.id}.postScanEcho.dossierFinding`, echo.dossierFinding);
  }
  if (typeof echo.psycheVoice !== 'string' || !validSpeakers.has(echo.psycheVoice)) {
    console.error(`[lint-narrative] Check 15: Anomaly "${a.id}" has invalid postScanEcho.psycheVoice "${echo.psycheVoice}"`);
    errors++;
  }
  if (typeof echo.psycheLine !== 'string' || !echo.psycheLine.trim()) {
    console.error(`[lint-narrative] Check 15: Anomaly "${a.id}" missing postScanEcho.psycheLine`);
    errors++;
  } else {
    const wc = countWords(echo.psycheLine);
    if (wc > 24) {
      console.error(`[lint-narrative] Check 15: Anomaly "${a.id}" postScanEcho.psycheLine exceeds 24 words (${wc})`);
      errors++;
    }
    checkTextHygiene(`anomalies.${a.id}.postScanEcho.psycheLine`, echo.psycheLine);
  }
  if (typeof echo.storyFlag !== 'string' || !echo.storyFlag.trim()) {
    console.error(`[lint-narrative] Check 15: Anomaly "${a.id}" missing postScanEcho.storyFlag`);
    errors++;
  } else if (seenStoryFlags.has(echo.storyFlag)) {
    console.error(`[lint-narrative] Check 15: Duplicate postScanEcho.storyFlag "${echo.storyFlag}"`);
    errors++;
  } else {
    seenStoryFlags.add(echo.storyFlag);
  }

  const assignedShift = shiftByAnomalyId.get(a.id);
  if (!a.proofContribution || a.proofContribution.phase !== assignedShift) {
    console.error(
      `[lint-narrative] Check 15: Anomaly "${a.id}" proofContribution.phase (${a.proofContribution?.phase}) != assigned shift (${assignedShift})`
    );
    errors++;
  }
}

// Check 16: shifts.json v2 required/optional invariants & shiftMandate hygiene
const sortedShifts = [...(shiftsJson.shifts ?? [])].sort((a, b) => a.shift - b.shift);
const v2AssignedAnomalies = new Set();
for (const sh of sortedShifts) {
  if (typeof sh.shiftMandate !== 'string' || !sh.shiftMandate.trim()) {
    console.error(`[lint-narrative] Check 16: Shift ${sh.shift} missing shiftMandate`);
    errors++;
  } else {
    checkTextHygiene(`shifts.${sh.shift}.shiftMandate`, sh.shiftMandate);
  }
  const req = Array.isArray(sh.requiredTargets) ? sh.requiredTargets : [];
  const opt = Array.isArray(sh.optionalTargets) ? sh.optionalTargets : [];
  const all = Array.isArray(sh.targetAnomalies) ? sh.targetAnomalies : [];
  const maxReq = sh.shift === 1 ? 3 : 2;
  if (req.length < 2 || req.length > maxReq) {
    console.error(`[lint-narrative] Check 16: Shift ${sh.shift} requiredTargets must have length 2..${maxReq} (found ${req.length})`);
    errors++;
  }
  if (opt.length < 1 || opt.length > 2) {
    console.error(`[lint-narrative] Check 16: Shift ${sh.shift} optionalTargets must have length 1..2 (found ${opt.length})`);
    errors++;
  }
  const reqSet = new Set(req);
  if (reqSet.size !== req.length || opt.some((id) => reqSet.has(id)) || new Set(opt).size !== opt.length) {
    console.error(`[lint-narrative] Check 16: Shift ${sh.shift} requiredTargets and optionalTargets must be disjoint`);
    errors++;
  }
  const combined = [...req, ...opt];
  if (combined.length !== all.length || combined.some((id, idx) => all[idx] !== id)) {
    console.error(`[lint-narrative] Check 16: Shift ${sh.shift} targetAnomalies must equal [...requiredTargets, ...optionalTargets]`);
    errors++;
  }
  for (const id of combined) {
    if (v2AssignedAnomalies.has(id)) {
      console.error(`[lint-narrative] Check 16: Duplicate anomaly "${id}" in Shift ${sh.shift}`);
      errors++;
    }
    v2AssignedAnomalies.add(id);
  }
}
if (v2AssignedAnomalies.size !== anomaliesJson.anomalies.length) {
  console.error(
    `[lint-narrative] Check 16: Shift required/optional targets cover ${v2AssignedAnomalies.size} anomalies (expected ${anomaliesJson.anomalies.length})`
  );
  errors++;
}

// Check 17: Monotonic skyRevealTier & anomalyPhase across Shifts 1..6
if (sortedShifts.length === 6) {
  for (let i = 0; i < sortedShifts.length; i++) {
    const sh = sortedShifts[i];
    const sky = sh.skyRevealTier;
    const anom = sh.anomalyPhase;
    if (!sky || typeof sky.maxMagnitude !== 'number' || typeof sky.starBudget !== 'number') {
      console.error(`[lint-narrative] Check 17: Shift ${sh.shift} missing skyRevealTier numeric fields`);
      errors++;
    }
    if (!anom || anom.fractalStage !== sh.shift || typeof anom.skyShellOpacity !== 'number' || typeof anom.minigameBleedIntensity !== 'number') {
      console.error(`[lint-narrative] Check 17: Shift ${sh.shift} invalid anomalyPhase (fractalStage=${anom?.fractalStage})`);
      errors++;
    }
    if (i === 0 && anom && anom.skyShellOpacity !== 0) {
      console.error(`[lint-narrative] Check 17: Shift 1 anomalyPhase.skyShellOpacity must be 0 (found ${anom.skyShellOpacity})`);
      errors++;
    }
    if (i > 0) {
      const prevSky = sortedShifts[i - 1].skyRevealTier;
      const prevAnom = sortedShifts[i - 1].anomalyPhase;
      if (sky && prevSky && (sky.maxMagnitude < prevSky.maxMagnitude || sky.starBudget < prevSky.starBudget)) {
        console.error(`[lint-narrative] Check 17: Shift ${sh.shift} skyRevealTier is not monotonic`);
        errors++;
      }
      if (
        anom &&
        prevAnom &&
        (anom.skyShellOpacity < prevAnom.skyShellOpacity || anom.minigameBleedIntensity < prevAnom.minigameBleedIntensity)
      ) {
        console.error(`[lint-narrative] Check 17: Shift ${sh.shift} anomalyPhase is not monotonic`);
        errors++;
      }
    }
  }
  const s1Sky = sortedShifts[0].skyRevealTier;
  const s6Sky = sortedShifts[5].skyRevealTier;
  if (s1Sky && s6Sky && (s6Sky.maxMagnitude <= s1Sky.maxMagnitude || s6Sky.starBudget <= s1Sky.starBudget)) {
    console.error('[lint-narrative] Check 17: Shift 6 skyRevealTier must strictly exceed Shift 1');
    errors++;
  }
}

// Check 18: Anti-premature-spoiler guard on Shift 1-2 baseline briefs/echoes & ui_copy detailFirst
const PREMATURE_SPOILER_RX = /\b(?:impossible\s+geometry|93[- ]billion|93\s*BLY|recursive\s+enclosure|spherical\s+enclosure)\b/i;
for (const a of anomaliesJson.anomalies) {
  const shNum = shiftByAnomalyId.get(a.id);
  if ((shNum === 1 || shNum === 2) && a.anomalyRole === 'baseline') {
    const texts = [
      ['preScanBrief.objective', a.preScanBrief?.objective ?? ''],
      ['preScanBrief.instrumentAction', a.preScanBrief?.instrumentAction ?? ''],
      ['preScanBrief.whyNow', a.preScanBrief?.whyNow ?? ''],
      ['postScanEcho.dossierFinding', a.postScanEcho?.dossierFinding ?? ''],
      ['postScanEcho.psycheLine', a.postScanEcho?.psycheLine ?? ''],
    ];
    for (const [fld, txt] of texts) {
      if (PREMATURE_SPOILER_RX.test(txt)) {
        console.error(`[lint-narrative] Check 18: Premature spoiler leak in Shift ${shNum} baseline "${a.id}" ${fld}: "${txt}"`);
        errors++;
      }
    }
  }
}
const detailFirst = uiCopyJson?.statusAlerts?.targetDecoded?.detailFirst ?? '';
if (PREMATURE_SPOILER_RX.test(detailFirst)) {
  console.error(`[lint-narrative] Check 18: Premature spoiler leak in ui_copy.json statusAlerts.targetDecoded.detailFirst: "${detailFirst}"`);
  errors++;
}

// Check 19: Multi-file Ink coverage for implemented shifts + project word-count budget warning
const combinedInkText = `${rawInkCorpus}\n${compiledStoryTexts.join('\n')}`;
for (const sh of sortedShifts) {
  if (sh.status !== 'implemented') continue;
  const hooks = sh.narrativeHooks ?? {};
  for (const hookKey of ['openingKnot', 'postRequiredKnot', 'dreamKnot']) {
    const knotName = hooks[hookKey];
    if (!knotName || !unionCompiledKnots.has(knotName)) {
      console.error(`[lint-narrative] Check 19: Implemented Shift ${sh.shift} missing compiled Ink knot for narrativeHooks.${hookKey} ("${knotName}")`);
      errors++;
    }
  }
  const hasStoryletForShift = (storyletsJson.storylets ?? []).some((st) => {
    const c = st.conditions ?? {};
    if (c.exactShift !== undefined) return c.exactShift === sh.shift;
    const minS = c.minShift ?? 1;
    const maxS = c.maxShift ?? 6;
    return sh.shift >= minS && sh.shift <= maxS;
  });
  if (!hasStoryletForShift) {
    console.error(`[lint-narrative] Check 19: Implemented Shift ${sh.shift} has no matching entry in storylets.json`);
    errors++;
  }
  const shiftFlags = (sh.targetAnomalies ?? [])
    .map((id) => anomaliesJson.anomalies.find((a) => a.id === id)?.postScanEcho?.storyFlag)
    .filter(Boolean);
  const refsTargetFlag = shiftFlags.some((flag) => combinedInkText.includes(flag));
  const refsShiftScanState =
    combinedInkText.includes(`shift${sh.shift}_optional_scan`) ||
    combinedInkText.includes(`shift_${sh.shift}_scan`) ||
    combinedInkText.includes('shift_required_done') ||
    combinedInkText.includes('shift_optional_done') ||
    (hooks.postRequiredKnot ? unionCompiledKnots.has(hooks.postRequiredKnot) : false);
  if (!refsTargetFlag && !refsShiftScanState) {
    console.error(`[lint-narrative] Check 19: Implemented Shift ${sh.shift} has no Ink reference to target storyFlags or shift scan state`);
    errors++;
  }
}
if (totalInkWords > TOTAL_INK_WORD_WARNING_CEILING) {
  warn(`Total project Ink word count (${totalInkWords}) exceeds ${TOTAL_INK_WORD_WARNING_CEILING.toLocaleString()}-word pacing budget.`);
}

let softLongVoLines = 0;
const extractedInkEntries = [];
if (fs.existsSync(VOICE_PROFILES_PATH) && fs.existsSync(VOICE_SCRIPT)) {
  const vs = JSON.parse(fs.readFileSync(VOICE_SCRIPT, 'utf8'));
  const profiles = voiceProfiles?.profiles ?? {};
  const provider = vs.provider ?? voiceProfiles.defaultProvider ?? 'voxcpm2';

  for (const fullPath of walkInkFiles(DIALOGUE_DIR, { includeStructural: false })) {
    const file = path.relative(DIALOGUE_DIR, fullPath).replace(/\\/g, '/');
    const lines = extractLinesFromInk(fullPath, voiceProfiles, provider, { includeMeta: true });
    for (const entry of lines) {
      extractedInkEntries.push({ ...entry, file });
      if (entry._meta?.hasDynamicInterpolation) {
        console.error(
          `[lint-narrative] Dynamic Ink "{var}" interpolation inside voiced line "${entry.lineId}" (${file}:${entry._meta.lineNum}); use static conditional branches instead.`
        );
        errors++;
      }
      if (!entry._meta?.hasExplicitId) {
        warn(`Voiced line at ${file}:${entry._meta?.lineNum} lacks an explicit # id: tag (generated "${entry.lineId}").`);
      }
      const quoteCount = (entry.text.match(/"/g) ?? []).length;
      if (quoteCount % 2 === 1 && !entry.text.startsWith('"...') && !entry.text.endsWith('..."')) {
        console.error(`[lint-narrative] Unbalanced quotation marks in voiced line "${entry.lineId}" (${file}:${entry._meta?.lineNum})`);
        errors++;
      }
    }

    // Prose collocations, em-dash density, and burst/choice pacing checks per .ink file
    const rawInk = fs.readFileSync(fullPath, 'utf8');
    const rawLines = rawInk.split(/\r?\n/);
    let spokenLineCount = 0;
    let emDashLines = 0;
    let currentKnotName = 'root';
    let currentBurst = 0;
    let inFunc = false;
    let activeChoiceGroup = 0;
    const burstStack = [];
    const knotEntryBursts = new Map();
    const knotChainTargets = [];

    for (let idx = 0; idx < rawLines.length; idx++) {
      const ln = idx + 1;
      const t = rawLines[idx].trim();
      if (!t || t.startsWith('//')) continue;
      if (t.startsWith('===')) {
        const m = t.match(/^===\s*(function\s+)?([a-zA-Z0-9_]+)/);
        inFunc = Boolean(m?.[1]);
        currentKnotName = m?.[2] ?? currentKnotName;
        currentBurst = 0;
        activeChoiceGroup = 0;
        burstStack.length = 0;
        continue;
      }
      if (inFunc) continue;
      if (t.startsWith('*') || t.startsWith('+')) {
        currentBurst = 0;
        activeChoiceGroup++;
        const condMatch = t.match(/^[\*\+]+\s*\{([^}]+)\}/);
        const cond = condMatch?.[1]?.trim() ?? '';
        if (!cond && activeChoiceGroup > 5) {
          warn(`${file}:${ln} (${currentKnotName}) has ${activeChoiceGroup} unconditional choice lines in one block (target <=5).`);
        }
        const choiceText = t.replace(/#.*$/, '');
        for (const rule of BAD_COLLOCATIONS) {
          const hit = choiceText.match(rule.rx);
          if (hit && !(rule.allow && rule.allow.has(hit[1]?.toLowerCase()))) {
            console.error(`[lint-narrative] Prose error in ${file}:${ln}: ${rule.msg} ("${hit[0]}")`);
            errors++;
          }
        }
        continue;
      }
      if (t.startsWith('->')) {
        const targetMatch = t.match(/^->\s*([a-zA-Z0-9_]+)/);
        if (targetMatch && targetMatch[1] !== 'DONE' && currentBurst > 0) {
          knotChainTargets.push({ from: currentKnotName, to: targetMatch[1], preBurst: currentBurst, line: ln });
        }
        activeChoiceGroup = 0;
        continue;
      }
      if (t === '{') {
        burstStack.push({ base: currentBurst, max: currentBurst });
        activeChoiceGroup = 0;
        continue;
      }
      if (t.startsWith('- ')) {
        if (burstStack.length > 0) {
          const top = burstStack[burstStack.length - 1];
          top.max = Math.max(top.max, currentBurst);
          currentBurst = top.base;
        }
        activeChoiceGroup = 0;
        continue;
      }
      if (t === '}') {
        if (burstStack.length > 0) {
          const top = burstStack.pop();
          currentBurst = Math.max(top.max, currentBurst);
        }
        activeChoiceGroup = 0;
        continue;
      }
      if (t.startsWith('#') || t.startsWith('VAR ') || t.startsWith('EXTERNAL ') || t.startsWith('~')) {
        continue;
      }

      // Dialogue/prose line
      activeChoiceGroup = 0;
      const proseOnly = t.replace(/#.*$/, '').trim();
      if (!proseOnly) continue;
      spokenLineCount++;
      if (proseOnly.includes('—')) emDashLines++;
      currentBurst++;
      if (!knotEntryBursts.has(currentKnotName)) {
        knotEntryBursts.set(currentKnotName, currentBurst);
      } else {
        knotEntryBursts.set(currentKnotName, Math.max(knotEntryBursts.get(currentKnotName), currentBurst));
      }
      if (currentBurst > 3) {
        warn(`${file}:${ln} (${currentKnotName}) reaches ${currentBurst} uninterrupted lines before a player choice (target 1–3).`);
      }

      for (const rule of BAD_COLLOCATIONS) {
        const hit = proseOnly.match(rule.rx);
        if (hit && !(rule.allow && rule.allow.has(hit[1]?.toLowerCase()))) {
          console.error(`[lint-narrative] Prose error in ${file}:${ln}: ${rule.msg} ("${hit[0]}")`);
          errors++;
        }
      }
    }

    if (spokenLineCount > 0 && emDashLines / spokenLineCount > 0.35) {
      warn(`${file} uses em-dashes in ${emDashLines}/${spokenLineCount} lines (${Math.round((emDashLines / spokenLineCount) * 100)}%, target <=35%).`);
    }
  }

  // Check ui_copy.json for objective bad collocations
  const uiCopyPath = path.join(ROOT, 'src', 'content', 'ui_copy.json');
  if (fs.existsSync(uiCopyPath)) {
    const uiRaw = fs.readFileSync(uiCopyPath, 'utf8');
    for (const rule of BAD_COLLOCATIONS) {
      const hit = uiRaw.match(rule.rx);
      if (hit && !(rule.allow && rule.allow.has(hit[1]?.toLowerCase()))) {
        console.error(`[lint-narrative] Prose error in ui_copy.json: ${rule.msg} ("${hit[0]}")`);
        errors++;
      }
    }
  }

  // Check voice_script.json integrity + .ink sync
  const dedupedInk = dedupeEntries(extractedInkEntries);
  const inkById = new Map(dedupedInk.map((e) => [e.lineId, e]));
  const vsById = new Map((vs.lines ?? []).map((l) => [l.lineId, l]));
  const syncIssues = [];

  for (const [lineId, inkEntry] of inkById) {
    const rec = vsById.get(lineId);
    if (!rec) {
      syncIssues.push(`missing from voice_script.json: "${lineId}"`);
      continue;
    }
    if (rec.text !== inkEntry.text || rec.spokenText !== inkEntry.spokenText) {
      syncIssues.push(`text/spokenText changed for "${lineId}"`);
    } else if (rec.speaker !== inkEntry.speaker || rec.emotion !== inkEntry.emotion) {
      syncIssues.push(`speaker/emotion changed for "${lineId}"`);
    } else if (rec.synthHash !== inkEntry.synthHash) {
      syncIssues.push(`synthHash stale for "${lineId}" (${rec.synthHash} != ${inkEntry.synthHash})`);
    }
  }
  for (const lineId of vsById.keys()) {
    if (!inkById.has(lineId)) {
      syncIssues.push(`stale extra entry in voice_script.json: "${lineId}"`);
    }
  }

  for (const line of vs.lines ?? []) {
    const speakerProfile = profiles[line.speaker];
    if (speakerProfile && speakerProfile.voiced === false) {
      console.error(`[lint-narrative] Unvoiced speaker "${line.speaker}" emitted into voice_script.json (${line.lineId})`);
      errors++;
    }
    const charLen = (line.text ?? '').length;
    if (charLen > VO_CHAR_HARD_CAP) {
      console.error(
        `[lint-narrative] Voiced line "${line.lineId}" exceeds ${VO_CHAR_HARD_CAP}-char hard cap (${charLen} chars)`
      );
      errors++;
    } else if (charLen > VO_CHAR_WARN) {
      softLongVoLines++;
    }
    const mp3Path = path.join(ROOT, 'public', line.audioFile);
    if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size <= 512) {
      if (strictVoiceSync) {
        console.error(`[lint-narrative] Missing or corrupt voice audio for lineId "${line.lineId}": ${line.audioFile}`);
        errors++;
      } else {
        syncIssues.push(`missing voice MP3 for "${line.lineId}" (${line.audioFile})`);
      }
    } else if (strictVoiceSync && line.audioSha256 && sha256File(mp3Path) !== line.audioSha256) {
      syncIssues.push(`MP3 file sha256 mismatch on disk for "${line.lineId}"`);
    }
  }

  if (strictVoiceSync) {
    if (!fs.existsSync(VOICE_RUNTIME)) {
      console.error('[lint-narrative] Missing compiled voice_runtime.json (--release gate). Run `npm run generate:voices`.');
      errors++;
    } else {
      const vr = JSON.parse(fs.readFileSync(VOICE_RUNTIME, 'utf8'));
      const vrById = vr.byId ?? {};
      for (const line of vs.lines ?? []) {
        if (!vrById[line.lineId]) {
          syncIssues.push(`missing from voice_runtime.json: "${line.lineId}"`);
        }
      }
    }
  }

  if (syncIssues.length > 0) {
    const sample = syncIssues.slice(0, 6).join('; ') + (syncIssues.length > 6 ? ` (+${syncIssues.length - 6} more)` : '');
    const msg = `Voice-sync drift (${syncIssues.length} issue(s)): ${sample}. Run \`npm run generate:voices\`.`;
    if (strictVoiceSync) {
      console.error(`[lint-narrative] ERROR (strict voice-sync): ${msg}`);
      errors++;
    } else {
      warn(`Draft voice-sync drift (allowed on draft branches; hard-blocked on main): ${msg}`);
    }
  }
}

// 7. Music catalog referential integrity & MP3 coverage
const MUSIC_CATALOG_PATH = path.join(ROOT, 'src', 'content', 'music_catalog.json');
if (fs.existsSync(MUSIC_CATALOG_PATH)) {
  const mc = JSON.parse(fs.readFileSync(MUSIC_CATALOG_PATH, 'utf8'));
  const coldStems = mc.coldStems ?? {};
  const cues = mc.cues ?? {};
  for (const stem of Object.values(coldStems)) {
    const mp3Path = path.join(ROOT, 'public', stem.file);
    if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size <= 4096) {
      console.error(`[lint-narrative] Missing or corrupt cold stem audio "${stem.id}": ${stem.file}`);
      errors++;
    }
  }
  for (const cue of Object.values(cues)) {
    if (!coldStems[cue.coldStem]) {
      console.error(`[lint-narrative] Music cue "${cue.id}" references missing coldStem "${cue.coldStem}"`);
      errors++;
    }
    const mp3Path = path.join(ROOT, 'public', cue.file);
    if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size <= 4096) {
      console.error(`[lint-narrative] Missing or corrupt music cue audio "${cue.id}": ${cue.file}`);
      errors++;
    }
  }
  for (const mgId of validMinigames) {
    const mapped = mc.routing?.minigames?.[mgId];
    if (!mapped || !cues[mapped]) {
      console.error(`[lint-narrative] Minigame "${mgId}" missing valid music_catalog routing`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`[lint-narrative] FAILED with ${errors} issue(s).`);
  process.exit(1);
}

if (softLongVoLines > 0) {
  console.log(`[lint-narrative] Note: ${softLongVoLines} voiced line(s) sit in soft ${VO_CHAR_WARN + 1}..${VO_CHAR_HARD_CAP} char range (under ${VO_CHAR_HARD_CAP} hard cap).`);
}
console.log(
  `[lint-narrative] PASS (${totalInkWords} Ink words across ${compiledInkFiles.length} compiled Ink file(s), ${seenLineIds.size} unique line IDs, choice tags, Checks 13-19 cohesion/spoiler/scale contracts, 1420/1406 voice parity, anti-HTML & zero spoiler dots, Codex, VO & Lyria music verified).`
);
