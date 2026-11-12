import ExcelJS from 'exceljs';
import { csvCell, sanitizeCell, ticketsToCsv } from '@complex/core';
import { db } from './db';

export type ExportKind = 'tickets' | 'participants';
export type ExportFormat = 'csv' | 'xlsx';

async function tableFor(kind: ExportKind): Promise<{ head: string[]; rows: (string | number)[][] }> {
  const prisma = db();
  if (kind === 'tickets') {
    const tickets = await prisma.ticket.findMany({ orderBy: { ticketSeq: 'asc' }, include: { user: true, purchase: { select: { receiptNumber: true } } } });
    return {
      head: ['Номер билета', 'Статус', 'Участник', 'Telegram ID', 'Телефон', 'Чек'],
      rows: tickets.map((t) => [t.ticketNumber, t.status, [t.user.firstName, t.user.lastName].filter(Boolean).join(' '), t.user.telegramId.toString(), (t.user.phone ?? '').replace(/^\+/, ''), t.purchase.receiptNumber]),
    };
  }
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { tickets: { where: { status: 'ACTIVE' } } } } } });
  return {
    head: ['Участник', 'Telegram ID', 'Username', 'Телефон', 'Активных билетов', 'Дата регистрации'],
    rows: users.map((u) => [[u.firstName, u.lastName].filter(Boolean).join(' '), u.telegramId.toString(), u.username ? '@' + u.username : '', (u.phone ?? '').replace(/^\+/, ''), u._count.tickets, u.createdAt.toISOString()]),
  };
}

export async function buildExport(kind: ExportKind, format: ExportFormat): Promise<{ filename: string; contentType: string; body: string | Uint8Array }> {
  const { head, rows } = await tableFor(kind);
  const base = `${kind}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    const body = kind === 'tickets'
      ? ticketsToCsv(rows.map((r) => ({ ticketNumber: String(r[0]), status: String(r[1]), userName: String(r[2]), telegramId: String(r[3]), phone: String(r[4]), receiptNumber: String(r[5]) })))
      : '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
    return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body };
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(kind === 'tickets' ? 'Билеты' : 'Участники');
  ws.addRow(head).font = { bold: true };
  for (const r of rows) ws.addRow(r.map((c) => (typeof c === 'string' ? sanitizeCell(c) : c)));
  ws.columns.forEach((c) => { c.width = 22; });
  const buf = await wb.xlsx.writeBuffer();
  return { filename: `${base}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: new Uint8Array(buf as ArrayBuffer) };
}
