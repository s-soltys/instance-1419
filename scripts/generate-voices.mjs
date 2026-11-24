import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const COMPILED_DIR = path.join(DIALOGUE_DIR, 'compiled');
const PROFILES_PATH = path.join(ROOT, 'src', 'content', 'voice_profiles.json');
const VOICES_OUT_DIR = path.join(ROOT, 'public', 'voices');

fs.mkdirSync(COMPILED_DIR, { recursive: true });
fs.mkdirSync(VOICES_OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const providerArg = args.find((a) => a.startsWith('--provider='))?.split('=')[1] ?? 'kokoro';
const forceRegen = args.includes('--force');

const profilesJson = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
const profiles = profilesJson.profiles ?? {};

export function normalizeMatchKey(speaker, text) {
  const cleaned = text
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

function prepareSpokenText(rawText) {
  return rawText
    .replace(/\[RELATION:SPOUSE_01\]'s/g, 'their')
    .replace(/\[RELATION:SPOUSE_01\]/g, 'your partner')
    .replace(/\{humanity\}/g, 'seventy')
    .replace(/\{max_humanity\}/g, 'seventy eight')
    .replace(/\{chaos_drift\}/g, 'fourteen')
    .replace(/\{subjective_months\}/g, 'twenty four')
    .replace(/\{[^}]+\}/g, '')
    .replace(/—(["']?)$/g, '...$1')
    .replace(/—/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinesFromInk(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  let currentKnot = 'root';
  let currentSpeaker = 'narrator';
  let currentEmotion = 'neutral';
  let currentExplicitId = null;
  let inFunction = false;
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
        scopeStack.length = 0;
      }
      continue;
    }

    if (inFunction) continue;

    if (trimmed === '{') {
      scopeStack.push({ speaker: currentSpeaker, emotion: currentEmotion });
      currentExplicitId = null;
      continue;
    }

    if (trimmed === '}') {
      if (scopeStack.length > 0) {
        const prev = scopeStack.pop();
        currentSpeaker = prev.speaker;
        currentEmotion = prev.emotion;
      }
      currentExplicitId = null;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (scopeStack.length > 0) {
        const top = scopeStack[scopeStack.length - 1];
        currentSpeaker = top.speaker;
        currentEmotion = top.emotion;
      }
      currentExplicitId = null;
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
    if (text.startsWith('[') && text.endsWith(']')) {
      currentExplicitId = null;
      continue;
    }

    const lineId = currentExplicitId ?? makeLineId(currentSpeaker, text);
    currentExplicitId = null;
    const matchKey = normalizeMatchKey(currentSpeaker, text);
    const profile = profiles[currentSpeaker] ?? profiles.narrator;

    collected.push({
      lineId,
      matchKey,
      knot: currentKnot,
      speaker: currentSpeaker,
      emotion: currentEmotion,
      text,
      spokenText: prepareSpokenText(text),
      audioFile: `voices/${lineId}.mp3`,
      remoteConfig: profile?.remoteConfig ?? null,
    });
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

function writeScriptArtifacts(entries) {
  const engineName = providerArg === 'kokoro' ? 'kokoro-82m-q8' : providerArg;
  const jsonOut = {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    provider: providerArg,
    engine: engineName,
    lines: entries,
  };
  fs.writeFileSync(path.join(COMPILED_DIR, 'voice_script.json'), JSON.stringify(jsonOut, null, 2));

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

async function synthesizeKokoro(entries) {
  const pending = entries.filter((entry) => {
    const outPath = path.join(ROOT, 'public', entry.audioFile);
    return forceRegen || !fs.existsSync(outPath) || fs.statSync(outPath).size <= 512;
  });

  if (pending.length === 0) {
    console.log(`[generate-voices] Kokoro-82M: 0 generated, ${entries.length} cached.`);
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

  const cached = entries.length - pending.length;
  console.log(`[generate-voices] Kokoro-82M complete: ${generated} generated, ${cached} cached.`);
}

function synthesizeSay(entries) {
  let generated = 0;
  let skipped = 0;

  for (const entry of entries) {
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
  const inkFiles = fs
    .readdirSync(DIALOGUE_DIR)
    .filter((f) => f.endsWith('.ink'))
    .map((f) => path.join(DIALOGUE_DIR, f));

  const rawEntries = inkFiles.flatMap(extractLinesFromInk);
  const entries = dedupeEntries(rawEntries);
  writeScriptArtifacts(entries);

  if (providerArg === 'kokoro') {
    await synthesizeKokoro(entries);
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

  if (providerArg === 'kokoro' || providerArg === 'say') {
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
