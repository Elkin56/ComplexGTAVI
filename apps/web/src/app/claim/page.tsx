'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { calculateTickets, type Category } from '@complex/core/src/rules';
import { BackBar, useApp } from '@/components/App';
import { authHeader, plural, todayIso, ApiError } from '@/lib/client';

/** Уменьшаем фото на устройстве (до 1600 px, JPEG): быстрее загрузка и меньше места в базе. */
async function compress(file: File): Promise<File> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
  return blob ? new File([blob], 'receipt.jpg', { type: 'image/jpeg' }) : file;
}

export default function Claim() {
  const { me, toast, reload } = useApp();
  const router = useRouter();
  const [f, setF] = useState({ receiptNumber: '', amount: '', category: 'OTHER' as Category, purchaseDate: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const open = me.raffle.status === 'ACTIVE';
  const start = new Intl.DateTimeFormat('en-CA', { timeZone: me.raffle.timezone }).format(new Date(me.raffle.startDate));
  const preview = calculateTickets(Number(f.amount), f.category);

  const submit = async () => {
    if (!f.receiptNumber.trim()) return toast('Введите номер чека', true);
    if (!(Number(f.amount) > 0)) return toast('Сумма должна быть больше 0', true);
    if (!f.purchaseDate) return toast('Укажите дату покупки', true);
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.set(k, v));
      if (photo) fd.set('photo', await compress(photo));
      const res = await fetch('/api/claims', { method: 'POST', body: fd, headers: { authorization: authHeader() ?? '' } });
      const j = (await res.json().catch(() => ({}))) as { error?: string; status?: string; tickets?: string[] };
      if (!res.ok) throw new ApiError(res.status, j.error ?? 'Не удалось отправить чек');
      toast(j.status === 'approved' ? `Чек подтверждён автоматически: ${plural(j.tickets?.length ?? 0)}` : 'Чек отправлен. Билеты придут в Telegram после проверки');
      await reload();
      router.replace('/history');
    } catch (e) { toast(e instanceof Error ? e.message : 'Ошибка', true); setBusy(false); }
  };

  if (!open) return (<><BackBar title="Добавить чек" /><div className="glass" style={{ marginTop: 0 }}>{me.raffle.status === 'DRAFT' ? 'Акция ещё не началась.' : 'Приём чеков закрыт.'}</div></>);
  return (
    <>
      <BackBar title="Добавить чек" />
      <div className="glass" style={{ marginTop: 0 }}>
        <label className="lbl" htmlFor="rc" style={{ marginTop: 0 }}>Номер чека</label>
        <input id="rc" className="inp" value={f.receiptNumber} maxLength={40} autoComplete="off" onChange={(e) => setF({ ...f, receiptNumber: e.target.value })} placeholder="Например, A-10452" />
        <label className="lbl" htmlFor="am">Сумма по чеку, ₽</label>
        <input id="am" className="inp" type="number" inputMode="decimal" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" />
        <label className="lbl" htmlFor="ct">Категория</label>
        <select id="ct" className="inp" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>
          <option value="PC">ПК</option><option value="COMPONENTS">Комплектующие</option><option value="PERIPHERALS">Периферия</option><option value="OTHER">Другое</option>
        </select>
        <label className="lbl" htmlFor="dt">Дата покупки</label>
        <input id="dt" className="inp" type="date" min={start} max={todayIso()} value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} />
        <label className="lbl" htmlFor="ph">Фото чека (по желанию)</label>
        <input id="ph" className="inp" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 16, padding: '12px 14px', borderRadius: 14, border: '1px dashed rgba(165,255,53,.35)' }}>
          <span className="mut">Ожидаемо после проверки</span><b className="g" style={{ textShadow: 'none', fontSize: 20 }}>{preview}</b>
        </div>
        <p className="note">Билеты начисляет сервер после проверки чека. Если данные совпадут с кассой, это произойдёт сразу, иначе чек проверит сотрудник. Результат придёт в Telegram.</p>
        <button className="btn btn-f" onClick={submit} disabled={busy}>{busy ? 'Отправка…' : 'Отправить на проверку'}</button>
      </div>
    </>
  );
}
