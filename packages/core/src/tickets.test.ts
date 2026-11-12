import { describe, it, expect } from 'vitest';
import { calculateTickets, formatTicketNumber, normalizeReceipt } from './rules';
import { registerPurchase, ValidationError } from './register';
import { MemoryStore } from './memory-store';

describe('calculateTickets', () => {
  it.each([
    [4999.99, 'OTHER', 0],
    [5000, 'OTHER', 1],
    [29999.99, 'COMPONENTS', 1],
    [30000, 'PERIPHERALS', 2],
    [100000, 'OTHER', 2],
    [1000, 'PC', 2],
    [5000, 'PC', 2],
    [30000, 'PC', 2], // не 4: правила не суммируются
    [250000, 'PC', 2],
    [0, 'PC', 0],
    [-10, 'OTHER', 0],
    [NaN, 'PC', 0],
  ] as const)('amount=%s category=%s → %s', (amount, cat, expected) => {
    expect(calculateTickets(amount, cat)).toBe(expected);
  });
});

describe('formatTicketNumber / normalizeReceipt', () => {
  it('форматирует номер', () => {
    expect(formatTicketNumber(1)).toBe('CP-000001');
    expect(formatTicketNumber(123456)).toBe('CP-123456');
  });
  it('нормализует чек', () => {
    expect(normalizeReceipt('  ab 12-3 ')).toBe('AB12-3');
  });
});

const base = { userId: 1, adminId: 1, purchasedAt: new Date('2026-11-01') };

describe('registerPurchase', () => {
  it('выдаёт последовательные уникальные номера', async () => {
    const s = new MemoryStore();
    const a = await registerPurchase(s, { ...base, receiptNumber: 'A1', amount: 30000, category: 'PC' });
    const b = await registerPurchase(s, { ...base, receiptNumber: 'A2', amount: 6000, category: 'OTHER' });
    expect(a.tickets.map((t) => t.ticketNumber)).toEqual(['CP-000001', 'CP-000002']);
    expect(b.tickets.map((t) => t.ticketNumber)).toEqual(['CP-000003']);
  });

  it('повторный чек не начисляет билеты второй раз', async () => {
    const s = new MemoryStore();
    await registerPurchase(s, { ...base, receiptNumber: 'X1', amount: 5000, category: 'OTHER' });
    const again = await registerPurchase(s, { ...base, receiptNumber: ' x1 ', amount: 5000, category: 'OTHER' });
    expect(again.status).toBe('duplicate');
    expect(s.tickets).toHaveLength(1);
    expect(s.purchases).toHaveLength(1);
  });

  it('параллельные одинаковые запросы дают одну покупку', async () => {
    const s = new MemoryStore();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => registerPurchase(s, { ...base, receiptNumber: 'R9', amount: 40000, category: 'PC' })),
    );
    expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
    expect(s.tickets).toHaveLength(2);
  });

  it('покупка без билетов регистрируется с 0 билетов', async () => {
    const s = new MemoryStore();
    const r = await registerPurchase(s, { ...base, receiptNumber: 'S1', amount: 1000, category: 'OTHER' });
    expect(r.status).toBe('created');
    expect(r.purchase.ticketsAwarded).toBe(0);
    expect(s.tickets).toHaveLength(0);
  });

  it('пишет аудит', async () => {
    const s = new MemoryStore();
    await registerPurchase(s, { ...base, receiptNumber: 'AU1', amount: 5000, category: 'OTHER' });
    expect(s.audit.map((a) => a.action)).toEqual(['PURCHASE_REGISTERED']);
  });

  it('отклоняет некорректный ввод', async () => {
    const s = new MemoryStore();
    await expect(registerPurchase(s, { ...base, receiptNumber: '  ', amount: 5000, category: 'PC' })).rejects.toThrow(ValidationError);
    await expect(registerPurchase(s, { ...base, receiptNumber: 'Z', amount: 0, category: 'PC' })).rejects.toThrow(ValidationError);
  });
});
