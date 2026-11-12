export type Category = 'PC' | 'COMPONENTS' | 'PERIPHERALS' | 'OTHER';

export const MIN_AMOUNT_ONE_TICKET = 5000;
export const MIN_AMOUNT_TWO_TICKETS = 30000;

/** Правила не суммируются: берётся максимум. */
export function calculateTickets(amount: number, category: Category): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  let tickets = 0;
  if (amount >= MIN_AMOUNT_ONE_TICKET) tickets = Math.max(tickets, 1);
  if (category === 'PC') tickets = Math.max(tickets, 2);
  if (amount >= MIN_AMOUNT_TWO_TICKETS) tickets = Math.max(tickets, 2);
  return tickets;
}

export function formatTicketNumber(seq: number): string {
  return `CP-${String(seq).padStart(6, '0')}`;
}

export function normalizeReceipt(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

/** Российский номер → +7XXXXXXXXXX или null. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  else if (d.length === 10) d = '7' + d;
  return d.length === 11 && d[0] === '7' ? '+' + d : null;
}

/** '427', 'cp-427', 'CP-000427' → 'CP-000427'. */
export function parseTicketNumber(raw: string): string | null {
  const m = raw.trim().toUpperCase().match(/^(?:CP-?)?0*(\d{1,6})$/);
  return m && Number(m[1]) > 0 ? formatTicketNumber(Number(m[1])) : null;
}
