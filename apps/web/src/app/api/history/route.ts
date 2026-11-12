import { db } from '@/server/db';
import { api, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = api(async (_req, { user }) => {
  const [purchases, claims] = await Promise.all([
    db().purchase.findMany({ where: { userId: user.id }, orderBy: { purchasedAt: 'desc' }, select: { id: true, receiptNumber: true, amount: true, category: true, ticketsAwarded: true, purchasedAt: true, status: true, cancelReason: true } }),
    db().purchaseClaim.findMany({ where: { userId: user.id, status: { in: ['PENDING', 'REJECTED'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, receiptNumber: true, amount: true, category: true, purchasedAt: true, status: true, rejectReason: true, createdAt: true } }),
  ]);
  return json({
    purchases: purchases.map((p) => ({ ...p, amount: Number(p.amount) })),
    claims: claims.map((c) => ({ ...c, amount: Number(c.amount) })),
  });
});
