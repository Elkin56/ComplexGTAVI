import { db } from '@/server/db';
import { api, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = api(async () => {
  const rows = await db().auditLog.findMany({ orderBy: { id: 'desc' }, take: 200, include: { admin: { select: { telegramId: true, role: true } } } });
  const ids = [...new Set(rows.flatMap((r) => (r.admin ? [r.admin.telegramId] : [])))];
  const users = await db().user.findMany({ where: { telegramId: { in: ids } }, select: { telegramId: true, firstName: true, lastName: true } });
  const names = new Map(users.map((u) => [u.telegramId.toString(), [u.firstName, u.lastName].filter(Boolean).join(' ')]));
  return json({
    entries: rows.map((r) => ({ id: r.id, createdAt: r.createdAt, action: r.action, details: r.details, actor: r.admin ? `${names.get(r.admin.telegramId.toString()) ?? r.admin.telegramId} (${r.admin.role})` : 'Система' })),
  });
}, { perm: 'audit.view' });
