import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  DuplicateReceiptError, formatTicketNumber,
  type ClaimRecord, type PurchaseRecord, type RaffleSettings, type Store, type TicketRecord, type Tx,
} from '@complex/core';

type TxClient = Prisma.TransactionClient;
type Row = Record<string, unknown>;

const isUnique = (e: unknown): boolean => {
  const x = e as { code?: string; message?: string; cause?: { originalCode?: string } };
  return x?.code === 'P2002' || x?.cause?.originalCode === '23505' || /unique constraint|23505/i.test(x?.message ?? '');
};

const toPurchase = (p: Row): PurchaseRecord => ({ ...(p as object), amount: Number(p.amount) }) as PurchaseRecord;
const toTicket = (t: Row): TicketRecord => t as unknown as TicketRecord;
const toClaim = (c: Row): ClaimRecord => ({ ...(c as object), amount: Number(c.amount) }) as ClaimRecord;
const toRaffle = (r: Row): RaffleSettings => r as unknown as RaffleSettings;
const NO_PHOTO = { photo: true } as const;

const DEFAULT_TITLE = 'Розыгрыш PS5 + GTA 6';

/** Единственная строка Raffle. Создаётся при первом обращении (под advisory-lock, чтобы не получить две). */
async function lockedRaffleId(tx: TxClient, lock: 'share' | 'update'): Promise<number> {
  const sel = () => lock === 'update'
    ? tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Raffle" ORDER BY id LIMIT 1 FOR UPDATE`
    : tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Raffle" ORDER BY id LIMIT 1 FOR SHARE`;
  let rows = await sel();
  if (rows.length === 0) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7001)`;
    rows = await sel();
    if (rows.length === 0) {
      const now = new Date();
      await tx.raffle.create({ data: { title: DEFAULT_TITLE, startDate: now, endDate: new Date(now.getTime() + 25 * 864e5), status: 'DRAFT' } });
      rows = await sel();
    }
  }
  return rows[0].id;
}

function makeTx(tx: TxClient): Tx {
  return {
    findPurchaseByReceipt: async (r) => { const p = await tx.purchase.findUnique({ where: { receiptNumber: r } }); return p ? toPurchase(p) : null; },
    insertPurchase: async (p) => {
      try { return toPurchase(await tx.purchase.create({ data: p })); }
      catch (e) { if (isUnique(e)) throw new DuplicateReceiptError(); throw e; }
    },
    nextTicketSeqs: async (count) => {
      const rows = await tx.$queryRaw<{ n: number }[]>`SELECT nextval('ticket_number_seq')::int AS n FROM generate_series(1, ${count}::int)`;
      return rows.map((r) => r.n).sort((a, b) => a - b);
    },
    insertTickets: async (ts) => {
      const out: TicketRecord[] = [];
      for (const t of ts) out.push(toTicket(await tx.ticket.create({ data: { ...t, ticketNumber: t.ticketNumber || formatTicketNumber(t.ticketSeq) } })));
      return out;
    },
    insertAudit: async (e) => { await tx.auditLog.create({ data: { adminId: e.adminId, action: e.action, details: e.details as Prisma.InputJsonValue } }); },
    findActiveClaimByReceipt: async (r) => {
      const c = await tx.purchaseClaim.findFirst({ where: { receiptNumber: r, status: { in: ['PENDING', 'APPROVED'] } }, omit: NO_PHOTO });
      return c ? toClaim(c) : null;
    },
    insertClaim: async (c) => {
      try { return toClaim(await tx.purchaseClaim.create({ data: c, omit: NO_PHOTO })); }
      catch (e) { if (isUnique(e)) throw new DuplicateReceiptError(); throw e; }
    },
    getClaim: async (id) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseClaim" WHERE id = ${id} FOR UPDATE`; // сериализует параллельные решения по одной заявке
      const c = await tx.purchaseClaim.findUnique({ where: { id }, omit: NO_PHOTO });
      return c ? toClaim(c) : null;
    },
    updateClaim: async (id, patch) => {
      const { id: _id, ...data } = patch;
      return toClaim(await tx.purchaseClaim.update({ where: { id }, data, omit: NO_PHOTO }));
    },
    countRecentClaims: (userId, since) => tx.purchaseClaim.count({ where: { userId, createdAt: { gte: since } } }),
    countPendingClaims: () => tx.purchaseClaim.count({ where: { status: 'PENDING' } }),
    getPurchase: async (id) => { const p = await tx.purchase.findUnique({ where: { id } }); return p ? toPurchase(p) : null; },
    updatePurchase: async (id, patch) => {
      const { id: _id, ...data } = patch;
      return toPurchase(await tx.purchase.update({ where: { id }, data }));
    },
    voidTicketsByPurchase: async (purchaseId) => {
      await tx.ticket.updateMany({ where: { purchaseId }, data: { status: 'VOID' } });
      return (await tx.ticket.findMany({ where: { purchaseId }, orderBy: { ticketSeq: 'asc' } })).map(toTicket);
    },
    findTicketByNumber: async (n) => { const t = await tx.ticket.findUnique({ where: { ticketNumber: n } }); return t ? toTicket(t) : null; },
    getRaffle: async (lock = 'share') => {
      const id = await lockedRaffleId(tx, lock);
      return toRaffle((await tx.raffle.findUniqueOrThrow({ where: { id } })) as Row);
    },
    updateRaffle: async (patch) => {
      const id = await lockedRaffleId(tx, 'update');
      return toRaffle((await tx.raffle.update({ where: { id }, data: patch as Prisma.RaffleUpdateInput })) as Row);
    },
  };
}

export class PrismaStore implements Store {
  constructor(private prisma: PrismaClient) {}
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(makeTx(tx)), { maxWait: 5000, timeout: 20000 });
  }
}
