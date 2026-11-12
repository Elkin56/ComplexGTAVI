import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { hasDb, mkAdmin, resetDb } from './helpers';

const BOT = '123456:TEST-bot-token';
process.env.BOT_TOKEN = BOT;
process.env.WEBHOOK_SECRET = 'webhook-secret-0123456789';
process.env.CRON_SECRET = 'cron-secret-0123456789012';
process.env.APP_URL = 'https://app.example.com';
process.env.ADMIN_TELEGRAM_IDS = '7001';
process.env.DEV_AUTH_BYPASS = 'false';

const d = hasDb ? describe : describe.skip;

const initFor = (id: number, name: string, tamper = false) => {
  const f: Record<string, string> = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AA', user: JSON.stringify({ id, first_name: name }) };
  const dcs = Object.entries(f).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(BOT).digest()).update(dcs).digest('hex');
  if (tamper) f.user = JSON.stringify({ id: 7001, first_name: 'Hacker' });
  return new URLSearchParams({ ...f, hash }).toString();
};
const NAMES: Record<number, string> = { 5001: 'Анна', 5002: 'Борис', 7001: 'Босс', 7002: 'Стафф', 7003: 'Менеджер' };
const req = (path: string, as: number | null, init: RequestInit & { name?: string } = {}) =>
  new Request('http://localhost' + path, { ...init, headers: { ...(as ? { authorization: 'tma ' + initFor(as, init.name ?? NAMES[as] ?? `U${as}`) } : {}), ...(init.headers as Record<string, string>) } });
