import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const COMPILED_DIR = path.join(DIALOGUE_DIR, 'compiled');
const VOICE_SCRIPT_PATH = path.join(COMPILED_DIR, 'voice_script.json');
const PROFILES_PATH = path.join(ROOT, 'src', 'content', 'voice_profiles.json');
const VOICES_OUT_DIR = path.join(ROOT, 'public', 'voices');
const ANCHORS_DIR = path.join(ROOT, '.voice-anchors');
const VOXCPM2_WORKER = path.join(ROOT, 'scripts', 'generate-voices-voxcpm2.py');
const QWEN3_WORKER = path.join(ROOT, 'scripts', 'generate-voices-qwen3.py');

fs.mkdirSync(COMPILED_DIR, { recursive: true });
fs.mkdirSync(VOICES_OUT_DIR, { recursive: true });

const profilesJson = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
const profiles = profilesJson.profiles ?? {};

const args = process.argv.slice(2);
const providerArg =
  args.find((a) => a.startsWith('--provider='))?.split('=')[1] ??
  profilesJson.defaultProvider ??
  'voxcpm2';
const forceRegen = args.includes('--force');
const forceAnchors = args.includes('--force-anchors');
const skipSttQa = args.includes('--skip-stt-qa');
const noContinuation = args.includes('--no-continuation');
const batchSizeArg = args.find((a) => a.startsWith('--batch-size='))?.split('=')[1];
const idsArg = args.find((a) => a.startsWith('--ids='))?.split('=')[1];
const onlyIds = idsArg ? new Set(idsArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;

export function stripInlineMarkup(text) {
  return text.replace(/\[\[(?:warm|cold):([^\]]+)\]\]/gi, '$1');
}

