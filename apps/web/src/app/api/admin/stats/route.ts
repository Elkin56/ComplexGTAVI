import { db } from '@/server/db';
import { api, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = api(async () => {
  const p = db();
  const [participants, purchases, ticketsIssued, ticketsActive, pending, rejected, approved] = await Promise.all([
    p.user.count({ where: { consentAt: { not: null } } }),
    p.purchase.count({ where: { status: 'ACTIVE' } }),
    p.ticket.count(),
    p.ticket.count({ where: { status: 'ACTIVE' } }),
    p.purchaseClaim.count({ where: { status: 'PENDING' } }),
    p.purchaseClaim.count({ where: { status: 'REJECTED' } }),
    p.purchaseClaim.count({ where: { status: 'APPROVED' } }),
  ]);
  return json({ participants, purchases, ticketsIssued, ticketsActive, claims: { pending, rejected, approved } });
}, { perm: 'stats.view' });
