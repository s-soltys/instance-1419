import fs from 'node:fs';
import path from 'node:path';
import { Compiler, CompilerOptions } from 'inkjs/full';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const OUT_DIR = path.join(DIALOGUE_DIR, 'compiled');

fs.mkdirSync(OUT_DIR, { recursive: true });

const MAIN_FILE = path.join(DIALOGUE_DIR, 'main.ink');
const OUT_PATH = path.join(OUT_DIR, 'story.ink.json');
const OBSOLETE_SPIKE_JSON = path.join(OUT_DIR, 'spike_shift1.ink.json');

if (!fs.existsSync(MAIN_FILE)) {
  console.error('Missing entrypoint:', MAIN_FILE);
  process.exit(1);
}

const source = fs.readFileSync(MAIN_FILE, 'utf8');
const diagnostics = [];
const fileHandler = {
  ResolveInkFilename: (filename) => {
    if (path.isAbsolute(filename)) return filename;
    return path.resolve(DIALOGUE_DIR, filename);
  },
  LoadInkFileContents: (fullPath) => fs.readFileSync(fullPath, 'utf8'),
};

const options = new CompilerOptions(
  'main.ink',
  [],
  false,
  (msg, type) => diagnostics.push({ msg, type }),
  fileHandler
);
const compiler = new Compiler(source, options);
let story = null;
try {
  story = compiler.Compile();
} catch (err) {
  for (const d of diagnostics) {
    console.error(`[ink:main.ink] ${d.msg}`);
  }
  console.error(`[ink:main.ink] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
if (!story) {
  for (const d of diagnostics) {
    console.error(`[ink:main.ink] ${d.msg}`);
  }
  process.exit(1);
}

if (fs.existsSync(OBSOLETE_SPIKE_JSON)) {
  fs.unlinkSync(OBSOLETE_SPIKE_JSON);
}

fs.writeFileSync(OUT_PATH, story.ToJson(), 'utf8');
console.log(`Compiled main.ink -> ${path.relative(ROOT, OUT_PATH)}`);
