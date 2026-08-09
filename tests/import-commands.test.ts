import { describe, expect, it } from 'vitest';
import { parseQuestionsFile } from '../src/bot/import-commands.js';

describe('parseQuestionsFile', () => {
  it('разбирает массив вопросов', () => {
    const r = parseQuestionsFile('[{"id":"q1"}]');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.questions).toEqual([{ id: 'q1' }]);
  });

  it('разбирает обёртку { questions: [...] }', () => {
    const r = parseQuestionsFile('{"questions":[{"id":"q1"}]}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.questions).toHaveLength(1);
  });

  it('срезает BOM', () => {
    const r = parseQuestionsFile('\uFEFF[{"id":"q1"}]');
    expect(r.ok).toBe(true);
  });

  it('возвращает ошибку на битый JSON', () => {
    const r = parseQuestionsFile('{ сломанный json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('невалидный JSON');
  });

  it('возвращает ошибку, если не массив и не обёртка', () => {
    expect(parseQuestionsFile('{"foo":1}').ok).toBe(false);
    expect(parseQuestionsFile('42').ok).toBe(false);
    expect(parseQuestionsFile('null').ok).toBe(false);
  });
});
