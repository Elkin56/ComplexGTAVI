import { z } from 'zod';
import { signToken } from '@complex/core';
import { env } from '@/server/env';
import { api, json } from '@/server/http';

/** Выдаёт ссылку на скачивание, действующую 5 минут (скачивание открывается во внешнем браузере без заголовков авторизации). */
export const POST = api(async (req, ctx) => {
  const b = z.object({ kind: z.enum(['tickets', 'participants']), format: z.enum(['csv', 'xlsx']) }).parse(await req.json());
  const token = signToken({ ...b, adminId: ctx.admin!.id }, env().WEBHOOK_SECRET, 300);
  return json({ url: `${env().APP_URL}/api/export/download?token=${token}` });
}, { perm: 'export' });
