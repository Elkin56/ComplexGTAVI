import { z } from 'zod';
import { db } from '@/server/db';
import { api, json, need } from '@/server/http';
import { amount, category, claimBody, receipt } from '@/server/schemas';
import { registerManualService } from '@/server/services';

export const dynamic = 'force-dynamic';

export const GET = api(async () => {
  const rows = await db().purchase.findMany({
    orderBy: { id: 'desc' }, take: 100,
    include: { user: { select: { firstName: true, lastName: true, telegramId: true } } },
  });
  return json({
    purchases: rows.map((p) => ({
      id: p.id, receiptNumber: p.receiptNumber, amount: Number(p.amount), category: p.category, ticketsAwarded: p.ticketsAwarded,
      purchasedAt: p.purchasedAt, status: p.status, cancelReason: p.cancelReason, userName: [p.user.firstName, p.user.lastName].filter(Boolean).join(' '), telegramId: p.user.telegramId,
    })),
  });
}, { perm: 'stats.view' });

const manual = claimBody.extend({ identifier: z.string().trim().min(3).max(30), receiptNumber: receipt, amount, category });

export const POST = api(async (req, ctx) => {
  const admin = need(ctx, 'purchases.register');
  const r = await registerManualService(admin, manual.parse(await req.json()));
  if (r.status === 'duplicate') return json({ error: 'Этот чек уже зарегистрирован' }, 409);
  return json({ status: r.status, tickets: r.tickets.map((t) => t.ticketNumber), participant: r.user.firstName }, 201);
}, { admin: true });
