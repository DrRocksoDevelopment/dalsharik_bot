import { describe, expect, it } from 'vitest';
import {
  normalizeGenerated,
  nextQuestionId,
  parseGeneratedText,
  sanitizeGeneratedQuestion,
} from '../src/ai/normalize-generated.js';
import type { Question } from '../src/game/question.js';

const rawValid = {
  type: 'historical_next_event',
  category: 'history',
  difficulty: 2,
  eventDate: '1969-07-20',
  event: { title: 'Apollo 11', context: 'Контекст события' },
  question: 'Что произошло дальше?',
  answers: [
    { text: 'a', correct: false },
    { text: 'b', correct: true },
    { text: 'c', correct: false },
    { text: 'd', correct: false },
  ],
  explanation: 'Объяснение правильного ответа',
  sources: ['https://example.com/1'],
};

describe('parseGeneratedText', () => {
  it('разбирает обычный массив', () => {
    const r = parseGeneratedText(JSON.stringify([rawValid]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.list).toHaveLength(1);
  });

  it('разбирает обёртку { questions: [...] }', () => {
    const r = parseGeneratedText(JSON.stringify({ questions: [rawValid] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.list).toHaveLength(1);
  });

  it('срезает markdown-обёртку ```json', () => {
    const r = parseGeneratedText('```json\n' + JSON.stringify([rawValid]) + '\n```');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.list).toHaveLength(1);
  });

  it('возвращает ошибку на битый JSON', () => {
    const r = parseGeneratedText('{ не json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('невалидный JSON');
  });

  it('возвращает ошибку, если не массив и не обёртка', () => {
    expect(parseGeneratedText('"привет"').ok).toBe(false);
    expect(parseGeneratedText('42').ok).toBe(false);
  });
});

describe('nextQuestionId', () => {
  it('выдаёт id после максимального существующего', () => {
    const assign = nextQuestionId(['event_000010', 'event_000007', 'other']);
    expect(assign()).toBe('event_000011');
    expect(assign()).toBe('event_000012');
  });

  it('без существующих начинает с event_000001', () => {
    expect(nextQuestionId([])()).toBe('event_000001');
  });
});

describe('sanitizeGeneratedQuestion', () => {
  it('исправляет опечатку history_next_event → historical_next_event', () => {
    const res = sanitizeGeneratedQuestion({ ...rawValid, type: 'history_next_event' }, () => 'event_000001', '2026-01-01T00:00:00.000Z');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.question.type).toBe('historical_next_event');
  });

  it('приводит difficulty из строки в число', () => {
    const res = sanitizeGeneratedQuestion({ ...rawValid, difficulty: '3' }, () => 'id', 'now');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.question.difficulty).toBe(3);
  });

  it('назначает id и createdAt', () => {
    const res = sanitizeGeneratedQuestion(rawValid, () => 'event_000001', '2026-01-01T00:00:00.000Z');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.question.id).toBe('event_000001');
      expect(res.question.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(res.question.nextEventId).toBeUndefined();
    }
  });

  it('отбрасывает nextEventId от модели', () => {
    const res = sanitizeGeneratedQuestion({ ...rawValid, nextEventId: 'event_000999' }, () => 'id', 'now');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.question.nextEventId).toBeUndefined();
  });

  it('отклоняет источники без http(s)', () => {
    const res = sanitizeGeneratedQuestion({ ...rawValid, sources: ['example.com'] }, () => 'id', 'now');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('http(s)'))).toBe(true);
  });

  it('отклоняет отсутствие верного варианта', () => {
    const res = sanitizeGeneratedQuestion(
      { ...rawValid, answers: rawValid.answers.map((a) => ({ ...a, correct: false })) },
      () => 'id',
      'now',
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('ровно один верный'))).toBe(true);
  });

  it('отклоняет слишком мало вариантов', () => {
    const res = sanitizeGeneratedQuestion({ ...rawValid, answers: rawValid.answers.slice(0, 2) }, () => 'id', 'now');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes('4 варианта'))).toBe(true);
  });

  it('отклоняет неизвестный тип', () => {
    const res = sanitizeGeneratedQuestion({ ...rawValid, type: 'space_next_event' }, () => 'id', 'now');
    expect(res.ok).toBe(false);
  });
});

describe('normalizeGenerated', () => {
  const now = '2026-01-01T00:00:00.000Z';

  it('возвращает валидные вопросы с уникальными id', () => {
    const text = JSON.stringify([
      rawValid,
      { ...rawValid, question: 'Второй вопрос', event: { ...rawValid.event, title: 'Аполлон-12' } },
    ]);
    const res = normalizeGenerated(text, { existingIds: ['event_000010'], existingTexts: [], now });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.questions).toHaveLength(2);
      expect(res.questions[0]!.id).toBe('event_000011');
      expect(res.questions[1]!.id).toBe('event_000012');
    }
  });

  it('фильтрует битые и собирает ошибки', () => {
    const text = JSON.stringify([rawValid, { ...rawValid, sources: [] }]);
    const res = normalizeGenerated(text, { existingIds: [], existingTexts: [], now });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.questions).toHaveLength(1);
      expect(res.rejected).toHaveLength(1);
      expect(res.rejected[0]!.errors).toContain('нет источников');
    }
  });

  it('не повторяет существующие тексты вопросов', () => {
    const text = JSON.stringify([rawValid]);
    const res = normalizeGenerated(text, {
      existingIds: [],
      existingTexts: ['Что произошло дальше?'],
      now,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.questions).toHaveLength(0);
      expect(res.rejected[0]!.errors).toContain('повторяет существующий вопрос');
    }
  });

  it('не допускает дубли текстов внутри пачки', () => {
    const text = JSON.stringify([rawValid, { ...rawValid }]);
    const res = normalizeGenerated(text, { existingIds: [], existingTexts: [], now });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.questions).toHaveLength(1);
      expect(res.rejected).toHaveLength(1);
    }
  });

  it('не повторяет темы существующих вопросов', () => {
    const text = JSON.stringify([rawValid]);
    const res = normalizeGenerated(text, {
      existingIds: [],
      existingTexts: [],
      existingTopics: ['Apollo 11'],
      now,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.questions).toHaveLength(0);
      expect(res.rejected[0]!.errors).toContain('повторяет тему существующего вопроса');
    }
  });

  it('возвращает reason на невалидный JSON', () => {
    const res = normalizeGenerated('не json', { existingIds: [], existingTexts: [], now });
    expect(res.ok).toBe(false);
  });

  it('возвращает объекты Question, проходящие isQuestion', () => {
    const res = normalizeGenerated(JSON.stringify([rawValid]), { existingIds: [], existingTexts: [], now });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const q: Question = res.questions[0]!;
      expect(q.id).toBe('event_000001');
      expect(q.answers.length).toBeGreaterThanOrEqual(4);
      expect(q.answers.filter((a) => a.correct)).toHaveLength(1);
      expect(q.answers.find((a) => a.correct)?.text).toBe('b');
    }
  });

  it('перемешивает варианты, сохраняя ровно один верный', () => {
    const res = sanitizeGeneratedQuestion(rawValid, () => 'event_000001', now);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.question.answers.filter((a) => a.correct)).toHaveLength(1);
      expect(res.question.answers.find((a) => a.correct)?.text).toBe('b');
      expect(new Set(res.question.answers.map((a) => a.text))).toEqual(new Set(['a', 'b', 'c', 'd']));
    }
  });
});
