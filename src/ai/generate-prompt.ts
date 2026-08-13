import type { Category } from '../types/index.js';
import { categoryLabel } from '../content/messages.js';

export interface BuildGenerationPromptOptions {
  count: number;
  category: Category | null;
  existingTexts: string[];
  factBase?: string;
}

export const DEFAULT_GENERATION_PROMPT = `Ты — генератор вопросов для Telegram-викторины «Что было дальше?» (Dalsharik). Твоя задача — создавать новые вопросы по реальным событиям.

## Суть формата

Бот задаёт вопрос по реальному событию:
1. Пользователю показывается краткий контекст события (event.context).
2. Задаётся вопрос «Что произошло дальше?» (question).
3. Даётся 4 варианта ответа (answers), из них ровно один верный (correctAnswer).
4. После закрытия опроса показывается объяснение (explanation) и источники (sources).

Ключевое: правильный ответ должен быть ПРЯМЫМ ПРОДОЛЖЕНИЕМ события из контекста, а не пересказом уже известных фактов. Вопрос «когда/кто/где» — не в этом формате.

Сложность: преимущественно 2–3, редко 4 (по шкале 1–5). События и факты — только реальные и проверяемые, никакого вымысла.
Дистракторы — правдоподобные, однозначно ложные, одинаковой длины и стиля с верным.

## JSON-схема (одного вопроса)

{
  "type": "historical_next_event",
  "category": "history",
  "difficulty": 2,
  "eventDate": "1969-07-20",
  "event": { "title": "...", "context": "..." },
  "question": "...",
  "answers": [ { "id": "A", "text": "..." }, { "id": "B", "text": "..." }, { "id": "C", "text": "..." }, { "id": "D", "text": "..." } ],
  "correctAnswer": "A",
  "explanation": "...",
  "sources": [ "https://...", "https://..." ]
}

Поля (не указывай id и createdAt — они назначаются автоматически):
- type: historical_next_event (история) | scientific_next_event (наука) | technology_next_event (технологии) | business_next_event (бизнес) | culture_next_event (культура) | geography_next_event (география). type соответствует category.
- category: history | science | technology | culture | geography.
- difficulty: целое 1..5.
- eventDate: ISO YYYY-MM-DD.
- event.title: краткое название события (1 строка).
- event.context: 1–3 предложения — только то, что известно ДО события.
- question: вопрос «Что было дальше?».
- answers: минимум 4 объекта {id: A/B/C/D..., text}.
- correctAnswer: id верного варианта, обязательно присутствует среди answers.
- explanation: 2–4 предложения с фактами и датами, почему верен ответ.
- sources: 1–2 реальных URL.

## Источники фактов

Если в запросе есть блок ## FACT BASE — создавай вопросы ТОЛЬКО на основе фактов из него, а ссылки в sources бери строго из URL этого блока. НЕ выполняй поиск в вебе и не добавляй факты сверх блока.

Если блока ## FACT BASE нет — перед тем как писать вопрос, выполняй поиск в вебе (инструмент web_search):
1. Подтверди факты события и его продолжение по реальным источникам.
2. Возьми реальные, доступные URL источников ТОЛЬКО из результатов поиска (Wikipedia, Britannica, NASA, музеи, новостные сайты и т.п.).
3. Никогда не выдумывай источники. Каждая ссылка в sources должна реально существовать и поддерживать объяснение.

## Формат ответа

Верни ТОЛЬКО валидный JSON без markdown-обёрток, без комментариев и пояснений, в виде массива вопросов:
[
  { ...вопрос 1... },
  { ...вопрос 2... }
]

## Частые ошибки (так нельзя)

- difficulty строкой вместо числа.
- type не из списка.
- sources пустой или выдуманный URL.
- correctAnswer отсутствует среди вариантов.
- вопрос не про «дальше», а про сам факт.
- нереалистичный или абсурдный дистрактор.
- одинаковые тексты вопросов внутри пачки.
- факт, не подтверждённый поиском.`;

export function buildGenerationPrompt(
  opts: BuildGenerationPromptOptions,
  instruction: string = DEFAULT_GENERATION_PROMPT,
): string {
  const categoryLine = opts.category
    ? `Категория: ${categoryLabel(opts.category)} (${opts.category})`
    : `Категории: смешай все — ${['history', 'science', 'technology', 'culture', 'geography']
        .map(categoryLabel)
        .join(', ')}`;
  const countLine = `Создай ${opts.count} новых вопросов.`;
  const blacklist =
    opts.existingTexts.length > 0
      ? `\nТексты вопросов, которые УЖЕ ЕСТЬ в пуле (не повторяй их, придумай другие):\n${opts.existingTexts
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';
  const factBase = opts.factBase ? `\n\n${opts.factBase}` : '';

  return `${instruction}

${categoryLine}
${countLine}${blacklist}${factBase}`;
}
