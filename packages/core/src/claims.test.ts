import { describe, it, expect } from 'vitest';
import { submitClaim, approveClaim, rejectClaim, NotFoundError } from './claims';
import { registerPurchase, ValidationError } from './register';
import { MemoryStore } from './memory-store';

const claim = { userId: 1, purchasedAt: new Date('2026-11-01'), now: new Date('2026-11-07') };
const admin = { adminId: 9 };

describe('submitClaim', () => {
  it('создаёт заявку PENDING и не выдаёт билеты', async () => {
    const s = new MemoryStore();
    const r = await submitClaim(s, { ...claim, receiptNumber: 'a-1', amount: 8000, category: 'OTHER' });
    expect(r.status).toBe('submitted');
    expect(s.claims[0].status).toBe('PENDING');
    expect(s.tickets).toHaveLength(0);
    expect(s.purchases).toHaveLength(0);
  });
  it('чек уже зарегистрирован сотрудником', async () => {
    const s = new MemoryStore();
    await registerPurchase(s, { userId: 2, adminId: 9, receiptNumber: 'A2', amount: 6000, category: 'OTHER', purchasedAt: new Date('2026-11-01') });
    expect((await submitClaim(s, { ...claim, receiptNumber: ' a2', amount: 6000, category: 'OTHER' })).status).toBe('already_registered');
  });
  it('чужой повтор того же чека отклоняется', async () => {
    const s = new MemoryStore();
    await submitClaim(s, { ...claim, receiptNumber: 'B1', amount: 6000, category: 'OTHER' });
    expect((await submitClaim(s, { ...claim, userId: 2, receiptNumber: 'b1', amount: 6000, category: 'OTHER' })).status).toBe('duplicate_claim');
  });
  it('10 параллельных отправок дают одну заявку', async () => {
    const s = new MemoryStore();
    const rs = await Promise.all(Array.from({ length: 10 }, () => submitClaim(s, { ...claim, receiptNumber: 'P1', amount: 9000, category: 'PC' })));
    expect(rs.filter((r) => r.status === 'submitted')).toHaveLength(1);
    expect(s.claims).toHaveLength(1);
  });
  it('валидация: будущая дата, нулевая сумма', async () => {
    const s = new MemoryStore();
    await expect(submitClaim(s, { ...claim, receiptNumber: 'F', amount: 5000, category: 'PC', purchasedAt: new Date('2027-01-01') })).rejects.toThrow(ValidationError);
    await expect(submitClaim(s, { ...claim, receiptNumber: 'F', amount: 0, category: 'PC' })).rejects.toThrow(ValidationError);
  });
});

describe('approveClaim', () => {
  it('подтверждение выдаёт билеты и закрывает заявку', async () => {
    const s = new MemoryStore();
    await submitClaim(s, { ...claim, receiptNumber: 'C1', amount: 40000, category: 'PC' });
    const r = await approveClaim(s, { claimId: 1, ...admin });
    expect(r.status).toBe('approved');
    if (r.status === 'approved') expect(r.tickets.map((t) => t.ticketNumber)).toEqual(['CP-000001', 'CP-000002']);
    expect(s.claims[0]).toMatchObject({ status: 'APPROVED', reviewedBy: 9, purchaseId: 1 });
    expect(s.audit.map((a) => a.action)).toEqual(['PURCHASE_REGISTERED', 'CLAIM_APPROVED']);
  });
  it('сумма сотрудника главнее заявленной', async () => {
    const s = new MemoryStore();
    await submitClaim(s, { ...claim, receiptNumber: 'C2', amount: 4000, category: 'OTHER' });
    const r = await approveClaim(s, { claimId: 1, ...admin, amount: 6000 });
    expect(r.status === 'approved' && r.tickets).toHaveLength(1);
    expect(s.purchases[0].amount).toBe(6000);
  });
  it('повторное и параллельное подтверждение не удваивает билеты', async () => {
    const s = new MemoryStore();
    await submitClaim(s, { ...claim, receiptNumber: 'C3', amount: 31000, category: 'OTHER' });
    const rs = await Promise.all(Array.from({ length: 5 }, () => approveClaim(s, { claimId: 1, ...admin })));
    expect(rs.filter((r) => r.status === 'approved')).toHaveLength(1);
    expect(s.tickets).toHaveLength(2);
  });
  it('чек зарегистрирован вручную раньше: заявка отклоняется, билетов нет сверх', async () => {
    const s = new MemoryStore();
    await submitClaim(s, { ...claim, receiptNumber: 'C4', amount: 6000, category: 'OTHER' });
    // сотрудник зарегистрировал тот же чек в обход заявки
    s.claims[0].status = 'REJECTED'; s.claims[0].rejectReason = 'x';
    await registerPurchase(s, { userId: 1, adminId: 9, receiptNumber: 'C4', amount: 6000, category: 'OTHER', purchasedAt: new Date('2026-11-01') });
    s.claims[0].status = 'PENDING';
    const r = await approveClaim(s, { claimId: 1, ...admin });
    expect(r.status).toBe('duplicate_receipt');
    expect(s.tickets).toHaveLength(1);
  });
  it('неизвестная заявка', async () => {
    await expect(approveClaim(new MemoryStore(), { claimId: 5, ...admin })).rejects.toThrow(NotFoundError);
  });
});

describe('rejectClaim', () => {
  it('отказ требует причину и не выдаёт билеты', async () => {
    const s = new MemoryStore();
    await submitClaim(s, { ...claim, receiptNumber: 'D1', amount: 9000, category: 'OTHER' });
    await expect(rejectClaim(s, { claimId: 1, ...admin, reason: '  ' })).rejects.toThrow(ValidationError);
    const r = await rejectClaim(s, { claimId: 1, ...admin, reason: 'Нечитаемое фото' });
    expect(r.status).toBe('rejected');
    expect(s.tickets).toHaveLength(0);
  });
  it('после отказа можно подать исправленную заявку, но нельзя подтвердить отклонённую', async () => {
    const s = new MemoryStore();
    await submitClaim(s, { ...claim, receiptNumber: 'D2', amount: 9000, category: 'OTHER' });
    await rejectClaim(s, { claimId: 1, ...admin, reason: 'Сумма не совпадает' });
    expect((await approveClaim(s, { claimId: 1, ...admin })).status).toBe('already_reviewed');
    expect((await submitClaim(s, { ...claim, receiptNumber: 'D2', amount: 5000, category: 'OTHER' })).status).toBe('submitted');
  });
});
