import crypto from 'node:crypto';
import fs from 'node:fs';

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

export function makeLineId(speaker, text) {
  const key = normalizeMatchKey(speaker, text);
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
  return `${speaker}_${hash}`;
}

export function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
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
      `[voice-extract] WARN unresolved Ink interpolation in ${lineId || 'line'}: ${unresolved?.join(', ')}`
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

export function computeSynthHash(entry, profilesJson, providerArg = 'voxcpm2', { noContinuation = false } = {}) {
  const profiles = profilesJson.profiles ?? {};
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

export function extractLinesFromInk(
  filePath,
  profilesJson,
  providerArg = profilesJson.defaultProvider ?? 'voxcpm2',
  { noContinuation = false, includeMeta = false } = {}
) {
  const profiles = profilesJson.profiles ?? {};
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

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const trimmed = lines[i].trim();
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

    const hasExplicitId = Boolean(currentExplicitId);
    const hasDynamicInterpolation = /\{[^}]+\}/.test(text);
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
    entry.synthHash = computeSynthHash(entry, profilesJson, providerArg, { noContinuation });
    if (includeMeta) {
      entry._meta = {
        lineNum,
        hasExplicitId,
        hasDynamicInterpolation,
        rawText: text,
      };
    }

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

export function dedupeEntries(entries) {
  const byId = new Map();
  for (const e of entries) {
    if (!byId.has(e.lineId)) {
      byId.set(e.lineId, e);
    }
  }
  return [...byId.values()];
}
