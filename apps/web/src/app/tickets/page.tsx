'use client';
import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { useApp } from '@/components/App';
import { useApi } from '@/lib/client';

interface T { tickets: { ticketNumber: string; status: 'ACTIVE' | 'VOID'; createdAt: string; receiptNumber: string }[] }

export default function Tickets() {
  const { me } = useApp();
  const { data, error, loading } = useApi<T>('/api/tickets');
  return (
    <>
      <img src="/ticket.png" alt="" style={{ display: 'block', margin: '0 auto', width: 96 }} />
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 18, margin: '6px 0 14px' }}>Ваши билеты<br />в розыгрыше:</div>
      {loading && <p className="mut" style={{ textAlign: 'center' }}>Загрузка…</p>}
      {error && <p style={{ color: 'var(--color-err)', textAlign: 'center' }}>{error}</p>}
      {data?.tickets.map((t) => (
        <div key={t.ticketNumber} className={`trow ${t.status === 'VOID' ? 'v' : ''}`}>
          <b>{t.ticketNumber}</b>
          {t.status === 'ACTIVE'
            ? <span className="row" style={{ gap: 6, font: '700 14px var(--font-sans)', fontStyle: 'normal', color: 'var(--color-acc)' }}><Icon n="check" size={20} />Активен</span>
            : <span style={{ font: '700 14px var(--font-sans)', fontStyle: 'normal', color: 'var(--color-err)' }}>Отменён</span>}
        </div>
      ))}
      {data && data.tickets.length === 0 && <div className="glass">Билетов пока нет. Они появятся после проверки чека на покупку от 5 000 ₽ или на покупку ПК.</div>}
      <div className="glass"><div className="row mut"><Icon n="info" size={30} className="text-acc" />Чем больше покупок — тем больше шансов на победу!</div></div>
      {me.raffle.status === 'ACTIVE' && <Link href="/claim" className="btn btn-f"><Icon n="plus" />Добавить чек</Link>}
      <Link href="/history" className="btn"><Icon n="cart" />История покупок</Link>
    </>
  );
}
