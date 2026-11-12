'use client';
import { useEffect, useState } from 'react';
import { calculateTickets, type Category } from '@complex/core/src/rules';
import { can, type Permission } from '@complex/core/src/rbac';
import { ApiError, api, apiBlob, fmtDate, fmtDateTime, money, plural, post, tgApp, todayIso, useApi } from '@/lib/client';
import { CATEGORY_LABEL } from '@/lib/rules';
import { useApp } from './App';
import { Icon } from './Icons';

type View = 'home' | 'claims' | 'people' | 'purchases' | 'manual' | 'stats' | 'audit' | 'export' | 'draw' | 'settings' | 'admins';
const TILES: { v: View; label: string; icon: React.ComponentProps<typeof Icon>['n']; perm: Permission }[] = [
  { v: 'claims', label: 'Заявки', icon: 'check', perm: 'claims.review' },
  { v: 'people', label: 'Участники', icon: 'users', perm: 'participants.view' },
  { v: 'purchases', label: 'Покупки', icon: 'cart', perm: 'stats.view' },
  { v: 'manual', label: 'Выдать вручную', icon: 'tick', perm: 'purchases.register' },
  { v: 'stats', label: 'Статистика', icon: 'chart', perm: 'stats.view' },
  { v: 'audit', label: 'Журнал', icon: 'list', perm: 'audit.view' },
  { v: 'export', label: 'Экспорт', icon: 'doc', perm: 'export' },
  { v: 'draw', label: 'Розыгрыш', icon: 'cup', perm: 'raffle.winner' },
  { v: 'settings', label: 'Настройки акции', icon: 'cog', perm: 'raffle.manage' },
  { v: 'admins', label: 'Сотрудники', icon: 'shield', perm: 'admins.manage' },
];
const REJECT_REASONS = ['Чек не найден в кассе', 'Сумма не совпадает с чеком', 'Нечитаемое фото', 'Чек вне сроков акции'];
const CANCEL_REASONS = ['Возврат товара', 'Ошибка кассира', 'Мошенничество'];
const ACTIONS: Record<string, string> = {
  PURCHASE_REGISTERED: 'Зарегистрирована покупка', CLAIM_APPROVED: 'Заявка подтверждена', CLAIM_AUTO_APPROVED: 'Заявка подтверждена автоматически (касса)',
  CLAIM_REJECTED: 'Заявка отклонена', CLAIM_REJECTED_DUPLICATE: 'Заявка отклонена: дубль чека', PURCHASE_CANCELLED: 'Покупка отменена',
  REGISTRATION_CLOSED: 'Приём чеков закрыт', WINNER_FIXED: 'Зафиксирован победитель', RAFFLE_STARTED: 'Акция запущена',
  RAFFLE_SETTINGS_UPDATED: 'Изменены настройки акции', EXPORT_DOWNLOADED: 'Выгрузка данных', ADMIN_ROLE_SET: 'Назначена роль сотрудника', ADMIN_REMOVED: 'Сотрудник удалён',
};
const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка');

