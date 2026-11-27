import fs from 'node:fs';
import path from 'node:path';
import { stripInlineMarkup, walkInkFiles } from './voice-extract.mjs';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const MAIN_INK_PATH = path.join(DIALOGUE_DIR, 'main.ink');
const CHARACTERS_PATH = path.join(ROOT, 'src', 'content', 'characters.json');
const OUT_PATH = path.join(ROOT, 'artifacts', 'playscript.md');

const characters = JSON.parse(fs.readFileSync(CHARACTERS_PATH, 'utf8')).characters ?? {};

function orderInkFiles() {
  const discovered = walkInkFiles(DIALOGUE_DIR, { includeStructural: false });
  const byRel = new Map(
    discovered.map((abs) => [path.relative(DIALOGUE_DIR, abs).replace(/\\/g, '/'), abs])
  );
  const ordered = [];
  const seen = new Set();

  if (fs.existsSync(MAIN_INK_PATH)) {
    const mainRaw = fs.readFileSync(MAIN_INK_PATH, 'utf8');
    for (const m of mainRaw.matchAll(/^\s*INCLUDE\s+(.+)\s*$/gm)) {
      const rel = m[1].trim().replace(/\\/g, '/');
      if (byRel.has(rel) && !seen.has(rel)) {
        ordered.push({ rel, abs: byRel.get(rel) });
        seen.add(rel);
      }
    }
  }

  for (const [rel, abs] of byRel.entries()) {
    if (!seen.has(rel)) {
      ordered.push({ rel, abs });
    }
  }
  return ordered;
}

function speakerLabel(id) {
  return characters[id]?.displayName ?? id.toUpperCase();
}

function formatDialogueFile(relPath, absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const md = [`## File: \`${relPath}\``, ''];
  let currentSpeaker = 'narrator';
  let currentEmotion = 'neutral';
  let inFunction = false;
  let lineCount = 0;
  let wordCount = 0;
  const speakerLines = new Map();

  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (!t || t.startsWith('//')) continue;

    if (t.startsWith('===')) {
      const m = t.match(/^===\s*(function\s+)?([a-zA-Z0-9_]+)/);
      if (m) {
        inFunction = Boolean(m[1]);
        if (!inFunction) {
          md.push('', `### \`${m[2]}\``, '');
          currentSpeaker = 'narrator';
          currentEmotion = 'neutral';
        }
      }
      continue;
    }
    if (inFunction) continue;

    if (
      t.startsWith('VAR ') ||
      t.startsWith('EXTERNAL ') ||
      t.startsWith('INCLUDE ') ||
      t.startsWith('~') ||
      t === '{' ||
      t === '}' ||
      t.startsWith('- ')
    ) {
      continue;
    }

    if (t.startsWith('->')) {
      const target = t.replace(/^->\s*/, '').trim();
      md.push(`_→ ${target}_`);
      continue;
    }

    if (t.startsWith('#')) {
      const spk = t.match(/# *speaker:([a-zA-Z0-9_-]+)/);
      if (spk) currentSpeaker = spk[1];
      const emo = t.match(/# *emotion:([a-zA-Z0-9_-]+)/);
      if (emo) currentEmotion = emo[1];
      const noteBits = [];
      const vis = t.match(/# *visual:([a-zA-Z0-9_-]+)/);
      if (vis) noteBits.push(`visual:${vis[1]}`);
      const tab = t.match(/# *tableau:([a-zA-Z0-9_-]+)/);
      if (tab) noteBits.push(`tableau:${tab[1]}`);
      const pause = t.match(/# *pause:(\d+)/);
      if (pause) noteBits.push(`pause:${pause[1]}ms`);
      const beat = t.match(/# *beat:([a-zA-Z0-9_-]+)/);
      if (beat) noteBits.push(`beat:${beat[1]}`);
      if (noteBits.length > 0) {
        md.push(`> *Stage:* ${noteBits.join(' · ')}`);
      }
      continue;
    }

    if (t.startsWith('*') || t.startsWith('+')) {
      const choiceClean = stripInlineMarkup(t.replace(/#.*$/, ''))
        .replace(/^[\*\+]+\s*(\{[^}]+\})?\s*/, '')
        .trim();
      const kind = t.match(/# *kind:([a-zA-Z0-9_-]+)/)?.[1] ?? 'choice';
      md.push(`- **[${kind.toUpperCase()}]** ${choiceClean}`);
      continue;
    }

    let lineSpk = currentSpeaker;
    let lineEmo = currentEmotion;
    let body = t;
    const tagIdx = t.indexOf(' #');
    if (tagIdx !== -1) {
      const tags = t.slice(tagIdx);
      lineSpk = tags.match(/# *speaker:([a-zA-Z0-9_-]+)/)?.[1] ?? lineSpk;
      lineEmo = tags.match(/# *emotion:([a-zA-Z0-9_-]+)/)?.[1] ?? lineEmo;
      currentSpeaker = lineSpk;
      currentEmotion = lineEmo;
      body = t.slice(0, tagIdx).trim();
    }

    const cleanBody = stripInlineMarkup(body).trim();
    if (!cleanBody) continue;
    lineCount++;
    wordCount += (cleanBody.match(/\b[a-zA-Z0-9'’-]+\b/g) ?? []).length;
    speakerLines.set(lineSpk, (speakerLines.get(lineSpk) ?? 0) + 1);
    md.push(`**${speakerLabel(lineSpk)}** *(${lineEmo})*: ${cleanBody}  `);
  }

  return { relPath, lines: md.join('\n'), lineCount, wordCount, speakerLines };
}

const files = orderInkFiles();
const sections = files.map((f) => formatDialogueFile(f.rel, f.abs));
const totalWords = sections.reduce((acc, s) => acc + s.wordCount, 0);
const totalLines = sections.reduce((acc, s) => acc + s.lineCount, 0);

const out = [
  '# INSTANCE-1419 — COMPLETE PLAYSCRIPT EXPORT',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Files: ${sections.length} · Spoken Lines: ${totalLines} · Spoken Words: ${totalWords}`,
  '',
  '## Table of Contents',
  ...sections.map((s) => `- \`${s.relPath}\` — ${s.lineCount} lines, ${s.wordCount} words`),
  '',
  '---',
  '',
  ...sections.map((s) => s.lines),
  '',
].join('\n');

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, out, 'utf8');
console.log(`[export-playscript] Wrote ${path.relative(ROOT, OUT_PATH)} (${totalLines} lines, ${totalWords} words across ${sections.length} file(s)).`);
