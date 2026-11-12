import { z } from 'zod';
import { db } from '@/server/db';
import { api, json } from '@/server/http';
import { RULES_VERSION } from '@/lib/rules';
import { ValidationError } from '@complex/core';

export const POST = api(async (req, { user }) => {
  const { version } = z.object({ version: z.string() }).parse(await req.json());
  if (version !== RULES_VERSION) throw new ValidationError('Правила обновились, обновите приложение');
  await db().user.update({ where: { id: user.id }, data: { consentAt: new Date(), consentVersion: RULES_VERSION } });
  return json({ ok: true });
});
