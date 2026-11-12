import { assertPurchaseAccepted, type RaffleSettings } from './raffle';
import { calculateTickets, formatTicketNumber, normalizeReceipt, type Category } from './rules';

export interface PurchaseRecord {
  id: number; userId: number; receiptNumber: string; amount: number; category: Category;
  ticketsAwarded: number; purchasedAt: Date; createdBy: number | null; status: 'ACTIVE' | 'CANCELLED';
  cancelReason?: string | null; cancelledAt?: Date | null;
}
export interface TicketRecord {
  id: number; ticketNumber: string; ticketSeq: number; userId: number; purchaseId: number; status: 'ACTIVE' | 'VOID';
}

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface ClaimRecord {
  id: number; userId: number; receiptNumber: string; amount: number; category: Category; purchasedAt: Date;
  status: ClaimStatus; reviewedBy?: number | null; reviewedAt?: Date | null;
  rejectReason?: string | null; purchaseId?: number | null; createdAt?: Date; verifyNote?: string | null;
}

export interface Tx {
  findPurchaseByReceipt(receipt: string): Promise<PurchaseRecord | null>;
  insertPurchase(p: Omit<PurchaseRecord, 'id'>): Promise<PurchaseRecord>;
  nextTicketSeqs(count: number): Promise<number[]>;
  insertTickets(t: Omit<TicketRecord, 'id'>[]): Promise<TicketRecord[]>;
  insertAudit(e: { adminId: number | null; action: string; details: Record<string, unknown> }): Promise<void>;
  findActiveClaimByReceipt(receipt: string): Promise<ClaimRecord | null>; // PENDING или APPROVED
  insertClaim(c: Omit<ClaimRecord, 'id'>): Promise<ClaimRecord>;
  getClaim(id: number): Promise<ClaimRecord | null>;
  updateClaim(id: number, patch: Partial<ClaimRecord>): Promise<ClaimRecord>;
  countRecentClaims(userId: number, since: Date): Promise<number>;
  countPendingClaims(): Promise<number>;
  getPurchase(id: number): Promise<PurchaseRecord | null>;
  updatePurchase(id: number, patch: Partial<PurchaseRecord>): Promise<PurchaseRecord>;
  voidTicketsByPurchase(purchaseId: number): Promise<TicketRecord[]>;
  findTicketByNumber(ticketNumber: string): Promise<TicketRecord | null>;
  /** lock: 'share' для чтения в операциях выдачи билетов, 'update' для смены состояния акции (закрытие, финал). */
  getRaffle(lock?: 'share' | 'update'): Promise<RaffleSettings>;
  updateRaffle(patch: Partial<RaffleSettings>): Promise<RaffleSettings>;
}
export interface Store { transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>; }

/** Адаптер БД обязан бросать эту ошибку при нарушении уникальности receiptNumber (Prisma P2002). */
export class DuplicateReceiptError extends Error {}
export class ValidationError extends Error {}
const CATEGORIES: Category[] = ['PC', 'COMPONENTS', 'PERIPHERALS', 'OTHER'];

export interface RegisterInput {
  userId: number; adminId: number | null; receiptNumber: string;
  amount: number; category: Category; purchasedAt: Date;
}
export interface RegisterResult {
  status: 'created' | 'duplicate';
  purchase: PurchaseRecord;
  tickets: TicketRecord[];
}


export function validateReceiptInput(receiptNumber: string, amount: number, category: Category): string {
  const receipt = normalizeReceipt(receiptNumber);
  if (!receipt) throw new ValidationError('Номер чека обязателен');
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Сумма должна быть больше 0');
  if (!CATEGORIES.includes(category)) throw new ValidationError('Неизвестная категория');
  return receipt;
}

/** Гонка двух одинаковых запросов: проигравший повторяет транзакцию и получает duplicate, а не 500. */
export async function retryOnDuplicate<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (e) { if (e instanceof DuplicateReceiptError) return run(); throw e; }
}

/** Создаёт покупку, билеты и аудит. Вызывать только внутри транзакции. */
export async function awardPurchase(tx: Tx, input: RegisterInput, receipt: string): Promise<RegisterResult> {
  assertPurchaseAccepted(await tx.getRaffle(), input.purchasedAt);
  const existing = await tx.findPurchaseByReceipt(receipt);
  if (existing) return { status: 'duplicate', purchase: existing, tickets: [] };

  const count = calculateTickets(input.amount, input.category);
  const purchase = await tx.insertPurchase({
    userId: input.userId, receiptNumber: receipt, amount: input.amount, category: input.category,
    ticketsAwarded: count, purchasedAt: input.purchasedAt, createdBy: input.adminId, status: 'ACTIVE',
  });
  const seqs = count > 0 ? await tx.nextTicketSeqs(count) : [];
  const tickets = await tx.insertTickets(
    seqs.map((seq) => ({
      ticketNumber: formatTicketNumber(seq), ticketSeq: seq,
      userId: input.userId, purchaseId: purchase.id, status: 'ACTIVE' as const,
    })),
  );
  await tx.insertAudit({
    adminId: input.adminId, action: 'PURCHASE_REGISTERED',
    details: { purchaseId: purchase.id, receipt, amount: input.amount, category: input.category, tickets: tickets.map((t) => t.ticketNumber) },
  });
  return { status: 'created', purchase, tickets };
}

/** Ручная регистрация сотрудником (без заявки пользователя). */
export async function registerPurchase(store: Store, input: RegisterInput): Promise<RegisterResult> {
  const receipt = validateReceiptInput(input.receiptNumber, input.amount, input.category);
  return retryOnDuplicate(() => store.transaction((tx) => awardPurchase(tx, input, receipt)));
}
