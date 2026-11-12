'use client';
import { useCallback, useEffect, useState } from 'react';

export interface TgWebApp {
  initData: string;
  ready(): void; expand(): void; openLink(url: string): void;
  requestContact(cb: (shared: boolean) => void): void;
  setHeaderColor?(c: string): void; setBackgroundColor?(c: string): void;
  disableVerticalSwipes?(): void;
}
declare global { interface Window { Telegram?: { WebApp: TgWebApp } } }

export const tgApp = (): TgWebApp | null => (typeof window !== 'undefined' ? window.Telegram?.WebApp ?? null : null);

/** Строка initData для сервера. Сервер сам проверяет подпись; initDataUnsafe не используется. */
export function authHeader(): string | null {
  const init = tgApp()?.initData;
  if (init) return 'tma ' + init;
  const dev = process.env.NEXT_PUBLIC_DEV_USER_ID;
  return dev ? 'dev ' + dev : null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const a = authHeader();
  if (a) headers.set('authorization', a);
  if (typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let res: Response;
  try { res = await fetch(path, { ...init, headers, cache: 'no-store' }); }
  catch { throw new ApiError(0, 'Нет связи с сервером'); }
  if (!res.ok) {
    const j = await res.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(res.status, j?.error ?? `Ошибка ${res.status}`);
  }
  return res;
}
export const api = async <T = unknown>(path: string, init?: RequestInit): Promise<T> => (await call(path, init)).json() as Promise<T>;
export const apiBlob = async (path: string): Promise<Blob> => (await call(path)).blob();
export const post = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try { setData(await api<T>(path)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load };
}

export interface Me {
  user: { id: number; telegramId: string; firstName: string; lastName: string | null; username: string | null; phone: string | null; createdAt: string; notifyEnabled: boolean; consented: boolean };
  raffle: { title: string; startDate: string; endDate: string; timezone: string; status: 'DRAFT' | 'ACTIVE' | 'REGISTRATION_CLOSED' | 'FINISHED'; streamUrl: string | null; winner: { ticketNumber: string; name: string } | null };
  ticketsActive: number;
  role: 'OWNER' | 'MANAGER' | 'STAFF' | null;
  rulesVersion: string;
}

export const money = (n: number) => `${Number(n).toLocaleString('ru-RU')} ₽`;
export const plural = (n: number) => { const m = n % 10, h = n % 100; return `${n} ${m === 1 && h !== 11 ? 'билет' : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? 'билета' : 'билетов'}`; };
export const fmtDate = (iso: string, tz = 'Europe/Moscow') => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
export const fmtDateTime = (iso: string) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtLong = (iso: string, tz: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: 'numeric', month: 'long' }).format(new Date(iso));
export const todayIso = () => new Intl.DateTimeFormat('en-CA').format(new Date());
