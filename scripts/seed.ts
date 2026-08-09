import { createDataStore } from '../src/storage/data-store.js';
import { getEnv } from '../src/config/config.js';
import { SEED_QUESTIONS } from '../src/content/seed-questions.js';

const env = getEnv();

const store = createDataStore(env.dataDir);

async function run(): Promise<void> {
  let added = 0;
  for (const q of SEED_QUESTIONS) {
    if (!(await store.questions.exists(q.id))) {
      await store.questions.insert(q);
      added += 1;
    }
  }
  const total = (await store.questions.getAll()).length;
  console.log(`Добавлено: ${added}. Всего вопросов в хранилище: ${total}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
