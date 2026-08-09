import { describe, expect, it } from 'vitest';
import {
  difficultyWindowForHour,
  effectiveDifficultyRange,
  intersectDifficultyRange,
  localHourFromUtc,
  normalizeOffsetMinutes,
} from '../src/game/time-of-day.js';
import { formatTimezoneOffset, formatLocalTime, parseTimezoneOffset, formatRelativeDuration } from '../src/utils/timezone.js';

describe('parseTimezoneOffset', () => {
  it('парсит часы со знаком', () => {
    expect(parseTimezoneOffset('+3')).toBe(180);
    expect(parseTimezoneOffset('-5')).toBe(-300);
    expect(parseTimezoneOffset('0')).toBe(0);
    expect(parseTimezoneOffset('3')).toBe(180);
  });

  it('парсит часы и минуты', () => {
    expect(parseTimezoneOffset('+5:30')).toBe(330);
    expect(parseTimezoneOffset('-3:45')).toBe(-225);
    expect(parseTimezoneOffset('+5:05')).toBe(305);
  });

  it('границы диапазона', () => {
    expect(parseTimezoneOffset('-12')).toBe(-720);
    expect(parseTimezoneOffset('+14')).toBe(840);
  });

  it('отклоняет невалидные значения', () => {
    expect(parseTimezoneOffset('+15')).toBeNull();
    expect(parseTimezoneOffset('-13')).toBeNull();
    expect(parseTimezoneOffset('+5:60')).toBeNull();
    expect(parseTimezoneOffset('+5:99')).toBeNull();
    expect(parseTimezoneOffset('abc')).toBeNull();
    expect(parseTimezoneOffset('')).toBeNull();
  });
});

describe('formatTimezoneOffset', () => {
  it('форматирует смещение', () => {
    expect(formatTimezoneOffset(180)).toBe('UTC+3');
    expect(formatTimezoneOffset(-300)).toBe('UTC-5');
    expect(formatTimezoneOffset(330)).toBe('UTC+5:30');
    expect(formatTimezoneOffset(0)).toBe('UTC+0');
  });

  it('форматирует локальное время по смещению', () => {
    const utc = Date.parse('2026-08-09T12:00:00.000Z');
    expect(formatLocalTime(utc, 180)).toBe('15:00');
    expect(formatLocalTime(utc, 0)).toBe('12:00');
    expect(formatLocalTime(utc, -300)).toBe('07:00');
    expect(formatLocalTime(utc, -720)).toBe('00:00');
    expect(formatLocalTime(utc, 780)).toBe('01:00');
  });
});

describe('time of day', () => {
  it('определяет окно по локальному часу', () => {
    expect(difficultyWindowForHour(6).min).toBe(1);
    expect(difficultyWindowForHour(12).min).toBe(2);
    expect(difficultyWindowForHour(18).min).toBe(3);
    expect(difficultyWindowForHour(0).min).toBe(2);
    expect(difficultyWindowForHour(5).min).toBe(2);
  });

  it('считает локальный час по UTC и смещению', () => {
    const utc = Date.parse('2026-08-09T05:00:00.000Z');
    expect(localHourFromUtc(utc, 180)).toBe(8);
    expect(localHourFromUtc(utc, 0)).toBe(5);
    expect(localHourFromUtc(utc, -300)).toBe(0);
    expect(localHourFromUtc(utc, 780)).toBe(18);
  });

  it('нормализует смещение в диапазон суток', () => {
    expect(normalizeOffsetMinutes(1440)).toBe(0);
    expect(normalizeOffsetMinutes(-60)).toBe(1380);
  });

  it('пересекает окно времени суток с диапазоном чата', () => {
    expect(intersectDifficultyRange(1, 2, 1, 5)).toEqual({ min: 1, max: 2 });
    expect(intersectDifficultyRange(1, 2, 4, 5)).toEqual({ min: 4, max: 5 });
  });

  it('считает эффективный диапазон сложности', () => {
    const utcMorning = Date.parse('2026-08-09T05:00:00.000Z');
    expect(effectiveDifficultyRange(utcMorning, 180, 1, 5)).toEqual({ min: 1, max: 2 });
    expect(effectiveDifficultyRange(utcMorning, 180, 4, 5)).toEqual({ min: 4, max: 5 });
  });
});

describe('formatRelativeDuration', () => {
  it('меньше минуты', () => {
    expect(formatRelativeDuration(0)).toBe('меньше минуты');
    expect(formatRelativeDuration(59_999)).toBe('меньше минуты');
  });

  it('минуты', () => {
    expect(formatRelativeDuration(60_000)).toBe('1 мин');
    expect(formatRelativeDuration(45 * 60_000)).toBe('45 мин');
  });

  it('часы и минуты', () => {
    expect(formatRelativeDuration(60 * 60_000)).toBe('1 ч');
    expect(formatRelativeDuration(2 * 60 * 60_000)).toBe('2 ч');
    expect(formatRelativeDuration(2 * 60 * 60_000 + 5 * 60_000)).toBe('2 ч 5 мин');
  });
});
