import { describe, it, expect } from 'vitest';
import { MemoryStore } from './memory-store';
import { submitClaim, approveClaim, autoReviewClaim, RateLimitError, type ReceiptVerifier } from './claims';
import { registerPurchase } from './register';
import { cancelPurchase, closeRegistration, fixWinner } from './operations';
import { OutOfPeriodError, RaffleClosedError, RaffleStateError } from './raffle';
import { normalizePhone, parseTicketNumber } from './rules';
import { ticketsToCsv, csvCell, reminderDue, flagRiskyUsers, zonedDate, localHour, isValidTimezone } from './extras';
import { signToken, verifyToken, AuthError } from './auth';

const D = (s: string) => new Date(s);
const msk = (s: string) => new Date(s + '+03:00');
const mk = () => {
  const s = new MemoryStore();
  s.raffle = { startDate: msk('2026-11-06T00:00:00'), endDate: msk('2026-12-01T00:00:00'), status: 'ACTIVE', timezone: 'Europe/Moscow' };
  return s;
};
const base = { userId: 1, now: msk('2026-11-10T12:00:00'), purchasedAt: msk('2026-11-08T12:00:00') };
const reg = (s: MemoryStore, receipt: string, amount = 6000, at = '2026-11-08T12:00:00') =>
  registerPurchase(s, { userId: 1, adminId: 9, receiptNumber: receipt, amount, category: 'OTHER', purchasedAt: msk(at) });

describe('период и статус акции', () => {
  it('чек до начала и после окончания не принимается', async () => {
    const s = mk();
    await expect(submitClaim(s, { ...base, receiptNumber: 'E1', amount: 6000, category: 'OTHER', purchasedAt: msk('2026-11-05T23:59:00') })).rejects.toThrow(OutOfPeriodError);
    await expect(reg(s, 'E2', 6000, '2026-12-01T00:00:00')).rejects.toThrow(OutOfPeriodError);
    expect(s.tickets).toHaveLength(0);
  });
  it('граница начала включена', async () => {
    const s = mk();
    expect((await reg(s, 'E3', 6000, '2026-11-06T00:00:00')).status).toBe('created');
  });
  it('после закрытия приёма новые заявки и покупки отклоняются', async () => {
    const s = mk();
    await closeRegistration(s, { adminId: 9 });
    await expect(submitClaim(s, { ...base, receiptNumber: 'E4', amount: 6000, category: 'OTHER' })).rejects.toThrow(RaffleClosedError);
    await expect(reg(s, 'E5')).rejects.toThrow(RaffleClosedError);
  });
});

describe('лимит заявок', () => {
  it('не больше 5 за сутки, потом можно', async () => {
    const s = mk();
    for (let i = 0; i < 5; i++) await submitClaim(s, { ...base, receiptNumber: 'R' + i, amount: 6000, category: 'OTHER' });
    await expect(submitClaim(s, { ...base, receiptNumber: 'R9', amount: 6000, category: 'OTHER' })).rejects.toThrow(RateLimitError);
    const later = { ...base, now: msk('2026-11-11T13:00:00') };
    expect((await submitClaim(s, { ...later, receiptNumber: 'R9', amount: 6000, category: 'OTHER' })).status).toBe('submitted');
  });
});

describe('автопроверка по кассе', () => {
  const v = (r: Awaited<ReturnType<ReceiptVerifier['verify']>> | 'throw'): ReceiptVerifier => ({ verify: async () => { if (r === 'throw') throw new Error('down'); return r; } });
  const setup = async () => { const s = mk(); await submitClaim(s, { ...base, receiptNumber: 'V1', amount: 12000, category: 'OTHER' }); return s; };

  it('точное совпадение подтверждается системой без сотрудника', async () => {
    const s = await setup();
    const r = await autoReviewClaim(s, 1, v({ status: 'match', amount: 12000 }));
    expect(r.status).toBe('approved');
    expect(s.tickets).toHaveLength(1);
    expect(s.claims[0].reviewedBy).toBeNull();
    expect(s.audit.map((a) => a.action)).toContain('CLAIM_AUTO_APPROVED');
  });
  it('расхождение суммы, нет чека, касса недоступна: остаётся на ручной проверке', async () => {
    for (const res of [v({ status: 'mismatch', amount: 11000 }), v({ status: 'not_found' }), v({ status: 'unavailable' }), v('throw')]) {
      const s = await setup();
      const r = await autoReviewClaim(s, 1, res);
      expect(r.status).toBe('needs_review');
      expect(s.claims[0].status).toBe('PENDING');
      expect(s.claims[0].verifyNote).toBeTruthy();
      expect(s.tickets).toHaveLength(0);
    }
  });
  it('повторная автопроверка не дублирует билеты', async () => {
    const s = await setup();
    await Promise.all([1, 2, 3].map(() => autoReviewClaim(s, 1, v({ status: 'match', amount: 12000 }))));
    expect(s.tickets).toHaveLength(1);
  });
});

