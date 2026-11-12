/**
 * Регистрирует вебхук, кнопку меню и команды бота. Запускать после деплоя и при смене APP_URL:
 *   npm run bot:setup -w @complex/web
 */
import 'dotenv/config';

const { BOT_TOKEN, APP_URL, WEBHOOK_SECRET } = process.env;
if (!BOT_TOKEN || !APP_URL || !WEBHOOK_SECRET) { console.error('Нужны BOT_TOKEN, APP_URL и WEBHOOK_SECRET в .env'); process.exit(1); }
if (!APP_URL.startsWith('https://')) { console.error('Telegram принимает только HTTPS-адрес. Сейчас APP_URL =', APP_URL); process.exit(1); }

async function tg(method: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

(async () => {
  const me = (await tg('getMe')) as { username: string };
  await tg('setWebhook', { url: `${APP_URL}/api/telegram/webhook`, secret_token: WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: true });
  await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: APP_URL } } });
  await tg('setMyCommands', { commands: [{ command: 'start', description: 'Открыть розыгрыш' }] });
  console.log(`Готово: бот @${me.username}`);
  console.log('Вебхук:', JSON.stringify(await tg('getWebhookInfo')));
  console.log(`Ссылка на бота для NEXT_PUBLIC_BOT_URL: https://t.me/${me.username}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
