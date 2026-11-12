import { z } from 'zod';
import { ValidationError } from '@complex/core';
import { db } from '@/server/db';
import { api, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = api(async () => {
  const admins = await db().admin.findMany({ orderBy: { id: 'asc' } });
  const users = await db().user.findMany({ where: { telegramId: { in: admins.map((a) => a.telegramId) } }, select: { telegramId: true, firstName: true, username: true } });
  const u = new Map(users.map((x) => [x.telegramId.toString(), x]));
  return json({ admins: admins.map((a) => ({ id: a.id, telegramId: a.telegramId, role: a.role, name: u.get(a.telegramId.toString())?.firstName ?? null, username: u.get(a.telegramId.toString())?.username ?? null })) });
}, { perm: 'admins.manage' });

export const POST = api(async (req, ctx) => {
  const b = z.object({ telegramId: z.string().regex(/^\d{5,15}$/, 'Некорректный Telegram ID'), role: z.enum(['OWNER', 'MANAGER', 'STAFF']) }).parse(await req.json());
  const telegramId = BigInt(b.telegramId);
  const a = await db().admin.upsert({ where: { telegramId }, update: { role: b.role }, create: { telegramId, role: b.role } });
  await db().auditLog.create({ data: { adminId: ctx.admin!.id, action: 'ADMIN_ROLE_SET', details: { telegramId: b.telegramId, role: b.role } } });
  return json({ id: a.id, role: a.role });
}, { perm: 'admins.manage' });

export const DELETE = api(async (req, ctx) => {
  const id = z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('id'));
  if (id === ctx.admin!.id) throw new ValidationError('Нельзя удалить самого себя');
  await db().admin.delete({ where: { id } });
  await db().auditLog.create({ data: { adminId: ctx.admin!.id, action: 'ADMIN_REMOVED', details: { adminId: id } } });
  return json({ ok: true });
}, { perm: 'admins.manage' });