describe('отмена покупки', () => {
  it('аннулирует билеты, сохраняет записи и аудит, идемпотентна', async () => {
    const s = mk();
    await reg(s, 'X1', 40000);
    const r = await cancelPurchase(s, { purchaseId: 1, adminId: 9, reason: 'Возврат товара' });
    expect(r.status).toBe('cancelled');
    expect(s.tickets).toHaveLength(2);
    expect(s.tickets.every((t) => t.status === 'VOID')).toBe(true);
    expect(s.purchases[0]).toMatchObject({ status: 'CANCELLED', cancelReason: 'Возврат товара' });
    expect((await cancelPurchase(s, { purchaseId: 1, adminId: 9, reason: 'ещё раз' })).status).toBe('already_cancelled');
    expect(s.audit.filter((a) => a.action === 'PURCHASE_CANCELLED')).toHaveLength(1);
  });
  it('чек отменённой покупки нельзя зарегистрировать повторно', async () => {
    const s = mk();
    await reg(s, 'X2');
    await cancelPurchase(s, { purchaseId: 1, adminId: 9, reason: 'ошибка' });
    expect((await reg(s, 'X2')).status).toBe('duplicate');
  });
});

describe('закрытие приёма и фиксация победителя', () => {
  it('нельзя закрыть при необработанных заявках', async () => {
    const s = mk();
    await submitClaim(s, { ...base, receiptNumber: 'P1', amount: 6000, category: 'OTHER' });
    expect(await closeRegistration(s, { adminId: 9 })).toMatchObject({ status: 'pending_claims', pending: 1 });
    await approveClaim(s, { claimId: 1, adminId: 9 });
    expect((await closeRegistration(s, { adminId: 9 })).status).toBe('closed');
  });
  it('победитель фиксируется один раз, только по действительному билету', async () => {
    const s = mk();
    await reg(s, 'W1', 40000); // билеты 1, 2
    await reg(s, 'W2', 6000);  // билет 3
    await expect(fixWinner(s, { adminId: 9, ticketInput: '1' })).rejects.toThrow(RaffleStateError);
    await cancelPurchase(s, { purchaseId: 2, adminId: 9, reason: 'ошибка' });
    await closeRegistration(s, { adminId: 9 });
    expect((await fixWinner(s, { adminId: 9, ticketInput: '3' })).status).toBe('void_ticket');
    expect((await fixWinner(s, { adminId: 9, ticketInput: '99' })).status).toBe('not_found');
    const ok = await fixWinner(s, { adminId: 9, ticketInput: 'cp-000002' });
    expect(ok.status).toBe('fixed');
    expect(s.raffle).toMatchObject({ status: 'FINISHED', winnerTicketId: 2 });
    expect((await fixWinner(s, { adminId: 9, ticketInput: '1' })).status).toBe('already_finished');
    expect(s.raffle.winnerTicketId).toBe(2);
    await expect(cancelPurchase(s, { purchaseId: 1, adminId: 9, reason: 'поздно' })).rejects.toThrow(RaffleClosedError);
  });
});

