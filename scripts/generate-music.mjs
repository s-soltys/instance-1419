import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CATALOG_PATH = path.join(ROOT, 'src', 'content', 'music_catalog.json');
const OUT_DIR = path.join(ROOT, 'public', 'music');
const TMP_DIR = path.join(ROOT, '.tmp-music-gen');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const args = process.argv.slice(2);
const forceRegen = args.includes('--force');
const onlyArg = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const onlySet = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim())) : null;
const modelOverride = args.find((a) => a.startsWith('--model='))?.split('=')[1];
const concurrency = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 4);

const API_KEY = (process.env.GEMINI_API_KEY ?? '').trim();
if (!API_KEY) {
  console.error('[generate-music] Missing GEMINI_API_KEY environment variable.');
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const MODEL = modelOverride || catalog.model || 'lyria-3.5';
const TARGET_LUFS = catalog.loudnessTargetLufs ?? -16;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const items = [
  ...Object.values(catalog.coldStems ?? {}),
  ...Object.values(catalog.cues ?? {}),
].filter((item) => !onlySet || onlySet.has(item.id));

function normalizeToLoopMp3(rawPath, outPath) {
  // Probe duration so we can apply clean 0.6s fade-in and 1.2s fade-out loop edges
  let durSec = 120;
  try {
    const rawDur = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', rawPath],
      { encoding: 'utf8' }
    ).trim();
    const parsed = Number(rawDur);
    if (Number.isFinite(parsed) && parsed > 4) durSec = parsed;
  } catch {
    // Fallback to default duration if ffprobe unavailable
  }

  const fadeOutStart = Math.max(2, durSec - 1.2).toFixed(2);
  const filterChain = `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOutStart}:d=1.2`;
  execFileSync(
    'ffmpeg',
    ['-y', '-v', 'error', '-i', rawPath, '-af', filterChain, '-codec:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', outPath],
    { stdio: 'inherit' }
  );
}

async function generateOne(item) {
  const outPath = path.join(ROOT, 'public', item.file);
  if (!forceRegen && fs.existsSync(outPath) && fs.statSync(outPath).size > 40_000) {
    return { id: item.id, status: 'cached', bytes: fs.statSync(outPath).size };
  }

  const body = JSON.stringify({
    model: MODEL,
    input: item.prompt,
    response_modalities: ['audio'],
  });

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY,
        },
        body,
      });

      if (!res.ok) {
        const errText = (await res.text()).slice(0, 260);
        if ([429, 500, 502, 503, 504].includes(res.status) && attempt < 4) {
          await new Promise((r) => setTimeout(r, attempt * 6000));
          continue;
        }
        return { id: item.id, status: `HTTP_${res.status}: ${errText}`, bytes: 0 };
      }

      const data = await res.json();
      let audioB64 = null;
      for (const step of data.steps ?? []) {
        for (const content of step.content ?? []) {
          if (content.data && (content.type === 'audio' || String(content.mime_type ?? '').includes('audio'))) {
            audioB64 = content.data;
          }
        }
      }
      if (!audioB64) {
        return { id: item.id, status: 'NO_AUDIO_BLOCK', bytes: 0 };
      }

      const rawPath = path.join(TMP_DIR, `${item.id}_raw.mp3`);
      fs.writeFileSync(rawPath, Buffer.from(audioB64, 'base64'));
      normalizeToLoopMp3(rawPath, outPath);
      fs.unlinkSync(rawPath);
      return { id: item.id, status: 'ok', bytes: fs.statSync(outPath).size };
    } catch (err) {
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 5000));
        continue;
      }
      return { id: item.id, status: `ERR: ${err instanceof Error ? err.message : String(err)}`, bytes: 0 };
    }
  }
  return { id: item.id, status: 'FAILED', bytes: 0 };
}

async function runPool(list, limit) {
  const results = [];
  let cursor = 0;
  const t0 = Date.now();

  async function worker() {
    while (cursor < list.length) {
      const idx = cursor++;
      const item = list[idx];
      const res = await generateOne(item);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[${sec}s] ${res.id}: ${res.status} (${Math.round(res.bytes / 1024)} KB)`);
      results.push(res);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, () => worker()));
  return results;
}

console.log(`[generate-music] Generating ${items.length} tracks with ${MODEL} (target ${TARGET_LUFS} LUFS, 96k MP3)...`);
const results = await runPool(items, concurrency);
try {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
} catch {
  // Ignore temp cleanup race
}

const failed = results.filter((r) => r.bytes < 40_000);
console.log(`[generate-music] Complete: ${results.length - failed.length}/${results.length} succeeded.`);
if (failed.length > 0) {
  console.error('[generate-music] Failed tracks:', failed);
  process.exit(2);
}
