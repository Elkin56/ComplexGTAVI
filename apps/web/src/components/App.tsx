'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, api, authHeader, post, tgApp, type Me } from '@/lib/client';
import { RULES_ITEMS } from '@/lib/rules';
import { Icon } from './Icons';

interface AppCtx { me: Me; reload: () => Promise<void>; toast: (msg: string, bad?: boolean) => void }
const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('useApp вне провайдера'); return c; };

type State =
  | { k: 'loading' }
  | { k: 'no-telegram' }
  | { k: 'down'; title: string; detail: string }
  | { k: 'ready'; me: Me };

export function RulesText() {
  return (
    <>
      <span className="draft">Черновик: проверьте у юриста</span>
      <ol className="rl">{RULES_ITEMS.map((r) => <li key={r.title}><b>{r.title}:</b> {r.text}</li>)}</ol>
    </>
  );
}

function Status({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return (
    <div className="app" style={{ display: 'grid', alignContent: 'center', textAlign: 'center' }}>
      <img src="/logo.png" alt="COMPLEX PC" width={96} height={96} style={{ margin: '0 auto 16px' }} />
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>{title}</h1>
      <p className="mut" style={{ margin: '10px 0 0' }}>{detail}</p>
      {retry && <button className="btn" onClick={retry}>Повторить</button>}
    </div>
  );
}

/** Состояние подключения: не в Telegram, нет сервера/базы/настроек, нет согласия. Вместо пустого экрана показываем причину. */
async function diagnose(): Promise<{ title: string; detail: string }> {
  try {
    const h = await fetch('/api/health', { cache: 'no-store' });
    const j = (await h.json()) as { db: string; config: string; bot: string };
    if (j.config !== 'ok' || j.bot !== 'configured') return { title: 'Сервер не настроен', detail: 'Не заданы переменные окружения (BOT_TOKEN, WEBHOOK_SECRET, APP_URL, CRON_SECRET). Обратитесь к администратору.' };
    if (j.db !== 'ok') return { title: 'База данных недоступна', detail: 'Не удаётся подключиться к PostgreSQL. Попробуйте позже.' };
  } catch { /* ниже */ }
  return { title: 'Нет связи с сервером', detail: 'Проверьте подключение к интернету и повторите.' };
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ k: 'loading' });
  const [toastMsg, setToastMsg] = useState<{ msg: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string, bad = false) => {
    setToastMsg({ msg, bad });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const load = useCallback(async () => {
    const tg = tgApp();
    if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor?.('#050705'); tg.setBackgroundColor?.('#050705'); tg.disableVerticalSwipes?.(); } catch { /* старые клиенты */ } }
    if (!authHeader()) { setState({ k: 'no-telegram' }); return; }
    try {
      setState({ k: 'ready', me: await api<Me>('/api/me') });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState({ k: 'down', title: 'Сессия устарела', detail: 'Закройте приложение и откройте его снова из чата с ботом.' });
      else if (e instanceof ApiError && e.status !== 0 && e.status !== 503 && e.status < 500) setState({ k: 'down', title: 'Ошибка', detail: e.message });
      else setState({ k: 'down', ...(await diagnose()) });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (state.k === 'loading') return <Status title="Загрузка…" detail="" />;
  if (state.k === 'no-telegram') return <Status title="Откройте через Telegram" detail="Это приложение работает только внутри Telegram. Откройте бота и нажмите «Открыть приложение»." />;
  if (state.k === 'down') return <Status title={state.title} detail={state.detail} retry={() => { setState({ k: 'loading' }); void load(); }} />;

  const me = state.me;
  const ctx: AppCtx = { me, reload: load, toast };
  return (
    <Ctx.Provider value={ctx}>
      {!me.user.consented ? <Consent me={me} onDone={load} /> : children}
      {toastMsg && <div className={`toast ${toastMsg.bad ? 'bad' : ''}`} role="status">{toastMsg.msg}</div>}
    </Ctx.Provider>
  );
}

function Consent({ me, onDone }: { me: Me; onDone: () => Promise<void> }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await post('/api/consent', { version: me.rulesVersion }); await onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); setBusy(false); }
  };
  return (
    <div className="ovl"><div style={{ maxWidth: 430, margin: '0 auto' }}>
      <h1 style={{ font: '900 24px var(--font-sans)', fontStyle: 'italic', margin: '0 0 8px' }}>Розыгрыш PS5 + GTA 6</h1>
      <p className="mut" style={{ margin: '0 0 14px' }}>Перед участием ознакомьтесь с правилами и дайте согласие на обработку персональных данных.</p>
      <div className="glass" style={{ marginTop: 0 }}><RulesText /></div>
      <label className="glass row" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ width: 22, height: 22, accentColor: '#A5FF35', flex: 'none' }} />
        <span>Я принимаю правила акции и согласен на обработку персональных данных</span>
      </label>
      {err && <p style={{ color: 'var(--color-err)' }}>{err}</p>}
      <button className="btn btn-f" disabled={!ok || busy} onClick={go}>Продолжить</button>
    </div></div>
  );
}

const TABS = [
  { href: '/', label: 'Главная', icon: 'home' },
  { href: '/tickets', label: 'Мои билеты', icon: 'tick' },
  { href: '/rules', label: 'Правила', icon: 'doc' },
  { href: '/profile', label: 'Профиль', icon: 'user' },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const tab = path === '/' ? '/' : path.startsWith('/tickets') || path.startsWith('/history') || path.startsWith('/claim') ? '/tickets' : path.startsWith('/rules') ? '/rules' : '/profile';
  return (
    <>
      <main className="app">{children}</main>
      <nav className="nav" aria-label="Основная навигация"><div>
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={tab === t.href ? 'on' : ''}><Icon n={t.icon} />{t.label}</Link>
        ))}
      </div></nav>
    </>
  );
}

export function BackBar({ title, icon }: { title: string; icon?: React.ComponentProps<typeof Icon>['n'] }) {
  return (
    <div className="bar">
      <button onClick={() => history.back()} aria-label="Назад"><Icon n="back" /></button>
      {icon && <Icon n={icon} className="text-acc" />}{title}
    </div>
  );
}
