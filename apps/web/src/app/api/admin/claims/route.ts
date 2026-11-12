import { z } from 'zod';
import { flagRiskyUsers } from '@complex/core';
import { db } from '@/server/db';
import { api, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = api(async (req) => {
  const status = z.enum(['PENDING', 'APPROVED', 'REJECTED']).catch('PENDING').parse(new URL(req.url).searchParams.get('status') ?? 'PENDING');
  const claims = await db().purchaseClaim.findMany({
    where: { status }, orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' }, take: 100, omit: { photo: true },
    include: { user: { select: { id: true, firstName: true, lastName: true, username: true, telegramId: true, phone: true } } },
  });
  const recent = await db().purchaseClaim.findMany({
    where: { userId: { in: claims.map((c) => c.userId) }, status: 'REJECTED', createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
    select: { userId: true, status: true, createdAt: true },
  });
  const risky = new Set(flagRiskyUsers(recent));
  return json({
    claims: claims.map((c) => ({
      id: c.id, receiptNumber: c.receiptNumber, amount: Number(c.amount), category: c.category, purchasedAt: c.purchasedAt, createdAt: c.createdAt,
      status: c.status, rejectReason: c.rejectReason, verifyNote: c.verifyNote, hasPhoto: !!c.photoMime, risky: risky.has(c.userId), user: c.user,
    })),
  });
}, { perm: 'claims.review' });
