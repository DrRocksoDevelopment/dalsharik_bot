import type { Logger } from 'winston';
import type { DataStore } from '../../storage/data-store.js';
import type { TextStreamer } from '../../telegram/stream.js';
import { OpenRouterClient, getOrCreateClient } from '../../ai/openrouter-client.js';
import { AI_SETTINGS_ID } from '../../ai/types.js';
import type { MetricsStore } from '../../metrics/metrics.js';
import type { Question } from '../question.js';
import type { QuestionResults } from '../stats.js';
import type { UserProfile } from '../user.js';
import type { StreakHighlight } from '../../content/results.js';

export const DEFAULT_HOST_PROMPT = `Ты — Дальшарик, живой и харизматичный ведущий викторины «Что было дальше?» в Telegram. Веди разбор результатов опроса как настоящее шоу: с драматизмом, лёгкой иронией и искренним интересом.

Правила:
- Пиши ТОЛЬКО по фактам из контекста: распределение голосов, правильный ответ, объяснение.
- Язык — живой русский, без markdown, без эмодзи, без звёздочек.
- Результат — готовый план выступления: массив строк. Каждая строка — один «кадр» шоу, который бот показывает отдельно с паузой. Пример: «17 человек выбрали вариант Б…», «Жаль, что неправильно», «5 человек выбрали вариант А», «В начальной школе был бы праздник…», «но мы не в началке, и это неверный ответ».
- Интригуй: не раскрывай правильный ответ до самой последней строки. В финальной строке назови верный вариант и кратко объясни, почему он правильный.
- Не упоминай следующие события, ссылки на источники и прочую служебную информацию — только разбор этого вопроса.
- 4–9 строк, суммарно до ~250 слов.

Верни ТОЛЬКО валидный JSON-объект вида {"lines": ["строка 1", "строка 2"]} без markdown-обёрток и пояснений.`;

export interface HostContext {
  chatTitle?: string;
  question: Question;
  results: QuestionResults;
  users: Map<string, UserProfile>;
  streakHighlights?: StreakHighlight[];
  chatStreakRecord?: number | null;
  nextEventLocalTime?: string;
  questionMessageId?: number;
}

export type ShowMode = 'ai' | 'static';

function displayName(user: UserProfile | undefined, userId: string): string {
  if (!user) return `@${userId}`;
  if (user.username) return `@${user.username}`;
  return user.firstName ?? `@${userId}`;
}

export function buildHostPrompt(ctx: HostContext, instruction: string = DEFAULT_HOST_PROMPT): string {
  const { question, results, users } = ctx;
  const correct = question.answers.find((a) => a.id === question.correctAnswer);
  const parts: string[] = [];

  parts.push(`Чат: ${ctx.chatTitle ?? 'наш чат'}`);
  parts.push(`Событие: ${question.event.title} (${question.eventDate})`);
  parts.push(`Контекст: ${question.event.context}`);
  parts.push(`Вопрос: ${question.question}`);
  parts.push(`Варианты:\n${question.answers.map((a) => `- ${a.id}. ${a.text}`).join('\n')}`);
  parts.push(
    `Правильный ответ: ${question.correctAnswer}${correct ? ` — ${correct.text}` : ''}`,
  );
  parts.push(`Объяснение: ${question.explanation}`);
  parts.push('');
  parts.push('Результаты опроса:');
  parts.push(
    `Ответили: ${results.totalPlayers}; правильно: ${results.correct}; неверно: ${results.wrong}; точность: ${results.accuracy.toFixed(1)}%`,
  );
  parts.push(
    `Распределение:\n${question.answers.map((a) => `- ${a.id}. ${results.answerDistribution[a.id] ?? 0}`).join('\n')}`,
  );
  if (results.topPlayers.length > 0) {
    parts.push(
      `Топ по очкам:\n${results.topPlayers.map((p) => `- ${displayName(users.get(p.userId), p.userId)}: ${p.points}`).join('\n')}`,
    );
  }
  if (results.fastestCorrect) {
    parts.push(
      `Быстрее всех правильно ответил: ${displayName(users.get(results.fastestCorrect.userId), results.fastestCorrect.userId)}`,
    );
  }
  if (ctx.streakHighlights && ctx.streakHighlights.length > 0) {
    parts.push(
      `Серии:\n${ctx.streakHighlights.map((h) => `- ${displayName(users.get(h.userId), h.userId)}: ${h.currentStreak}`).join('\n')}`,
    );
  }
  if (ctx.chatStreakRecord !== null && ctx.chatStreakRecord !== undefined) {
    parts.push(`Рекорд чата: ${ctx.chatStreakRecord}`);
  }

  return `${instruction}\n\n## Контекст для шоу\n${parts.join('\n')}`;
}

export type ParseShowPlanResult = { ok: true; lines: string[] } | { ok: false; reason: string };

export function parseShowPlan(rawText: string): ParseShowPlanResult {
  const trimmed = rawText.trim().replace(/^\uFEFF/, '');
  const fenced = /^```(?:json)?\s*([\s\S]*?)```\s*$/.exec(trimmed);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, reason: `невалидный JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'ожидался объект с полем "lines"' };
  }
  const list = (parsed as { lines?: unknown }).lines;
  if (!Array.isArray(list)) return { ok: false, reason: 'ожидался объект с полем "lines"' };
  const lines = list
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0) return { ok: false, reason: 'план пустой' };
  return { ok: true, lines };
}

export interface ShowHost {
  show(chatId: string, ctx: HostContext): Promise<ShowMode>;
}

export interface AiHostDeps {
  logger: Logger;
  store: DataStore;
  streamer: TextStreamer;
  envApiKey?: string | null;
  envModel?: string | null;
  envOpenrouterTimeoutMs?: number;
  hostInstruction?: string;
  createClient?: (apiKey: string, model: string, timeoutMs?: number) => OpenRouterClient;
  metrics?: MetricsStore;
}

export class AiHost implements ShowHost {
  private readonly hostInstruction: string;

  constructor(private readonly deps: AiHostDeps) {
    this.hostInstruction = deps.hostInstruction ?? DEFAULT_HOST_PROMPT;
  }

  async show(chatId: string, ctx: HostContext): Promise<ShowMode> {
    try {
      const settings = await this.deps.store.aiSettings.get(AI_SETTINGS_ID);
      const apiKey = settings?.apiKey ?? this.deps.envApiKey ?? null;
      const model = settings?.model ?? this.deps.envModel ?? null;
      if (!apiKey || !model) {
        this.deps.logger.info('AI-ведущий пропущен: нет ключа/модели', { chatId });
        return 'static';
      }

      const client = (this.deps.createClient ?? getOrCreateClient)(
        apiKey,
        model,
        this.deps.envOpenrouterTimeoutMs,
      );
      const instruction = settings?.hostPrompt ?? this.hostInstruction;
      const prompt = buildHostPrompt(ctx, instruction);
      const { rawText, usage } = await client.generate(prompt, {
        temperature: 0.9,
        maxTokens: 800,
        webSearch: false,
      });
      await this.deps.metrics?.recordAiUsage({ kind: 'host', ...usage });

      const plan = parseShowPlan(rawText);
      if (!plan.ok) {
        this.deps.logger.warn('AI-ведущий: невалидный план', { chatId, reason: plan.reason });
        return 'static';
      }

      await this.deps.streamer.stream(chatId, plan.lines, ctx.questionMessageId);
      return 'ai';
    } catch (err) {
      this.deps.logger.error('AI-ведущий: ошибка, статичная карточка', {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'static';
    }
  }
}
