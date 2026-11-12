import { ValidationError } from './register';

/* ---------- CSV-экспорт ---------- */
export interface TicketExportRow { ticketNumber: string; status: string; userName: string; telegramId: string | number | bigint; phone?: string | null; receiptNumber: string; }

/** Защита от CSV/Excel-инъекций: ячейки, начинающиеся с = + - @, получают префикс ', чтобы Excel не выполнял формулу. */
export function sanitizeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
/** Телефон при выгрузке пишется без «+», иначе защита от формул добавила бы апостроф ко всем номерам. */
export function csvCell(v: unknown): string {
  const s = sanitizeCell(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function ticketsToCsv(rows: TicketExportRow[]): string {
  const head = ['Номер билета', 'Статус', 'Участник', 'Telegram ID', 'Телефон', 'Чек'];
  const lines = rows.map((r) => [r.ticketNumber, r.status, r.userName, r.telegramId, (r.phone ?? '').replace(/^\+/, ''), r.receiptNumber].map(csvCell).join(';'));
  return '\uFEFF' + [head.join(';'), ...lines].join('\r\n');
}

/* ---------- Напоминания ---------- */
export type ReminderKind = 'D3' | 'D1' | 'D0';
const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Какое напоминание пора слать сейчас (за 3 дня, за 1 день, в день финала) в часовом поясе акции. Дедупликация: ReminderLog (raffleId, kind) unique. */
export function reminderDue(now: Date, end: Date, tz: string): ReminderKind | null {
  const diff = Math.round((Date.parse(dayKey(end, tz)) - Date.parse(dayKey(now, tz))) / 864e5);
  return diff === 3 ? 'D3' : diff === 1 ? 'D1' : diff === 0 ? 'D0' : null;
}

/* ---------- Антифрод ---------- */
/** Пользователи с большим числом отклонённых заявок за период: подсвечиваются в админке. */
export function flagRiskyUsers(
  claims: { userId: number; status: string; createdAt?: Date }[],
  opts: { now?: Date; windowDays?: number; minRejected?: number } = {},
): number[] {
  const now = (opts.now ?? new Date()).getTime();
  const from = now - (opts.windowDays ?? 30) * 864e5;
  const counts = new Map<number, number>();
  for (const c of claims) {
    if (c.status !== 'REJECTED') continue;
    if (c.createdAt && c.createdAt.getTime() < from) continue;
    counts.set(c.userId, (counts.get(c.userId) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= (opts.minRejected ?? 3)).map(([id]) => id);
}

/* ---------- Часовые пояса ---------- */
function tzOffsetMs(at: Date, tz: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(at.getTime() / 1000) * 1000;
}
/** 'YYYY-MM-DD' в часовом поясе акции → момент времени (по умолчанию полдень: у чека известна только дата). */
export function zonedDate(dateStr: string, tz: string, hour = 12): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new ValidationError('Некорректная дата');
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], hour);
  if (new Date(guess).getUTCDate() !== +m[3]) throw new ValidationError('Некорректная дата');
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}
export function localHour(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit' }).format(now));
}
export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
