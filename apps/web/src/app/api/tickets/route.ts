import { db } from '@/server/db';
import { api, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = api(async (_req, { user }) => {
  const tickets = await db().ticket.findMany({
    where: { userId: user.id }, orderBy: { ticketSeq: 'desc' },
    select: { ticketNumber: true, status: true, createdAt: true, purchase: { select: { receiptNumber: true } } },
  });
  return json({ tickets: tickets.map((t) => ({ ticketNumber: t.ticketNumber, status: t.status, createdAt: t.createdAt, receiptNumber: t.purchase.receiptNumber })) });
});
