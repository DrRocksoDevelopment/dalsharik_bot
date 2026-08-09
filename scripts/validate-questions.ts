import { createDataStore } from '../src/storage/data-store.js';
import { getEnv } from '../src/config/config.js';
import { validateQuestionSet } from '../src/game/question-validator.js';

const env = getEnv();

const store = createDataStore(env.dataDir);

async function run(): Promise<void> {
  const questions = await store.questions.getAll();
  const errors = validateQuestionSet(questions);

  if (errors.length > 0) {
    console.error(`Найдено ошибок: ${errors.length}`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`Валидация пройдена: ${questions.length} вопросов, ошибок нет`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
