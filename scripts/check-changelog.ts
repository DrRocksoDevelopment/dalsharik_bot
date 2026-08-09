import { existsSync, readFileSync } from 'node:fs';

const bump = process.argv[2] as 'patch' | 'minor' | 'major' | undefined;
if (!bump || !['patch', 'minor', 'major'].includes(bump)) {
  console.error('Укажи тип bump: patch | minor | major');
  process.exit(1);
}

if (!existsSync('CHANGELOG.md')) {
  console.error('CHANGELOG.md не найден. Создай ченджелог перед релизом.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const [major, minor, patch] = String(pkg.version).split('.').map(Number);

let next: string;
if (bump === 'patch') next = `${major}.${minor}.${(patch ?? 0) + 1}`;
else if (bump === 'minor') next = `${major}.${(minor ?? 0) + 1}.0`;
else next = `${(major ?? 0) + 1}.0.0`;

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const hasSection = new RegExp(`^## \\[v${next}\\]`, 'm').test(changelog);
if (!hasSection) {
  console.error(`В CHANGELOG.md нет секции «## [v${next}]» — выпускаемая версия не задокументирована.`);
  console.error('Перенеси изменения из «## [Unreleased]» в «## [v' + next + '] — <дата>» и закоммить, затем повтори релиз.');
  process.exit(1);
}
