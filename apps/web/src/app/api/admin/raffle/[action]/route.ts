import { z } from 'zod';
import { NotFoundError, parseTicketNumber, ValidationError } from '@complex/core';
import { db } from '@/server/db';
import { ForbiddenError, api, json, need } from '@/server/http';
import { closeService, startRaffleService, winnerService } from '@/server/services';

export const dynamic = 'force-dynamic';
/** Рассылка уведомлений идёт после ответа; при ~20 сообщений/с за 60 с уходит около 1200. Для больших аудиторий используйте VPS. */
export const maxDuration = 60;

/** GET lookup?ticket=427: проверить владельца номера. GET tickets: список всех действительных билетов. */
export const GET = api(async (req, ctx, route) => {
  need(ctx, 'raffle.winner');
  const { action } = await route.params;
  if (action === 'tickets') {
    const rows = await db().ticket.findMany({ where: { status: 'ACTIVE' }, orderBy: { ticketSeq: 'asc' }, select: { ticketNumber: true } });
    return json({ count: rows.length, tickets: rows.map((r) => r.ticketNumber) });
  }
  if (action === 'lookup') {
    const num = parseTicketNumber(new URL(req.url).searchParams.get('ticket') ?? '');
    if (!num) throw new ValidationError('Некорректный номер билета');
    const t = await db().ticket.findUnique({ where: { ticketNumber: num }, include: { user: true, purchase: { select: { receiptNumber: true } } } });
    if (!t) throw new NotFoundError(`Билета ${num} нет в базе`);
    return json({ ticketNumber: t.ticketNumber, status: t.status, owner: [t.user.firstName, t.user.lastName].filter(Boolean).join(' '), username: t.user.username, telegramId: t.user.telegramId, receiptNumber: t.purchase.receiptNumber });
  }
  throw new NotFoundError('Не найдено');
}, { admin: true });

export const POST = api(async (req, ctx, route) => {
  const { action } = await route.params;
  if (action === 'start') { const r = await startRaffleService(need(ctx, 'raffle.manage')); return json({ status: r.status }); }
  if (action === 'close') { const r = await closeService(need(ctx, 'raffle.close')); return json(r.status === 'pending_claims' ? { status: r.status, pending: r.pending } : { status: r.status }); }
  if (action === 'winner') {
    const admin = need(ctx, 'raffle.winner');
    const { ticket } = z.object({ ticket: z.string().min(1).max(20) }).parse(await req.json());
    const r = await winnerService(admin, ticket);
    if (r.status === 'fixed') return json({ status: 'fixed', ticketNumber: r.ticket.ticketNumber, fixedAt: r.raffle.winnerFixedAt });
    return json({ status: r.status }, r.status === 'already_finished' ? 409 : 422);
  }
  throw new ForbiddenError('Неизвестное действие');
}, { admin: true });
