import { describe, expect, it } from 'vitest';
import { buildGenerationPrompt, DEFAULT_GENERATION_PROMPT } from '../src/ai/generate-prompt.js';

describe('buildGenerationPrompt', () => {
  it('включает количество и категорию', () => {
    const prompt = buildGenerationPrompt({ count: 5, category: 'history', existingTexts: [] });
    expect(prompt).toContain('5 новых вопросов');
    expect(prompt).toContain('history');
    expect(prompt).toContain('История');
  });

  it('без категории — смешивает все', () => {
    const prompt = buildGenerationPrompt({ count: 10, category: null, existingTexts: [] });
    expect(prompt).toContain('смешай все');
  });

  it('передаёт чёрный список существующих текстов', () => {
    const prompt = buildGenerationPrompt({
      count: 3,
      category: null,
      existingTexts: ['Вопрос про Луну', 'Вопрос про Рим'],
    });
    expect(prompt).toContain('Вопрос про Луну');
    expect(prompt).toContain('Вопрос про Рим');
  });

  it('не упоминает пустой чёрный список', () => {
    const prompt = buildGenerationPrompt({ count: 3, category: null, existingTexts: [] });
    expect(prompt).not.toContain('УЖЕ ЕСТЬ');
  });

  it('требует web-поиск и реальные источники', () => {
    const prompt = buildGenerationPrompt({ count: 3, category: null, existingTexts: [] });
    expect(prompt.toLowerCase()).toContain('web_search');
    expect(prompt).toContain('Никогда не выдумывай источники');
  });

  it('по умолчанию использует стандартный промпт', () => {
    const prompt = buildGenerationPrompt({ count: 3, category: null, existingTexts: [] });
    expect(prompt).toContain(DEFAULT_GENERATION_PROMPT);
  });

  it('кастомная инструкция заменяет стандартную, но сохраняет динамику', () => {
    const custom = 'Ты — генератор каверзных вопросов про космос.';
    const prompt = buildGenerationPrompt(
      { count: 7, category: 'science', existingTexts: ['Вопрос про Марс'] },
      custom,
    );
    expect(prompt).toContain(custom);
    expect(prompt).not.toContain('генератор вопросов для Telegram-викторины');
    expect(prompt).toContain('7 новых вопросов');
    expect(prompt).toContain('Вопрос про Марс');
    expect(prompt).toContain('Наука (science)');
  });
});
