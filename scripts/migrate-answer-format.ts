import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { getEnv } from '../src/config/config.js';

const FILES = ['questions.json', 'polls.json', 'answers.json', 'metrics.json'] as const;

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(JSON.stringify(data, null, 2), 'utf-8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
}

async function backup(filePath: string): Promise<void> {
  try {
    await fs.copyFile(filePath, `${filePath}.bak-answer-format`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

function letterToIndex(letter: string): number | null {
  const code = letter.charCodeAt(0);
  return code >= 65 && code <= 68 ? code - 65 : null;
}

function isMigratedAnswer(a: unknown): boolean {
  return (
    typeof a === 'object' &&
    a !== null &&
    'text' in (a as Record<string, unknown>) &&
    'correct' in (a as Record<string, unknown>) &&
    !('id' in (a as Record<string, unknown>))
  );
}

function migrateQuestionSet(questions: Array<Record<string, unknown>>): number {
  let migrated = 0;
  for (const q of questions) {
    if (isMigratedAnswer((q.answers as unknown[])?.[0])) continue;
    const correctAnswer = String(q.correctAnswer);
    q.answers = (q.answers as Array<{ id: string; text: string }>).map((a) => ({
      text: a.text,
      correct: a.id === correctAnswer,
    }));
    delete q.correctAnswer;
    migrated += 1;
  }
  return migrated;
}

async function run(): Promise<void> {
  const dataDir = getEnv().dataDir;

  const importGlob = join(dataDir, 'imports', 'done', '*.json');
  const importDirs = await fs.readdir(join(dataDir, 'imports', 'done')).catch(() => []);
  const importFiles = importDirs
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(dataDir, 'imports', 'done', name));
  void importGlob;

  const extraQuestionFiles = [join(dataDir, 'questions_backup.json'), ...importFiles];
  for (const filePath of extraQuestionFiles) {
    await backup(filePath);
  }

  for (const name of FILES) {
    await backup(join(dataDir, name));
  }

  const questions = (await readJson(join(dataDir, 'questions.json'))) as Array<Record<string, unknown>>;
  const polls = (await readJson(join(dataDir, 'polls.json'))) as Array<Record<string, unknown>>;
  const answers = (await readJson(join(dataDir, 'answers.json'))) as Array<Record<string, unknown>>;
  const metrics = (await readJson(join(dataDir, 'metrics.json'))) as Array<Record<string, unknown>>;

  const questionById = new Map<string, Array<{ id: string }>>();
  for (const q of questions) {
    questionById.set(String(q.id), (q.answers as Array<{ id: string }>).slice());
  }

  const migratedMain = migrateQuestionSet(questions);

  for (const filePath of extraQuestionFiles) {
    let list: unknown;
    try {
      list = await readJson(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    if (!Array.isArray(list)) {
      console.warn(`Пропуск ${filePath}: ожидался массив`);
      continue;
    }
    const migrated = migrateQuestionSet(list as Array<Record<string, unknown>>);
    await writeJson(filePath, list);
    console.log(`Мигрированы вопросы: ${filePath} (${migrated} вопросов)`);
  }

  for (const p of polls) {
    const qAnswers = questionById.get(String(p.questionId));
    if (!Array.isArray(p.optionMap)) continue;
    p.optionMap = (p.optionMap as unknown[]).map((letter) => {
      if (typeof letter === 'number') return letter;
      const idx = letterToIndex(String(letter));
      if (idx === null) throw new Error(`Письмо вне диапазона в poll ${p.id}: ${letter}`);
      return idx;
    });
    if (qAnswers) {
      (p.optionMap as number[]).forEach((idx) => {
        if (idx < 0 || idx >= qAnswers.length) {
          throw new Error(`Индекс ${idx} вне диапазона в poll ${p.id}`);
        }
      });
    }
  }

  for (const a of answers) {
    if (typeof a.selectedOption === 'string') {
      const idx = letterToIndex(a.selectedOption);
      if (idx === null) throw new Error(`Письмо вне диапазона в answer ${a.id}: ${a.selectedOption}`);
      a.selectedOption = idx;
    }
  }

  const metricsItem = metrics.find((m) => m.id === 'global');
  if (metricsItem) {
    const data = (metricsItem as { data: { questions: Record<string, { answer_distribution?: Record<string, number> }> } }).data;
    for (const [questionId, q] of Object.entries(data.questions ?? {})) {
      if (!q.answer_distribution) continue;
      const remapped: Record<string, number> = {};
      for (const [letter, count] of Object.entries(q.answer_distribution)) {
        const idx = letterToIndex(String(letter));
        if (idx !== null) {
          remapped[String(idx)] = count;
        } else {
          remapped[letter] = count;
        }
      }
      q.answer_distribution = remapped;
      void questionId;
    }
  }

  await writeJson(join(dataDir, 'questions.json'), questions);
  await writeJson(join(dataDir, 'polls.json'), polls);
  await writeJson(join(dataDir, 'answers.json'), answers);
  await writeJson(join(dataDir, 'metrics.json'), metrics);

  console.log(
    `Миграция завершена: ${questions.length} вопросов (${migratedMain} переведено), ${polls.length} polls, ${answers.length} ответов`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
