import { broadcast, esc, sendToUser } from './telegram';
import { db } from './db';

const plural = (n: number) => { const m = n % 10, h = n % 100; return `${n} ${m === 1 && h !== 11 ? 'билет' : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? 'билета' : 'билетов'}`; };

export const notifyAwarded = (userId: number, receipt: string, tickets: string[]) =>
  sendToUser(userId, tickets.length
    ? `✅ Чек <b>${esc(receipt)}</b> подтверждён.\nНачислено: <b>${plural(tickets.length)}</b>\n${tickets.map((t) => `<code>${t}</code>`).join(', ')}\nУдачи в розыгрыше!`
    : `Чек <b>${esc(receipt)}</b> принят, но по условиям акции билет не положен (сумма меньше 5 000 ₽ и это не ПК).`);

export const notifyRejected = (userId: number, receipt: string, reason: string) =>
  sendToUser(userId, `❌ Чек <b>${esc(receipt)}</b> не принят.\nПричина: ${esc(reason)}\nМожно отправить исправленный чек в приложении.`);

export const notifyCancelled = (userId: number, receipt: string, tickets: string[], reason: string) =>
  sendToUser(userId, `⚠️ Покупка по чеку <b>${esc(receipt)}</b> отменена.${tickets.length ? `\nБилеты аннулированы: ${tickets.map((t) => `<code>${t}</code>`).join(', ')}` : ''}\nПричина: ${esc(reason)}`);

export const notifyWinner = (userId: number, ticket: string) =>
  sendToUser(userId, `🏆 Поздравляем! На лототроне выпал ваш билет <code>${ticket}</code>.\nМы свяжемся с вами для вручения приза: PlayStation 5 и GTA 6.`);

/** Рассылка участникам (у кого есть действительные билеты) о завершении розыгрыша, кроме победителя. */
export async function notifyRaffleFinished(winnerUserId: number, ticket: string) {
  const rows = await db().ticket.findMany({ where: { status: 'ACTIVE', userId: { not: winnerUserId } }, distinct: ['userId'], select: { userId: true } });
  return broadcast(rows.map((r) => r.userId), `🏁 Розыгрыш завершён. Выпал билет <code>${ticket}</code>. Спасибо за участие!`, 'transactional');
}

export const reminderText = (kind: 'D3' | 'D1' | 'D0', endLabel: string) =>
  kind === 'D3' ? `⏳ До финала розыгрыша PS5 + GTA 6 осталось 3 дня (${endLabel}). Успейте добавить чеки.`
  : kind === 'D1' ? `⏳ Финал розыгрыша уже завтра (${endLabel}). Последний шанс добавить чеки.`
  : `🎰 Финал розыгрыша сегодня (${endLabel}). Следите за прямым эфиром!`;
