import { after } from 'next/server';

/** Выполнить после ответа клиенту (уведомления). Вне запроса Next (тесты, скрипты) запускает сразу в фоне. */
export function defer(fn: () => Promise<unknown>): void {
  const run = () => fn().catch((e) => console.error('[defer]', e));
  try { after(run); } catch { void run(); }
}
