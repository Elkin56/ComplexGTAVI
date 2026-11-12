import type { Category, ReceiptVerifier } from '@complex/core';
import { env } from './env';

const CATS = ['PC', 'COMPONENTS', 'PERIPHERALS', 'OTHER'];

/**
 * Автопроверка чека по кассе/1С. Контракт вашего API:
 *   GET {RECEIPT_API_URL}?receipt=<номер>&date=<YYYY-MM-DD>   (Authorization: Bearer <RECEIPT_API_TOKEN>)
 *   200 {"found": true, "amount": 5400, "category": "PC"}   или   200 {"found": false}   или   404
 * Если RECEIPT_API_URL не задан, автопроверка выключена и все заявки идут на ручную проверку.
 */
export function receiptVerifier(): ReceiptVerifier | null {
  const e = env();
  if (!e.RECEIPT_API_URL) return null;
  return {
    async verify(q) {
      const url = new URL(e.RECEIPT_API_URL);
      url.searchParams.set('receipt', q.receiptNumber);
      url.searchParams.set('date', q.purchasedAt.toISOString().slice(0, 10));
      const res = await fetch(url, { headers: e.RECEIPT_API_TOKEN ? { authorization: `Bearer ${e.RECEIPT_API_TOKEN}` } : {}, signal: AbortSignal.timeout(5000) });
      if (res.status === 404) return { status: 'not_found' };
      if (!res.ok) return { status: 'unavailable' };
      const j = (await res.json()) as { found?: boolean; amount?: number; category?: string };
      if (!j.found) return { status: 'not_found' };
      if (typeof j.amount !== 'number' || !Number.isFinite(j.amount)) return { status: 'unavailable' };
      const category = j.category && CATS.includes(j.category) ? (j.category as Category) : undefined;
      return Math.abs(j.amount - q.amount) < 0.005 ? { status: 'match', amount: j.amount, category } : { status: 'mismatch', amount: j.amount };
    },
  };
}