const post = (path: string, as: number, body: unknown) => req(path, as, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const sent: { chat: number; text: string }[] = [];
const realFetch = globalThis.fetch;

d('API: авторизация, права, сценарий от регистрации до победителя', () => {
  let routes: Record<string, any>;
  const USER = 5001, USER2 = 5002, OWNER = 7001, STAFF = 7002, MANAGER = 7003;

  beforeAll(async () => {
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://api.telegram.org/')) {
        const b = JSON.parse(String(init?.body ?? '{}'));
        sent.push({ chat: b.chat_id, text: b.text ?? '' });
        return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { 'content-type': 'application/json' } });
      }
      return realFetch(url as string, init);
    });
    await resetDb();
    await mkAdmin(STAFF, 'STAFF'); await mkAdmin(MANAGER, 'MANAGER');
    routes = {
      health: await import('@/app/api/health/route'), me: await import('@/app/api/me/route'), consent: await import('@/app/api/consent/route'),
      claims: await import('@/app/api/claims/route'), tickets: await import('@/app/api/tickets/route'), history: await import('@/app/api/history/route'),
      aClaims: await import('@/app/api/admin/claims/route'), aClaimAct: await import('@/app/api/admin/claims/[id]/[action]/route'),
      aPurch: await import('@/app/api/admin/purchases/route'), aCancel: await import('@/app/api/admin/purchases/[id]/cancel/route'),
      aRaffle: await import('@/app/api/admin/raffle/route'), aRaffleAct: await import('@/app/api/admin/raffle/[action]/route'),
      aExport: await import('@/app/api/admin/export/route'), dl: await import('@/app/api/export/download/route'),
      aStats: await import('@/app/api/admin/stats/route'), aAudit: await import('@/app/api/admin/audit/route'),
      aAdmins: await import('@/app/api/admin/admins/route'), aPeople: await import('@/app/api/admin/participants/route'),
      hook: await import('@/app/api/telegram/webhook/route'), cron: await import('@/app/api/cron/reminders/route'),
    };
  });
  afterAll(async () => { vi.unstubAllGlobals(); const { db } = await import('@/server/db'); await db().$disconnect(); });

  const waitSent = (pred: (m: { chat: number; text: string }) => boolean) => vi.waitFor(() => { if (!sent.some(pred)) throw new Error('no message'); }, { timeout: 3000 });

  it('health отвечает и не раскрывает секреты', async () => {
    const r = await routes.health.GET(new Request('http://x/api/health'));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ ok: true, db: 'ok', bot: 'configured' });
    expect(JSON.stringify(j)).not.toContain(BOT);
  });

  it('без авторизации и с подделанным initData: 401', async () => {
    expect((await routes.me.GET(req('/api/me', null))).status).toBe(401);
    expect((await routes.me.GET(new Request('http://x/api/me', { headers: { authorization: 'tma ' + initFor(5001, 'X', true) } }))).status).toBe(401);
    expect((await routes.me.GET(new Request('http://x/api/me', { headers: { authorization: 'dev 5001' } }))).status).toBe(401); // dev-обход выключен
    expect((await routes.aStats.GET(req('/api/admin/stats', null))).status).toBe(401);
  });

  it('обычный пользователь не попадает в админку (403)', async () => {
    const me = await (await routes.me.GET(req('/api/me', USER, { name: 'Анна' }))).json();
    expect(me.user.firstName).toBe('Анна');
    expect(me.role).toBeNull();
    expect(me.user.consented).toBe(false);
    for (const [name, h] of [['aStats', routes.aStats.GET], ['aClaims', routes.aClaims.GET], ['aAudit', routes.aAudit.GET], ['aRaffle', routes.aRaffle.GET]] as const) {
      expect((await h(req('/api/admin/x', USER)) as Response).status, name).toBe(403);
    }
    expect((await routes.aExport.POST(post('/api/admin/export', USER, { kind: 'tickets', format: 'csv' }))).status).toBe(403);
  });

  it('роль из ADMIN_TELEGRAM_IDS становится OWNER; STAFF и MANAGER ограничены', async () => {
    expect((await (await routes.me.GET(req('/api/me', OWNER, { name: 'Босс' }))).json()).role).toBe('OWNER');
    expect((await routes.aStats.GET(req('/x', STAFF))).status).toBe(200);
    expect((await routes.aAudit.GET(req('/x', STAFF))).status).toBe(403);                                        // STAFF без audit.view
    expect((await routes.aCancel.POST(post('/x', STAFF, { reason: 'r' }), ctx({ id: '1' }))).status).toBe(403);  // STAFF без purchases.cancel
    expect((await routes.aAudit.GET(req('/x', MANAGER))).status).toBe(200);
    expect((await routes.aAdmins.GET(req('/x', MANAGER))).status).toBe(403);                                     // только OWNER
    expect((await routes.aRaffleAct.POST(post('/x', MANAGER, {}), ctx({ action: 'close' }))).status).toBe(403);
  });

  it('до запуска акции чек не принимается, до согласия тоже', async () => {
    const fd = () => { const f = new FormData(); f.set('receiptNumber', 'U-1'); f.set('amount', '8000'); f.set('category', 'OTHER'); f.set('purchaseDate', '2026-11-09'); return f; };
    expect((await routes.claims.POST(req('/api/claims', USER, { method: 'POST', body: fd() }))).status).toBe(400); // нет согласия
    const c = await routes.consent.POST(post('/api/consent', USER, { version: 'старая' }));
    expect(c.status).toBe(400);
    const { RULES_VERSION } = await import('@/lib/rules');
    expect((await routes.consent.POST(post('/api/consent', USER, { version: RULES_VERSION }))).status).toBe(200);
    expect((await routes.claims.POST(req('/api/claims', USER, { method: 'POST', body: fd() }))).status).toBe(409); // акция DRAFT
  });

  it('владелец настраивает и запускает акцию', async () => {
    const bad = await routes.aRaffle.PUT(req('/x', OWNER, { method: 'PUT', body: JSON.stringify({ title: 'T', startDate: '2026-12-01', endDate: '2026-11-01', timezone: 'Europe/Moscow', streamUrl: '' }), headers: { 'content-type': 'application/json' } }));
    expect(bad.status).toBe(400);
    const badUrl = await routes.aRaffle.PUT(req('/x', OWNER, { method: 'PUT', body: JSON.stringify({ title: 'T', startDate: '2026-11-06', endDate: '2026-12-01', timezone: 'Europe/Moscow', streamUrl: 'javascript:alert(1)' }), headers: { 'content-type': 'application/json' } }));
    expect(badUrl.status).toBe(400);
    const ok = await routes.aRaffle.PUT(req('/x', OWNER, { method: 'PUT', body: JSON.stringify({ title: 'Розыгрыш PS5 + GTA 6', startDate: '2026-11-06', endDate: '2026-12-01', timezone: 'Europe/Moscow', streamUrl: '' }), headers: { 'content-type': 'application/json' } }));
    expect((await ok.json())).toMatchObject({ status: 'DRAFT', startDate: '2026-11-06', endDate: '2026-12-01' });
    expect((await routes.aRaffleAct.POST(post('/x', STAFF, {}), ctx({ action: 'start' }))).status).toBe(403);
    expect((await (await routes.aRaffleAct.POST(post('/x', OWNER, {}), ctx({ action: 'start' }))).json()).status).toBe('started');
  });

  let claimId = 0;
  it('пользователь отправляет чек с фото: статус «на проверке», билетов нет', async () => {
    const f = new FormData();
    f.set('receiptNumber', ' u-1 '); f.set('amount', '8000'); f.set('category', 'PC'); f.set('purchaseDate', '2026-11-09');
    f.set('photo', new File([PNG], 'r.png', { type: 'image/png' }));
    const r = await routes.claims.POST(req('/api/claims', USER, { method: 'POST', body: f }));
    expect(r.status).toBe(201);
    expect((await r.json()).status).toBe('submitted');
    expect((await (await routes.tickets.GET(req('/x', USER))).json()).tickets).toHaveLength(0);
    const hist = await (await routes.history.GET(req('/x', USER))).json();
    expect(hist.claims[0]).toMatchObject({ receiptNumber: 'U-1', status: 'PENDING' });
  });

  it('фото: чужие форматы и «подделка под картинку» отклоняются; дубль чека 409; чек вне периода 422', async () => {
    const mk = (over: Record<string, string>, file?: File) => { const f = new FormData(); Object.entries({ receiptNumber: 'U-2', amount: '8000', category: 'OTHER', purchaseDate: '2026-11-09', ...over }).forEach(([k, v]) => f.set(k, v)); if (file) f.set('photo', file); return req('/api/claims', USER, { method: 'POST', body: f }); };
    expect((await routes.claims.POST(mk({}, new File(['<script>alert(1)</script>'], 'x.png', { type: 'image/png' })))).status).toBe(400);
    expect((await routes.claims.POST(mk({ receiptNumber: 'U-1' }))).status).toBe(409);
    expect((await routes.claims.POST(mk({ receiptNumber: 'U-3', purchaseDate: '2026-11-05' }))).status).toBe(422);
    expect((await routes.claims.POST(mk({ receiptNumber: 'U-4', amount: '-5' }))).status).toBe(400);
    expect((await routes.claims.POST(mk({ receiptNumber: 'U-5', purchaseDate: '2099-01-01' }))).status).toBe(400);
  });

  it('сотрудник видит заявку и фото, подтверждает с исправленной суммой, пользователь получает билеты и уведомление', async () => {
    const list = await (await routes.aClaims.GET(req('/x', STAFF))).json();
    expect(list.claims).toHaveLength(1);
    const c = list.claims[0]; claimId = c.id;
    expect(c).toMatchObject({ receiptNumber: 'U-1', hasPhoto: true, status: 'PENDING' });
    expect(JSON.stringify(list)).not.toContain('iVBOR');
    const photo = await routes.aClaimAct.GET(req('/x', STAFF), ctx({ id: String(claimId), action: 'photo' }));
    expect(photo.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await photo.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await routes.aClaimAct.GET(req('/x', USER), ctx({ id: String(claimId), action: 'photo' }))).status).toBe(403);

    const ap = await routes.aClaimAct.POST(post('/x', STAFF, { amount: 3000 }), ctx({ id: String(claimId), action: 'approve' })); // PC: 2 билета независимо от суммы
    expect((await ap.json())).toMatchObject({ status: 'approved', tickets: ['CP-000001', 'CP-000002'] });
    expect((await (await routes.aClaimAct.POST(post('/x', STAFF, {}), ctx({ id: String(claimId), action: 'approve' }))).json()).status).toBe('already_reviewed');
    await waitSent((m) => m.chat === USER && m.text.includes('Начислено') && m.text.includes('CP-000001'));
    expect((await (await routes.tickets.GET(req('/x', USER))).json()).tickets).toHaveLength(2);
  });

  it('отказ: причина обязательна, пользователь получает уведомление и может подать заново', async () => {
    const f = () => { const x = new FormData(); Object.entries({ receiptNumber: 'U-9', amount: '9000', category: 'OTHER', purchaseDate: '2026-11-09' }).forEach(([k, v]) => x.set(k, v)); return req('/api/claims', USER2, { method: 'POST', body: x }); };
    await routes.consent.POST(post('/api/consent', USER2, { version: (await import('@/lib/rules')).RULES_VERSION }));
    expect((await routes.claims.POST(f())).status).toBe(201);
    const id = (await (await routes.aClaims.GET(req('/x', STAFF))).json()).claims[0].id;
    expect((await routes.aClaimAct.POST(post('/x', STAFF, { reason: ' ' }), ctx({ id: String(id), action: 'reject' }))).status).toBe(400);
    expect((await routes.aClaimAct.POST(post('/x', STAFF, { reason: 'Нечитаемое фото' }), ctx({ id: String(id), action: 'reject' }))).status).toBe(200);
    await waitSent((m) => m.chat === USER2 && m.text.includes('не принят') && m.text.includes('Нечитаемое фото'));
    expect((await routes.claims.POST(f())).status).toBe(201);
  });

  it('ручная регистрация по Telegram ID и по телефону; незнакомый участник не находится', async () => {
    const reg = (identifier: string, receiptNumber: string) => routes.aPurch.POST(post('/x', STAFF, { identifier, receiptNumber, amount: 35000, category: 'OTHER', purchaseDate: '2026-11-09' }));
    expect((await reg(String(USER), 'M-1')).status).toBe(201);
    expect((await reg('9999999', 'M-2')).status).toBe(404);
    const { db } = await import('@/server/db');
    await db().user.update({ where: { telegramId: BigInt(USER2) }, data: { phone: '+79001112233' } });
    expect((await reg('8 (900) 111-22-33', 'M-3')).status).toBe(201);
    expect((await reg(String(USER), 'M-1')).status).toBe(409);
  });

  it('участники ищутся по имени, ID и номеру билета', async () => {
    const find = async (q: string) => (await (await routes.aPeople.GET(req('/x?q=' + encodeURIComponent(q), STAFF))).json()).participants;
    expect((await find('Анна')).length).toBe(1);
    expect((await find(String(USER2))).length).toBe(1);
    expect((await find('CP-000001'))[0].telegramId).toBe(String(USER));
  });

  it('экспорт: ссылка 5 минут, CSV и XLSX, права проверяются, подделанный токен не работает', async () => {
    expect((await routes.aExport.POST(post('/x', STAFF, { kind: 'tickets', format: 'csv' }))).status).toBe(403);
    const link = (await (await routes.aExport.POST(post('/x', MANAGER, { kind: 'tickets', format: 'csv' }))).json()).url as string;
    const csv = await routes.dl.GET(new Request(link));
    expect(csv.headers.get('content-disposition')).toContain('.csv');
    const bytes = Buffer.from(await csv.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM для корректной кириллицы в Excel
    expect(bytes.toString('utf8').replace(/^\uFEFF/, '').split('\r\n')[0]).toBe('Номер билета;Статус;Участник;Telegram ID;Телефон;Чек');
    const xl = await routes.dl.GET(new Request((await (await routes.aExport.POST(post('/x', MANAGER, { kind: 'participants', format: 'xlsx' }))).json()).url));
    expect(xl.headers.get('content-type')).toContain('spreadsheetml');
    expect((await xl.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect((await routes.dl.GET(new Request(link.replace(/.$/, 'x')))).status).toBe(401);
  });

  it('отмена покупки сотрудником с правами: билеты VOID, уведомление, запрет для STAFF', async () => {
    const { db } = await import('@/server/db');
    const p = await db().purchase.findFirstOrThrow({ where: { receiptNumber: 'M-1' } });
    expect((await routes.aCancel.POST(post('/x', STAFF, { reason: 'r' }), ctx({ id: String(p.id) }))).status).toBe(403);
    const r = await routes.aCancel.POST(post('/x', MANAGER, { reason: 'Возврат товара' }), ctx({ id: String(p.id) }));
    expect((await r.json()).status).toBe('cancelled');
    await waitSent((m) => m.chat === USER && m.text.includes('отменена') && m.text.includes('Возврат товара'));
    expect(await db().ticket.count({ where: { purchaseId: p.id, status: 'VOID' } })).toBe(2); // 35 000 ₽ = 2 билета
  });

  it('вебхук бота: нужен secret, /start присылает кнопку, телефон только свой', async () => {
    const hook = (secret: string | null, body: unknown) => routes.hook.POST(new Request('http://x/api/telegram/webhook', { method: 'POST', body: JSON.stringify(body), headers: { ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) } }));
    expect((await hook(null, {})).status).toBe(401);
    expect((await hook('wrong-secret-wrong-secret', {})).status).toBe(401);
    const from = { id: USER, first_name: 'Анна' };
    expect((await hook(process.env.WEBHOOK_SECRET!, { message: { text: '/start', from, chat: { id: USER, type: 'private' } } })).status).toBe(200);
    await waitSent((m) => m.chat === USER && m.text.includes('Привет'));
    // чужой контакт
    await hook(process.env.WEBHOOK_SECRET!, { message: { from, chat: { id: USER, type: 'private' }, contact: { phone_number: '+79005556677', user_id: 999 } } });
    const { db } = await import('@/server/db');
    expect((await db().user.findUniqueOrThrow({ where: { telegramId: BigInt(USER) } })).phone).toBeNull();
    await hook(process.env.WEBHOOK_SECRET!, { message: { from, chat: { id: USER, type: 'private' }, contact: { phone_number: '8 900 555 66 77', user_id: USER } } });
    expect((await db().user.findUniqueOrThrow({ where: { telegramId: BigInt(USER) } })).phone).toBe('+79005556677');
  });

  it('cron-напоминания требуют секрет', async () => {
    expect((await routes.cron.GET(new Request('http://x/api/cron/reminders'))).status).toBe(401);
    const r = await routes.cron.GET(new Request('http://x/api/cron/reminders', { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } }));
    expect(r.status).toBe(200);
    expect((await r.json()).sent).toBe(false); // финал далеко
  });

  it('закрытие приёма, проверка владельца, финал, уведомления победителю и участникам', async () => {
    const closeAs = (as: number) => routes.aRaffleAct.POST(post('/x', as, {}), ctx({ action: 'close' }));
    expect((await (await closeAs(OWNER)).json())).toMatchObject({ status: 'pending_claims', pending: 1 }); // заявка USER2 ждёт
    const id = (await (await routes.aClaims.GET(req('/x', STAFF))).json()).claims[0].id;
    await routes.aClaimAct.POST(post('/x', STAFF, { reason: 'Чек не найден в кассе' }), ctx({ id: String(id), action: 'reject' }));
    expect((await (await closeAs(OWNER)).json()).status).toBe('closed');
    expect((await routes.claims.POST(req('/api/claims', USER, { method: 'POST', body: (() => { const f = new FormData(); Object.entries({ receiptNumber: 'LATE', amount: '8000', category: 'OTHER', purchaseDate: '2026-11-09' }).forEach(([k, v]) => f.set(k, v)); return f; })() }))).status).toBe(409);

    const list = await (await routes.aRaffleAct.GET(req('/x', OWNER), ctx({ action: 'tickets' }))).json();
    expect(list.count).toBe(list.tickets.length);
    expect((await routes.aRaffleAct.GET(req('/x', STAFF), ctx({ action: 'tickets' }))).status).toBe(403);
    const lk = (n: string) => routes.aRaffleAct.GET(req('/x?ticket=' + n, OWNER), ctx({ action: 'lookup' }));
    expect((await lk('999')).status).toBe(404);
    expect((await (await lk('1')).json())).toMatchObject({ ticketNumber: 'CP-000001', owner: 'Анна', status: 'ACTIVE' });
    const win = (t: string, as = OWNER) => routes.aRaffleAct.POST(post('/x', as, { ticket: t }), ctx({ action: 'winner' }));
    expect((await win('1', MANAGER)).status).toBe(403);
    expect((await win('3')).status).toBe(422);                       // билет CP-000003 из отменённой покупки M-1 (VOID)
    expect((await (await win('1')).json())).toMatchObject({ status: 'fixed', ticketNumber: 'CP-000001' });
    expect((await win('2')).status).toBe(409);                       // победитель уже зафиксирован
    await waitSent((m) => m.chat === USER && m.text.includes('Поздравляем'));
    await waitSent((m) => m.chat === USER2 && m.text.includes('Розыгрыш завершён'));
    const me = await (await routes.me.GET(req('/x', USER2))).json();
    expect(me.raffle.status).toBe('FINISHED');
    expect(me.raffle.winner).toMatchObject({ ticketNumber: 'CP-000001', name: 'Анна' });
  });

  it('журнал и статистика отражают всё сделанное', async () => {
    const st = await (await routes.aStats.GET(req('/x', STAFF))).json();
    expect(st.ticketsIssued).toBeGreaterThanOrEqual(4);
    expect(st.claims.approved).toBe(1);
    const actions = (await (await routes.aAudit.GET(req('/x', MANAGER))).json()).entries.map((e: { action: string }) => e.action);
    for (const a of ['RAFFLE_STARTED', 'RAFFLE_SETTINGS_UPDATED', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'PURCHASE_REGISTERED', 'PURCHASE_CANCELLED', 'REGISTRATION_CLOSED', 'WINNER_FIXED', 'EXPORT_DOWNLOADED']) expect(actions).toContain(a);
  });

  it('управление админами только у OWNER; себя удалить нельзя', async () => {
    const r = await routes.aAdmins.POST(post('/x', OWNER, { telegramId: '8000001', role: 'STAFF' }));
    expect(r.status).toBe(200);
    expect((await routes.aAdmins.POST(post('/x', MANAGER, { telegramId: '8000002', role: 'OWNER' }))).status).toBe(403);
    const list = (await (await routes.aAdmins.GET(req('/x', OWNER))).json()).admins;
    const me = list.find((a: { telegramId: string }) => a.telegramId === String(OWNER));
    expect((await routes.aAdmins.DELETE(req('/x?id=' + me.id, OWNER, { method: 'DELETE' }))).status).toBe(400);
  });
});
