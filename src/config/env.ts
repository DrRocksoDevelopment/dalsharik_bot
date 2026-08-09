import 'dotenv/config';

export interface EnvConfig {
  botToken: string;
  logLevel: string;
  logChatId: string | null;
  logFile: string;
  dataDir: string;
  botAdminId: number | null;
  openrouterApiKey: string | null;
  openrouterModel: string | null;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value.trim();
}

function optional(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim() === '') return null;
  return value.trim();
}

export function loadEnv(): EnvConfig {
  return {
    botToken: required('BOT_TOKEN'),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logChatId: process.env.LOG_CHAT_ID && process.env.LOG_CHAT_ID.trim() !== ''
      ? process.env.LOG_CHAT_ID.trim()
      : null,
    logFile: process.env.LOG_FILE ?? 'logs/app.log',
    dataDir: process.env.DATA_DIR ?? 'data',
    botAdminId: process.env.BOT_ADMIN_ID && /^\d+$/.test(process.env.BOT_ADMIN_ID.trim())
      ? Number(process.env.BOT_ADMIN_ID.trim())
      : null,
    openrouterApiKey: optional('OPENROUTER_API_KEY'),
    openrouterModel: optional('OPENROUTER_MODEL'),
  };
}
