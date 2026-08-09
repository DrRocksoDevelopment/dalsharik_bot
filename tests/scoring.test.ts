import { describe, expect, it } from 'vitest';
import { calculatePoints, calculateStreakMultiplier } from '../src/game/scoring.js';
import { formatReactionTime } from '../src/content/messages.js';

describe('scoring', () => {
  it('базовые очки соответствуют сложности', () => {
    expect(calculatePoints({ difficulty: 4, streak: 0, alreadyAnswered: false }).basePoints).toBe(4);
    expect(calculatePoints({ difficulty: 2, streak: 0, alreadyAnswered: false }).points).toBe(2);
  });

  it('повторный вопрос даёт 0 очков', () => {
    const result = calculatePoints({ difficulty: 5, streak: 10, alreadyAnswered: true });
    expect(result.points).toBe(0);
    expect(result.isRepeat).toBe(true);
  });

  it('multiplier ограничен ×2', () => {
    expect(calculateStreakMultiplier(100)).toBe(2);
  });

  it('streak увеличивает очки', () => {
    const base = calculatePoints({ difficulty: 4, streak: 0, alreadyAnswered: false }).points;
    const boosted = calculatePoints({ difficulty: 4, streak: 5, alreadyAnswered: false }).points;
    expect(boosted).toBeGreaterThan(base);
  });
});

describe('formatReactionTime', () => {
  it('форматирует секунды', () => {
    expect(formatReactionTime(4200)).toBe('4.2 сек');
  });

  it('форматирует минуты', () => {
    expect(formatReactionTime(2 * 60 * 1000 + 14 * 1000)).toBe('2 мин 14 сек');
  });
});
