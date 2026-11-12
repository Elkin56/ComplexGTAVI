import { AuthError, validateInitData, type TelegramUser } from '@complex/core';
import type { Admin, User } from '@/generated/prisma/client';
import { db } from './db';
import { adminIds, devBypass, env } from './env';

export interface Ctx { user: User; admin: Admin | null }

/**
 * Каждый запрос несёт initData в заголовке `Authorization: tma <initData>`.
 * Подпись проверяется на сервере по официальному алгоритму. initDataUnsafe не используется.
 */
export async function authenticate(req: Request): Promise<Ctx> {
  const h = req.headers.get('authorization') ?? '';
  let tg: TelegramUser;
  if (h.startsWith('tma ')) {
    tg = validateInitData(h.slice(4), env().BOT_TOKEN, { maxAgeSec: env().INIT_DATA_MAX_AGE_SEC }).user;
  } else if (h.startsWith('dev ') && devBypass()) {
    const id = Number(h.slice(4));
    if (!Number.isSafeInteger(id) || id <= 0) throw new AuthError('Некорректный dev-пользователь');
    tg = { id, first_name: `Dev ${id}` };
  } else {
    throw new AuthError('Откройте приложение через Telegram');
  }

  const prisma = db();
  const telegramId = BigInt(tg.id);
  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { username: tg.username ?? null, firstName: tg.first_name, lastName: tg.last_name ?? null },
    create: { telegramId, username: tg.username ?? null, firstName: tg.first_name, lastName: tg.last_name ?? null },
  });

  let admin = await prisma.admin.findUnique({ where: { telegramId } });
  if (adminIds().includes(tg.id) && admin?.role !== 'OWNER') {
    admin = await prisma.admin.upsert({ where: { telegramId }, update: { role: 'OWNER' }, create: { telegramId, role: 'OWNER' } });
  }
  return { user, admin };
}
