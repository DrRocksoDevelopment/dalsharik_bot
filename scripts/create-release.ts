import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

let tag: string;
try {
  tag = run('git describe --tags --abbrev=0');
} catch {
  console.error('Нет тегов — сначала выпусти версию (npm run release:patch|minor|major).');
  process.exit(1);
}

if (!existsSync('CHANGELOG.md')) {
  console.error('CHANGELOG.md не найден.');
  process.exit(1);
}

const lines = readFileSync('CHANGELOG.md', 'utf8').split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${tag}]`));
if (start === -1) {
  console.error(`В CHANGELOG.md нет секции «## [${tag}]».`);
  console.error('Добавь секцию для этой версии в CHANGELOG.md, закоммить, затем повтори release:push.');
  process.exit(1);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) {
    end = i;
    break;
  }
}

const notes = `${lines.slice(start, end).join('\n').trim()}\n`;
const dir = mkdtempSync(join(tmpdir(), 'dalsharik-release-'));
const file = join(dir, 'notes.md');
writeFileSync(file, notes, 'utf8');

let exists = false;
try {
  run(`gh release view ${tag}`);
  exists = true;
} catch {
  exists = false;
}

if (exists) {
  console.log(`Релиз ${tag} уже существует — обновляю заметки.`);
  run(`gh release edit ${tag} --notes-file "${file}"`);
} else {
  run(`gh release create ${tag} --notes-file "${file}"`);
  console.log(`Релиз ${tag} создан.`);
}
