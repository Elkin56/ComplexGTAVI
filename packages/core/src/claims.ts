import {
  awardPurchase, retryOnDuplicate, validateReceiptInput, ValidationError,
  type ClaimRecord, type PurchaseRecord, type Store, type TicketRecord,
} from './register';
import { assertPurchaseAccepted } from './raffle';
import type { Category } from './rules';

export class NotFoundError extends Error {}
export class RateLimitError extends Error {}

export interface SubmitClaimInput {
  userId: number; receiptNumber: string; amount: number; category: Category;
  purchasedAt: Date; now?: Date; maxPerDay?: number;
}
export type SubmitResult =
  | { status: 'submitted'; claim: ClaimRecord }
  | { status: 'already_registered' }
  | { status: 'duplicate_claim'; claim: ClaimRecord };

/** Пользователь отправляет чек на проверку. Билеты НЕ выдаются. */
export async function submitClaim(store: Store, input: SubmitClaimInput): Promise<SubmitResult> {
  const receipt = validateReceiptInput(input.receiptNumber, input.amount, input.category);
  const now = input.now ?? new Date();
  if (input.purchasedAt.getTime() > now.getTime()) throw new ValidationError('Дата покупки в будущем');
  return retryOnDuplicate(() =>
    store.transaction(async (tx): Promise<SubmitResult> => {
      assertPurchaseAccepted(await tx.getRaffle(), input.purchasedAt);
      if (await tx.findPurchaseByReceipt(receipt)) return { status: 'already_registered' };
      const active = await tx.findActiveClaimByReceipt(receipt);
      if (active) return { status: 'duplicate_claim', claim: active };
      const recent = await tx.countRecentClaims(input.userId, new Date(now.getTime() - 864e5));
      if (recent >= (input.maxPerDay ?? 5)) throw new RateLimitError('Слишком много заявок за сутки');
      const claim = await tx.insertClaim({
        userId: input.userId, receiptNumber: receipt, amount: input.amount, category: input.category,
        purchasedAt: input.purchasedAt, status: 'PENDING', createdAt: now,
      });
      return { status: 'submitted', claim };
    }),
  );
}

/** adminId = null означает системное подтверждение (автопроверка по кассе). */
export interface ApproveInput { claimId: number; adminId: number | null; amount?: number; category?: Category; purchasedAt?: Date; }
export type ApproveResult =
  | { status: 'approved'; claim: ClaimRecord; purchase: PurchaseRecord; tickets: TicketRecord[] }
  | { status: 'already_reviewed'; claim: ClaimRecord }
  | { status: 'duplicate_receipt'; claim: ClaimRecord };

export async function approveClaim(store: Store, input: ApproveInput): Promise<ApproveResult> {
  return retryOnDuplicate(() =>
    store.transaction(async (tx): Promise<ApproveResult> => {
      const claim = await tx.getClaim(input.claimId);
      if (!claim) throw new NotFoundError('Заявка не найдена');
      if (claim.status !== 'PENDING') return { status: 'already_reviewed', claim };

      const amount = input.amount ?? claim.amount;
      const category = input.category ?? claim.category;
      const receipt = validateReceiptInput(claim.receiptNumber, amount, category);
      const award = await awardPurchase(
        tx,
        { userId: claim.userId, adminId: input.adminId, receiptNumber: receipt, amount, category, purchasedAt: input.purchasedAt ?? claim.purchasedAt },
        receipt,
      );
      const now = new Date();
      if (award.status === 'duplicate') {
        const rejected = await tx.updateClaim(claim.id, { status: 'REJECTED', reviewedBy: input.adminId, reviewedAt: now, rejectReason: 'Чек уже зарегистрирован' });
        await tx.insertAudit({ adminId: input.adminId, action: 'CLAIM_REJECTED_DUPLICATE', details: { claimId: claim.id, receipt } });
        return { status: 'duplicate_receipt', claim: rejected };
      }
      const approved = await tx.updateClaim(claim.id, { status: 'APPROVED', reviewedBy: input.adminId, reviewedAt: now, purchaseId: award.purchase.id });
      await tx.insertAudit({
        adminId: input.adminId, action: input.adminId === null ? 'CLAIM_AUTO_APPROVED' : 'CLAIM_APPROVED',
        details: { claimId: claim.id, purchaseId: award.purchase.id, claimed: { amount: claim.amount, category: claim.category }, approved: { amount, category } },
      });
      return { status: 'approved', claim: approved, purchase: award.purchase, tickets: award.tickets };
    }),
  );
}

export interface RejectInput { claimId: number; adminId: number; reason: string; }
export type RejectResult = { status: 'rejected' | 'already_reviewed'; claim: ClaimRecord };

export async function rejectClaim(store: Store, input: RejectInput): Promise<RejectResult> {
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError('Укажите причину отказа');
  return store.transaction(async (tx): Promise<RejectResult> => {
    const claim = await tx.getClaim(input.claimId);
    if (!claim) throw new NotFoundError('Заявка не найдена');
    if (claim.status !== 'PENDING') return { status: 'already_reviewed', claim };
    const rejected = await tx.updateClaim(claim.id, { status: 'REJECTED', reviewedBy: input.adminId, reviewedAt: new Date(), rejectReason: reason });
    await tx.insertAudit({ adminId: input.adminId, action: 'CLAIM_REJECTED', details: { claimId: claim.id, reason } });
    return { status: 'rejected', claim: rejected };
  });
}

/* ---------- Автопроверка по кассе / 1С ---------- */
export type VerifyResult =
  | { status: 'match'; amount: number; category?: Category }
  | { status: 'mismatch'; amount: number }
  | { status: 'not_found' }
  | { status: 'unavailable' };
export interface ReceiptVerifier {
  verify(q: { receiptNumber: string; amount: number; purchasedAt: Date }): Promise<VerifyResult>;
}
export type AutoReviewResult = ApproveResult | { status: 'needs_review'; note: string };

/** Сверка вызывается ВНЕ транзакции (внешний API). Подтверждает только точное совпадение суммы; всё остальное уходит сотруднику. */
export async function autoReviewClaim(store: Store, claimId: number, verifier: ReceiptVerifier): Promise<AutoReviewResult> {
  const claim = await store.transaction((tx) => tx.getClaim(claimId));
  if (!claim) throw new NotFoundError('Заявка не найдена');
  if (claim.status !== 'PENDING') return { status: 'already_reviewed', claim };
  let v: VerifyResult;
  try {
    v = await verifier.verify({ receiptNumber: claim.receiptNumber, amount: claim.amount, purchasedAt: claim.purchasedAt });
  } catch {
    v = { status: 'unavailable' };
  }
  if (v.status === 'match' && Math.abs(v.amount - claim.amount) < 0.005) {
    return approveClaim(store, { claimId, adminId: null, amount: v.amount, category: v.category });
  }
  const note =
    v.status === 'match' || v.status === 'mismatch' ? `Касса: сумма ${v.amount}, в заявке ${claim.amount}`
    : v.status === 'not_found' ? 'Чек не найден в кассе' : 'Касса недоступна';
  await store.transaction((tx) => tx.updateClaim(claimId, { verifyNote: note }));
  return { status: 'needs_review', note };
}
