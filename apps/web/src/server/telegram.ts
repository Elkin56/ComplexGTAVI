import { db } from './db';
import { env } from './env';

export class TelegramError extends Error {
  constructor(public method: string, public code: number, message: string) { super(`${method}: ${message}`); }
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env().BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; error_code?: number; description?: string };
  if (!data.ok) throw new TelegramError(method, data.error_code ?? 0, data.description ?? 'unknown error');
  return data.result as T;
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const openAppButton = () => ({ inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: env().APP_URL } }]] });

export type SendResult = 'sent' | 'skipped' | 'blocked' | 'failed';

/**
 * Сообщение пользователю по внутреннему id.
 * kind=transactional (билеты, отказы) шлётся всегда, marketing (напоминания, рассылки) только тем, кто не отключил уведомления.
 */
export async function sendToUser(userId: number, html: string, kind: 'transactional' | 'marketing' = 'transactional', withButton = true): Promise<SendResult> {
  const u = await db().user.findUnique({ where: { id: userId }, select: { telegramId: true, notifyEnabled: true, botBlocked: true } });
  if (!u || u.botBlocked || (kind === 'marketing' && !u.notifyEnabled)) return 'skipped';
  try {
    await tg('sendMessage', { chat_id: Number(u.telegramId), text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(withButton ? { reply_markup: openAppButton() } : {}) });
    return 'sent';
  } catch (e) {
    if (e instanceof TelegramError && (e.code === 403 || /blocked|deactivated|chat not found/i.test(e.message))) {
      await db().user.update({ where: { id: userId }, data: { botBlocked: true } }).catch(() => undefined);
      return 'blocked';
    }
    console.error('[telegram] send failed', e);
    return 'failed';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Рассылка с ограничением ~20 сообщений/с (лимит Telegram около 30/с). */
export async function broadcast(userIds: number[], html: string, kind: 'transactional' | 'marketing' = 'marketing'): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (const id of userIds) {
    const r = await sendToUser(id, html, kind);
    if (r === 'sent') sent++; else if (r === 'failed') failed++;
    await sleep(50);
  }
  return { sent, failed };
}