describe('утилиты', () => {
  it('телефон', () => {
    expect(normalizePhone('8 (900) 111-22-33')).toBe('+79001112233');
    expect(normalizePhone('+7 900 111 22 33')).toBe('+79001112233');
    expect(normalizePhone('9001112233')).toBe('+79001112233');
    expect(normalizePhone('12345')).toBeNull();
  });
  it('номер билета', () => {
    expect(parseTicketNumber('427')).toBe('CP-000427');
    expect(parseTicketNumber(' cp-000427 ')).toBe('CP-000427');
    expect(parseTicketNumber('0')).toBeNull();
    expect(parseTicketNumber('abc')).toBeNull();
  });
  it('CSV: экранирование и защита от формул', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('a;b')).toBe('"a;b"');
    const csv = ticketsToCsv([{ ticketNumber: 'CP-000001', status: 'ACTIVE', userName: '+cmd', telegramId: 5n, phone: '+79001112233', receiptNumber: 'A1' }]);
    expect(csv.split('\r\n')[1]).toBe("CP-000001;ACTIVE;'+cmd;5;79001112233;A1");
  });
  it('напоминания: за 3 дня, за 1 день, в день финала', () => {
    const end = msk('2026-12-01T00:00:00');
    expect(reminderDue(msk('2026-11-28T10:00:00'), end, 'Europe/Moscow')).toBe('D3');
    expect(reminderDue(msk('2026-11-30T10:00:00'), end, 'Europe/Moscow')).toBe('D1');
    expect(reminderDue(msk('2026-12-01T09:00:00'), end, 'Europe/Moscow')).toBe('D0');
    expect(reminderDue(msk('2026-11-29T10:00:00'), end, 'Europe/Moscow')).toBeNull();
  });
  it('антифрод: 3 и более отказов за 30 дней', () => {
    const now = D('2026-11-10');
    const c = (u: number, s: string, d = '2026-11-05') => ({ userId: u, status: s, createdAt: D(d) });
    expect(flagRiskyUsers([c(1, 'REJECTED'), c(1, 'REJECTED'), c(1, 'REJECTED'), c(2, 'REJECTED'), c(2, 'APPROVED'), c(3, 'REJECTED', '2026-08-01'), c(3, 'REJECTED', '2026-08-01'), c(3, 'REJECTED', '2026-08-01')], { now })).toEqual([1]);
  });
});

describe('часовые пояса и токены', () => {
  it('zonedDate: полдень по Москве и граница суток', () => {
    expect(zonedDate('2026-11-08', 'Europe/Moscow').toISOString()).toBe('2026-11-08T09:00:00.000Z');
    expect(zonedDate('2026-12-01', 'Europe/Moscow', 0).toISOString()).toBe('2026-11-30T21:00:00.000Z');
    expect(zonedDate('2026-07-01', 'Europe/Samara', 12).toISOString()).toBe('2026-07-01T08:00:00.000Z');
  });
  it('zonedDate: летнее время и несуществующие даты', () => {
    expect(zonedDate('2026-07-01', 'Europe/Berlin', 12).toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(zonedDate('2026-01-01', 'Europe/Berlin', 12).toISOString()).toBe('2026-01-01T11:00:00.000Z');
    expect(() => zonedDate('2026-02-31', 'Europe/Moscow')).toThrow();
    expect(() => zonedDate('01.02.2026', 'Europe/Moscow')).toThrow();
  });
  it('localHour и isValidTimezone', () => {
    expect(localHour(new Date('2026-11-10T07:30:00Z'), 'Europe/Moscow')).toBe(10);
    expect(isValidTimezone('Europe/Moscow')).toBe(true);
    expect(isValidTimezone('Mars/Base')).toBe(false);
  });
  it('токен: подпись, срок и подмена', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const tok = signToken({ kind: 'tickets', admin: 1 }, 'secret-secret-secret', 300, now);
    expect(verifyToken<{ kind: string }>(tok, 'secret-secret-secret', now).kind).toBe('tickets');
    expect(() => verifyToken(tok, 'other-secret-secret!', now)).toThrow(AuthError);
    expect(() => verifyToken(tok, 'secret-secret-secret', new Date('2026-11-10T12:06:00Z'))).toThrow(/устарела/);
    const [b, s] = tok.split('.');
    const forged = Buffer.from(JSON.stringify({ kind: 'tickets', admin: 2, exp: 9e9 })).toString('base64url') + '.' + s;
    expect(() => verifyToken(forged, 'secret-secret-secret', now)).toThrow(AuthError);
    expect(() => verifyToken(b, 'secret-secret-secret', now)).toThrow(AuthError);
  });
});
