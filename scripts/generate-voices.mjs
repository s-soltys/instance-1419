import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeSynthHash,
  dedupeEntries,
  extractLinesFromInk,
  normalizeMatchKey,
  prepareSpokenText,
  sha256File,
  stripInlineMarkup,
  walkInkFiles,
} from './voice-extract.mjs';

export { stripInlineMarkup, normalizeMatchKey, prepareSpokenText };

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const COMPILED_DIR = path.join(DIALOGUE_DIR, 'compiled');
const VOICE_SCRIPT_PATH = path.join(COMPILED_DIR, 'voice_script.json');
const VOICE_RUNTIME_PATH = path.join(COMPILED_DIR, 'voice_runtime.json');
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
const extractOnly = args.includes('--extract-only');
const providerArg = extractOnly
  ? 'manifest'
  : args.find((a) => a.startsWith('--provider='))?.split('=')[1] ??
    profilesJson.defaultProvider ??
    'voxcpm2';
const forceRegen = args.includes('--force');
const forceAnchors = args.includes('--force-anchors');
const skipSttQa = args.includes('--skip-stt-qa');
const noContinuation = args.includes('--no-continuation');
const batchSizeArg = args.find((a) => a.startsWith('--batch-size='))?.split('=')[1];
const idsArg = args.find((a) => a.startsWith('--ids='))?.split('=')[1];
const shiftArg = args.find((a) => a.startsWith('--shift='))?.split('=')[1];
const fileArg = args.find((a) => a.startsWith('--file='))?.split('=')[1];
const speakerArg = args.find((a) => a.startsWith('--speaker='))?.split('=')[1];
const knotArg = args.find((a) => a.startsWith('--knot='))?.split('=')[1];

