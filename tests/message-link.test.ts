import { describe, expect, it } from 'vitest';
import { buildMessageLink } from '../src/utils/message-link.js';

describe('buildMessageLink', () => {
  it('строит ссылку для супергруппы (chatId с префиксом -100)', () => {
    expect(buildMessageLink('-1001234567890', 777)).toBe('https://t.me/c/1234567890/777');
  });

  it('строит ссылку для обычной группы без префикса 100', () => {
    expect(buildMessageLink('-12345', 7)).toBe('https://t.me/c/12345/7');
  });

  it('возвращает null для нечислового или позитивного chatId', () => {
    expect(buildMessageLink('@channel', 7)).toBeNull();
    expect(buildMessageLink('12345', 7)).toBeNull();
  });

  it('возвращает null при невалидном messageId', () => {
    expect(buildMessageLink('-100123', 0)).toBeNull();
    expect(buildMessageLink('-100123', -5)).toBeNull();
  });
});
