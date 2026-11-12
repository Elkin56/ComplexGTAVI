import { z } from 'zod';
import { db } from '@/server/db';
import { api, json } from '@/server/http';

export const POST = api(async (req, { user }) => {
  const { notifyEnabled } = z.object({ notifyEnabled: z.boolean() }).parse(await req.json());
  await db().user.update({ where: { id: user.id }, data: { notifyEnabled } });
  return json({ ok: true });
});
