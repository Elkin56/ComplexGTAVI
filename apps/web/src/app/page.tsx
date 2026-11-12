'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icons';
import { useApp } from '@/components/App';
import { fmtLong } from '@/lib/client';

function Countdown({ end }: { end: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(end).getTime() - now) / 1000));
  const cells: [number, string][] = [[Math.floor(s / 86400), 'дней'], [Math.floor((s % 86400) / 3600), 'часов'], [Math.floor((s % 3600) / 60), 'минут'], [s % 60, 'секунд']];
  return <div className="cd" aria-label="До финала">{cells.map(([v, l]) => <div key={l}><b>{String(v).padStart(2, '0')}</b><span>{l}</span></div>)}</div>;
}

export default function Home() {
  const { me } = useApp();
  const r = me.raffle;
  const open = r.status === 'ACTIVE';
  const share = `https://t.me/share/url?url=${encodeURIComponent(process.env.NEXT_PUBLIC_BOT_URL ?? 'https://t.me')}&text=${encodeURIComponent('Розыгрыш PS5 + GTA 6 от COMPLEX PC. Билеты за покупки от 5 000 ₽ и за ПК!')}`;
  return (
    <>
      <div className="row" style={{ justifyContent: 'center', margin: '4px 0 14px' }}>
        <img src="/logo.png" alt="" width={46} height={46} style={{ filter: 'drop-shadow(0 0 10px rgba(165,255,53,.45))' }} />
        <span style={{ fontWeight: 800, fontSize: 22 }}>COMPLEX <b className="g" style={{ textShadow: 'none' }}>PC</b></span>
      </div>
      <h1 className="title">РОЗЫГРЫШ<br />PS5 + <span className="g">GTA 6</span></h1>
      <div className="pill"><Icon n="cup" /><span>{r.status === 'FINISHED' ? 'Розыгрыш завершён' : `Финал ${fmtLong(r.endDate, r.timezone)}`}</span></div>
      {open && <Countdown end={r.endDate} />}
      <img src="/hero.webp" alt="PlayStation 5, GTA 6 и геймпад" style={{ width: '100%', margin: '6px 0 -6px', WebkitMaskImage: 'linear-gradient(#000 72%, transparent)', maskImage: 'linear-gradient(#000 72%, transparent)' }} />
      <Link href="/tickets" className="cta"><Icon n="tick" size={30} />МОИ БИЛЕТЫ<Icon n="chev" className="ml-auto" /></Link>
      {open
        ? <Link href="/claim" className="btn"><Icon n="plus" />Добавить чек</Link>
        : <button className="btn" disabled><Icon n="plus" />{r.status === 'DRAFT' ? 'Акция скоро начнётся' : 'Приём чеков закрыт'}</button>}

      {r.winner && (
        <div className="glass" style={{ borderColor: 'var(--color-acc)' }}>
          <h3><Icon n="cup" />Победитель розыгрыша</h3>
          <div className="big" style={{ fontSize: 26 }}>{r.winner.ticketNumber}</div>
          <div style={{ marginTop: 4 }}>{r.winner.name}</div>
        </div>
      )}
      {r.streamUrl
        ? <a className="btn btn-f" href={r.streamUrl} target="_blank" rel="noopener noreferrer">Смотреть прямой эфир</a>
        : r.status !== 'FINISHED' && <div className="glass"><div className="row mut"><Icon n="info" size={28} />Финал на настоящем лототроне в прямом эфире. Ссылку пришлём в Telegram.</div></div>}

      <div className="glass">
        <h3><Icon n="gift" className="text-acc" />Условия участия</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1px 1fr', gap: 12 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12, fontSize: 14 }}>
            <li className="row"><Icon n="cart" className="text-acc" />От 5 000 ₽ — 1 билет</li>
            <li className="row"><Icon n="pc" className="text-acc" />Покупка ПК — 2 билета</li>
            <li className="row"><Icon n="star" className="text-acc" />От 30 000 ₽ — 2 билета</li>
          </ul>
          <span style={{ background: 'var(--color-line)' }} />
          <div style={{ fontSize: 12, textAlign: 'center', display: 'grid', gap: 6, justifyItems: 'center', alignContent: 'center' }}>
            <Icon n="warn" className="text-acc" /><span><b>Правила не суммируются.</b> Максимум 2 билета за покупку.</span>
          </div>
        </div>
      </div>
      <a className="btn" href={share} target="_blank" rel="noopener noreferrer"><Icon n="share" />Поделиться с другом</a>
    </>
  );
}
