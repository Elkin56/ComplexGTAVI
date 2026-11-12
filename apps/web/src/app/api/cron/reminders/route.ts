import { localHour, reminderDue, safeEqual } from '@complex/core';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { AuthError } from '@complex/core';
import { json, open } from '@/server/http';
import { reminderText } from '@/server/notify';
import { getRaffleRow } from '@/server/services';
import { broadcast } from '@/server/telegram';

export const dynamic = 'force-dynamic';
/** Рассылка уведомлений идёт после ответа; при ~20 сообщений/с за 60 с уходит около 1200. Для больших аудиторий используйте VPS. */
export const maxDuration = 60;

/** Вызывать раз в час (cron): `curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/reminders`. */
const run = open(async (req) => {
  if (!safeEqual(req.headers.get('authorization') ?? '', `Bearer ${env().CRON_SECRET}`)) throw new AuthError('Нет доступа');
  const raffle = await getRaffleRow();
  if (raffle.status !== 'ACTIVE') return json({ sent: false, reason: 'raffle not active' });
  const now = new Date();
  const kind = reminderDue(now, raffle.endDate, raffle.timezone);
  const hour = localHour(now, raffle.timezone);
  if (!kind || hour < 10 || hour > 20) return json({ sent: false, reason: 'not due' });

  try { await db().reminderLog.create({ data: { raffleId: raffle.id, kind } }); }
  catch { return json({ sent: false, reason: 'already sent' }); } // уникальный индекс: одно напоминание каждого вида

  const label = new Intl.DateTimeFormat('ru-RU', { timeZone: raffle.timezone, day: 'numeric', month: 'long' }).format(raffle.endDate);
  const users = await db().user.findMany({ where: { consentAt: { not: null }, notifyEnabled: true, botBlocked: false }, select: { id: true } });
  const result = await broadcast(users.map((u) => u.id), reminderText(kind, label), 'marketing');
  return json({ sent: true, kind, delivered: result.sent, failed: result.failed });
});
export const GET = run;
export const POST = run;
