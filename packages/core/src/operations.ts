import { NotFoundError } from './claims';
import { RaffleClosedError, RaffleStateError, type RaffleSettings } from './raffle';
import { ValidationError, type PurchaseRecord, type Store, type TicketRecord } from './register';
import { parseTicketNumber } from './rules';

/** Отмена ошибочной покупки: покупка CANCELLED, билеты VOID, ничего не удаляется. */
export async function cancelPurchase(store: Store, input: { purchaseId: number; adminId: number; reason: string }) {
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError('Укажите причину отмены');
  return store.transaction(async (tx): Promise<{ status: 'cancelled' | 'already_cancelled'; purchase: PurchaseRecord; voided: TicketRecord[] }> => {
    if ((await tx.getRaffle()).status === 'FINISHED') throw new RaffleClosedError('Розыгрыш завершён, отмена невозможна');
    const p = await tx.getPurchase(input.purchaseId);
    if (!p) throw new NotFoundError('Покупка не найдена');
    if (p.status === 'CANCELLED') return { status: 'already_cancelled', purchase: p, voided: [] };
    const purchase = await tx.updatePurchase(p.id, { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() });
    const voided = await tx.voidTicketsByPurchase(p.id);
    await tx.insertAudit({ adminId: input.adminId, action: 'PURCHASE_CANCELLED', details: { purchaseId: p.id, reason, voided: voided.map((t) => t.ticketNumber) } });
    return { status: 'cancelled', purchase, voided };
  });
}

/** Закрыть приём чеков. Нельзя, пока есть необработанные заявки: иначе список билетов изменится после закрытия. */
export async function closeRegistration(store: Store, input: { adminId: number }) {
  return store.transaction(async (tx): Promise<
    | { status: 'closed'; raffle: RaffleSettings } | { status: 'not_active'; raffle: RaffleSettings } | { status: 'pending_claims'; pending: number }
  > => {
    const r = await tx.getRaffle('update');
    if (r.status !== 'ACTIVE') return { status: 'not_active', raffle: r };
    const pending = await tx.countPendingClaims();
    if (pending > 0) return { status: 'pending_claims', pending };
    const raffle = await tx.updateRaffle({ status: 'REGISTRATION_CLOSED' });
    await tx.insertAudit({ adminId: input.adminId, action: 'REGISTRATION_CLOSED', details: {} });
    return { status: 'closed', raffle };
  });
}

/** Фиксация победителя по номеру выпавшего шарика. Случайного выбора нет. */
export async function fixWinner(store: Store, input: { adminId: number; ticketInput: string }) {
  const ticketNumber = parseTicketNumber(input.ticketInput);
  if (!ticketNumber) throw new ValidationError('Некорректный номер билета');
  return store.transaction(async (tx): Promise<
    | { status: 'fixed'; raffle: RaffleSettings; ticket: TicketRecord } | { status: 'already_finished'; raffle: RaffleSettings }
    | { status: 'not_found' } | { status: 'void_ticket'; ticket: TicketRecord }
  > => {
    const r = await tx.getRaffle('update');
    if (r.status === 'FINISHED') return { status: 'already_finished', raffle: r };
    if (r.status !== 'REGISTRATION_CLOSED') throw new RaffleStateError('Сначала закройте приём чеков');
    const ticket = await tx.findTicketByNumber(ticketNumber);
    if (!ticket) return { status: 'not_found' };
    if (ticket.status !== 'ACTIVE') return { status: 'void_ticket', ticket };
    const raffle = await tx.updateRaffle({ status: 'FINISHED', winnerTicketId: ticket.id, winnerFixedAt: new Date() });
    await tx.insertAudit({ adminId: input.adminId, action: 'WINNER_FIXED', details: { ticketNumber, userId: ticket.userId } });
    return { status: 'fixed', raffle, ticket };
  });
}
