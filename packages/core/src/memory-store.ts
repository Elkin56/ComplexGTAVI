import type { Store, Tx, PurchaseRecord, TicketRecord, ClaimRecord } from './register';
import { DuplicateReceiptError } from './register';
import type { RaffleSettings } from './raffle';

/** In-memory реализация Store для тестов: транзакции сериализуются, при ошибке откатываются. */
export class MemoryStore implements Store {
  purchases: PurchaseRecord[] = [];
  tickets: TicketRecord[] = [];
  claims: ClaimRecord[] = [];
  audit: { adminId: number | null; action: string; details: Record<string, unknown> }[] = [];
  raffle: RaffleSettings = { startDate: new Date('2020-01-01'), endDate: new Date('2100-01-01'), status: 'ACTIVE', timezone: 'Europe/Moscow' };
  seq = 0;
  private chain: Promise<unknown> = Promise.resolve();

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const result = this.chain.then(async () => {
      const cp = <X extends object>(a: X[]) => a.map((x) => ({ ...x }));
      const snap = { p: cp(this.purchases), t: cp(this.tickets), c: cp(this.claims), a: [...this.audit], s: this.seq, r: { ...this.raffle } };
      try {
        return await fn(this.tx());
      } catch (e) {
        this.purchases = snap.p; this.tickets = snap.t; this.claims = snap.c; this.audit = snap.a; this.seq = snap.s; this.raffle = snap.r;
        throw e;
      }
    });
    this.chain = result.catch(() => undefined);
    return result;
  }

  private tx(): Tx {
    return {
      findPurchaseByReceipt: async (r) => this.purchases.find((p) => p.receiptNumber === r) ?? null,
      insertPurchase: async (p) => {
        if (this.purchases.some((x) => x.receiptNumber === p.receiptNumber)) throw new DuplicateReceiptError();
        const rec = { ...p, id: this.purchases.length + 1 };
        this.purchases.push(rec);
        return rec;
      },
      nextTicketSeqs: async (n) => Array.from({ length: n }, () => ++this.seq),
      insertTickets: async (ts) => {
        const recs = ts.map((t, i) => ({ ...t, id: this.tickets.length + i + 1 }));
        this.tickets.push(...recs);
        return recs;
      },
      insertAudit: async (e) => { this.audit.push(e); },
      findActiveClaimByReceipt: async (r) => this.claims.find((c) => c.receiptNumber === r && c.status !== 'REJECTED') ?? null,
      insertClaim: async (c) => {
        if (this.claims.some((x) => x.receiptNumber === c.receiptNumber && x.status !== 'REJECTED')) throw new DuplicateReceiptError();
        const rec = { ...c, id: this.claims.length + 1 };
        this.claims.push(rec);
        return rec;
      },
      getClaim: async (id) => { const c = this.claims.find((x) => x.id === id); return c ? { ...c } : null; },
      updateClaim: async (id, patch) => {
        const i = this.claims.findIndex((x) => x.id === id);
        this.claims[i] = { ...this.claims[i], ...patch };
        return { ...this.claims[i] };
      },
      countRecentClaims: async (u, since) => this.claims.filter((c) => c.userId === u && (c.createdAt ?? new Date(0)) >= since).length,
      countPendingClaims: async () => this.claims.filter((c) => c.status === 'PENDING').length,
      getPurchase: async (id) => { const p = this.purchases.find((x) => x.id === id); return p ? { ...p } : null; },
      updatePurchase: async (id, patch) => {
        const i = this.purchases.findIndex((x) => x.id === id);
        this.purchases[i] = { ...this.purchases[i], ...patch };
        return { ...this.purchases[i] };
      },
      voidTicketsByPurchase: async (pid) => {
        const hit = this.tickets.filter((t) => t.purchaseId === pid);
        hit.forEach((t) => { t.status = 'VOID'; });
        return hit.map((t) => ({ ...t }));
      },
      findTicketByNumber: async (n) => { const t = this.tickets.find((x) => x.ticketNumber === n); return t ? { ...t } : null; },
      getRaffle: async () => ({ ...this.raffle }),
      updateRaffle: async (patch) => { this.raffle = { ...this.raffle, ...patch }; return { ...this.raffle }; },
    };
  }
}
