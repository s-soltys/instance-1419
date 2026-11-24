import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const COMPILED_STORY = path.join(DIALOGUE_DIR, 'compiled', 'spike_shift1.ink.json');
const VOICE_SCRIPT = path.join(DIALOGUE_DIR, 'compiled', 'voice_script.json');
const CHARACTERS_PATH = path.join(ROOT, 'src', 'content', 'characters.json');
const ANOMALIES_PATH = path.join(ROOT, 'src', 'content', 'anomalies.json');
const SHIFTS_PATH = path.join(ROOT, 'src', 'content', 'shifts.json');
const STORYLETS_PATH = path.join(ROOT, 'src', 'content', 'storylets.json');
const BALANCE_PATH = path.join(ROOT, 'src', 'content', 'balance.json');
const MINIGAMES_DIR = path.join(ROOT, 'src', 'engine', 'minigames');

const charactersJson = JSON.parse(fs.readFileSync(CHARACTERS_PATH, 'utf8'));
const anomaliesJson = JSON.parse(fs.readFileSync(ANOMALIES_PATH, 'utf8'));
const shiftsJson = JSON.parse(fs.readFileSync(SHIFTS_PATH, 'utf8'));
const storyletsJson = JSON.parse(fs.readFileSync(STORYLETS_PATH, 'utf8'));
const balanceJson = JSON.parse(fs.readFileSync(BALANCE_PATH, 'utf8'));

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

let errors = 0;
const seenLineIds = new Map();

// 1. Ink dialogue lint (IP guardrails, valid speakers/portraits, unique line IDs, clean # vo:true lines)
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

  // Ban dynamic Ink {...} interpolation inside # vo:true spoken lines
  const lines = text.split(/\r?\n/);
  let pendingVoTrue = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('#')) {
      if (/# *vo:true\b/i.test(trimmed)) pendingVoTrue = true;
      continue;
    }
    const inlineVo = /# *vo:true\b/i.test(trimmed);
    const isSpoken = !trimmed.startsWith('VAR ') && !trimmed.startsWith('EXTERNAL ') && !trimmed.startsWith('~') && !trimmed.startsWith('->') && !trimmed.startsWith('*') && !trimmed.startsWith('+') && !trimmed.startsWith('===') && trimmed !== '{' && trimmed !== '}' && !trimmed.startsWith('- ');
    if (isSpoken && (pendingVoTrue || inlineVo)) {
      const textOnly = trimmed.split(' #')[0];
      if (/\{[^}]+\}/.test(textOnly)) {
        console.error(`[lint-narrative] # vo:true line contains dynamic {...} interpolation (${file}:${i + 1}): ${textOnly}`);
        errors++;
      }
      pendingVoTrue = false;
    } else if (trimmed.startsWith('*') || trimmed.startsWith('+') || trimmed.startsWith('===')) {
      pendingVoTrue = false;
    }
  }
}

// 2. Cross-JSON referential integrity & shift clock budget
for (const a of anomaliesJson.anomalies) {
  if (!validMinigames.has(a.minigameId)) {
    console.error(`[lint-narrative] Anomaly "${a.id}" references uncurated/unknown minigameId "${a.minigameId}"`);
    errors++;
  }
}

let totalShiftMonths = 0;
for (const shift of shiftsJson.shifts) {
  if (typeof shift.hibernationMonthsElapsed !== 'number') {
    console.error(`[lint-narrative] Shift ${shift.shift} missing numeric hibernationMonthsElapsed`);
    errors++;
  }
  totalShiftMonths += shift.monthsPerShift ?? 0;
  for (const targetId of shift.targetAnomalies) {
    if (!validAnomalyIds.has(targetId)) {
      console.error(`[lint-narrative] Shift ${shift.shift} references unknown targetAnomaly "${targetId}"`);
      errors++;
    }
  }
}
if (totalShiftMonths > balanceJson.startingState.subjectiveMonthsLeft) {
  console.error(
    `[lint-narrative] Sum of shift monthsPerShift (${totalShiftMonths}) exceeds starting subjectiveMonthsLeft (${balanceJson.startingState.subjectiveMonthsLeft})`
  );
  errors++;
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

// 4. Voice script audio file coverage (selective # vo:true when tagged, or all lines otherwise)
if (fs.existsSync(VOICE_SCRIPT)) {
  const vs = JSON.parse(fs.readFileSync(VOICE_SCRIPT, 'utf8'));
  const allLines = vs.lines ?? [];
  const hasKeyFlags = allLines.some((l) => l.voKey === true);
  const requiredLines = hasKeyFlags ? allLines.filter((l) => l.voKey === true) : allLines;

  for (const line of requiredLines) {
    const mp3Path = path.join(ROOT, 'public', line.audioFile);
    if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size <= 512) {
      console.error(`[lint-narrative] Missing or corrupt voice audio for lineId "${line.lineId}": ${line.audioFile}`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`[lint-narrative] FAILED with ${errors} issue(s).`);
  process.exit(1);
}

console.log(
  `[lint-narrative] PASS (speakers, portraits, ${seenLineIds.size} unique line IDs, cross-JSON refs, shift clocks, anti-HTML controls, and selective VO files verified).`
);
