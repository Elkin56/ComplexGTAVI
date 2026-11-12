import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  approveClaim, cancelPurchase, closeRegistration, fixWinner, registerPurchase, rejectClaim, submitClaim,
  RaffleClosedError, OutOfPeriodError, RateLimitError,
} from '@complex/core';
import { db } from '@/server/db';
import { PrismaStore } from '@/server/prisma-store';
import { hasDb, mkAdmin, mkUser, resetDb } from './helpers';

const d = hasDb ? describe : describe.skip;
const at = (s: string) => new Date(s + 'T09:00:00Z');

d('PrismaStore на реальной PostgreSQL', () => {
  const store = new PrismaStore(db());
  let admin: { id: number }; let u1: { id: number }; let u2: { id: number };

  beforeAll(async () => {
    await resetDb();
    admin = await mkAdmin(900);
    u1 = await mkUser(1001, 'Анна');
    u2 = await mkUser(1002, 'Борис');
    await store.transaction(async (tx) => {
      await tx.getRaffle('update');
      await tx.updateRaffle({ startDate: at('2026-11-06'), endDate: at('2026-12-01'), status: 'ACTIVE' });
    });
  });
  afterAll(async () => { await db().$disconnect(); });

  const reg = (userId: number, receipt: string, amount: number, category: 'PC' | 'OTHER' = 'OTHER', date = '2026-11-08') =>
    registerPurchase(store, { userId, adminId: admin.id, receiptNumber: receipt, amount, category, purchasedAt: at(date) });

  it('ручная регистрация: билеты по правилам, номера CP-…, аудит', async () => {
    const r = await reg(u1.id, 'M-1', 40000, 'PC');
    expect(r.status).toBe('created');
    expect(r.tickets.map((t) => t.ticketNumber)).toEqual(['CP-000001', 'CP-000002']);
    expect(await db().ticket.count()).toBe(2);
    expect(await db().auditLog.count({ where: { action: 'PURCHASE_REGISTERED' } })).toBe(1);
  });

  it('повторный чек и 8 параллельных одинаковых запросов дают одну покупку', async () => {
    expect((await reg(u1.id, 'm-1', 40000, 'PC')).status).toBe('duplicate');
    const rs = await Promise.all(Array.from({ length: 8 }, () => reg(u2.id, 'RACE-1', 31000)));
    expect(rs.filter((r) => r.status === 'created')).toHaveLength(1);
    expect(await db().purchase.count({ where: { receiptNumber: 'RACE-1' } })).toBe(1);
    expect(await db().ticket.count({ where: { purchase: { receiptNumber: 'RACE-1' } } })).toBe(2);
  });

  it('параллельные разные покупки получают уникальные номера билетов', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => reg(u1.id, `P-${i}`, 6000)));
    const nums = (await db().ticket.findMany({ select: { ticketNumber: true, ticketSeq: true } }));
    expect(new Set(nums.map((n) => n.ticketNumber)).size).toBe(nums.length);
    expect(nums.every((n) => n.ticketNumber === 'CP-' + String(n.ticketSeq).padStart(6, '0'))).toBe(true);
  });

  it('период акции: до начала и после окончания не принимаются', async () => {
    await expect(reg(u1.id, 'OLD-1', 6000, 'OTHER', '2026-11-05')).rejects.toThrow(OutOfPeriodError);
    await expect(reg(u1.id, 'OLD-2', 6000, 'OTHER', '2026-12-01')).rejects.toThrow(OutOfPeriodError);
    expect(await db().purchase.count({ where: { receiptNumber: { in: ['OLD-1', 'OLD-2'] } } })).toBe(0);
  });

  it('заявка: отправка, 5 параллельных подтверждений выдают билеты один раз', async () => {
    const s = await submitClaim(store, { userId: u2.id, receiptNumber: 'C-1', amount: 50000, category: 'OTHER', purchasedAt: at('2026-11-09'), now: at('2026-11-10') });
    expect(s.status).toBe('submitted');
    const claimId = s.status === 'submitted' ? s.claim.id : 0;
    const before = await db().ticket.count();
    const rs = await Promise.all(Array.from({ length: 5 }, () => approveClaim(store, { claimId, adminId: admin.id })));
    expect(rs.filter((r) => r.status === 'approved')).toHaveLength(1);
    expect(await db().ticket.count()).toBe(before + 2);
    const c = await db().purchaseClaim.findUniqueOrThrow({ where: { id: claimId } });
    expect(c).toMatchObject({ status: 'APPROVED', reviewedBy: admin.id });
    expect(c.purchaseId).not.toBeNull();
  });

  it('заявка: дубль чужой заявки, 10 параллельных отправок, повтор после отказа', async () => {
    const sub = (userId: number, r: string) => submitClaim(store, { userId, receiptNumber: r, amount: 9000, category: 'OTHER', purchasedAt: at('2026-11-09'), now: at('2026-11-10'), maxPerDay: 100 });
    const rs = await Promise.all(Array.from({ length: 10 }, () => sub(u1.id, 'D-1')));
    expect(rs.filter((r) => r.status === 'submitted')).toHaveLength(1);
    expect((await sub(u2.id, 'D-1')).status).toBe('duplicate_claim');
    const first = rs.find((r) => r.status === 'submitted');
    const id = first && first.status === 'submitted' ? first.claim.id : 0;
    await rejectClaim(store, { claimId: id, adminId: admin.id, reason: 'Нечитаемое фото' });
    expect((await sub(u1.id, 'D-1')).status).toBe('submitted');
    expect((await approveClaim(store, { claimId: id, adminId: admin.id })).status).toBe('already_reviewed');
  });

  it('база не даёт обойти защиту: два активных claim на один чек и нулевая сумма запрещены', async () => {
    const base = { userId: u1.id, receiptNumber: 'RAW-1', amount: 100, category: 'OTHER' as const, purchasedAt: at('2026-11-09') };
    await db().purchaseClaim.create({ data: base });
    await expect(db().purchaseClaim.create({ data: base })).rejects.toThrow();
    await expect(db().purchase.create({ data: { userId: u1.id, receiptNumber: 'RAW-2', amount: 0, category: 'OTHER', ticketsAwarded: 0, purchasedAt: at('2026-11-09') } })).rejects.toThrow();
    await db().purchaseClaim.deleteMany({ where: { receiptNumber: 'RAW-1' } });
  });

  it('лимит заявок в сутки', async () => {
    const u = await mkUser(1003, 'Лимит');
    const sub = (i: number) => submitClaim(store, { userId: u.id, receiptNumber: `LIM-${i}`, amount: 6000, category: 'OTHER', purchasedAt: at('2026-11-09'), now: at('2026-11-10') });
    for (let i = 0; i < 5; i++) await sub(i);
    await expect(sub(99)).rejects.toThrow(RateLimitError);
  });

  it('отмена покупки: билеты VOID, записи сохранены, повтор идемпотентен', async () => {
    const r = await reg(u2.id, 'CAN-1', 6000);
    const pid = r.purchase.id;
    const c = await cancelPurchase(store, { purchaseId: pid, adminId: admin.id, reason: 'Возврат товара' });
    expect(c.status).toBe('cancelled');
    const ts = await db().ticket.findMany({ where: { purchaseId: pid } });
    expect(ts).toHaveLength(1);
    expect(ts.every((t) => t.status === 'VOID')).toBe(true);
    expect((await cancelPurchase(store, { purchaseId: pid, adminId: admin.id, reason: 'ещё раз' })).status).toBe('already_cancelled');
    expect((await reg(u2.id, 'CAN-1', 6000)).status).toBe('duplicate');
  });

  it('закрытие приёма и финал', async () => {
    // есть необработанные заявки (LIM-*): закрыть нельзя
    expect((await closeRegistration(store, { adminId: admin.id })).status).toBe('pending_claims');
    await db().purchaseClaim.updateMany({ where: { status: 'PENDING' }, data: { status: 'REJECTED', rejectReason: 'тест' } });
    expect((await closeRegistration(store, { adminId: admin.id })).status).toBe('closed');

    await expect(reg(u1.id, 'LATE-1', 6000)).rejects.toThrow(RaffleClosedError);
    await expect(submitClaim(store, { userId: u1.id, receiptNumber: 'LATE-2', amount: 6000, category: 'OTHER', purchasedAt: at('2026-11-09'), now: at('2026-11-10') })).rejects.toThrow(RaffleClosedError);

    const voidT = await db().ticket.findFirstOrThrow({ where: { status: 'VOID' } });
    expect((await fixWinner(store, { adminId: admin.id, ticketInput: voidT.ticketNumber })).status).toBe('void_ticket');
    expect((await fixWinner(store, { adminId: admin.id, ticketInput: '999999' })).status).toBe('not_found');

    const win = await db().ticket.findFirstOrThrow({ where: { status: 'ACTIVE' }, orderBy: { ticketSeq: 'asc' } });
    const r = await fixWinner(store, { adminId: admin.id, ticketInput: String(win.ticketSeq) });
    expect(r.status).toBe('fixed');
    const raffle = await db().raffle.findFirstOrThrow();
    expect(raffle).toMatchObject({ status: 'FINISHED', winnerTicketId: win.id });
    expect(raffle.winnerFixedAt).not.toBeNull();
    expect((await fixWinner(store, { adminId: admin.id, ticketInput: '2' })).status).toBe('already_finished');
    expect((await db().raffle.findFirstOrThrow()).winnerTicketId).toBe(win.id);
    await expect(cancelPurchase(store, { purchaseId: 1, adminId: admin.id, reason: 'поздно' })).rejects.toThrow(RaffleClosedError);
  });

  it('аудит содержит все действия', async () => {
    const actions = (await db().auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of ['PURCHASE_REGISTERED', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'PURCHASE_CANCELLED', 'REGISTRATION_CLOSED', 'WINNER_FIXED']) expect(actions).toContain(a);
  });
});
