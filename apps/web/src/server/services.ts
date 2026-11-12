import {
  approveClaim, autoReviewClaim, cancelPurchase, closeRegistration, fixWinner, normalizePhone, registerPurchase, rejectClaim,
  submitClaim, zonedDate, NotFoundError, ValidationError, type Category, type RaffleSettings,
} from '@complex/core';
import type { Admin, Raffle, User } from '@/generated/prisma/client';
import { db } from './db';
import { defer } from './defer';
import { notifyAwarded, notifyCancelled, notifyRaffleFinished, notifyRejected, notifyWinner } from './notify';
import { PrismaStore } from './prisma-store';
import { receiptVerifier } from './verifier';

export const store = () => new PrismaStore(db());

/** Строка акции (создаётся при первом обращении). */
export async function getRaffleRow(): Promise<Raffle> {
  await store().transaction((tx) => tx.getRaffle());
  return db().raffle.findFirstOrThrow({ orderBy: { id: 'asc' } });
}

export interface ClaimInput { receiptNumber: string; amount: number; category: Category; purchaseDate: string; photo?: { data: Uint8Array<ArrayBuffer>; mime: string } }

export async function submitClaimService(user: User, input: ClaimInput) {
  if (!user.consentAt) throw new ValidationError('Сначала примите правила акции');
  const raffle = await getRaffleRow();
  const purchasedAt = zonedDate(input.purchaseDate, raffle.timezone, 12);
  const r = await submitClaim(store(), { userId: user.id, receiptNumber: input.receiptNumber, amount: input.amount, category: input.category, purchasedAt });
  if (r.status !== 'submitted') return { status: 'duplicate' as const };
  if (input.photo) await db().purchaseClaim.update({ where: { id: r.claim.id }, data: { photo: input.photo.data, photoMime: input.photo.mime }, select: { id: true } });

  const verifier = receiptVerifier();
  if (verifier) {
    const a = await autoReviewClaim(store(), r.claim.id, verifier);
    if (a.status === 'approved') {
      const nums = a.tickets.map((t) => t.ticketNumber);
      defer(() => notifyAwarded(user.id, a.purchase.receiptNumber, nums));
      return { status: 'approved' as const, tickets: nums };
    }
  }
  return { status: 'submitted' as const, claimId: r.claim.id };
}

export async function approveService(admin: Admin, claimId: number, o: { amount?: number; category?: Category }) {
  const r = await approveClaim(store(), { claimId, adminId: admin.id, amount: o.amount, category: o.category });
  if (r.status === 'approved') {
    const nums = r.tickets.map((t) => t.ticketNumber);
    defer(() => notifyAwarded(r.claim.userId, r.purchase.receiptNumber, nums));
  } else if (r.status === 'duplicate_receipt') {
    defer(() => notifyRejected(r.claim.userId, r.claim.receiptNumber, 'Чек уже зарегистрирован'));
  }
  return r;
}

export async function rejectService(admin: Admin, claimId: number, reason: string) {
  const r = await rejectClaim(store(), { claimId, adminId: admin.id, reason });
  if (r.status === 'rejected') defer(() => notifyRejected(r.claim.userId, r.claim.receiptNumber, reason.trim()));
  return r;
}

/** Ручная регистрация сотрудником: участник ищется по Telegram ID или телефону и должен хотя бы раз открыть приложение. */
export async function registerManualService(admin: Admin, i: { identifier: string; receiptNumber: string; amount: number; category: Category; purchaseDate: string }) {
  const raffle = await getRaffleRow();
  const id = i.identifier.trim();
  const phone = normalizePhone(id);
  const user = await db().user.findFirst({ where: /^\d{5,}$/.test(id) && !phone ? { telegramId: BigInt(id) } : { OR: [{ telegramId: /^\d+$/.test(id) ? BigInt(id) : -1n }, ...(phone ? [{ phone }] : [])] } });
  if (!user) throw new NotFoundError('Участник не найден. Он должен хотя бы раз открыть приложение.');
  if (!user.consentAt) throw new ValidationError('Участник ещё не принял правила акции');
  const r = await registerPurchase(store(), {
    userId: user.id, adminId: admin.id, receiptNumber: i.receiptNumber, amount: i.amount, category: i.category,
    purchasedAt: zonedDate(i.purchaseDate, raffle.timezone, 12),
  });
  if (r.status === 'created') {
    const nums = r.tickets.map((t) => t.ticketNumber);
    defer(() => notifyAwarded(user.id, r.purchase.receiptNumber, nums));
  }
  return { ...r, user };
}

export async function cancelService(admin: Admin, purchaseId: number, reason: string) {
  const r = await cancelPurchase(store(), { purchaseId, adminId: admin.id, reason });
  if (r.status === 'cancelled') defer(() => notifyCancelled(r.purchase.userId, r.purchase.receiptNumber, r.voided.map((t) => t.ticketNumber), reason.trim()));
  return r;
}

export async function startRaffleService(admin: Admin) {
  return store().transaction(async (tx) => {
    const r = await tx.getRaffle('update');
    if (r.status !== 'DRAFT') return { status: 'not_draft' as const, raffle: r };
    const raffle = await tx.updateRaffle({ status: 'ACTIVE' });
    await tx.insertAudit({ adminId: admin.id, action: 'RAFFLE_STARTED', details: {} });
    return { status: 'started' as const, raffle };
  });
}

export const closeService = (admin: Admin) => closeRegistration(store(), { adminId: admin.id });

export async function winnerService(admin: Admin, ticketInput: string) {
  const r = await fixWinner(store(), { adminId: admin.id, ticketInput });
  if (r.status === 'fixed') {
    defer(async () => {
      await notifyWinner(r.ticket.userId, r.ticket.ticketNumber);
      await notifyRaffleFinished(r.ticket.userId, r.ticket.ticketNumber);
    });
  }
  return r;
}

export type { RaffleSettings };
