import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const COMPILED_STORY = path.join(DIALOGUE_DIR, 'compiled', 'spike_shift1.ink.json');
const VOICE_SCRIPT = path.join(DIALOGUE_DIR, 'compiled', 'voice_script.json');
const VOICE_PROFILES_PATH = path.join(ROOT, 'src', 'content', 'voice_profiles.json');
const CHARACTERS_PATH = path.join(ROOT, 'src', 'content', 'characters.json');
const ANOMALIES_PATH = path.join(ROOT, 'src', 'content', 'anomalies.json');
const SHIFTS_PATH = path.join(ROOT, 'src', 'content', 'shifts.json');
const STORYLETS_PATH = path.join(ROOT, 'src', 'content', 'storylets.json');
const MINIGAMES_DIR = path.join(ROOT, 'src', 'engine', 'minigames');
const UI_DIR = path.join(ROOT, 'src', 'ui');

const charactersJson = JSON.parse(fs.readFileSync(CHARACTERS_PATH, 'utf8'));
const anomaliesJson = JSON.parse(fs.readFileSync(ANOMALIES_PATH, 'utf8'));
const shiftsJson = JSON.parse(fs.readFileSync(SHIFTS_PATH, 'utf8'));
const storyletsJson = JSON.parse(fs.readFileSync(STORYLETS_PATH, 'utf8'));

const validSpeakers = new Set(Object.keys(charactersJson.characters));
const validMinigames = new Set([
  'wave_shaper',
  'constellation_recall',
  'pulsar_echo',
  'lens_focus',
  'light_dispersion',
  'blink_spotter',
  'gravity_slingshot',
  'exoplanet_transit',
  'spectral_prism',
  'radio_triangulation',
  'coronagraph_mask',
  'polarization_filter',
  'exposure_stacker',
  'binary_mass_scale',
  'cepheid_ladder',
  'supernova_echoes',
  'horizon_seam_stitcher',
  'michelson_fringe',
  'multiband_loupe',
  'einstein_cross',
  'parallax_depth',
]);
const validAnomalyIds = new Set(anomaliesJson.anomalies.map((a) => a.id));

const DISALLOWED_IP_TERMS = [/\bMMAcevedo\b/i, /\bqntm\b/i, /\bLena\b/];
const SPEAKER_TAG = /# *speaker:([a-zA-Z0-9_-]+)/g;
const PORTRAIT_TAG = /# *portrait:([a-zA-Z0-9_-]+)/g;
const ID_TAG = /# *id:([a-zA-Z0-9_-]+)/g;
const CHOICE_KIND_TAG = /# *kind:([a-zA-Z0-9_-]+)/g;
const CHOICE_WEIGHT_TAG = /# *weight:([a-zA-Z0-9_-]+)/g;

const VALID_CHOICE_KINDS = new Set(['ask', 'reply', 'action', 'prune']);
const VALID_CHOICE_WEIGHTS = new Set(['explore', 'consequential', 'permanent']);
const INK_WORD_FLOOR = 1200;
const INK_WORD_CEILING = 12000;
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
      .replace(/\[\[(?:warm|cold):([^\]]+)\]\]/gi, '$1');
    cleanedLines.push(noTags);
  }
  const words = cleanedLines.join(' ').match(/\b[a-zA-Z0-9'’-]+\b/g);
  return words ? words.length : 0;
}

// 1. Ink dialogue lint (IP guardrails, valid speakers/portraits, unique line IDs, word budgets, choice enums)
let totalInkWords = 0;
for (const file of fs.readdirSync(DIALOGUE_DIR)) {
  if (!file.endsWith('.ink')) continue;
  const fullPath = path.join(DIALOGUE_DIR, file);
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

  for (const match of text.matchAll(ID_TAG)) {
    const id = match[1];
    if (seenLineIds.has(id)) {
      console.error(`[lint-narrative] Duplicate # id:${id} in ${file} (already used in ${seenLineIds.get(id)})`);
      errors++;
    } else {
      seenLineIds.set(id, file);
    }
  }

  // Check 8: Per-file Ink word budget (floor & ceiling)
  const wordCount = countInkProseWords(text);
  totalInkWords += wordCount;
  if (wordCount < INK_WORD_FLOOR || wordCount > INK_WORD_CEILING) {
    console.error(
      `[lint-narrative] Word budget violation in ${file}: ${wordCount} words (expected ${INK_WORD_FLOOR}..${INK_WORD_CEILING})`
    );
    errors++;
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

// 2. Cross-JSON referential integrity & Check 13: 6-Shift & 21-Instrument Coverage Guard
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

if (fs.existsSync(COMPILED_STORY)) {
  const compiled = JSON.parse(fs.readFileSync(COMPILED_STORY, 'utf8'));
  const rootDict = compiled?.root?.[2] ?? {};
  for (const st of storyletsJson.storylets) {
    if (!(st.knot in rootDict)) {
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

let softLongVoLines = 0;
if (fs.existsSync(VOICE_SCRIPT)) {
  const vs = JSON.parse(fs.readFileSync(VOICE_SCRIPT, 'utf8'));
  const profiles = voiceProfiles?.profiles ?? {};
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
      console.error(`[lint-narrative] Missing or corrupt voice audio for lineId "${line.lineId}": ${line.audioFile}`);
      errors++;
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
  `[lint-narrative] PASS (${totalInkWords} Ink words, ${seenLineIds.size} unique line IDs, choice tags, 6-shift/21-instrument map, 1420/1406 voice parity, anti-HTML & zero spoiler dots, Codex, VO & Lyria music verified).`
);