export function normalizeMatchKey(speaker, text) {
  const cleaned = stripInlineMarkup(text)
    .replace(/\{[^}]+\}/g, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${speaker}|${cleaned}`;
}

function makeLineId(speaker, text) {
  const key = normalizeMatchKey(speaker, text);
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
  return `${speaker}_${hash}`;
}

export function prepareSpokenText(rawText, lineId = '') {
  let out = stripInlineMarkup(rawText)
    .replace(/\[RELATION:SPOUSE_01\]'s/g, 'their')
    .replace(/\[RELATION:SPOUSE_01\]/g, 'your partner')
    .replace(/\{humanity\}/g, 'seventy')
    .replace(/\{max_humanity\}/g, 'seventy eight')
    .replace(/\{chaos_drift\}/g, 'fourteen')
    .replace(/\{subjective_months\}/g, 'twenty four');

  if (/\{[^}]+\}/.test(out)) {
    const unresolved = out.match(/\{[^}]+\}/g);
    console.warn(
      `[generate-voices] WARN unresolved Ink interpolation in ${lineId || 'line'}: ${unresolved?.join(', ')}`
    );
    out = out.replace(/\{[^}]+\}/g, '');
  }

  out = out
    .replace(/^\(ARCHIVE\s*[·•-]\s*\d+\):\s*/i, '')
    .replace(/\bInstance[-\s]1419\b/g, 'Instance fourteen nineteen')
    .replace(/\bInstance[-\s]1420\b/g, 'Instance fourteen twenty')
    .replace(/\bInstance[-\s]1418\b/g, 'Instance fourteen eighteen')
    .replace(/\bInstance[-\s]1411\b/g, 'Instance fourteen eleven')
    .replace(/\bInstance[-\s]1406\b/g, 'Instance fourteen oh six')
    .replace(/\bProbe\s+1419\b/g, 'Probe fourteen nineteen')
    .replace(/\bProbe\s+1420\b/g, 'Probe fourteen twenty')
    .replace(/\bProbe\s+1418\b/g, 'Probe fourteen eighteen')
    .replace(/\bCluster\s+J1419-A\b/g, 'Cluster J fourteen nineteen A')
    .replace(/\bJ1419-A\b/g, 'J fourteen nineteen A')
    .replace(/\bS-04\b/g, 'S zero four')
    .replace(/\bSol[–—-]Centauri\b/g, 'Sol Centauri')
    .replace(/\b1419\b/g, 'fourteen nineteen')
    .replace(/\b1420\b/g, 'fourteen twenty')
    .replace(/\b1418\b/g, 'fourteen eighteen')
    .replace(/\b1411\b/g, 'fourteen eleven')
    .replace(/\b1406\b/g, 'fourteen oh six')
    .replace(/\b0812\b/g, 'oh eight twelve')
    .replace(/—(["']?)$/g, '$1')
    .replace(/—/g, ', ')
    .replace(/–/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip outer quotation marks around full spoken lines so TTS doesn't insert odd quote pauses
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith('“') && out.endsWith('”'))
  ) {
    out = out.slice(1, -1).trim();
  }
  out = out.replace(/^(Archive fourteen oh six\.\.\.\s*)"\.\.\./i, '$1');
  out = out.replace(/^"\.\.\./, '');
  if (out.endsWith('..."')) {
    out = out.slice(0, -1);
  } else if (out.endsWith('"') && (out.match(/"/g) ?? []).length % 2 === 1) {
    out = out.slice(0, -1).trim();
  }

  // Unwrap bracketed relay/telemetry notices and normalize ALL-CAPS telemetry blocks for natural TTS
  if (out.startsWith('[') && out.endsWith(']')) {
    out = out.slice(1, -1).trim();
  }
  out = out.replace(/\s*[·•]\s*/g, ', ');
  if (out.length > 12 && out === out.toUpperCase() && /[A-Z]/.test(out)) {
    out = out
      .toLowerCase()
      .replace(/(^\s*|[.!?]\s+|,\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase())
      .replace(/\b(sol|centauri|overseer)\b/g, (w) => w[0].toUpperCase() + w.slice(1));
  }

  return out.replace(/\s+/g, ' ').trim();
}

function computeSynthHash(entry) {
  const prof = profiles[entry.speaker] ?? profiles.narrator ?? {};
  const voxCfg = profilesJson.voxcpm2 ?? {};
  const qwenCfg = profilesJson.qwen3 ?? {};
  const v = prof.voxcpm2 ?? {};
  const q = prof.qwen3 ?? {};

  let payload;
  if (providerArg === 'voxcpm2') {
    const instruct =
      v.emotionInstructs?.[entry.emotion] ?? v.defaultInstruct ?? q.voiceDesignInstruct ?? '';
    payload = [
      'voxcpm2',
      voxCfg.model ?? 'mlx-community/VoxCPM2-8bit',
      String(voxCfg.inferenceTimesteps ?? 10),
      String(voxCfg.cfgValue ?? 2.0),
      String(voxCfg.bitrate ?? '128k'),
      String(voxCfg.sampleRate ?? 48000),
      String(Boolean(voxCfg.enableContinuation) && !noContinuation),
      v.anchorFile ?? q.anchorFile ?? '',
      entry.emotion,
      instruct,
      entry.spokenText,
      prof.ffmpegFilter ?? '',
      entry.turnPrevLineId ?? '',
    ].join('|');
  } else if (providerArg === 'qwen3') {
    const emoSpec = q.emotionAnchors?.[entry.emotion];
    const resolvedSpec = typeof emoSpec === 'string' ? q.emotionAnchors?.[emoSpec] : emoSpec;
    const anchorFile = resolvedSpec?.anchorFile ?? q.anchorFile ?? '';
    payload = [
      'qwen3',
      qwenCfg.baseModel ?? '',
      anchorFile,
      entry.emotion,
      entry.spokenText,
      prof.ffmpegFilter ?? '',
    ].join('|');
  } else {
    payload = [providerArg, entry.speaker, entry.emotion, entry.spokenText].join('|');
  }

  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 12);
}

function extractLinesFromInk(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  let currentKnot = 'root';
  let currentSpeaker = 'narrator';
  let currentEmotion = 'neutral';
  let currentExplicitId = null;
  let inFunction = false;
  let prevTurnLine = null;
  const scopeStack = [];
  const collected = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    if (trimmed.startsWith('===')) {
      const nameMatch = trimmed.match(/^===\s*(function\s+)?([a-zA-Z0-9_]+)/);
      if (nameMatch) {
        inFunction = Boolean(nameMatch[1]);
        currentKnot = nameMatch[2];
        currentSpeaker = 'narrator';
        currentEmotion = 'neutral';
        currentExplicitId = null;
        prevTurnLine = null;
        scopeStack.length = 0;
      }
      continue;
    }

    if (inFunction) continue;

    if (trimmed === '{') {
      scopeStack.push({ speaker: currentSpeaker, emotion: currentEmotion });
      currentExplicitId = null;
      prevTurnLine = null;
      continue;
    }

    if (trimmed === '}') {
      if (scopeStack.length > 0) {
        const prev = scopeStack.pop();
        currentSpeaker = prev.speaker;
        currentEmotion = prev.emotion;
      }
      currentExplicitId = null;
      prevTurnLine = null;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (scopeStack.length > 0) {
        const top = scopeStack[scopeStack.length - 1];
        currentSpeaker = top.speaker;
        currentEmotion = top.emotion;
      }
      currentExplicitId = null;
      prevTurnLine = null;
      continue;
    }

    if (
      trimmed.startsWith('VAR ') ||
      trimmed.startsWith('EXTERNAL ') ||
      trimmed.startsWith('~') ||
      trimmed.startsWith('->') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('+')
    ) {
      currentExplicitId = null;
      prevTurnLine = null;
      continue;
    }

    if (trimmed.startsWith('#')) {
      const speakerMatch = trimmed.match(/# *speaker:([a-zA-Z0-9_-]+)/);
      if (speakerMatch) currentSpeaker = speakerMatch[1];
      const emotionMatch = trimmed.match(/# *emotion:([a-zA-Z0-9_-]+)/);
      if (emotionMatch) currentEmotion = emotionMatch[1];
      const idMatch = trimmed.match(/# *id:([a-zA-Z0-9_-]+)/);
      if (idMatch) currentExplicitId = idMatch[1];
      continue;
    }

    let text = trimmed;
    const tagIdx = trimmed.indexOf(' #');
    if (tagIdx !== -1) {
      const tagPart = trimmed.slice(tagIdx);
      const speakerMatch = tagPart.match(/# *speaker:([a-zA-Z0-9_-]+)/);
      if (speakerMatch) currentSpeaker = speakerMatch[1];
      const emotionMatch = tagPart.match(/# *emotion:([a-zA-Z0-9_-]+)/);
      if (emotionMatch) currentEmotion = emotionMatch[1];
      const idMatch = tagPart.match(/# *id:([a-zA-Z0-9_-]+)/);
      if (idMatch) currentExplicitId = idMatch[1];
      text = trimmed.slice(0, tagIdx).trim();
    }

    if (!text) continue;
    // Skip bracketed stage directions like [STATIC] but NEVER skip [[warm:...]] inline highlights
    if (text.startsWith('[') && !text.startsWith('[[') && text.endsWith(']')) {
      currentExplicitId = null;
      prevTurnLine = null;
      continue;
    }

    const lineId = currentExplicitId ?? makeLineId(currentSpeaker, text);
    currentExplicitId = null;
    const profile = profiles[currentSpeaker] ?? profiles.narrator;
    if (profile?.voiced === false) {
      prevTurnLine = null;
      continue;
    }

    const spokenText = prepareSpokenText(text, lineId);
    const matchKey = normalizeMatchKey(currentSpeaker, text);

    let turnPrevLineId = null;
    let turnPrevSpokenText = null;
    let chainLen = 1;
    if (
      prevTurnLine &&
      prevTurnLine.speaker === currentSpeaker &&
      prevTurnLine.emotion === currentEmotion &&
      prevTurnLine.chainLen < 3
    ) {
      turnPrevLineId = prevTurnLine.lineId;
      turnPrevSpokenText = prevTurnLine.spokenText;
      chainLen = prevTurnLine.chainLen + 1;
    }

    const entry = {
      lineId,
      matchKey,
      knot: currentKnot,
      speaker: currentSpeaker,
      emotion: currentEmotion,
      text: stripInlineMarkup(text),
      spokenText,
      audioFile: `voices/${lineId}.mp3`,
      turnPrevLineId,
      turnPrevSpokenText,
      remoteConfig: profile?.remoteConfig ?? null,
    };
    entry.synthHash = computeSynthHash(entry);

    prevTurnLine = {
      lineId,
      spokenText,
      speaker: currentSpeaker,
      emotion: currentEmotion,
      chainLen,
    };

    collected.push(entry);
  }

  return collected;
}

function dedupeEntries(entries) {
  const byId = new Map();
  for (const e of entries) {
    if (!byId.has(e.lineId)) {
      byId.set(e.lineId, e);
    }
  }
  return [...byId.values()];
}

function loadPreviousHashes() {
  const map = new Map();
  if (!fs.existsSync(VOICE_SCRIPT_PATH)) return map;
  try {
    const prev = JSON.parse(fs.readFileSync(VOICE_SCRIPT_PATH, 'utf8'));
    if (prev.provider === providerArg) {
      for (const l of prev.lines ?? []) {
        if (l.lineId && l.synthHash) {
          map.set(l.lineId, l.synthHash);
        }
      }
    }
  } catch {
    // Ignore corrupt previous manifest
  }
  return map;
}

function writeScriptArtifacts(entries) {
  const engineName =
    providerArg === 'voxcpm2'
      ? 'voxcpm2-8bit'
      : providerArg === 'qwen3'
        ? 'qwen3-tts-12hz-1.7b-base-4bit'
        : providerArg === 'kokoro'
          ? 'kokoro-82m-q8'
          : providerArg;
  const serializedLines = entries.map(({ turnPrevSpokenText: _omit, ...rest }) => rest);
  const jsonOut = {
    schema_version: 3,
    generated_at: new Date().toISOString(),
    provider: providerArg,
    engine: engineName,
    lines: serializedLines,
  };
  fs.writeFileSync(VOICE_SCRIPT_PATH, JSON.stringify(jsonOut, null, 2));

  const txtLines = [
    '# INSTANCE-1419 — GENERATED VOICE SCRIPT',
    `# Engine: ${engineName}`,
    `# Generated: ${jsonOut.generated_at}`,
    `# Total spoken lines: ${entries.length}`,
    '',
  ];
  let lastKnot = '';
  for (const e of entries) {
    if (e.knot !== lastKnot) {
      txtLines.push(`\n=== ${e.knot} ===`);
      lastKnot = e.knot;
    }
    txtLines.push(`[${e.lineId}] ${e.speaker.toUpperCase()} (${e.emotion}): ${e.text}`);
  }
  fs.writeFileSync(path.join(COMPILED_DIR, 'voice_script.txt'), txtLines.join('\n') + '\n');
}