function Back({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className="bar"><button onClick={onBack} aria-label="Назад"><Icon n="back" /></button>{title}</div>;
}
function Load({ loading, error }: { loading: boolean; error: string | null }) {
  return <>{loading && <p className="mut">Загрузка…</p>}{error && <p style={{ color: 'var(--color-err)' }}>{error}</p>}</>;
}
/** Опасное действие требует второго нажатия. */
function Confirm({ label, armedLabel, onGo, cls = 'btn', disabled }: { label: string; armedLabel: string; onGo: () => void; cls?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return <button className={cls} disabled={disabled} onClick={() => { if (armed) { setArmed(false); onGo(); } else setArmed(true); }}>{armed ? armedLabel : label}</button>;
}

export default function AdminApp() {
  const { me } = useApp();
  const [view, setView] = useState<View>('home');
  const role = me.role;
  if (!role) return <div className="glass">Нет доступа.</div>;
  const back = () => setView('home');
  if (view === 'home') {
    return (
      <>
        <div className="bar"><Icon n="shield" className="text-acc" />Админ-панель <span className="chip chip-ok" style={{ marginLeft: 'auto' }}>{role}</span></div>
        <div className="grid2" style={{ marginTop: 0 }}>
          {TILES.filter((t) => can(role, t.perm)).map((t) => <button key={t.v} className="tile" onClick={() => setView(t.v)}><Icon n={t.icon} />{t.label}</button>)}
        </div>
      </>
    );
  }
  const V = { claims: Claims, people: People, purchases: Purchases, manual: Manual, stats: Stats, audit: Audit, export: Export, draw: Draw, settings: Settings, admins: Admins }[view];
  return <><Back title={TILES.find((t) => t.v === view)?.label ?? ''} onBack={back} /><V /></>;
}

/* ---------- Заявки ---------- */
interface Claim { id: number; receiptNumber: string; amount: number; category: Category; purchasedAt: string; verifyNote: string | null; hasPhoto: boolean; risky: boolean; user: { firstName: string; lastName: string | null; username: string | null; telegramId: string; phone: string | null } }

function PhotoButton({ id }: { id: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const { toast } = useApp();
  const open = async () => { try { setUrl(URL.createObjectURL(await apiBlob(`/api/admin/claims/${id}/photo`))); } catch (e) { toast(errMsg(e), true); } };
  const close = () => { if (url) URL.revokeObjectURL(url); setUrl(null); };
  return (
    <>
      <button className="btn" style={{ marginTop: 0 }} onClick={open}>Открыть фото чека</button>
      {url && <div className="ovl" onClick={close}><img src={url} alt="Фото чека" style={{ maxWidth: '100%', margin: '0 auto', display: 'block', borderRadius: 12 }} /><button className="btn" onClick={close}>Закрыть</button></div>}
    </>
  );
}

function ClaimCard({ c, done }: { c: Claim; done: () => void }) {
  const { toast } = useApp();
  const [amount, setAmount] = useState(String(c.amount));
  const [cat, setCat] = useState<Category>(c.category);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const run = async (kind: 'approve' | 'reject') => {
    setBusy(true);
    try {
      const r = await post<{ status: string; tickets?: string[] }>(
        `/api/admin/claims/${c.id}/${kind}`,
        kind === 'approve' ? { amount: Number(amount), category: cat } : { reason },
      );
      const bad = r.status === 'already_reviewed' || r.status === 'duplicate_receipt';
      toast(r.status === 'approved' ? `Подтверждено: ${plural(r.tickets?.length ?? 0)}` : r.status === 'rejected' ? 'Отклонено. Участник уведомлён' : r.status === 'already_reviewed' ? 'Заявка уже обработана' : 'Чек уже зарегистрирован, заявка отклонена', bad);
      done();
    } catch (e) { toast(errMsg(e), true); setBusy(false); }
  };
  const name = [c.user.firstName, c.user.lastName].filter(Boolean).join(' ');
  return (
    <div className="glass" style={{ marginTop: 0, marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><b>{name}</b>{c.risky && <span className="chip chip-v">Много отказов</span>}</div>
      <div className="mut" style={{ fontSize: 13, margin: '4px 0 8px' }}>{c.user.username ? `@${c.user.username} · ` : ''}ID {c.user.telegramId}{c.user.phone ? ` · ${c.user.phone}` : ''}</div>
      <div className="mut" style={{ fontSize: 13 }}>чек {c.receiptNumber} · {fmtDate(c.purchasedAt)} · заявлено {money(c.amount)} ({CATEGORY_LABEL[c.category]})</div>
      {c.verifyNote && <div className="chip chip-p" style={{ margin: '10px 0 0', whiteSpace: 'normal' }}>{c.verifyNote}</div>}
      <div style={{ marginTop: 12 }}>{c.hasPhoto ? <PhotoButton id={c.id} /> : <span className="mut" style={{ fontSize: 12 }}>Фото не приложено</span>}</div>
      <label className="lbl">Сумма по чеку, ₽ (можно исправить)</label>
      <input className="inp" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label className="lbl">Категория</label>
      <select className="inp" value={cat} onChange={(e) => setCat(e.target.value as Category)}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}><span className="mut">Будет выдано</span><b className="g" style={{ textShadow: 'none' }}>{plural(calculateTickets(Number(amount), cat))}</b></div>
      <label className="lbl">Причина отказа</label>
      <select className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>{REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
      <div className="row" style={{ gap: 10 }}>
        <Confirm cls="btn btn-d" label="Отклонить" armedLabel="Точно отклонить?" onGo={() => void run('reject')} disabled={busy} />
        <button className="btn btn-f" disabled={busy} onClick={() => void run('approve')}>Подтвердить</button>
      </div>
    </div>
  );
}

function Claims() {
  const { data, error, loading, reload } = useApi<{ claims: Claim[] }>('/api/admin/claims');
  return (<><Load loading={loading} error={error} />{data?.claims.map((c) => <ClaimCard key={c.id} c={c} done={() => void reload()} />)}{data && data.claims.length === 0 && <div className="glass" style={{ marginTop: 0 }}>Новых заявок нет</div>}</>);
}

/* ---------- Участники ---------- */
function People() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading } = useApi<{ participants: { id: number; telegramId: string; name: string; username: string | null; phone: string | null; activeTickets: number; rejectedClaims: number }[] }>(`/api/admin/participants?q=${encodeURIComponent(dq)}`);
  return (
    <>
      <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, Telegram ID, телефон или номер билета" />
      <Load loading={loading} error={error} />
      <div className="glass" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {data?.participants.map((p) => (
          <div className="item" key={p.id}>
            <Icon n="user" className="text-acc" />
            <div><b>{p.name}{p.username ? ` @${p.username}` : ''} {p.rejectedClaims >= 3 && <span className="chip chip-v">Много отказов</span>}</b><span className="sub">ID {p.telegramId}{p.phone ? ` · ${p.phone}` : ''}</span></div>
            <b style={{ fontSize: 14 }}>{plural(p.activeTickets)}</b>
          </div>
        ))}
        {data && data.participants.length === 0 && <div className="item mut">Никого не найдено</div>}
      </div>
    </>
  );
}

/* ---------- Покупки ---------- */
interface Purchase { id: number; receiptNumber: string; amount: number; category: string; ticketsAwarded: number; purchasedAt: string; status: 'ACTIVE' | 'CANCELLED'; cancelReason: string | null; userName: string; telegramId: string }

function PurchaseRow({ p, canCancel, done }: { p: Purchase; canCancel: boolean; done: () => void }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const cancel = async () => {
    try { await post(`/api/admin/purchases/${p.id}/cancel`, { reason }); toast('Покупка отменена, билеты аннулированы'); done(); }
    catch (e) { toast(errMsg(e), true); }
  };
  return (
    <div className="glass" style={{ marginTop: 0, marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><b>{p.userName} · {money(p.amount)}</b>{p.status === 'CANCELLED' ? <span className="chip chip-v">Отменена</span> : <span className="chip chip-ok">{plural(p.ticketsAwarded)}</span>}</div>
      <div className="mut" style={{ fontSize: 13, marginTop: 4 }}>чек {p.receiptNumber} · {CATEGORY_LABEL[p.category]} · {fmtDate(p.purchasedAt)}{p.cancelReason ? ` · ${p.cancelReason}` : ''}</div>
      {canCancel && p.status === 'ACTIVE' && (open ? (
        <>
          <select className="inp" style={{ marginTop: 12 }} value={reason} onChange={(e) => setReason(e.target.value)}>{CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <Confirm cls="btn btn-d" label="Отменить покупку" armedLabel="Нажмите ещё раз для отмены" onGo={() => void cancel()} />
        </>
      ) : <button className="btn" onClick={() => setOpen(true)}>Отменить…</button>)}
    </div>
  );
}

function Purchases() {
  const { me } = useApp();
  const { data, error, loading, reload } = useApi<{ purchases: Purchase[] }>('/api/admin/purchases');
  return (<><Load loading={loading} error={error} />{data?.purchases.map((p) => <PurchaseRow key={p.id} p={p} canCancel={can(me.role, 'purchases.cancel')} done={() => void reload()} />)}</>);
}

/* ---------- Ручная выдача ---------- */
function Manual() {
  const { toast } = useApp();
  const [f, setF] = useState({ identifier: '', receiptNumber: '', amount: '', category: 'OTHER' as Category, purchaseDate: todayIso() });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await post<{ tickets: string[]; participant: string }>('/api/admin/purchases', { ...f, amount: Number(f.amount) });
      toast(`${r.participant}: начислено ${plural(r.tickets.length)}`);
      setF({ ...f, receiptNumber: '', amount: '' });
    } catch (e) { toast(errMsg(e), true); }
    setBusy(false);
  };
  return (
    <div className="glass" style={{ marginTop: 0 }}>
      <label className="lbl" style={{ marginTop: 0 }}>Участник: Telegram ID или телефон</label>
      <input className="inp" value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} inputMode="tel" autoComplete="off" />
      <label className="lbl">Номер чека</label>
      <input className="inp" value={f.receiptNumber} onChange={(e) => setF({ ...f, receiptNumber: e.target.value })} autoComplete="off" />
      <label className="lbl">Сумма, ₽</label>
      <input className="inp" type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      <label className="lbl">Категория</label>
      <select className="inp" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <label className="lbl">Дата покупки</label>
      <input className="inp" type="date" max={todayIso()} value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} />
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}><span className="mut">Будет выдано</span><b className="g" style={{ textShadow: 'none' }}>{plural(calculateTickets(Number(f.amount), f.category))}</b></div>
      <button className="btn btn-f" disabled={busy} onClick={() => void go()}>Зарегистрировать покупку</button>
    </div>
  );
}

/* ---------- Статистика, журнал ---------- */
function Stats() {
  const { data, error, loading } = useApi<{ participants: number; purchases: number; ticketsIssued: number; ticketsActive: number; claims: { pending: number; rejected: number; approved: number } }>('/api/admin/stats');
  const items: [string, number | undefined][] = [['Участников', data?.participants], ['Покупок', data?.purchases], ['Выдано билетов', data?.ticketsIssued], ['Активных билетов', data?.ticketsActive], ['На проверке', data?.claims.pending], ['Отклонено заявок', data?.claims.rejected]];
  return (<><Load loading={loading} error={error} /><div className="grid2" style={{ marginTop: 0 }}>{items.map(([l, v]) => <div key={l} className="tile"><span className="big">{v ?? '–'}</span>{l}</div>)}</div></>);
}

function Audit() {
  const { data, error, loading } = useApi<{ entries: { id: number; createdAt: string; action: string; details: Record<string, unknown>; actor: string }[] }>('/api/admin/audit');
  return (
    <>
      <Load loading={loading} error={error} />
      <div className="glass" style={{ marginTop: 0, paddingTop: 4, paddingBottom: 4 }}>
        {data?.entries.map((e) => (
          <div className="item" key={e.id}>
            <Icon n="doc" className="text-acc" />
            <div><b>{ACTIONS[e.action] ?? e.action}</b><span className="sub">{e.actor}</span><span className="sub" style={{ wordBreak: 'break-word' }}>{Object.entries(e.details).slice(0, 4).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ').slice(0, 160)}</span></div>
            <small className="mut">{fmtDateTime(e.createdAt)}</small>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Экспорт ---------- */
function Export() {
  const { toast } = useApp();
  const [kind, setKind] = useState('tickets');
  const [format, setFormat] = useState('xlsx');
  const go = async () => {
    try {
      const { url } = await post<{ url: string }>('/api/admin/export', { kind, format });
      const tg = tgApp();
      if (tg) tg.openLink(url); else window.open(url, '_blank', 'noopener');
      toast('Ссылка действует 5 минут');
    } catch (e) { toast(errMsg(e), true); }
  };
  return (
    <div className="glass" style={{ marginTop: 0 }}>
      <label className="lbl" style={{ marginTop: 0 }}>Что выгрузить</label>
      <select className="inp" value={kind} onChange={(e) => setKind(e.target.value)}><option value="tickets">Все билеты</option><option value="participants">Участники</option></select>
      <label className="lbl">Формат</label>
      <select className="inp" value={format} onChange={(e) => setFormat(e.target.value)}><option value="xlsx">XLSX (Excel)</option><option value="csv">CSV</option></select>
      <button className="btn btn-f" onClick={() => void go()}>Скачать</button>
      <p className="note">Файл откроется во внешнем браузере. Ячейки с «=», «+», «-», «@» в начале экранируются от формул Excel.</p>
    </div>
  );
}

/* ---------- Финал ---------- */
interface RaffleAdmin { title: string; status: 'DRAFT' | 'ACTIVE' | 'REGISTRATION_CLOSED' | 'FINISHED'; timezone: string; startDate: string; endDate: string; streamUrl: string | null; validTickets: number; pendingClaims: number; winnerFixedAt: string | null }
const STATUS_RU = { DRAFT: 'не запущена', ACTIVE: 'идёт, чеки принимаются', REGISTRATION_CLOSED: 'приём закрыт, ждём финала', FINISHED: 'завершена' } as const;

function Draw() {
  const { me, toast } = useApp();
  const { data, error, loading, reload } = useApi<RaffleAdmin>('/api/admin/raffle');
  const [ball, setBall] = useState('');
  const [owner, setOwner] = useState<{ ticketNumber: string; status: string; owner: string; username: string | null; receiptNumber: string } | null>(null);
  const [lookupErr, setLookupErr] = useState('');
  const [list, setList] = useState<string | null>(null);

  const close = async () => {
    try {
      const r = await post<{ status: string; pending?: number }>('/api/admin/raffle/close');
      toast(r.status === 'closed' ? 'Приём чеков закрыт' : r.status === 'pending_claims' ? `Сначала обработайте заявки: ${r.pending}` : 'Приём уже закрыт', r.status !== 'closed');
      void reload();
    } catch (e) { toast(errMsg(e), true); }
  };
  const lookup = async () => {
    setOwner(null); setLookupErr('');
    try { setOwner(await api(`/api/admin/raffle/lookup?ticket=${encodeURIComponent(ball)}`)); } catch (e) { setLookupErr(errMsg(e)); }
  };
  const fix = async () => {
    try {
      await post('/api/admin/raffle/winner', { ticket: ball });
      toast('Победитель зафиксирован. Уведомления отправлены');
      void reload();
    } catch (e) { toast(errMsg(e), true); }
  };
  const showList = async () => {
    try { const r = await api<{ tickets: string[] }>('/api/admin/raffle/tickets'); setList(r.tickets.join('\n')); } catch (e) { toast(errMsg(e), true); }
  };
  const exportXlsx = async () => {
    try { const { url } = await post<{ url: string }>('/api/admin/export', { kind: 'tickets', format: 'xlsx' }); const tg = tgApp(); if (tg) tg.openLink(url); else window.open(url, '_blank', 'noopener'); }
    catch (e) { toast(errMsg(e), true); }
  };
  void me;
  return (
    <>
      <Load loading={loading} error={error} />
      {data && (
        <>
          <div className="glass" style={{ marginTop: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="mut">Статус</span><b>{STATUS_RU[data.status]}</b></div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}><span className="mut">Действительных билетов</span><b>{data.validTickets}</b></div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}><span className="mut">Заявок на проверке</span><b>{data.pendingClaims}</b></div>
            {data.status === 'ACTIVE' && <Confirm cls="btn btn-d" label="Закрыть приём чеков" armedLabel="Нажмите ещё раз: приём закроется" onGo={() => void close()} />}
          </div>
          <img src="/drum.webp" alt="Лототрон" style={{ display: 'block', width: '60%', margin: '14px auto 0' }} />
          <div className="glass">
            <h3>Список билетов</h3>
            <p className="note" style={{ marginTop: 0 }}>Сверьте номера с физическими шариками. Номер шарика = номер билета.</p>
            <button className="btn" onClick={() => void showList()} disabled={data.status === 'ACTIVE' || data.status === 'DRAFT'}>Показать список</button>
            <button className="btn" onClick={() => void exportXlsx()}>Выгрузить в Excel</button>
            {list !== null && <textarea className="inp" readOnly value={list} style={{ marginTop: 12 }} onFocus={(e) => e.currentTarget.select()} />}
          </div>
          <div className="glass">
            <h3>Победитель</h3>
            {data.status === 'FINISHED' ? <p>Победитель зафиксирован{data.winnerFixedAt ? ` ${fmtDateTime(data.winnerFixedAt)}` : ''}. Изменить результат нельзя.</p> : data.status !== 'REGISTRATION_CLOSED' ? <p className="mut">Сначала закройте приём чеков.</p> : (
              <>
                <label className="lbl" style={{ marginTop: 0 }}>Номер выпавшего шарика</label>
                <input className="inp" inputMode="numeric" value={ball} onChange={(e) => { setBall(e.target.value); setOwner(null); setLookupErr(''); }} placeholder="Например, 427" />
                <button className="btn" onClick={() => void lookup()} disabled={!ball.trim()}>Проверить владельца</button>
                {lookupErr && <div className="own bad">{lookupErr}</div>}
                {owner && (
                  <div className={`own ${owner.status === 'ACTIVE' ? '' : 'bad'}`}>
                    <b>{owner.ticketNumber}</b><br />Владелец: {owner.owner}{owner.username ? ` @${owner.username}` : ''}<br />Чек: {owner.receiptNumber}<br />
                    {owner.status === 'ACTIVE' ? 'Статус: активен' : 'Билет отменён и не участвует в розыгрыше'}
                  </div>
                )}
                {owner?.status === 'ACTIVE' && <Confirm cls="btn btn-f" label="Зафиксировать победителя" armedLabel="Подтвердите: результат необратим" onGo={() => void fix()} />}
              </>
            )}
          </div>
          <p className="note">Победитель определяется физическим лототроном. Приложение только проверяет номер и фиксирует результат: случайного выбора здесь нет.</p>
        </>
      )}
    </>
  );
}

/* ---------- Настройки акции ---------- */
function Settings() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useApi<RaffleAdmin>('/api/admin/raffle');
  const [f, setF] = useState<{ title: string; startDate: string; endDate: string; timezone: string; streamUrl: string } | null>(null);
  useEffect(() => { if (data) setF({ title: data.title, startDate: data.startDate, endDate: data.endDate, timezone: data.timezone, streamUrl: data.streamUrl ?? '' }); }, [data]);
  const save = async () => {
    try { await api('/api/admin/raffle', { method: 'PUT', body: JSON.stringify(f) }); toast('Сохранено'); void reload(); } catch (e) { toast(errMsg(e), true); }
  };
  const start = async () => { try { await post('/api/admin/raffle/start'); toast('Акция запущена'); void reload(); } catch (e) { toast(errMsg(e), true); } };
  const locked = data?.status === 'REGISTRATION_CLOSED' || data?.status === 'FINISHED';
  return (
    <>
      <Load loading={loading} error={error} />
      {f && data && (
        <div className="glass" style={{ marginTop: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="mut">Статус</span><b>{STATUS_RU[data.status]}</b></div>
          <label className="lbl">Название</label>
          <input className="inp" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} disabled={locked} />
          <label className="lbl">Дата начала</label>
          <input className="inp" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} disabled={locked || data.status === 'ACTIVE'} />
          <label className="lbl">Дата финала (день, когда заканчивается приём, 00:00)</label>
          <input className="inp" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} disabled={locked} />
          <label className="lbl">Часовой пояс</label>
          <input className="inp" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} disabled={locked || data.status === 'ACTIVE'} placeholder="Europe/Moscow" />
          <label className="lbl">Ссылка на прямой эфир (https://)</label>
          <input className="inp" value={f.streamUrl} onChange={(e) => setF({ ...f, streamUrl: e.target.value })} placeholder="https://" />
          <button className="btn btn-f" onClick={() => void save()} disabled={locked}>Сохранить</button>
          {data.status === 'DRAFT' && <Confirm cls="btn" label="Запустить акцию" armedLabel="Нажмите ещё раз: приём чеков начнётся" onGo={() => void start()} />}
        </div>
      )}
    </>
  );
}

/* ---------- Сотрудники ---------- */
function Admins() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useApi<{ admins: { id: number; telegramId: string; role: string; name: string | null; username: string | null }[] }>('/api/admin/admins');
  const [id, setId] = useState('');
  const [role, setRole] = useState('STAFF');
  const add = async () => { try { await post('/api/admin/admins', { telegramId: id.trim(), role }); setId(''); toast('Сохранено'); void reload(); } catch (e) { toast(errMsg(e), true); } };
  const del = async (a: number) => { try { await api(`/api/admin/admins?id=${a}`, { method: 'DELETE' }); void reload(); } catch (e) { toast(errMsg(e), true); } };
  return (
    <>
      <Load loading={loading} error={error} />
      <div className="glass" style={{ marginTop: 0, paddingTop: 4, paddingBottom: 4 }}>
        {data?.admins.map((a) => (
          <div className="item" key={a.id}>
            <Icon n="shield" className="text-acc" />
            <div><b>{a.name ?? 'Не входил в приложение'}{a.username ? ` @${a.username}` : ''}</b><span className="sub">ID {a.telegramId} · {a.role}</span></div>
            <Confirm cls="chip chip-v" label="Удалить" armedLabel="Точно?" onGo={() => void del(a.id)} />
          </div>
        ))}
      </div>
      <div className="glass">
        <h3>Добавить или изменить роль</h3>
        <input className="inp" value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" placeholder="Telegram ID" />
        <select className="inp" style={{ marginTop: 10 }} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="STAFF">STAFF: заявки и ручная выдача</option><option value="MANAGER">MANAGER: + отмена, журнал, экспорт</option><option value="OWNER">OWNER: полный доступ</option>
        </select>
        <button className="btn btn-f" onClick={() => void add()} disabled={!id.trim()}>Сохранить</button>
      </div>
    </>
  );
}
