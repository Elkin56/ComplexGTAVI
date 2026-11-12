import { createHmac, timingSafeEqual } from 'node:crypto';

export class AuthError extends Error {}
export interface TelegramUser { id: number; first_name: string; last_name?: string; username?: string; language_code?: string; }

/**
 * Официальный алгоритм проверки Telegram Mini App initData:
 * secret = HMAC_SHA256(key="WebAppData", msg=botToken); hash = HMAC_SHA256(key=secret, msg=data_check_string).
 * initDataUnsafe на клиенте доказательством личности не является: проверяем только эту строку на сервере.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  opts: { now?: Date; maxAgeSec?: number } = {},
): { user: TelegramUser; authDate: Date } {
  if (!initData || !botToken) throw new AuthError('Нет данных авторизации');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) throw new AuthError('Некорректная подпись');
  params.delete('hash');

  const dataCheckString = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new AuthError('Подпись не совпадает');

  const authTs = Number(params.get('auth_date'));
  if (!Number.isFinite(authTs) || authTs <= 0) throw new AuthError('Нет даты авторизации');
  const nowMs = (opts.now ?? new Date()).getTime();
  if (nowMs - authTs * 1000 > (opts.maxAgeSec ?? 86400) * 1000) throw new AuthError('Сессия устарела, откройте приложение заново');
  if (authTs * 1000 - nowMs > 5 * 60 * 1000) throw new AuthError('Дата авторизации из будущего');

  let user: TelegramUser;
  try { user = JSON.parse(params.get('user') ?? ''); } catch { throw new AuthError('Нет данных пользователя'); }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string') throw new AuthError('Некорректный пользователь');
  return { user, authDate: new Date(authTs * 1000) };
}

/** Проверка secret_token вебхука Telegram (заголовок X-Telegram-Bot-Api-Secret-Token) без утечки по времени. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Короткоживущая подписанная ссылка (например, на скачивание экспорта): payload + exp, HMAC-SHA256. */
export function signToken(payload: Record<string, unknown>, secret: string, ttlSec: number, now = new Date()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now.getTime() / 1000) + ttlSec })).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifyToken<T extends Record<string, unknown>>(token: string, secret: string, now = new Date()): T {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) throw new AuthError('Некорректная ссылка');
  if (!safeEqual(sig, createHmac('sha256', secret).update(body).digest('base64url'))) throw new AuthError('Некорректная ссылка');
  let data: T & { exp?: number };
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { throw new AuthError('Некорректная ссылка'); }
  if (typeof data.exp !== 'number' || data.exp * 1000 < now.getTime()) throw new AuthError('Ссылка устарела');
  return data;
}