function resolveVoicePython() {
  const candidates = [
    process.env.VOICE_PYTHON,
    path.join(ROOT, '.venv-voice', 'bin', 'python'),
    '/tmp/venv-voice/bin/python',
    'python3',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === 'python3' || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python3';
}

function getPendingEntries(entries, prevHashById) {
  const filtered = onlyIds ? entries.filter((e) => onlyIds.has(e.lineId)) : entries;
  const pending = filtered.filter((entry) => {
    const outPath = path.join(ROOT, 'public', entry.audioFile);
    const missingOrTiny = !fs.existsSync(outPath) || fs.statSync(outPath).size <= 512;
    const hashChanged = prevHashById.get(entry.lineId) !== entry.synthHash;
    return forceRegen || missingOrTiny || hashChanged;
  });
  return { filtered, pending };
}

function synthesizeVoxcpm2(entries, prevHashById) {
  const { filtered, pending } = getPendingEntries(entries, prevHashById);
  if (pending.length === 0) {
    console.log(`[generate-voices] VoxCPM2-8bit: 0 generated, ${filtered.length} cached.`);
    return;
  }

  const pythonBin = resolveVoicePython();
  const voxcpm2Config = { ...(profilesJson.voxcpm2 ?? {}) };
  const jobPath = `/tmp/i1419_voxcpm2_job_${Date.now()}.json`;
  const reportPath = `/tmp/i1419_voxcpm2_report_${Date.now()}.json`;
  const jobPayload = {
    voxcpm2Config,
    anchorsDir: ANCHORS_DIR,
    profiles,
    reportPath,
    tasks: pending.map((entry) => ({
      lineId: entry.lineId,
      speaker: entry.speaker,
      emotion: entry.emotion,
      spokenText: entry.spokenText,
      turnPrevLineId: entry.turnPrevLineId,
      turnPrevSpokenText: entry.turnPrevSpokenText,
      outPath: path.join(ROOT, 'public', entry.audioFile),
    })),
  };

  fs.writeFileSync(jobPath, JSON.stringify(jobPayload, null, 2));
  console.log(
    `[generate-voices] Launching VoxCPM2 worker (${pythonBin}) for ${pending.length} pending line(s)...`
  );

  try {
    const workerArgs = [VOXCPM2_WORKER, '--jobs', jobPath];
    if (forceAnchors) workerArgs.push('--force-anchors');
    if (skipSttQa) workerArgs.push('--skip-stt-qa');
    if (noContinuation) workerArgs.push('--no-continuation');
    execFileSync(pythonBin, workerArgs, { stdio: 'inherit', cwd: ROOT });
  } finally {
    if (fs.existsSync(jobPath)) fs.unlinkSync(jobPath);
  }

  const cached = filtered.length - pending.length;
  console.log(
    `[generate-voices] VoxCPM2-8bit complete: ${pending.length} generated, ${cached} cached.`
  );
}

function synthesizeQwen3(entries, prevHashById) {
  const { filtered, pending } = getPendingEntries(entries, prevHashById);
  if (pending.length === 0) {
    console.log(`[generate-voices] Qwen3-TTS: 0 generated, ${filtered.length} cached.`);
    return;
  }

  const pythonBin = resolveVoicePython();
  const qwen3Config = { ...(profilesJson.qwen3 ?? {}) };
  if (batchSizeArg) {
    qwen3Config.batchSize = Math.max(1, Number.parseInt(batchSizeArg, 10) || 4);
  }

  const jobPath = `/tmp/i1419_qwen3_job_${Date.now()}.json`;
  const reportPath = `/tmp/i1419_qwen3_report_${Date.now()}.json`;
  const jobPayload = {
    qwen3Config,
    anchorsDir: ANCHORS_DIR,
    profiles,
    reportPath,
    tasks: pending.map((entry) => ({
      lineId: entry.lineId,
      speaker: entry.speaker,
      emotion: entry.emotion,
      spokenText: entry.spokenText,
      outPath: path.join(ROOT, 'public', entry.audioFile),
    })),
  };

  fs.writeFileSync(jobPath, JSON.stringify(jobPayload, null, 2));
  console.log(
    `[generate-voices] Launching Qwen3-TTS worker (${pythonBin}) for ${pending.length} pending line(s)...`
  );

  try {
    const workerArgs = [QWEN3_WORKER, '--jobs', jobPath];
    if (forceAnchors) workerArgs.push('--force-anchors');
    execFileSync(pythonBin, workerArgs, { stdio: 'inherit', cwd: ROOT });
  } finally {
    if (fs.existsSync(jobPath)) fs.unlinkSync(jobPath);
  }

  const cached = filtered.length - pending.length;
  console.log(
    `[generate-voices] Qwen3-TTS complete: ${pending.length} generated, ${cached} cached.`
  );
}

async function synthesizeKokoro(entries, prevHashById) {
  const { filtered, pending } = getPendingEntries(entries, prevHashById);
  if (pending.length === 0) {
    console.log(`[generate-voices] Kokoro-82M: 0 generated, ${filtered.length} cached.`);
    return;
  }

  console.log(`[generate-voices] Loading Kokoro-82M neural TTS (q8, cpu) for ${pending.length} lines...`);
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'cpu',
  });

  let generated = 0;
  for (const entry of pending) {
    const outPath = path.join(ROOT, 'public', entry.audioFile);
    const profile = profiles[entry.speaker] ?? profiles.narrator;
    const voice = profile?.kokoroVoice ?? 'am_michael';
    const speed = profile?.emotionSpeed?.[entry.emotion] ?? profile?.kokoroSpeed ?? 1.0;
    const filter = profile?.ffmpegFilter ?? 'highpass=f=95,lowpass=f=9500';
    const tmpWav = `/tmp/i1419_${entry.lineId}.wav`;

    try {
      const audio = await tts.generate(entry.spokenText, { voice, speed });
      await audio.save(tmpWav);
      execFileSync(
        'ffmpeg',
        ['-y', '-loglevel', 'error', '-i', tmpWav, '-af', filter, '-codec:a', 'libmp3lame', '-b:a', '96k', outPath],
        { stdio: 'ignore' }
      );
      if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
      generated++;
      if (generated % 10 === 0 || generated === pending.length) {
        console.log(`[generate-voices] Kokoro-82M progress: ${generated}/${pending.length}`);
      }
    } catch (err) {
      if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
      console.error(`[generate-voices] Kokoro-82M failed for ${entry.lineId} (${voice}): ${err.message}`);
      throw err;
    }
  }

  const cached = filtered.length - pending.length;
  console.log(`[generate-voices] Kokoro-82M complete: ${generated} generated, ${cached} cached.`);
}

