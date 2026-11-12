import { z } from 'zod';
import { NotFoundError } from '@complex/core';
import { db } from '@/server/db';
import { api, intParam, json, need, ForbiddenError } from '@/server/http';
import { amount, category, reason } from '@/server/schemas';
import { approveService, rejectService } from '@/server/services';

export const dynamic = 'force-dynamic';

/** Фото чека: только для сотрудников, с проверкой прав; <img> не подойдёт, клиент берёт его через fetch с авторизацией. */
export const GET = api(async (_req, ctx, route) => {
  need(ctx, 'claims.review');
  const { id, action } = await route.params;
  if (action !== 'photo') throw new NotFoundError('Не найдено');
  const c = await db().purchaseClaim.findUnique({ where: { id: intParam(id) }, select: { photo: true, photoMime: true } });
  if (!c?.photo || !c.photoMime) throw new NotFoundError('Фото не приложено');
  return new Response(c.photo as unknown as BodyInit, { headers: { 'content-type': c.photoMime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-disposition': 'inline' } });
}, { admin: true });

export const POST = api(async (req, ctx, route) => {
  const admin = need(ctx, 'claims.review');
  const { id, action } = await route.params;
  const claimId = intParam(id);
  if (action === 'approve') {
    const b = z.object({ amount: amount.optional(), category: category.optional() }).parse(await req.json().catch(() => ({})));
    const r = await approveService(admin, claimId, b);
    return json({ status: r.status, tickets: r.status === 'approved' ? r.tickets.map((t) => t.ticketNumber) : [] });
  }
  if (action === 'reject') {
    const b = z.object({ reason }).parse(await req.json());
    return json({ status: (await rejectService(admin, claimId, b.reason)).status });
  }
  throw new ForbiddenError('Неизвестное действие');
}, { admin: true });
