import { describe, expect, it } from 'vitest';
import {
  buildTopicBlacklist,
  extractUsedTopics,
  filterRepeatedTopics,
  isTopicSimilar,
  topicSimilarity,
  topicTokens,
} from '../src/ai/used-topics.js';
import type { Question } from '../src/game/question.js';

function question(overrides: Partial<Question>): Question {
  return {
    id: 'event_000001',
    type: 'historical_next_event',
    category: 'history',
    difficulty: 2,
    eventDate: '1969-07-20',
    event: { title: 'Аполлон-11', context: 'Контекст' },
    question: 'Что было дальше?',
    answers: [
      { id: 'A', text: 'А' },
      { id: 'B', text: 'Б' },
      { id: 'C', text: 'В' },
      { id: 'D', text: 'Г' },
    ],
    correctAnswer: 'A',
    explanation: 'Объяснение',
    sources: ['https://example.com'],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('topicTokens', () => {
  it('вырезает стоп-слова и пунктуацию', () => {
    expect(topicTokens('Первый полёт Гагарина в космос')).toEqual(['полёт', 'гагарина', 'космос']);
  });

  it('возвращает сырые токены, если все значимые — стоп-слова', () => {
    expect(topicTokens('и в на')).toEqual(['на']);
  });
});

describe('topicSimilarity', () => {
  it('высокое сходство для перефраза', () => {
    expect(topicSimilarity('Высадка на Луну', 'Высадка человека на Луну')).toBeGreaterThan(0.66);
  });

  it('низкое сходство для разных тем', () => {
    expect(topicSimilarity('Падение Рима', 'Высадка на Луну')).toBeLessThan(0.66);
  });
});

describe('isTopicSimilar', () => {
  it('ловит почти совпадающие темы', () => {
    expect(isTopicSimilar('Создание НАСА', 'Создание НАСА в 1958 году')).toBe(true);
  });

  it('не считает разными темами разные события', () => {
    expect(isTopicSimilar('Создание НАСА', 'Первый спутник')).toBe(false);
  });
});

describe('extractUsedTopics', () => {
  it('собирает темы из вопросов без дублей', () => {
    const topics = extractUsedTopics([
      question({ event: { title: 'Аполлон-11', context: 'c' } }),
      question({ event: { title: 'аполлон-11', context: 'c' } }),
      question({ event: { title: 'Падение Рима', context: 'c' } }),
      question({ event: { title: '', context: 'c' } }),
    ]);
    expect(topics).toEqual(['Аполлон-11', 'Падение Рима']);
  });
});

describe('buildTopicBlacklist', () => {
  it('ограничивает список сверху', () => {
    const many = Array.from({ length: 300 }, (_, i) => `Тема ${i}`);
    const list = buildTopicBlacklist(many, 100);
    expect(list.length).toBeLessThanOrEqual(100);
  });
});

describe('filterRepeatedTopics', () => {
  it('отбрасывает точные и близкие повторы', () => {
    const result = filterRepeatedTopics(
      [
        { title: 'Высадка на Луну', query: 'q1' },
        { title: 'Высадка человека на Луну', query: 'q2' },
        { title: 'Падение Рима', query: 'q3' },
      ],
      ['Высадка на Луну'],
    );
    expect(result.kept.map((t) => t.title)).toEqual(['Падение Рима']);
    expect(result.skipped.map((t) => t.title)).toEqual([
      'Высадка на Луну',
      'Высадка человека на Луну',
    ]);
  });
});