function synthesizeSay(entries) {
  const filtered = onlyIds ? entries.filter((e) => onlyIds.has(e.lineId)) : entries;
  let generated = 0;
  let skipped = 0;

  for (const entry of filtered) {
    const outPath = path.join(ROOT, 'public', entry.audioFile);
    if (!forceRegen && fs.existsSync(outPath) && fs.statSync(outPath).size > 512) {
      skipped++;
      continue;
    }

    const profile = profiles[entry.speaker] ?? profiles.narrator;
    const voice = profile?.localVoice ?? 'Daniel';
    const rate = String(profile?.localRate ?? 176);
    const filter = profile?.ffmpegFilter ?? 'highpass=f=140,lowpass=f=4800';
    const tmpAiff = `/tmp/i1419_${entry.lineId}.aiff`;

    try {
      execFileSync('say', ['-v', voice, '-r', rate, '-o', tmpAiff, '--', entry.spokenText], {
        stdio: 'ignore',
      });
      execFileSync(
        'ffmpeg',
        ['-y', '-loglevel', 'error', '-i', tmpAiff, '-af', filter, '-codec:a', 'libmp3lame', '-b:a', '64k', outPath],
        { stdio: 'ignore' }
      );
      if (fs.existsSync(tmpAiff)) fs.unlinkSync(tmpAiff);
      generated++;
    } catch (err) {
      if (fs.existsSync(tmpAiff)) fs.unlinkSync(tmpAiff);
      console.warn(`[generate-voices] say TTS failed for ${entry.lineId} (${voice}): ${err.message}`);
    }
  }

  console.log(`[generate-voices] say TTS complete: ${generated} generated, ${skipped} cached.`);
}

