import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const CHARACTERS_PATH = path.join(ROOT, 'src', 'content', 'characters.json');

const charactersJson = JSON.parse(fs.readFileSync(CHARACTERS_PATH, 'utf8'));
const validSpeakers = new Set(Object.keys(charactersJson.characters));

// Guardrail terms: avoid CC BY-SA overlap and accidental proper names for loved ones.
const DISALLOWED_IP_TERMS = [/\bMMAcevedo\b/i, /\bqntm\b/i, /\bLena\b/];
const DISALLOWED_SPEAKER_TAG = /# *speaker:([a-zA-Z0-9_-]+)/g;
const DISALLOWED_PORTRAIT_TAG = /# *portrait:([a-zA-Z0-9_-]+)/g;

let errors = 0;

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

  for (const match of text.matchAll(DISALLOWED_SPEAKER_TAG)) {
    const id = match[1];
    if (!validSpeakers.has(id)) {
      console.error(`[lint-narrative] Unregistered speaker "${id}" in ${file}`);
      errors++;
    }
  }

  for (const match of text.matchAll(DISALLOWED_PORTRAIT_TAG)) {
    const id = match[1];
    if (!validSpeakers.has(id)) {
      console.error(`[lint-narrative] Unregistered portrait "${id}" in ${file}`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`[lint-narrative] FAILED with ${errors} issue(s).`);
  process.exit(1);
}

console.log('[lint-narrative] PASS (speakers, portraits, and IP guardrails verified).');
