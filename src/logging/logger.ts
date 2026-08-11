import winston from 'winston';
import { getEnv, type EnvConfig } from '../config/config.js';
import { TelegramTransport } from './telegram-transport.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const { combine, timestamp, printf, colorize, json } = winston.format;

export const consoleFormat = printf(({ level, message, timestamp, error, ...meta }) => {
  const suffixParts: string[] = [];
  if (error !== undefined) suffixParts.push(String(error));
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) suffixParts.push(`${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
  }
  const suffix = suffixParts.length > 0 ? ` — ${suffixParts.join(', ')}` : '';
  return `${timestamp} [${level}] ${message}${suffix}`;
});

export type LoggerEnvConfig = Pick<EnvConfig, 'logLevel' | 'logFile' | 'logChatId'>;

export function initLogger(
  getBot: () => import('telegraf').Telegraf,
  env: LoggerEnvConfig = getEnv(),
): winston.Logger {
  mkdirSync(dirname(env.logFile), { recursive: true });

  const transports: winston.transport[] = [
    new winston.transports.Console({
      level: env.logLevel,
      format: combine(colorize(), timestamp(), consoleFormat),
    }),
    new winston.transports.File({
      filename: env.logFile,
      level: env.logLevel,
      format: combine(timestamp(), json()),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ];

  if (env.logChatId) {
    transports.push(
      new TelegramTransport({
        bot: getBot(),
        chatId: env.logChatId,
        level: 'error',
        format: winston.format.printf(({ message }) => String(message)),
      }),
    );
  }

  return winston.createLogger({
    level: env.logLevel,
    transports,
  });
}
