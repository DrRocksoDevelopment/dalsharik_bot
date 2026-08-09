import { readFile } from 'node:fs/promises';
import winston from 'winston';
import { createDataStore } from '../src/storage/data-store.js';
import { getEnv } from '../src/config/config.js';
import { InMemoryQuestionEngine } from '../src/game/question-engine.js';
import { QuestionReloader } from '../src/game/question-reloader.js';
import type { Question } from '../src/game/question.js';

const FILE = process.argv[2];

async function parseQuestions(raw: string): Promise<Question[]> {
  const parsed: unknown = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(list)) throw new Error('ожидался JSON-массив или { "questions": [...] }');
  return list as Question[];
}

async function run(): Promise<void> {
  if (!FILE) {
    console.error('Укажите путь к файлу: npm run import-questions -- <file.json>');
    process.exit(1);
  }
  const env = getEnv();
  const store = createDataStore(env.dataDir);
  const logger = winston.createLogger({ level: 'info', transports: [new winston.transports.Console()] });
  const engine = new InMemoryQuestionEngine([]);
  const reloader = new QuestionReloader({ logger, store, engine, dataDir: env.dataDir });

  const questions = await parseQuestions(await readFile(FILE, 'utf-8'));
  const result = await reloader.importQuestions(questions);

  console.log(`Импортировано: ${result.imported}`);
  for (const r of result.renamed) console.log(`  переименовано: ${r.oldId} -> ${r.newId}`);
  for (const s of result.skipped) console.log(`  пропущено: ${s.id} — ${s.reason}`);
  for (const e of result.errors) console.error(`  ошибка: ${e.id} — ${e.errors.join('; ')}`);

  const total = (await store.questions.getAll()).length;
  console.log(`Всего вопросов в пуле: ${total}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
