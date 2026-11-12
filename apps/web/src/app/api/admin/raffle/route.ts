import { z } from 'zod';
import { isValidTimezone, ValidationError, zonedDate } from '@complex/core';
import { db } from '@/server/db';
import { api, json, need } from '@/server/http';
import { dateStr } from '@/server/schemas';
import { getRaffleRow, store } from '@/server/services';

export const dynamic = 'force-dynamic';

const view = async () => {
  const r = await getRaffleRow();
  const [validTickets, pendingClaims] = await Promise.all([db().ticket.count({ where: { status: 'ACTIVE' } }), db().purchaseClaim.count({ where: { status: 'PENDING' } })]);
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: r.timezone }).format(d);
  return { id: r.id, title: r.title, status: r.status, timezone: r.timezone, startDate: day(r.startDate), endDate: day(r.endDate), streamUrl: r.streamUrl, winnerTicketId: r.winnerTicketId, winnerFixedAt: r.winnerFixedAt, validTickets, pendingClaims };
};

export const GET = api(async () => json(await view()), { perm: 'stats.view' });

const body = z.object({
  title: z.string().trim().min(1).max(100), startDate: dateStr, endDate: dateStr, timezone: z.string().max(60),
  streamUrl: z.string().trim().max(300).regex(/^(https:\/\/\S+)?$/, 'Ссылка должна начинаться с https://'),
});

/** Настройки акции. Даты и часовой пояс хранятся в базе, а не в коде. После запуска дату начала и пояс менять нельзя. */
export const PUT = api(async (req, ctx) => {
  const admin = need(ctx, 'raffle.manage');
  const b = body.parse(await req.json());
  if (!isValidTimezone(b.timezone)) throw new ValidationError('Неизвестный часовой пояс');
  const start = zonedDate(b.startDate, b.timezone, 0), end = zonedDate(b.endDate, b.timezone, 0);
  if (end <= start) throw new ValidationError('Дата окончания должна быть позже даты начала');
  await store().transaction(async (tx) => {
    const cur = await tx.getRaffle('update');
    if (cur.status === 'FINISHED' || cur.status === 'REGISTRATION_CLOSED') throw new ValidationError('Акция уже закрыта, настройки менять нельзя');
    if (cur.status === 'ACTIVE' && (cur.startDate.getTime() !== start.getTime() || cur.timezone !== b.timezone)) throw new ValidationError('После запуска нельзя менять дату начала и часовой пояс');
    await tx.updateRaffle({ startDate: start, endDate: end, timezone: b.timezone, streamUrl: b.streamUrl || null });
    await tx.insertAudit({ adminId: admin.id, action: 'RAFFLE_SETTINGS_UPDATED', details: { ...b } });
  });
  const raffle = await getRaffleRow();
  await db().raffle.update({ where: { id: raffle.id }, data: { title: b.title } });
  return json(await view());
}, { admin: true });
