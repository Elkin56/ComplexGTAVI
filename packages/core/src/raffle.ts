export type RaffleStatus = 'DRAFT' | 'ACTIVE' | 'REGISTRATION_CLOSED' | 'FINISHED';
export interface RaffleSettings {
  startDate: Date; endDate: Date; status: RaffleStatus; timezone: string;
  streamUrl?: string | null; winnerTicketId?: number | null; winnerFixedAt?: Date | null;
}
export class RaffleClosedError extends Error {}
export class OutOfPeriodError extends Error {}
export class RaffleStateError extends Error {}

/** Новые покупки принимаются только при статусе ACTIVE и только с датой внутри периода акции. */
export function assertPurchaseAccepted(r: RaffleSettings, purchasedAt: Date): void {
  if (r.status !== 'ACTIVE') throw new RaffleClosedError(r.status === 'DRAFT' ? 'Акция ещё не началась' : 'Приём чеков закрыт');
  if (purchasedAt.getTime() < r.startDate.getTime()) throw new OutOfPeriodError('Покупка совершена до начала акции');
  if (purchasedAt.getTime() >= r.endDate.getTime()) throw new OutOfPeriodError('Покупка совершена после окончания акции');
}
