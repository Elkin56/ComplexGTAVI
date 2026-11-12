import { parseTicketNumber } from '@complex/core';
import { db } from '@/server/db';
import { api, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = api(async (req) => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60);
  const digits = q.replace(/\D/g, '');
  const ticket = q ? parseTicketNumber(q) : null;
  const or = q ? [
    { firstName: { contains: q, mode: 'insensitive' as const } },
    { lastName: { contains: q, mode: 'insensitive' as const } },
    { username: { contains: q.replace(/^@/, ''), mode: 'insensitive' as const } },
    ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
    ...(/^\d{1,15}$/.test(q) ? [{ telegramId: BigInt(q) }] : []),
    ...(ticket ? [{ tickets: { some: { ticketNumber: ticket } } }] : []),
  ] : undefined;
  const users = await db().user.findMany({
    where: { consentAt: { not: null }, ...(or ? { OR: or } : {}) }, orderBy: { id: 'desc' }, take: 50,
    select: { id: true, telegramId: true, firstName: true, lastName: true, username: true, phone: true, createdAt: true, _count: { select: { tickets: { where: { status: 'ACTIVE' } } } } },
  });
  const rejected = await db().purchaseClaim.groupBy({ by: ['userId'], where: { userId: { in: users.map((u) => u.id) }, status: 'REJECTED' }, _count: { _all: true } });
  const rej = new Map(rejected.map((r) => [r.userId, r._count._all]));
  return json({ participants: users.map((u) => ({ id: u.id, telegramId: u.telegramId, name: [u.firstName, u.lastName].filter(Boolean).join(' '), username: u.username, phone: u.phone, createdAt: u.createdAt, activeTickets: u._count.tickets, rejectedClaims: rej.get(u.id) ?? 0 })) });
}, { perm: 'participants.view' });
