'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icons';
import { useApp } from '@/components/App';
import { fmtDate, post, tgApp } from '@/lib/client';

export default function Profile() {
  const { me, reload, toast } = useApp();
  const u = me.user;
  const [notify, setNotify] = useState(u.notifyEnabled);

  const shareContact = () => {
    const tg = tgApp();
    if (!tg?.requestContact) return toast('Обновите Telegram, чтобы поделиться контактом', true);
    tg.requestContact((shared) => {
      if (!shared) return toast('Контакт не передан', true);
      // номер приходит боту в сообщении: даём секунду на обработку вебхука
      setTimeout(() => { void reload(); }, 1500);
      toast('Телефон сохраняется…');
    });
  };
  const toggle = async (v: boolean) => {
    setNotify(v);
    try { await post('/api/settings', { notifyEnabled: v }); toast(v ? 'Напоминания включены' : 'Напоминания выключены'); }
    catch { setNotify(!v); toast('Не удалось сохранить', true); }
  };

  return (
    <>
      <div className="bar"><Icon n="user" className="text-acc" />Профиль</div>
      <div className="glass" style={{ marginTop: 0 }}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 16px', margin: 0 }}>
          {([
            ['Имя', [u.firstName, u.lastName].filter(Boolean).join(' ')],
            ['Telegram ID', u.telegramId],
            ['Username', u.username ? `@${u.username}` : '—'],
            ['Телефон', u.phone ?? 'не указан'],
            ['Регистрация', fmtDate(u.createdAt, me.raffle.timezone)],
            ['Билетов', String(me.ticketsActive)],
          ] as const).map(([k, v]) => (<div key={k} style={{ display: 'contents' }}><dt className="mut">{k}</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 700 }}>{v}</dd></div>))}
        </dl>
      </div>
      {!u.phone && <button className="btn" onClick={shareContact}><Icon n="phone" />Поделиться контактом</button>}
      <label className="glass row" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
        <span>Напоминания в Telegram<br /><small className="mut">за 3 дня, за 1 день и в день финала</small></span>
        <input type="checkbox" checked={notify} onChange={(e) => void toggle(e.target.checked)} style={{ width: 22, height: 22, accentColor: '#A5FF35' }} />
      </label>
      <Link href="/history" className="btn"><Icon n="cart" />История покупок</Link>
      {me.role && <Link href="/admin" className="btn btn-f"><Icon n="shield" />Админ-панель</Link>}
    </>
  );
}
