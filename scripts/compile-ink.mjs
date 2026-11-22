import fs from 'node:fs';
import path from 'node:path';
import { Compiler, CompilerOptions } from 'inkjs/full';

const ROOT = path.resolve(process.cwd());
const DIALOGUE_DIR = path.join(ROOT, 'src', 'content', 'dialogue');
const OUT_DIR = path.join(DIALOGUE_DIR, 'compiled');

fs.mkdirSync(OUT_DIR, { recursive: true });

const inkFiles = fs
  .readdirSync(DIALOGUE_DIR)
  .filter((file) => file.endsWith('.ink'));

if (inkFiles.length === 0) {
  console.error('No .ink files found in', DIALOGUE_DIR);
  process.exit(1);
}

for (const file of inkFiles) {
  const fullPath = path.join(DIALOGUE_DIR, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  const diagnostics = [];
  const options = new CompilerOptions(
    null,
    [],
    false,
    (msg, type) => diagnostics.push({ msg, type }),
    null
  );
  const compiler = new Compiler(source, options);
  let story = null;
  try {
    story = compiler.Compile();
  } catch (err) {
    for (const d of diagnostics) {
      console.error(`[ink:${file}] ${d.msg}`);
    }
    console.error(`[ink:${file}] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  if (!story) {
    for (const d of diagnostics) {
      console.error(`[ink:${file}] ${d.msg}`);
    }
    process.exit(1);
  }
  const outName = file.replace(/\.ink$/, '.ink.json');
  const outPath = path.join(OUT_DIR, outName);
  fs.writeFileSync(outPath, story.ToJson(), 'utf8');
  console.log(`Compiled ${file} -> ${path.relative(ROOT, outPath)}`);
}
