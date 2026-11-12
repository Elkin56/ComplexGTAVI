import { z } from 'zod';

export class ConfigError extends Error {}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().min(10),
  WEBHOOK_SECRET: z.string().min(16),
  APP_URL: z.string().url(),
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  CRON_SECRET: z.string().min(16),
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().int().positive().default(86400),
  RECEIPT_API_URL: z.string().default(''),
  RECEIPT_API_TOKEN: z.string().default(''),
  DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
});
export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const r = schema.safeParse(process.env);
  if (!r.success) {
    const bad = r.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new ConfigError(`Не заданы или некорректны переменные окружения: ${bad}`);
  }
  cached = r.data;
  return cached;
}
export const resetEnvCache = () => { cached = null; };
export const adminIds = (): number[] => env().ADMIN_TELEGRAM_IDS.split(',').map((s) => Number(s.trim())).filter((n) => Number.isSafeInteger(n) && n > 0);
/** Обход авторизации только вне production. */
export const devBypass = (): boolean => process.env.NODE_ENV !== 'production' && env().DEV_AUTH_BYPASS === 'true';