async function main() {
  const prevHashById = loadPreviousHashes();
  const inkFiles = fs
    .readdirSync(DIALOGUE_DIR)
    .filter((f) => f.endsWith('.ink'))
    .map((f) => path.join(DIALOGUE_DIR, f));

  const rawEntries = inkFiles.flatMap(extractLinesFromInk);
  const entries = dedupeEntries(rawEntries);

  if (providerArg === 'voxcpm2') {
    synthesizeVoxcpm2(entries, prevHashById);
  } else if (providerArg === 'qwen3') {
    synthesizeQwen3(entries, prevHashById);
  } else if (providerArg === 'kokoro') {
    await synthesizeKokoro(entries, prevHashById);
  } else if (providerArg === 'say') {
    synthesizeSay(entries);
  } else if (providerArg === 'remote') {
    const apiKey = process.env.VOICE_API_KEY;
    if (!apiKey) {
      console.log(
        '[generate-voices] Remote mode selected. Set VOICE_API_PROVIDER and VOICE_API_KEY to synthesize via remote API; script manifest exported.'
      );
    } else {
      console.log('[generate-voices] Remote adapter hook ready with VOICE_API_KEY; batch synthesis stub invoked.');
    }
  } else {
    console.log(`[generate-voices] Manifest-only mode: exported ${entries.length} lines.`);
  }

  // Write manifest only after synthesis succeeds so interrupted runs don't mark stale lines current
  writeScriptArtifacts(entries);

  if (
    !onlyIds &&
    (providerArg === 'voxcpm2' ||
      providerArg === 'qwen3' ||
      providerArg === 'kokoro' ||
      providerArg === 'say')
  ) {
    const activeFiles = new Set(entries.map((e) => path.basename(e.audioFile)));
    let pruned = 0;
    for (const file of fs.readdirSync(VOICES_OUT_DIR)) {
      if (file.endsWith('.mp3') && !activeFiles.has(file)) {
        fs.unlinkSync(path.join(VOICES_OUT_DIR, file));
        pruned++;
      }
    }
    if (pruned > 0) {
      console.log(`[generate-voices] Pruned ${pruned} stale voice clip(s) from public/voices/.`);
    }
  }

  console.log(`[generate-voices] Exported ${entries.length} lines -> voice_script.json & voice_script.txt`);
}

main().catch((err) => {
  console.error('[generate-voices] Fatal error:', err);
  process.exit(1);
});
