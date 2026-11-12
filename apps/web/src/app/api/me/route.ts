import { db } from '@/server/db';
import { api, json } from '@/server/http';
import { getRaffleRow } from '@/server/services';
import { RULES_VERSION } from '@/lib/rules';

export const dynamic = 'force-dynamic';

export const GET = api(async (_req, { user, admin }) => {
  const raffle = await getRaffleRow();
  const ticketsActive = await db().ticket.count({ where: { userId: user.id, status: 'ACTIVE' } });
  let winner: { ticketNumber: string; name: string } | null = null;
  if (raffle.winnerTicketId) {
    const t = await db().ticket.findUnique({ where: { id: raffle.winnerTicketId }, include: { user: true } });
    if (t) winner = { ticketNumber: t.ticketNumber, name: t.user.firstName + (t.user.lastName ? ` ${t.user.lastName[0]}.` : '') };
  }
  return json({
    user: {
      id: user.id, telegramId: user.telegramId, firstName: user.firstName, lastName: user.lastName, username: user.username,
      phone: user.phone, createdAt: user.createdAt, notifyEnabled: user.notifyEnabled,
      consented: !!user.consentAt && user.consentVersion === RULES_VERSION,
    },
    raffle: { title: raffle.title, startDate: raffle.startDate, endDate: raffle.endDate, timezone: raffle.timezone, status: raffle.status, streamUrl: raffle.streamUrl, winner },
    ticketsActive,
    role: admin?.role ?? null,
    rulesVersion: RULES_VERSION,
  });
});
