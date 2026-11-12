'use client';
import { BackBar } from '@/components/App';
import { Icon } from '@/components/Icons';
import { CATEGORY_LABEL } from '@/lib/rules';
import { fmtDate, money, plural, useApi } from '@/lib/client';

interface H {
  purchases: { id: number; receiptNumber: string; amount: number; category: string; ticketsAwarded: number; purchasedAt: string; status: 'ACTIVE' | 'CANCELLED'; cancelReason: string | null }[];
  claims: { id: number; receiptNumber: string; amount: number; category: string; purchasedAt: string; status: 'PENDING' | 'REJECTED'; rejectReason: string | null }[];
}

export default function History() {
  const { data, error, loading } = useApi<H>('/api/history');
  return (
    <>
      <BackBar title="История покупок" />
      {loading && <p className="mut">Загрузка…</p>}
      {error && <p style={{ color: 'var(--color-err)' }}>{error}</p>}
      {data && (
        <div className="glass" style={{ marginTop: 0, paddingTop: 4, paddingBottom: 4 }}>
          {data.claims.map((c) => (
            <div className="item" key={`c${c.id}`}>
              <Icon n="clock" className="text-acc" />
              <div><b>{CATEGORY_LABEL[c.category]} · {money(c.amount)}</b>
                <span className="sub">{fmtDate(c.purchasedAt)} · чек {c.receiptNumber}</span>
                {c.rejectReason && <span className="sub" style={{ color: 'var(--color-err)' }}>{c.rejectReason}</span>}</div>
              <span className={`chip ${c.status === 'PENDING' ? 'chip-p' : 'chip-v'}`}>{c.status === 'PENDING' ? 'На проверке' : 'Отклонена'}</span>
            </div>
          ))}
          {data.purchases.map((p) => (
            <div className="item" key={`p${p.id}`}>
              <Icon n="cart" className="text-acc" />
              <div><b>{CATEGORY_LABEL[p.category]} · {money(p.amount)}</b>
                <span className="sub">{fmtDate(p.purchasedAt)} · чек {p.receiptNumber}</span>
                {p.cancelReason && <span className="sub" style={{ color: 'var(--color-err)' }}>{p.cancelReason}</span>}</div>
              {p.status === 'CANCELLED' ? <span className="chip chip-v">Отменена</span> : <b style={{ fontSize: 14 }}>{p.ticketsAwarded ? plural(p.ticketsAwarded) : '0 билетов'}</b>}
            </div>
          ))}
          {data.claims.length + data.purchases.length === 0 && <div className="item mut">Покупок пока нет</div>}
        </div>
      )}
    </>
  );
}
