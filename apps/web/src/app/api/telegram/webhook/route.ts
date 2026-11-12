import { normalizePhone, safeEqual } from '@complex/core';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { json, open } from '@/server/http';
import { esc, openAppButton, tg } from '@/server/telegram';

interface Update {
  message?: {
    text?: string;
    from?: { id: number; first_name: string; last_name?: string; username?: string; is_bot?: boolean };
    chat?: { id: number; type: string };
    contact?: { phone_number: string; user_id?: number };
  };
}

const say = (chatId: number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra }).catch((e) => console.error('[webhook] send', e));

/** Вебхук бота. Подлинность запроса подтверждает secret_token, заданный при setWebhook. Всегда отвечаем 200, чтобы Telegram не повторял. */
export const POST = open(async (req) => {
  if (!safeEqual(req.headers.get('x-telegram-bot-api-secret-token') ?? '', env().WEBHOOK_SECRET)) return json({ error: 'forbidden' }, 401);
  const m = ((await req.json()) as Update).message;
  if (!m?.from || m.from.is_bot || m.chat?.type !== 'private') return json({ ok: true });
  const chatId = m.chat.id;

  if (m.contact) {
    // принимаем только собственный контакт пользователя
    if (m.contact.user_id !== m.from.id) { await say(chatId, 'Нужно поделиться своим контактом.'); return json({ ok: true }); }
    const phone = normalizePhone(m.contact.phone_number);
    if (!phone) { await say(chatId, 'Не удалось распознать номер телефона.'); return json({ ok: true }); }
    try {
      await db().user.upsert({
        where: { telegramId: BigInt(m.from.id) }, update: { phone },
        create: { telegramId: BigInt(m.from.id), firstName: m.from.first_name, lastName: m.from.last_name ?? null, username: m.from.username ?? null, phone },
      });
      await say(chatId, 'Телефон сохранён. Вернитесь в приложение.', { reply_markup: { remove_keyboard: true } });
    } catch {
      await say(chatId, 'Этот номер уже привязан к другому участнику. Обратитесь к организаторам.', { reply_markup: { remove_keyboard: true } });
    }
    return json({ ok: true });
  }

  if (m.text && /^\/(start|help)(@\w+)?(\s|$)/.test(m.text)) {
    await say(chatId, `Привет, ${esc(m.from.first_name)}! Это розыгрыш <b>PS5 + GTA 6</b> от COMPLEX PC.\nДобавляйте чеки, получайте билеты и следите за финалом в приложении.`, { reply_markup: openAppButton() });
  }
  return json({ ok: true });
});
