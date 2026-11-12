'use client';
import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { RulesText, useApp } from '@/components/App';
import { fmtLong } from '@/lib/client';

export default function Rules() {
  const { me } = useApp();
  const r = me.raffle;
  const days = Math.round((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 864e5);
  return (
    <>
      <div className="bar"><Icon n="doc" className="text-acc" />Подробные условия</div>
      <div className="glass" style={{ marginTop: 0 }}>
        <div className="row"><Icon n="cup" size={30} className="text-acc" /><div><span className="mut" style={{ fontSize: 13 }}>Срок проведения</span><br /><b>{days} дн., финал {fmtLong(r.endDate, r.timezone)}</b></div></div>
        <div className="row" style={{ marginTop: 14 }}><Icon n="gift" size={30} className="text-acc" /><div><span className="mut" style={{ fontSize: 13 }}>Приз</span><br /><b>PlayStation 5 + GTA 6</b></div></div>
        <h3 style={{ margin: '18px 0 12px' }}><Icon n="check" className="text-acc" />Как участвовать?</h3>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {['Купите товар от 5 000 ₽ или ПК', 'Добавьте чек в приложении', 'Сотрудник проверит чек, билеты придут в Telegram', 'Ждите финала в прямом эфире'].map((t, i) => (
            <li key={t} className="row"><i style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%', background: 'var(--color-acc)', color: '#0a1204', font: '800 13px var(--font-sans)', fontStyle: 'normal', display: 'grid', placeItems: 'center' }}>{i + 1}</i>{t}</li>
          ))}
        </ol>
        <div className="row" style={{ marginTop: 16, fontSize: 13 }}><Icon n="warn" className="text-acc" /><span>Покупка ПК на 30 000 ₽ и больше даёт 2 билета, а не 4. Один чек учитывается один раз.</span></div>
        <details style={{ marginTop: 14 }}><summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-acc)' }}>Полный текст правил</summary><div style={{ marginTop: 10 }}><RulesText /></div></details>
        <Link href="/" className="btn">Понятно</Link>
      </div>
    </>
  );
}