const onlyIds = idsArg ? new Set(idsArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const onlyShift = shiftArg ? Number.parseInt(shiftArg, 10) : null;
const onlyFileSub = fileArg ? fileArg.trim() : null;
const onlySpeakers = speakerArg ? new Set(speakerArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const onlyKnotPrefixes = knotArg ? knotArg.split(',').map((s) => s.trim()).filter(Boolean) : null;
const hasFilter = Boolean(onlyIds || onlyShift || onlyFileSub || onlySpeakers || onlyKnotPrefixes);

function matchesFilter(entry) {
  if (onlyIds && !onlyIds.has(entry.lineId)) return false;
  if (onlyShift) {
    const sf = entry._sourceFile ?? '';
    const knot = entry.knot ?? '';
    const shiftMatch =
      sf.includes(`shift${onlyShift}`) ||
      knot.startsWith(`shift${onlyShift}_`) ||
      knot.startsWith(`s${onlyShift}_`) ||
      (onlyShift === 1 && sf.includes('spike_shift1'));
    if (!shiftMatch) return false;
  }
  if (onlyFileSub && !(entry._sourceFile ?? '').includes(onlyFileSub)) return false;
  if (onlySpeakers && !onlySpeakers.has(entry.speaker)) return false;
  if (onlyKnotPrefixes && !onlyKnotPrefixes.some((p) => (entry.knot ?? '').startsWith(p))) return false;
  return true;
}

function loadPreviousEntries(targetProvider = profilesJson.defaultProvider ?? 'voxcpm2') {
  const map = new Map();
  if (!fs.existsSync(VOICE_SCRIPT_PATH)) return map;
  try {
    const prev = JSON.parse(fs.readFileSync(VOICE_SCRIPT_PATH, 'utf8'));
    if (extractOnly || prev.provider === targetProvider) {
      for (const l of prev.lines ?? []) {
        if (l.lineId) {
          map.set(l.lineId, l);
        }
      }
    }
  } catch {
    // Ignore corrupt previous manifest
  }
  return map;
}

function writeScriptArtifacts(entries, prevById, synthesizedIds) {
  const activeProvider = extractOnly
    ? profilesJson.defaultProvider ?? 'voxcpm2'
    : providerArg;
  const engineName =
    activeProvider === 'voxcpm2'
      ? 'voxcpm2-8bit'
      : activeProvider === 'qwen3'
        ? 'qwen3-tts-12hz-1.7b-base-4bit'
        : activeProvider === 'kokoro'
          ? 'kokoro-82m-q8'
          : activeProvider;
  const serializedLines = entries.map(({ turnPrevSpokenText: _omit, _sourceFile: _omitSrc, ...rest }) => {
    const prev = prevById.get(rest.lineId);
    const outPath = path.join(ROOT, 'public', rest.audioFile);
    const hasFile = fs.existsSync(outPath) && fs.statSync(outPath).size > 512;

    // When filtering or --extract-only is used, avoid overwriting synthHash/metadata for unrequested lines so stale clips are not marked current
    if ((extractOnly || hasFilter) && !synthesizedIds.has(rest.lineId) && prev) {
      return {
        ...rest,
        synthHash: prev.synthHash ?? rest.synthHash,
        audioSha256: hasFile ? (prev.audioSha256 ?? sha256File(outPath)) : null,
        ...(typeof prev.sttWer === 'number' ? { sttWer: prev.sttWer } : {}),
        ...(typeof prev.sttTranscript === 'string' ? { sttTranscript: prev.sttTranscript } : {}),
      };
    }

    const audioSha256 = hasFile ? sha256File(outPath) : null;
    const sttWer =
      typeof rest.sttWer === 'number'
        ? rest.sttWer
        : prev?.synthHash === rest.synthHash && typeof prev?.sttWer === 'number'
          ? prev.sttWer
          : undefined;
    const sttTranscript =
      typeof rest.sttTranscript === 'string'
        ? rest.sttTranscript
        : prev?.synthHash === rest.synthHash && typeof prev?.sttTranscript === 'string'
          ? prev.sttTranscript
          : undefined;

    return {
      ...rest,
      audioSha256,
      ...(typeof sttWer === 'number' ? { sttWer } : {}),
      ...(typeof sttTranscript === 'string' ? { sttTranscript } : {}),
    };
  });
  const generatedAt = new Date().toISOString();
  const jsonOut = {
    schema_version: 3,
    generated_at: generatedAt,
    provider: activeProvider,
    engine: engineName,
    lines: serializedLines,
  };
  fs.writeFileSync(VOICE_SCRIPT_PATH, JSON.stringify(jsonOut, null, 2));

  const runtimeById = {};
  for (const l of serializedLines) {
    runtimeById[l.lineId] = {
      f: l.audioFile,
      s: l.audioSha256 ? String(l.audioSha256).slice(0, 8) : null,
      m: l.matchKey,
    };
  }
  fs.writeFileSync(
    VOICE_RUNTIME_PATH,
    JSON.stringify({ version: generatedAt, byId: runtimeById })
  );

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

function getPendingEntries(entries, prevById) {
  const filtered = hasFilter ? entries.filter(matchesFilter) : entries;
  const pending = filtered.filter((entry) => {
    const outPath = path.join(ROOT, 'public', entry.audioFile);
    const missingOrTiny = !fs.existsSync(outPath) || fs.statSync(outPath).size <= 512;
    if (forceRegen || missingOrTiny) return true;
    const prev = prevById.get(entry.lineId);
    if (!prev || prev.synthHash !== entry.synthHash) return true;
    if (prev.audioSha256 && sha256File(outPath) !== prev.audioSha256) return true;
    return false;
  });
  return { filtered, pending };
}

function synthesizeVoxcpm2(entries, prevById) {
  const { filtered, pending } = getPendingEntries(entries, prevById);
  const synthesizedIds = new Set();
  if (pending.length === 0) {
    console.log(`[generate-voices] VoxCPM2-8bit: 0 generated, ${filtered.length} cached.`);
    return synthesizedIds;
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

    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const byId = new Map((report.lines ?? []).map((r) => [r.lineId, r]));
      for (const entry of pending) {
        const rec = byId.get(entry.lineId);
        if (rec) {
          synthesizedIds.add(entry.lineId);
          if (typeof rec.wer === 'number') entry.sttWer = rec.wer;
          if (typeof rec.transcript === 'string') entry.sttTranscript = rec.transcript;
        }
      }
      fs.unlinkSync(reportPath);
    } else {
      for (const entry of pending) synthesizedIds.add(entry.lineId);
    }
  } finally {
    if (fs.existsSync(jobPath)) fs.unlinkSync(jobPath);
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
  }

  const cached = filtered.length - pending.length;
  console.log(
    `[generate-voices] VoxCPM2-8bit complete: ${pending.length} generated, ${cached} cached.`
  );
  return synthesizedIds;
}

function synthesizeQwen3(entries, prevById) {
  const { filtered, pending } = getPendingEntries(entries, prevById);
  const synthesizedIds = new Set();
  if (pending.length === 0) {
    console.log(`[generate-voices] Qwen3-TTS: 0 generated, ${filtered.length} cached.`);
    return synthesizedIds;
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
    for (const entry of pending) synthesizedIds.add(entry.lineId);
  } finally {
    if (fs.existsSync(jobPath)) fs.unlinkSync(jobPath);
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
  }

  const cached = filtered.length - pending.length;
  console.log(
    `[generate-voices] Qwen3-TTS complete: ${pending.length} generated, ${cached} cached.`
  );
  return synthesizedIds;
}

async function synthesizeKokoro(entries, prevById) {
  const { filtered, pending } = getPendingEntries(entries, prevById);
  const synthesizedIds = new Set();
  if (pending.length === 0) {
    console.log(`[generate-voices] Kokoro-82M: 0 generated, ${filtered.length} cached.`);
    return synthesizedIds;
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
      synthesizedIds.add(entry.lineId);
      generated++;
      if (generated % 25 === 0) {
        writeScriptArtifacts(entries, prevById, synthesizedIds);
      }
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
  return synthesizedIds;
}

function synthesizeSay(entries, prevById) {
  const filtered = hasFilter ? entries.filter(matchesFilter) : entries;
  const synthesizedIds = new Set();
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
      synthesizedIds.add(entry.lineId);
      generated++;
      if (generated % 25 === 0) {
        writeScriptArtifacts(entries, prevById, synthesizedIds);
      }
    } catch (err) {
      if (fs.existsSync(tmpAiff)) fs.unlinkSync(tmpAiff);
      console.warn(`[generate-voices] say TTS failed for ${entry.lineId} (${voice}): ${err.message}`);
    }
  }

  console.log(`[generate-voices] say TTS complete: ${generated} generated, ${skipped} cached.`);
  return synthesizedIds;
}

async function main() {
  const effectiveProvider = extractOnly
    ? profilesJson.defaultProvider ?? 'voxcpm2'
    : providerArg;
  const prevById = loadPreviousEntries(effectiveProvider);
  const inkFiles = walkInkFiles(DIALOGUE_DIR, { includeStructural: false });

  const rawEntries = inkFiles.flatMap((filePath) => {
    const relPath = path.relative(DIALOGUE_DIR, filePath).replace(/\\/g, '/');
    return extractLinesFromInk(filePath, profilesJson, effectiveProvider, { noContinuation }).map((e) => ({
      ...e,
      _sourceFile: relPath,
    }));
  });
  const entries = dedupeEntries(rawEntries);

  let synthesizedIds = new Set();
  if (extractOnly) {
    const filteredCount = hasFilter ? entries.filter(matchesFilter).length : entries.length;
    console.log(`[generate-voices] Extract-only mode: ${entries.length} total line(s) (${filteredCount} matching filter).`);
  } else if (providerArg === 'voxcpm2') {
    synthesizedIds = synthesizeVoxcpm2(entries, prevById);
  } else if (providerArg === 'qwen3') {
    synthesizedIds = synthesizeQwen3(entries, prevById);
  } else if (providerArg === 'kokoro') {
    synthesizedIds = await synthesizeKokoro(entries, prevById);
  } else if (providerArg === 'say') {
    synthesizedIds = synthesizeSay(entries, prevById);
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
  writeScriptArtifacts(entries, prevById, synthesizedIds);

  if (
    !extractOnly &&
    !hasFilter &&
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

  console.log(
    `[generate-voices] Exported ${entries.length} lines -> voice_script.json, voice_runtime.json & voice_script.txt`
  );
}

main().catch((err) => {
  console.error('[generate-voices] Fatal error:', err);
  process.exit(1);
});

