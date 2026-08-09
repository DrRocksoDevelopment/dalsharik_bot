import winston from 'winston';
import { getEnv } from '../config/config.js';

const env = getEnv();
import { TelegramTransport } from './telegram-transport.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const { combine, timestamp, printf, colorize, json } = winston.format;

const consoleFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}] ${message}`;
});

mkdirSync(dirname(env.logFile), { recursive: true });

let telegramTransport: winston.transport | null = null;

export function initLogger(getBot: () => import('telegraf').Telegraf): winston.Logger {
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
    telegramTransport = new TelegramTransport({
      bot: getBot(),
      chatId: env.logChatId,
      level: 'error',
      format: winston.format.printf(({ message }) => String(message)),
    });
    transports.push(telegramTransport);
  }

  const logger = winston.createLogger({
    level: env.logLevel,
    transports,
  });

  return logger;
}

export function setTelegramTransport(transport: winston.transport | null): void {
  telegramTransport = transport;
}
