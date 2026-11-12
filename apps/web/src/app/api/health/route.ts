import { db } from '@/server/db';
import { env } from '@/server/env';
import { json, open } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Состояние подключений для экрана «нет связи» и для мониторинга. Секреты не раскрываются. */
export const GET = open(async () => {
  let dbOk = false, configOk = true;
  try { await db().$queryRaw`SELECT 1`; dbOk = true; } catch { /* база недоступна */ }
  try { env(); } catch { configOk = false; }
  const body = {
    ok: dbOk && configOk,
    db: dbOk ? 'ok' : 'error',
    config: configOk ? 'ok' : 'incomplete',
    bot: process.env.BOT_TOKEN ? 'configured' : 'missing',
    receiptVerification: process.env.RECEIPT_API_URL ? 'on' : 'off',
  };
  return json(body, body.ok ? 200 : 503);
});
